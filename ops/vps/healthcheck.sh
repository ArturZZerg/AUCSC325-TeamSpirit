#!/bin/sh
# Five-minute probe, run by root cron as /opt/campusflow/healthcheck.sh.
# Logs every readiness failure. Restarts campusflow-api only when the process
# itself stops answering liveness, at most once per 30 minutes, and never during
# a deploy or backup. A database outage fails readiness but not liveness, so it
# is logged rather than met with a restart loop.
set -u
stamp() { date -u +%FT%TZ; }
probe() { curl -fsS --max-time 5 "http://127.0.0.1:8780/health/$1" > /dev/null 2>&1; }
probe ready && exit 0
exec 9> /run/campusflow.lock
flock -n 9 || { echo "$(stamp) readiness failed during a deploy/backup; not acting"; exit 0; }
if probe live; then echo "$(stamp) readiness failed, process alive (database or migration?)"; exit 0; fi
last=/run/campusflow-last-restart
if [ -f "$last" ] && [ $(( $(date +%s) - $(stat -c %Y "$last") )) -lt 1800 ]; then
  echo "$(stamp) liveness failed; restarted within 30 minutes, leaving it for an operator"; exit 0
fi
touch "$last"
if docker restart campusflow-api > /dev/null; then echo "$(stamp) liveness failed; restarted campusflow-api"
else echo "$(stamp) liveness failed; restart FAILED"; fi
