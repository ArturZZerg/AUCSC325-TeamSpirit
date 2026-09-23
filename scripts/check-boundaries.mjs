import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const violations = [];
async function inspect(directory, owner) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.expo', 'coverage'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await inspect(file, owner);
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      const source = await readFile(file, 'utf8');
      const imports = [...source.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
      for (const dependency of imports) {
        if (owner !== 'mobile' && (/apps[\\/]/.test(dependency) || /@campusflow\/(api|mobile)/.test(dependency))) violations.push(`${file}: shared package imports app ${dependency}`);
        if (owner === 'contracts' && /@campusflow\/domain|domain[\\/]src|@prisma/.test(dependency)) violations.push(`${file}: contracts dependency ${dependency}`);
        if (owner === 'domain' && /@campusflow\/contracts|contracts[\\/]src|@prisma|@nestjs|^expo|^react/.test(dependency)) violations.push(`${file}: domain dependency ${dependency}`);
        if (owner === 'mobile' && /@prisma|@nestjs|@campusflow\/api|apps[\\/]api/.test(dependency)) violations.push(`${file}: mobile backend dependency ${dependency}`);
      }
    }
  }
}
for (const [directory, owner] of [['packages/contracts', 'contracts'], ['packages/domain', 'domain'], ['apps/mobile', 'mobile']]) {
  await inspect(directory, owner);
}
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else console.log('Workspace dependency boundaries passed.');
