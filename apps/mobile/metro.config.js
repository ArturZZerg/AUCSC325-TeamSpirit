/* eslint-disable @typescript-eslint/no-require-imports */
const { getDefaultConfig } = require('expo/metro-config');
const { createHash } = require('node:crypto');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('wasm');
// Expo's native CI bundler disables --reset-cache. Partition transforms by the
// selected public API so an environment-only change cannot reuse its old URL.
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
config.cacheVersion = `${config.cacheVersion ?? ''}-campusflow-api-${createHash('sha256').update(apiUrl).digest('hex')}`;

module.exports = config;
