import { execFileSync } from 'node:child_process';

export function androidPreviewTarget(args = []) {
  if (!Array.isArray(args) || args.length > 2 || args.some(arg => !['--check', '--emulator'].includes(arg)) || new Set(args).size !== args.length)
    throw new Error('Android preview accepts only --check and --emulator.');
  return args.includes('--emulator')
    ? { architecture: 'x86_64', artifact: 'campusflow-emulator-preview.apk' }
    : { architecture: 'arm64-v8a', artifact: 'campusflow-preview.apk' };
}

export function checkAndroidArchitecture(report, architecture) {
  if (!['arm64-v8a', 'x86_64'].includes(architecture) || typeof report !== 'string' || report.length > 262_144)
    throw new Error('Invalid Android architecture inventory.');
  const entries = report.split(/\r?\n/).filter(line => line.startsWith('native-code:'));
  if (entries.length !== 1 || entries[0].trim() !== `native-code: '${architecture}'`)
    throw new Error('APK native architecture does not match its selected preview target.');
  return architecture;
}

export function inspectAndroidArchitecture(apk, aapt, architecture) {
  let report;
  try { report = execFileSync(aapt, ['dump', 'badging', apk], { encoding: 'utf8', timeout: 15_000, maxBuffer: 262_144, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw new Error('Could not inspect APK native architecture with Android SDK aapt2.'); }
  return checkAndroidArchitecture(report, architecture);
}
