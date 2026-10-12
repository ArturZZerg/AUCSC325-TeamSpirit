import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(nodeScrypt);
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16), key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt.toString('base64')}:${key.toString('base64')}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt64, key64, extra] = encoded.split(':');
  if (algorithm !== 'scrypt' || !salt64 || !key64 || extra) return false;
  const salt = Buffer.from(salt64, 'base64'), expected = Buffer.from(key64, 'base64');
  if (salt.length !== 16 || expected.length !== 64 || salt.toString('base64') !== salt64 || expected.toString('base64') !== key64) return false;
  const actual = await scrypt(password, salt, 64) as Buffer;
  return timingSafeEqual(expected, actual);
}
