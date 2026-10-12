import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaces = ['apps/api', 'packages/contracts', 'packages/domain'];
const tooling = /^(?:@jest\/|jest(?:$|-)|babel-jest$|ts-jest$|typescript$|prisma$|@prisma\/(?:config|engines)$|@nestjs\/(?:cli|testing)$|eslint(?:$|-)|@eslint\/|expo(?:$|-)|@expo\/|react-native(?:$|-)|metro(?:$|-))/;

// Inspect the filesystem shipped in the image, rather than lockfile dev flags.
// This is a packaging gate, not a vulnerability scanner or an SBOM standard.
export function inspectRuntime(root) {
  root = realpathSync(root);
  const packages = [], violations = [], visited = new Set(), seenPackages = new Set();
  const inside = target => { const relative = path.relative(root, target); return !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative); };
  function scan(directory) {
    if (!existsSync(directory)) return;
    const real = realpathSync(directory);
    if (!inside(real)) { violations.push('Package directory escapes the application'); return; }
    if (visited.has(real)) return;
    visited.add(real);
    for (const entry of readdirSync(real, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const target = path.join(real, entry.name);
      if (entry.name.startsWith('@') && (entry.isDirectory() || entry.isSymbolicLink())) { scan(target); continue; }
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const resolved = realpathSync(target);
      if (!inside(resolved)) { violations.push('Package link escapes the application'); continue; }
      const manifest = path.join(resolved, 'package.json');
      if (!existsSync(manifest)) continue;
      if (seenPackages.has(resolved)) continue;
      seenPackages.add(resolved);
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      packages.push({ name: pkg.name, version: pkg.version, location: path.relative(root, target).split(path.sep).join('/') });
      if (tooling.test(pkg.name)) violations.push(`Build/test package is shipped: ${pkg.name}`);
      scan(path.join(resolved, 'node_modules'));
    }
  }
  scan(path.join(root, 'node_modules'));
  for (const workspace of workspaces) {
    const manifest = path.join(root, workspace, 'package.json');
    if (!existsSync(manifest)) { violations.push(`Missing runtime workspace: ${workspace}`); continue; }
    if (!inside(realpathSync(manifest))) { violations.push(`Runtime workspace escapes the application: ${workspace}`); continue; }
    const pkg = JSON.parse(readFileSync(manifest, 'utf8')), require = createRequire(manifest);
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      try {
        if (!inside(require.resolve(name))) violations.push(`Runtime dependency escapes the application: ${name}`);
      } catch { violations.push(`Missing runtime dependency for ${workspace}: ${name}`); }
    }
    scan(path.join(root, workspace, 'node_modules'));
  }
  for (const file of ['apps/api/dist/src/main.js', 'packages/contracts/dist/index.js', 'packages/domain/dist/index.js', 'node_modules/.prisma/client/default.js']) {
    if (!existsSync(path.join(root, file))) violations.push(`Missing application entry: ${file}`);
  }
  for (const directory of ['apps/api/src', 'apps/api/test', 'apps/api/dist/test', 'apps/api/prisma', 'apps/mobile']) {
    if (existsSync(path.join(root, directory))) violations.push(`Non-runtime application files are shipped: ${directory}`);
  }
  packages.sort((left, right) => left.location.localeCompare(right.location));
  return { packages, violations: [...new Set(violations)].sort() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const report = inspectRuntime(process.cwd());
    if (process.argv.includes('--json')) console.log(JSON.stringify(report));
    else {
      console.log(`API runtime inventory: ${report.packages.length} installed packages`);
      for (const violation of report.violations) console.error(violation);
      if (!report.violations.length) console.log('Runtime entries/dependencies present; reviewed build/test packages absent.');
    }
    if (report.violations.length) process.exitCode = 1;
  } catch { console.error('Unable to inspect API runtime dependencies.'); process.exitCode = 1; }
}
