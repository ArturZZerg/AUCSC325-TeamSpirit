// Guards the native runtime boundary for over-the-air updates (ADR 021).
//   node scripts/native-runtime.mjs --check   exit 3 when native inputs changed since the recorded runtime
//   node scripts/native-runtime.mjs --record  record the fingerprint for the current runtime
//   node scripts/native-runtime.mjs --bump    increment the runtime and record its fingerprint (needs a new APK)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobile = path.join(root, 'apps/mobile');
const runtimeFile = path.join(mobile, 'native-runtime.json');
// Not loaded by app config, so recording a fingerprint never changes it.
const recordFile = path.join(mobile, 'native-fingerprint.json');
const { productionApiUrl } = createRequire(import.meta.url)(path.join(mobile, 'config/app-updates.cjs'));

export const readRuntime = () => JSON.parse(readFileSync(runtimeFile, 'utf8')).runtimeVersion;
export const readRecord = () => { try { return JSON.parse(readFileSync(recordFile, 'utf8')); } catch { return null; } };

/** Fingerprint of everything native for Android, computed with the production build environment. */
export async function nativeFingerprint() {
  // The same values build-android.mjs uses for an update-enabled build; config output depends on them.
  Object.assign(process.env, { EXPO_PUBLIC_API_URL: productionApiUrl, CAMPUSFLOW_ANDROID_PREVIEW: '1', NODE_ENV: 'production' });
  delete process.env.CAMPUSFLOW_IOS_SIMULATOR; delete process.env.CAMPUSFLOW_WEB_BASE_URL;
  const { createFingerprintAsync } = createRequire(path.join(mobile, 'package.json'))('@expo/fingerprint');
  // android/ and ios/ are regenerated from config by prebuild and are not committed;
  // whether a build already created them must not change the hash.
  const result = await createFingerprintAsync(mobile, { platforms: ['android'], ignorePaths: ['android', 'android/**', 'ios', 'ios/**', 'native-fingerprint.json'],
    fileHookTransform: normalizeLineEndings });
  return result.hash;
}

/** Project text files hash the same with CRLF (Windows checkouts) or LF; installed packages are left as published. */
export function normalizeLineEndings(source, chunk) {
  if (source.type !== 'file' || chunk === null || /(^|[\\/])node_modules[\\/]/.test(source.filePath)
    || !/(\.(c?js|mjs|json|ts|tsx)|\.gitignore)$/.test(source.filePath)) return chunk;
  return Buffer.from(Buffer.from(chunk).toString('utf8').replace(/\r\n/g, '\n'));
}

/** Throws a NativeRuntimeChanged error when the recorded fingerprint does not match the current runtime. */
export async function assertRuntimeCurrent() {
  const runtimeVersion = readRuntime(), record = readRecord(), fingerprint = await nativeFingerprint();
  if (!record || record.runtimeVersion !== runtimeVersion || record.fingerprint !== fingerprint) {
    const error = new Error(`Native inputs changed since runtime ${runtimeVersion} was recorded. Run "node scripts/native-runtime.mjs --bump", build and install a new APK, then publish.`);
    error.code = 'NATIVE_RUNTIME_CHANGED';
    throw error;
  }
  return { runtimeVersion, fingerprint };
}

const record = async () => {
  const runtimeVersion = readRuntime(), fingerprint = await nativeFingerprint();
  writeFileSync(recordFile, `${JSON.stringify({ runtimeVersion, fingerprint }, null, 2)}\n`);
  console.log(`Runtime ${runtimeVersion} recorded with fingerprint ${fingerprint}`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = process.argv[2];
  if (flag === '--check') {
    try { const { runtimeVersion } = await assertRuntimeCurrent(); console.log(`Native runtime ${runtimeVersion} is current`); }
    catch (error) { console.error(error.message); process.exit(error.code === 'NATIVE_RUNTIME_CHANGED' ? 3 : 1); }
  } else if (flag === '--record') await record();
  else if (flag === '--bump') {
    const next = String(Number(readRuntime()) + 1);
    writeFileSync(runtimeFile, `${JSON.stringify({ runtimeVersion: next }, null, 2)}\n`);
    await record();
  } else { console.error('Use --check, --record or --bump'); process.exit(1); }
}
