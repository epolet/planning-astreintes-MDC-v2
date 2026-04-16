#!/usr/bin/env bash
# ============================================================
# backup.sh — Sauvegarde de la base SQLite planning-mdc
# ============================================================
# Usage :
#   ./scripts/backup.sh              # backup manuel
#   ./scripts/backup.sh --rotate 30  # backup + purge > 30 jours
#
# Cron (exemple : tous les jours à 2h00) :
#   0 2 * * * /opt/planning-mdc/scripts/backup.sh --rotate 30 >> /var/log/planning-mdc-backup.log 2>&1
# ============================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

DB_SOURCE="$PROJECT_DIR/data/planning.db"
BACKUP_DIR="/var/backups/planning-mdc"
RETAIN_DAYS=30   # valeur par défaut, surchargeable via --rotate N

# ── Parsing des arguments ─────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rotate)
      RETAIN_DAYS="$2"
      shift 2
      ;;
    *)
      echo "Usage: $0 [--rotate <jours>]" >&2
      exit 1
      ;;
  esac
done

# ── Vérifications ─────────────────────────────────────────────
if [[ ! -f "$DB_SOURCE" ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERREUR : base de données introuvable : $DB_SOURCE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# ── Backup ────────────────────────────────────────────────────
TIMESTAMP="$(date '+%Y%m%d_%H%M%S')"
BACKUP_FILE="$BACKUP_DIR/planning_${TIMESTAMP}.db"

# Utilise l'API SQLite online-backup si sqlite3 est dispo (cohérence garantie)
# Sinon fallback sur une copie simple (acceptable car WAL est activé)
if command -v sqlite3 &>/dev/null; then
  sqlite3 "$DB_SOURCE" ".backup '$BACKUP_FILE'"
  METHOD="sqlite3 .backup"
else
  cp "$DB_SOURCE" "$BACKUP_FILE"
  METHOD="cp"
fi

SIZE="$(du -sh "$BACKUP_FILE" | cut -f1)"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK   backup → $(basename "$BACKUP_FILE")  ($SIZE, via $METHOD)"

# ── Rotation : suppression des backups plus vieux que RETAIN_DAYS ──
DELETED=0
while IFS= read -r old_file; do
  rm -f "$old_file"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] PURGE $(basename "$old_file")"
  ((DELETED++)) || true
done < <(find "$BACKUP_DIR" -maxdepth 1 -name "planning_*.db" -mtime +"$RETAIN_DAYS")

# ── Résumé ────────────────────────────────────────────────────
TOTAL="$(find "$BACKUP_DIR" -maxdepth 1 -name "planning_*.db" | wc -l | tr -d ' ')"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO $TOTAL backup(s) conservé(s) dans $BACKUP_DIR  |  $DELETED supprimé(s)"
