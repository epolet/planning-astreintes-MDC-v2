# Planning Astreintes MDC

Outil de planification des astreintes et permanences des cadres du musée.  
Déploiement : VM intranet, accès réseau local uniquement.

---

## Démarrage

```bash
# Développement (Vite :5173 + Express :3001 en parallèle)
npm run dev

# Production
npm run build && npm run start
```

---

## Sauvegarde et restauration

### Sauvegarder manuellement

```bash
./scripts/backup.sh
```

Les backups sont stockés dans `/var/backups/planning-mdc/planning_YYYYMMDD_HHMMSS.db`.

### Programmer une sauvegarde automatique (cron)

```bash
# Tous les jours à 2h00, conservation 30 jours
crontab -e
# Ajouter la ligne :
0 2 * * * /opt/planning-mdc/scripts/backup.sh --rotate 30 >> /var/log/planning-mdc-backup.log 2>&1
```

---

### Restaurer un backup

> ⚠️ La restauration **remplace toutes les données courantes**. Le script crée
> automatiquement une sauvegarde de sécurité avant d'écraser la base.

**Lister les backups disponibles**

```bash
./scripts/restore.sh --list
```

**Restaurer le backup le plus récent**

```bash
./scripts/restore.sh
```

**Restaurer un backup précis**

```bash
# Par nom de fichier seul (cherché dans /var/backups/planning-mdc/)
./scripts/restore.sh planning_20260430_020001.db

# Ou par chemin absolu
./scripts/restore.sh /var/backups/planning-mdc/planning_20260430_020001.db
```

Le script gère automatiquement :
- L'arrêt de l'appli (PM2 ou systemd) si elle tourne
- La suppression des fichiers WAL (`.db-shm` / `.db-wal`) qui deviendraient incohérents après remplacement de la base
- Une sauvegarde de sécurité de la base courante dans `/var/backups/planning-mdc/pre-restore/` avant d'écraser
- Le redémarrage de l'appli une fois la restauration terminée

> Si l'appli n'est pas gérée par PM2 ou systemd, le script demande une
> confirmation manuelle et vous laisse l'arrêter vous-même avant de continuer.

---

## Structure

Voir [CLAUDE.md](./CLAUDE.md) pour l'architecture détaillée.
