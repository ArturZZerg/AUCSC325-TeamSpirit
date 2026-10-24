// Builds a self-hosted Expo Updates release for Android (ADR 021).
//   node scripts/publish-update.mjs --out DIR [--apk FILE] [--commit SHA]
// DIR receives android/<runtime>/manifest.json, content-addressed assets/ and,
// with --apk, android/campusflow-<runtime>.apk plus android/latest.json.
// ops/vps/upload-update.sh copies DIR to the server.
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertRuntimeCurrent } from './native-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobile = path.join(root, 'apps/mobile');
const { updatesOrigin } = createRequire(import.meta.url)(path.join(mobile, 'config/app-updates.cjs'));
const contentTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', json: 'application/json', mp3: 'audio/mpeg', wav: 'audio/wav' };

const base64Url = (value) => value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const describe = (file) => {
  const bytes = readFileSync(file);
  return { sha256: createHash('sha256').update(bytes).digest('hex'), hash: base64Url(createHash('sha256').update(bytes).digest()),
    key: createHash('md5').update(bytes).digest('hex') };
};

/**
 * Manifest for one platform from an `expo export` directory. Files are stored
 * by SHA-256 so identical assets are uploaded once and never overwritten.
 */
export function buildManifest({ exportDir, platform = 'android', runtimeVersion, origin = updatesOrigin, id = randomUUID(),
  createdAt = new Date().toISOString(), expoClient, commit }) {
  if (!/^[0-9]{1,6}$/.test(runtimeVersion)) throw new Error(`Runtime version must be a whole number, got ${runtimeVersion}`);
  const metadata = JSON.parse(readFileSync(path.join(exportDir, 'metadata.json'), 'utf8'));
  const files = metadata.fileMetadata?.[platform];
  if (!files?.bundle) throw new Error(`The export has no ${platform} bundle`);
  const copies = [];
  const asset = (relative, extension, launch) => {
    const source = path.join(exportDir, relative), info = describe(source);
    copies.push({ source, target: `assets/${info.sha256}` });
    return { hash: info.hash, key: info.key, contentType: launch ? 'application/javascript' : contentTypes[extension] ?? 'application/octet-stream',
      ...(launch ? {} : { fileExtension: `.${extension}` }), url: `${origin}/assets/${info.sha256}` };
  };
  const manifest = { id, createdAt, runtimeVersion, launchAsset: asset(files.bundle, 'bundle', true),
    assets: (files.assets ?? []).map(item => asset(item.path, item.ext, false)), metadata: {},
    extra: { ...(expoClient ? { expoClient } : {}), ...(commit ? { campusflowCommit: commit } : {}) } };
  return { manifest, copies, manifestPath: `${platform}/${runtimeVersion}/manifest.json` };
}

/** The native-update offer the app reads; only a higher runtime triggers it. */
export function latestRelease({ runtimeVersion, version, apkFile, origin = updatesOrigin, publishedAt = new Date().toISOString() }) {
  const { sha256 } = describe(apkFile);
  return { runtimeVersion, version, sha256, publishedAt, apkUrl: `${origin}/android/campusflow-${runtimeVersion}.apk` };
}

function run(args, env) {
  const cli = createRequire(path.join(mobile, 'package.json')).resolve('expo/bin/cli');
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: mobile, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] });
  if (result.status !== 0) throw new Error(`expo ${args[0]} failed`);
  return result.stdout;
}

async function main(argv) {
  const option = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
  const out = option('--out'), apk = option('--apk'), commit = option('--commit');
  if (!out) throw new Error('Use --out DIR [--apk FILE] [--commit SHA]');
  if (apk && !existsSync(apk)) throw new Error(`APK not found: ${apk}`);
  // Sets the production build environment and refuses JavaScript the installed native code cannot run.
  const { runtimeVersion } = await assertRuntimeCurrent();
  const env = { ...process.env };
  const exportDir = mkdtempSync(path.join(tmpdir(), 'campusflow-update-'));
  try {
    run(['export', '--platform', 'android', '--output-dir', exportDir], env);
    const expoClient = JSON.parse(run(['config', '--type', 'public', '--json'], env));
    const { manifest, copies, manifestPath } = buildManifest({ exportDir, runtimeVersion, expoClient, commit });
    for (const copy of copies) { mkdirSync(path.dirname(path.join(out, copy.target)), { recursive: true }); copyFileSync(copy.source, path.join(out, copy.target)); }
    mkdirSync(path.dirname(path.join(out, manifestPath)), { recursive: true });
    writeFileSync(path.join(out, manifestPath), JSON.stringify(manifest));
    if (apk) {
      copyFileSync(apk, path.join(out, `android/campusflow-${runtimeVersion}.apk`));
      writeFileSync(path.join(out, 'android/latest.json'), JSON.stringify(latestRelease({ runtimeVersion, version: expoClient.version, apkFile: apk })));
    }
    console.log(`Update ${manifest.id} for runtime ${runtimeVersion}: ${copies.length} files${apk ? ' + APK' : ''} in ${out}`);
  } finally { rmSync(exportDir, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exit(error.code === 'NATIVE_RUNTIME_CHANGED' ? 3 : 1); });
}
