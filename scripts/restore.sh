#!/usr/bin/env bash
# ============================================================
# restore.sh — Restauration de la base SQLite planning-mdc
# ============================================================
# Usage :
#   ./scripts/restore.sh                        # restaure le backup le plus récent
#   ./scripts/restore.sh <fichier.db>           # restaure un backup précis
#   ./scripts/restore.sh --list                 # liste les backups disponibles
#
# Le script :
#   1. Arrête l'appli si elle tourne via PM2 ou systemd
#   2. Sauvegarde la base courante dans /var/backups/planning-mdc/pre-restore/
#   3. Restaure le fichier .db demandé
#   4. Supprime les fichiers WAL orphelins (-shm / -wal)
#   5. Redémarre l'appli si elle avait été arrêtée automatiquement
# ============================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

DB_TARGET="$PROJECT_DIR/data/planning.db"
BACKUP_DIR="/var/backups/planning-mdc"
PRE_RESTORE_DIR="$BACKUP_DIR/pre-restore"

# Nom du service (adapter si nécessaire)
PM2_NAME="planning-mdc"
SYSTEMD_NAME="planning-mdc"

# ── Couleurs ──────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
log()  { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
ok()   { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${GREEN}OK${NC}   $*"; }
warn() { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${YELLOW}WARN${NC} $*"; }
err()  { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${RED}ERREUR${NC} $*" >&2; }

# ── --list ────────────────────────────────────────────────────
if [[ "${1:-}" == "--list" ]]; then
  if [[ ! -d "$BACKUP_DIR" ]]; then
    err "Répertoire de backups introuvable : $BACKUP_DIR"
    exit 1
  fi
  echo ""
  echo "Backups disponibles dans $BACKUP_DIR :"
  echo "──────────────────────────────────────────────────────"
  find "$BACKUP_DIR" -maxdepth 1 -name "planning_*.db" | sort -r | while read -r f; do
    SIZE="$(du -sh "$f" | cut -f1)"
    MTIME="$(date -r "$f" '+%Y-%m-%d %H:%M:%S')"
    echo "  $(basename "$f")   ($SIZE)   modifié le $MTIME"
  done
  echo ""
  exit 0
fi

# ── Sélection du fichier source ───────────────────────────────
if [[ -n "${1:-}" ]]; then
  # Fichier passé en argument : chemin absolu ou relatif à BACKUP_DIR
  if [[ -f "$1" ]]; then
    BACKUP_FILE="$1"
  elif [[ -f "$BACKUP_DIR/$1" ]]; then
    BACKUP_FILE="$BACKUP_DIR/$1"
  else
    err "Fichier introuvable : $1"
    err "Utilisez --list pour voir les backups disponibles."
    exit 1
  fi
else
  # Pas d'argument : on prend le plus récent
  BACKUP_FILE="$(find "$BACKUP_DIR" -maxdepth 1 -name "planning_*.db" | sort | tail -1)"
  if [[ -z "$BACKUP_FILE" ]]; then
    err "Aucun backup trouvé dans $BACKUP_DIR"
    err "Utilisez ./scripts/backup.sh pour créer un backup."
    exit 1
  fi
  log "Aucun fichier spécifié — utilisation du backup le plus récent :"
  log "  → $(basename "$BACKUP_FILE")"
fi

# ── Validation du fichier source ──────────────────────────────
if ! file "$BACKUP_FILE" | grep -q "SQLite"; then
  err "Le fichier ne semble pas être une base SQLite valide : $BACKUP_FILE"
  exit 1
fi

# ── Confirmation interactive ──────────────────────────────────
echo ""
echo -e "${YELLOW}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║           RESTAURATION BASE DE DONNÉES               ║${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Source  : $(basename "$BACKUP_FILE")"
echo "  Cible   : $DB_TARGET"
echo ""
echo -e "${RED}  ATTENTION : toutes les données actuelles seront remplacées.${NC}"
echo ""
read -r -p "  Confirmer la restauration ? [oui/NON] : " CONFIRM
if [[ "$CONFIRM" != "oui" && "$CONFIRM" != "OUI" ]]; then
  log "Restauration annulée."
  exit 0
fi
echo ""

# ── Détection et arrêt de l'appli ─────────────────────────────
APP_WAS_RUNNING=false
STOP_METHOD=""

if command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q "$PM2_NAME"; then
  log "Arrêt de l'appli via PM2 ($PM2_NAME)..."
  pm2 stop "$PM2_NAME"
  APP_WAS_RUNNING=true
  STOP_METHOD="pm2"
elif systemctl is-active --quiet "$SYSTEMD_NAME" 2>/dev/null; then
  log "Arrêt de l'appli via systemd ($SYSTEMD_NAME)..."
  systemctl stop "$SYSTEMD_NAME"
  APP_WAS_RUNNING=true
  STOP_METHOD="systemd"
else
  warn "Appli non détectée via PM2 ou systemd."
  warn "Assurez-vous que l'appli est bien arrêtée avant de continuer."
  read -r -p "  Continuer quand même ? [oui/NON] : " FORCE
  if [[ "$FORCE" != "oui" && "$FORCE" != "OUI" ]]; then
    log "Restauration annulée."
    exit 0
  fi
fi

# ── Sauvegarde de sécurité de la base courante ────────────────
if [[ -f "$DB_TARGET" ]]; then
  mkdir -p "$PRE_RESTORE_DIR"
  SAFETY_FILE="$PRE_RESTORE_DIR/pre-restore_$(date '+%Y%m%d_%H%M%S').db"
  if command -v sqlite3 &>/dev/null; then
    sqlite3 "$DB_TARGET" ".backup '$SAFETY_FILE'"
  else
    cp "$DB_TARGET" "$SAFETY_FILE"
  fi
  ok "Sauvegarde de sécurité → $(basename "$SAFETY_FILE")"
fi

# ── Suppression des fichiers WAL orphelins ────────────────────
# Le fichier .db-wal contient des transactions non encore checkpointées.
# En mode restauration, ils ne correspondent plus à la base restaurée
# et provoqueraient une corruption silencieuse.
for ext in "-shm" "-wal"; do
  WAL_FILE="${DB_TARGET}${ext}"
  if [[ -f "$WAL_FILE" ]]; then
    rm -f "$WAL_FILE"
    log "Suppression de $(basename "$WAL_FILE") (orphelin après restauration)"
  fi
done

# ── Restauration ──────────────────────────────────────────────
if command -v sqlite3 &>/dev/null; then
  sqlite3 "$BACKUP_FILE" ".backup '$DB_TARGET'"
  METHOD="sqlite3 .backup"
else
  cp "$BACKUP_FILE" "$DB_TARGET"
  METHOD="cp"
fi

ok "Base restaurée depuis $(basename "$BACKUP_FILE")  (via $METHOD)"

# ── Redémarrage de l'appli ────────────────────────────────────
if [[ "$APP_WAS_RUNNING" == "true" ]]; then
  log "Redémarrage de l'appli ($STOP_METHOD : $PM2_NAME / $SYSTEMD_NAME)..."
  if [[ "$STOP_METHOD" == "pm2" ]]; then
    pm2 start "$PM2_NAME"
  elif [[ "$STOP_METHOD" == "systemd" ]]; then
    systemctl start "$SYSTEMD_NAME"
  fi
  ok "Appli redémarrée."
fi

# ── Résumé ────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            RESTAURATION TERMINÉE AVEC SUCCÈS         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Restauré depuis : $(basename "$BACKUP_FILE")"
if [[ -f "$SAFETY_FILE" ]]; then
  echo "  Sauvegarde pré-restauration : $SAFETY_FILE"
  echo "  (conservée 7 jours — supprimable manuellement)"
fi
echo ""
