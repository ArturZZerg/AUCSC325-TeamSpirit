/* eslint-disable @typescript-eslint/no-require-imports */
const { getDefaultConfig } = require('expo/metro-config');
const { createHash } = require('node:crypto');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');
// Expo's native CI bundler disables --reset-cache. Partition transforms by the
// public endpoint/link configuration so environment-only changes cannot reuse old URLs.
const publicConfig = [process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
  process.env.EXPO_PUBLIC_PRIVACY_URL ?? '', process.env.EXPO_PUBLIC_SUPPORT_URL ?? '', process.env.EXPO_PUBLIC_TERMS_URL ?? ''];
config.cacheVersion = `${config.cacheVersion ?? ''}-campusflow-public-${createHash('sha256').update(JSON.stringify(publicConfig)).digest('hex')}`;

module.exports = config;
