import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Inspect the built simulator product, rather than trusting Expo configuration. */
export function inspectIosPreview(info, bundle, architectures, apiUrl) {
  if (apiUrl !== 'http://127.0.0.1:3000') throw new Error('This public-only simulator preview requires its fixed loopback API.');
  if (info.DTPlatformName !== 'iphonesimulator') throw new Error('Expected an iOS simulator product, not a device/store archive.');
  if (info.CFBundleIdentifier !== 'com.campusflow.mobile' || info.CFBundleExecutable !== 'CampusFlow') throw new Error('Unexpected iOS preview identity.');
  if (!Array.isArray(architectures) || !architectures.length || architectures.some(arch => !['arm64', 'x86_64'].includes(arch))) throw new Error('Unexpected simulator executable architecture.');
  if (!Array.isArray(info.CFBundleURLTypes) || !info.CFBundleURLTypes.some(type => type.CFBundleURLSchemes?.includes('campusflow'))) throw new Error('CampusFlow incoming-link scheme is missing.');
  const usage = Object.keys(info).filter(key => /^NS.*UsageDescription$/.test(key));
  const unnecessary = usage.filter(key => key !== 'NSLocalNetworkUsageDescription');
  if (unnecessary.length) throw new Error(`Unreviewed sensitive capabilities: ${unnecessary.join(', ')}.`);
  if (info.NSAppTransportSecurity?.NSAllowsArbitraryLoads === true) throw new Error('The preview must not permit arbitrary insecure network loads.');
  if (info.UIBackgroundModes?.length) throw new Error('Unexpected iOS background modes.');
  for (const text of [apiUrl, 'A little help for your day.']) {
    if (!bundle.includes(Buffer.from(text)) && !bundle.includes(Buffer.from(text, 'utf16le'))) throw new Error('The built bundle is missing the selected preview API or public Help screen.');
  }
  return { platform: info.DTPlatformName, bundleIdentifier: info.CFBundleIdentifier, architectures,
    minimumIos: info.MinimumOSVersion, sdk: info.DTSDKName, apiUrl, usageDescriptions: usage,
    signing: 'unsigned simulator preview', acceptance: 'public flows only; authenticated and physical acceptance remain separate' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [infoPath, bundlePath, archText, outputPath] = process.argv.slice(2);
    if (!infoPath || !bundlePath || !archText || !outputPath) throw new Error('Usage: ios-preview.mjs info.json main.jsbundle architectures output.json');
    const proof = inspectIosPreview(JSON.parse(readFileSync(infoPath, 'utf8')), readFileSync(bundlePath), archText.trim().split(/\s+/), process.env.EXPO_PUBLIC_API_URL);
    proof.commit = process.env.CAMPUSFLOW_BUILD_SHA;
    writeFileSync(outputPath, `${JSON.stringify(proof, null, 2)}\n`);
    console.log('Actual iOS simulator product, scheme, capabilities and bundled preview API passed.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
