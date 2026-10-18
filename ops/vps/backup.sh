#!/bin/sh
# Daily CampusFlow database backup. Installed as /opt/campusflow/backup.sh and
# run by root cron. Writes only into BACKUP_DIR and prunes only its own dumps.
set -eu
umask 077
BACKUP_DIR=${BACKUP_DIR:-/var/backups/campusflow}
RETENTION_DAYS=${RETENTION_DAYS:-14}
stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$BACKUP_DIR/campusflow-$stamp.dump"

sudo -u postgres pg_dump --format=custom --compress=6 --no-owner campusflow > "$target.partial"
# A dump that pg_restore cannot list is not a backup.
pg_restore --list "$target.partial" > /dev/null
mv "$target.partial" "$target"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'campusflow-*.dump' -mtime +"$RETENTION_DAYS" -delete
echo "$(date -u +%FT%TZ) backup ok $(basename "$target") $(stat -c %s "$target") bytes"
