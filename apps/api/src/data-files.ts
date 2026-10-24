import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Reads a bundled file from `apps/api/data`, from source (`src/`) or the build (`dist/src/`). */
export function readDataFile(name: string): string {
  const file = [path.join(__dirname, '..', 'data', name), path.join(__dirname, '..', '..', 'data', name)].find(candidate => existsSync(candidate));
  if (!file) throw new Error(`Bundled data file ${name} is missing.`);
  return readFileSync(file, 'utf8');
}
