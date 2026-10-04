import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobile = path.join(root, 'apps/mobile');
const windows = process.platform === 'win32';
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
  ?? (windows && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android/Sdk') : '');
const java = process.env.JAVA_HOME;
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

function fail(message) { console.error(message); process.exit(1); }
if (!sdk || !existsSync(path.join(sdk, 'platform-tools'))) fail('Set ANDROID_HOME to an installed Android SDK (platform-tools are required).');
if (!java || !existsSync(path.join(java, 'bin', windows ? 'java.exe' : 'java'))) fail('Set JAVA_HOME to a JDK 17 or newer.');
const endpoint = new URL(apiUrl);
const localHost = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;
if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash
  || (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && localHost.test(endpoint.hostname)))) {
  fail('EXPO_PUBLIC_API_URL must be HTTPS, or HTTP on a local/private host, without credentials or query parameters.');
}
console.log(`Android preview API: ${endpoint.origin}${endpoint.pathname === '/' ? '' : endpoint.pathname}`);
console.log(`Android SDK: ${sdk}`);
if (process.argv.includes('--check')) process.exit(0);

const env = {
  ...process.env, ANDROID_HOME: sdk, JAVA_HOME: java,
  // Ninja on Windows still limits paths to 260 characters. Keep native headers
  // out of a deeply nested workspace cache.
  GRADLE_USER_HOME: process.env.GRADLE_USER_HOME ?? (windows ? path.join(homedir(), '.gradle/campusflow') : path.join(root, '.local/gradle')),
  EXPO_HOME: path.join(root, '.local/expo'), EXPO_NO_TELEMETRY: '1',
  __UNSAFE_EXPO_HOME_DIRECTORY: path.join(root, '.local/expo'),
  CI: '1', NODE_ENV: 'production', CAMPUSFLOW_ANDROID_PREVIEW: '1', EXPO_PUBLIC_API_URL: apiUrl,
};
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'prebuild', '--platform', 'android', '--no-install'], mobile);
// Gradle 9.1 fixes Windows transform-cache file locks (gradle/gradle#31438).
// Keep this in the workflow because Expo regenerates the native wrapper.
const wrapper = path.join(mobile, 'android/gradle/wrapper/gradle-wrapper.properties');
writeFileSync(wrapper, readFileSync(wrapper, 'utf8').replace(/gradle-9\.0\.0-bin\.zip/, 'gradle-9.1.0-bin.zip'));
const gradleArgs = [':app:assembleRelease', '-PreactNativeArchitectures=arm64-v8a', '--console=plain', '--no-daemon', '--max-workers=2', '--no-watch-fs', '-Dorg.gradle.parallel=false'];
if (windows) {
  // Use the Windows certificate store; retain normal TLS verification.
  const trust = '-Djavax.net.ssl.trustStoreType=Windows-ROOT -Djavax.net.ssl.trustStore=NONE';
  env.GRADLE_OPTS = `${env.GRADLE_OPTS ?? ''} ${trust}`;
  run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `gradlew.bat ${gradleArgs.join(' ')} ${trust}`], path.join(mobile, 'android'));
} else {
  run('./gradlew', gradleArgs, path.join(mobile, 'android'));
}
const output = path.join(root, 'artifacts/android/campusflow-preview.apk');
mkdirSync(path.dirname(output), { recursive: true });
copyFileSync(path.join(mobile, 'android/app/build/outputs/apk/release/app-release.apk'), output);
console.log(`Android preview APK: ${output}`);
console.log('Locally signed preview for testing; not a Play Store release.');
