import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function inspectSimulatorSigning(entitlements, signature, simulated) {
  const identifier = 'com.campusflow.mobile';
  if (!/^Signature=adhoc$/m.test(signature) || !/^TeamIdentifier=not set$/m.test(signature))
    throw new Error('Expected local ad-hoc simulator signing without an Apple team.');
  if (!entitlements || Object.keys(entitlements).some(key => key !== 'com.apple.security.get-task-allow'))
    throw new Error('iOS device entitlements must not be inserted into the simulator host signature.');
  if (simulated?.['application-identifier'] !== identifier)
    throw new Error('The simulator executable is missing its Keychain application identifier.');
  const groups = simulated['keychain-access-groups'];
  if (groups !== undefined && (!Array.isArray(groups) || groups.length !== 1 || groups[0] !== identifier))
    throw new Error('The simulator must not share Keychain access with other apps.');
  if (Object.keys(simulated).some(key => !['application-identifier', 'keychain-access-groups', 'get-task-allow'].includes(key)))
    throw new Error('Unreviewed simulated entitlement.');
  return { signing: 'Xcode local ad-hoc simulator signature; no Apple team or provisioning profile', keychainIdentifier: identifier,
    capabilityLocation: '__TEXT,__entitlements in each executable slice' };
}

/** Inspect the built simulator product, rather than trusting Expo configuration. */
export function inspectIosPreview(info, bundle, architectures, apiUrl, entitlements, signature, simulatedByArch) {
  if (apiUrl !== 'http://127.0.0.1:3000') throw new Error('This simulator preview requires its fixed loopback API.');
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
  let signing;
  for (const architecture of architectures) signing = inspectSimulatorSigning(entitlements, signature, simulatedByArch?.[architecture]);
  return { platform: info.DTPlatformName, bundleIdentifier: info.CFBundleIdentifier, architectures,
    minimumIos: info.MinimumOSVersion, sdk: info.DTSDKName, apiUrl, usageDescriptions: usage,
    ...signing,
    acceptance: 'simulator build; public and authenticated flow results recorded separately; physical acceptance remains open' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [infoPath, bundlePath, archText, outputPath, entitlementsPath, signaturePath, evidencePath] = process.argv.slice(2);
    if (!infoPath || !bundlePath || !archText || !outputPath || !entitlementsPath || !signaturePath || !evidencePath) throw new Error('Info, bundle, architectures, output, signature entitlements, signature and simulated evidence directory are required.');
    const architectures = archText.trim().split(/\s+/);
    const simulated = Object.fromEntries(architectures.map(architecture => [architecture, JSON.parse(readFileSync(path.join(evidencePath, `simulated-${architecture}.json`), 'utf8'))]));
    const proof = inspectIosPreview(JSON.parse(readFileSync(infoPath, 'utf8')), readFileSync(bundlePath), architectures, process.env.EXPO_PUBLIC_API_URL,
      JSON.parse(readFileSync(entitlementsPath, 'utf8')), readFileSync(signaturePath, 'utf8'), simulated);
    proof.commit = process.env.CAMPUSFLOW_BUILD_SHA;
    writeFileSync(outputPath, `${JSON.stringify(proof, null, 2)}\n`);
    console.log('Actual iOS simulator product, scheme, capabilities and bundled preview API passed.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
