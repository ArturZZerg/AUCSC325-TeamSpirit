#!/bin/sh
# Reset the synthetic demo account (demo@example.com) inside the running API
# container. Root cron runs it at 10:00 UTC, after local midnight in Edmonton in
# both MST and MDT, so sample dates match the viewer's day:
#   0 10 * * * /opt/campusflow/demo-account.sh >> /var/log/campusflow-demo.log 2>&1
# The password lives only in a root-only file and reaches the CLI on stdin.
set -eu
umask 077
exec 9> /run/campusflow.lock
flock -w 600 9 || { echo "$(date -u +%FT%TZ) demo reset skipped: lock busy" >&2; exit 1; }
secret=/etc/campusflow/demo.password
[ -s "$secret" ] || openssl rand -base64 18 > "$secret"
timeout 300 docker exec -i campusflow-api node apps/api/dist/src/demo-account.js < "$secret"
