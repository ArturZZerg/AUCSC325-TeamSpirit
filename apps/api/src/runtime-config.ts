import { requestSourceMode } from './request-source';
import { canvasTokenKey } from './integrations/canvas/canvas-token';

export interface RuntimeConfig { port: number; host: string; schema: string; corsOrigins: true | string[] }

// Errors name the setting only: environment values can contain credentials.
export function runtimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  if (env.NODE_ENV && !['development', 'test', 'production'].includes(env.NODE_ENV)) throw new Error('Invalid NODE_ENV');
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const host = env.HOST ?? '127.0.0.1';
  if (!host.trim() || /\s/.test(host)) throw new Error('Invalid HOST');
  requestSourceMode(env);
  let schema = 'public';
  if (env.DATABASE_URL) {
    let url: URL;
    try { url = new URL(env.DATABASE_URL); } catch { throw new Error('Invalid DATABASE_URL'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2 || url.hash)
      throw new Error('Invalid DATABASE_URL');
    schema = url.searchParams.get('schema') ?? 'public';
    if (url.searchParams.getAll('schema').length > 1) throw new Error('Invalid DATABASE_URL schema');
  } else if (production) throw new Error('DATABASE_URL is required in production');
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid DATABASE_URL schema');
  const origins = env.CORS_ORIGIN?.split(',').map(value => value.trim());
  if (origins?.some(value => !value)) throw new Error('Invalid CORS_ORIGIN');
  if (production) {
    if (!origins?.length) throw new Error('CORS_ORIGIN is required in production');
    for (const origin of origins) {
      let url: URL;
      try { url = new URL(origin); } catch { throw new Error('Invalid CORS_ORIGIN'); }
      if (url.protocol !== 'https:' || url.username || url.password || url.origin !== origin ||
        url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || /^127\./.test(url.hostname) ||
        /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(url.hostname) ||
        ['[::1]', '[::ffff:0:0]', '0.0.0.0'].includes(url.hostname)) throw new Error('Invalid CORS_ORIGIN');
    }
    if (env.CANVAS_MODE && !['disabled', 'token'].includes(env.CANVAS_MODE)) throw new Error('CANVAS_MODE must be disabled or token in production');
    if (env.CANVAS_MODE === 'token') canvasTokenKey(env);
  }
  return { port, host, schema, corsOrigins: origins ?? true };
}
