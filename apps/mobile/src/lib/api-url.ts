/**
 * The API origin for every request, including logout from the session store.
 * Builds that ship (scripts/build-android.mjs, the iOS build) validate it and always
 * set EXPO_PUBLIC_API_URL; the localhost fallback only serves development and tests.
 */
export const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
