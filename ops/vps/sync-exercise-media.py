#!/usr/bin/env python3
"""Downloads free-exercise-db photos (Unlicense) for the exercise library (ADR 022).

Run on the server:  ssh root@host python3 - < ops/vps/sync-exercise-media.py
Idempotent: existing files are kept; nothing outside the target directory is touched.
"""
import json, os, re, sys, time, urllib.request

SOURCE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main'
TARGET = os.environ.get('MEDIA_DIR', '/var/www/campusflow-media/exercises')
SAFE = re.compile(r'^[A-Za-z0-9_-]+/[0-9]+\.jpg$')

def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'CampusFlow-media-sync/1.0'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()

exercises = json.loads(fetch(f'{SOURCE}/dist/exercises.json'))
os.makedirs(TARGET, mode=0o755, exist_ok=True)
added = skipped = failed = 0
for exercise in exercises:
    for image in exercise.get('images', []):
        if not SAFE.match(image):
            skipped += 1; continue
        path = os.path.join(TARGET, image)
        if os.path.exists(path):
            skipped += 1; continue
        os.makedirs(os.path.dirname(path), mode=0o755, exist_ok=True)
        try:
            data = fetch(f'{SOURCE}/exercises/{image}')
            if not data.startswith(b'\xff\xd8'):
                raise ValueError('not a JPEG')
            with open(path + '.part', 'wb') as handle:
                handle.write(data)
            os.chmod(path + '.part', 0o644)
            os.replace(path + '.part', path)
            added += 1
        except Exception as error:  # keep going; a later run retries
            failed += 1
            print(f'failed {image}: {error}', file=sys.stderr)
        time.sleep(0.05)
print(f'added {added}, kept {skipped}, failed {failed}')
sys.exit(1 if failed else 0)
