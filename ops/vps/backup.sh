#!/bin/sh
# Daily CampusFlow database backup. Installed as /opt/campusflow/backup.sh and
# run by root cron (and by deploy.sh before migrations). Writes only into
# BACKUP_DIR and prunes only its own dumps.
set -eu
umask 077
BACKUP_DIR=${BACKUP_DIR:-/var/backups/campusflow}
RETENTION_DAYS=${RETENTION_DAYS:-14}
MIN_FREE_KB=${MIN_FREE_KB:-1048576}
if [ -z "${FLOCK_HELD:-}" ]; then
  exec 9> /run/campusflow.lock
  flock -w 600 9 || { echo "$(date -u +%FT%TZ) backup skipped: lock busy" >&2; exit 1; }
fi
install -d -m 700 "$BACKUP_DIR"
free=$(df -Pk "$BACKUP_DIR" | awk 'NR == 2 { print $4 }')
[ "$free" -ge "$MIN_FREE_KB" ] || { echo "$(date -u +%FT%TZ) backup refused: only ${free} KB free" >&2; exit 1; }

stamp=$(date -u +%Y%m%dT%H%M%SZ)
target="$BACKUP_DIR/campusflow-$stamp.dump"
trap 'rm -f "$target.partial"' EXIT
sudo -u postgres pg_dump --format=custom --compress=6 --no-owner campusflow > "$target.partial"
# Read every data block, not just the table of contents.
pg_restore --file=/dev/null "$target.partial"
mv "$target.partial" "$target"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'campusflow-*.dump' -mtime +"$RETENTION_DAYS" -delete
echo "$(date -u +%FT%TZ) backup ok $(basename "$target") $(stat -c %s "$target") bytes"
