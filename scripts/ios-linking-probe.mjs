// Temporary public-flow diagnosis. Preserve the template's short-circuit
// behavior and log only callback/result metadata, never URLs or account data.
import { readFileSync, writeFileSync } from 'node:fs';
const file = 'apps/mobile/ios/CampusFlow/AppDelegate.swift';
const original = 'return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)';
const source = readFileSync(file, 'utf8');
if (source.split(original).length !== 2) throw new Error('Native URL callback template changed; inspect it before diagnosis.');
writeFileSync(file, source.replace(original, `NSLog("CF_QA_NATIVE_URL_CALLBACK")
    let expoHandled = super.application(app, open: url, options: options)
    NSLog("CF_QA_NATIVE_EXPO_HANDLED: \\(expoHandled)")
    if expoHandled { return true }
    let reactHandled = RCTLinkingManager.application(app, open: url, options: options)
    NSLog("CF_QA_NATIVE_REACT_HANDLED: \\(reactHandled)")
    return reactHandled`));
