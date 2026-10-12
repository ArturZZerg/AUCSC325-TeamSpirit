// Shared by Expo configuration and the native Help screen. Never include a
// malformed configured value in diagnostics or in a published bundle.
function publishedLink(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || value !== value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || !url.hostname.includes('.') ||
      /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':')) return undefined;
    return url.href;
  } catch { return undefined; }
}
function validatePublishedLinks(env) {
  for (const name of ['EXPO_PUBLIC_PRIVACY_URL', 'EXPO_PUBLIC_SUPPORT_URL']) {
    if (env[name] !== undefined && env[name] !== '' && !publishedLink(env[name]))
      throw new Error(`${name} must be an HTTPS website URL without credentials, query or fragment.`);
  }
}
module.exports = { publishedLink, validatePublishedLinks };
