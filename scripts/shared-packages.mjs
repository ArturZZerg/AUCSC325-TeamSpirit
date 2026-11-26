// Metro bundles @campusflow/contracts and @campusflow/domain from their compiled dist/
// (package "main"), not from src/. A stale dist/ ships old schemas: in November 2026 an
// update built from an October dist/ crashed on launch ("Cannot read property 'array'
// of undefined") and expo-updates silently rolled every phone back. Build them first.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildSharedPackages({ cwd = root, spawn = spawnSync } = {}) {
  // npm is a .cmd shim on Windows, which needs a shell; the command has no user input.
  const result = process.platform === 'win32'
    ? spawn('npm run build:shared', { cwd, stdio: 'inherit', shell: true })
    : spawn('npm', ['run', 'build:shared'], { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Building the shared packages (npm run build:shared) failed.');
}
