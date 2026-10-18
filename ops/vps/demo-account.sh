#!/bin/sh
# Reset the synthetic demo account (demo@example.com) inside the running API
# container. Root cron runs it nightly so sample dates stay relative to today.
# The password lives only in a root-only file and reaches the CLI on stdin.
set -eu
umask 077
secret=/etc/campusflow/demo.password
[ -s "$secret" ] || openssl rand -base64 18 > "$secret"
docker exec -i campusflow-api node apps/api/dist/src/demo-account.js < "$secret"
