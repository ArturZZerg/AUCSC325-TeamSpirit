import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Personal Canvas access tokens are sealed with AES-256-GCM before storage
// (ADR 019). The account id is bound as associated data, so a sealed token
// copied to another account's row cannot be opened.
const sealedPattern = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Reads CANVAS_TOKEN_KEY: 32 random bytes in canonical base64. Errors name the setting only. */
export function canvasTokenKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const value = env.CANVAS_TOKEN_KEY ?? '';
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) throw new Error('CANVAS_TOKEN_KEY must be 32 random bytes in canonical base64');
  return key;
}
const aad = (userId: string) => Buffer.from(`campusflow-canvas-token:v1:${userId}`, 'utf8');

export function sealCanvasToken(key: Buffer, userId: string, token: string): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(userId));
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function isSealedCanvasToken(value: string): boolean { return sealedPattern.test(value); }

export function openCanvasToken(key: Buffer, userId: string, sealed: string): string {
  try {
    if (!isSealedCanvasToken(sealed) || sealed.length > 2048) throw new Error();
    const [iv, tag, encrypted] = sealed.split('.').slice(1).map(part => Buffer.from(part, 'base64url'));
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad(userId)); decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch { throw new Error('Stored Canvas token is unavailable'); }
}
