import { isIP } from 'node:net';

export type RequestSourceMode = 'socket' | 'loopback';
export interface SourceRequest {
  socket: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
}

// Setting values can contain credentials; errors name only the setting.
export function requestSourceMode(env: NodeJS.ProcessEnv = process.env): RequestSourceMode {
  const mode = env.AUTH_SOURCE_MODE ?? 'socket';
  if (mode !== 'socket' && mode !== 'loopback') throw new Error('Invalid AUTH_SOURCE_MODE');
  if (mode === 'loopback' && env.HOST !== '127.0.0.1' && env.HOST !== '::1')
    throw new Error('AUTH_SOURCE_MODE loopback requires explicit loopback HOST');
  return mode;
}

export function requestSource(request: SourceRequest, mode = requestSourceMode()): string {
  const peer = request.socket.remoteAddress ?? 'unknown';
  if (mode !== 'loopback' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)) return peer;
  const forwarded = request.headers?.['x-forwarded-for'];
  // Nginx must replace this header, never append an untrusted chain.
  return typeof forwarded === 'string' && forwarded.length <= 45 && isIP(forwarded) ? forwarded : peer;
}
