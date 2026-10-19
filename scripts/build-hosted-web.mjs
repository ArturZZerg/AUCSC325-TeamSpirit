// Builds the hosted web app (ADR 018) into an empty output directory:
//   node scripts/build-hosted-web.mjs <out-dir>
// The base path is set here rather than in the shell, because Git Bash on
// Windows rewrites "/campusflow"-style values into Windows paths.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const hostedWeb = { baseUrl: '/campusflow', apiUrl: 'https://workout.vakula-dev.com/campusflow-api' };

function fail(message) { console.error(message); process.exit(1); }
const out = process.argv[2] ? path.resolve(process.argv[2]) : fail('Usage: build-hosted-web.mjs <out-dir>');
if (existsSync(out) && readdirSync(out).length) fail(`Output directory must be empty: ${out}`);

// Only these public values reach the bundle: drop inherited EXPO_PUBLIC_* and ignore .env files.
const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('EXPO_PUBLIC_')));
const env = { ...inherited, EXPO_NO_DOTENV: '1', CAMPUSFLOW_WEB_BASE_URL: hostedWeb.baseUrl, EXPO_PUBLIC_API_URL: hostedWeb.apiUrl };
const result = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--clear', '--output-dir', out],
  { cwd: path.join(root, 'apps/mobile'), env, stdio: 'inherit', shell: process.platform === 'win32' });
if (result.status !== 0) fail('Web export failed.');

// Refuse an export that would load from the wrong place or call the wrong API.
const html = readFileSync(path.join(out, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
if (!scripts.length || scripts.some(src => !src.startsWith(`${hostedWeb.baseUrl}/_expo/`))) fail(`Unexpected script paths: ${scripts.join(', ')}`);
const entry = readFileSync(path.join(out, scripts[0].slice(hostedWeb.baseUrl.length + 1)), 'utf8');
if (!entry.includes(hostedWeb.apiUrl)) fail('The entry bundle does not use the hosted API URL.');
if (/https?:\/\/(localhost|127\.0\.0\.1)/.test(entry)) fail('The entry bundle still references a local API.');
const wasm = readdirSync(path.join(out, 'assets'), { recursive: true }).filter(file => String(file).endsWith('.wasm'));
if (!wasm.length) fail('The SQLite web worker asset is missing.');
console.log(`Hosted web built in ${out} (${scripts.length} script, base ${hostedWeb.baseUrl})`);
