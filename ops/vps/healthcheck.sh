#!/bin/sh
# Five-minute readiness probe, run by root cron as /opt/campusflow/healthcheck.sh.
# Logs every failure. Restarts only campusflow-api, and only after Docker marks
# it unhealthy (three failed in-container checks), so a slow database is not
# met with a restart loop.
set -u
if curl -fsS --max-time 5 http://127.0.0.1:8780/health/ready > /dev/null 2>&1; then exit 0; fi
status=$(docker inspect --format '{{.State.Health.Status}}' campusflow-api 2>/dev/null || echo missing)
echo "$(date -u +%FT%TZ) readiness failed (container $status)"
if [ "$status" = unhealthy ]; then
  docker restart campusflow-api > /dev/null && echo "$(date -u +%FT%TZ) restarted campusflow-api"
fi
