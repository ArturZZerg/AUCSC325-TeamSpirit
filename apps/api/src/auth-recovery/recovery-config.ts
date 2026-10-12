import { passwordRecoveryRequestSchema } from '@campusflow/contracts';
import { isIP } from 'node:net';

export const RECOVERY_CONFIG = Symbol('RECOVERY_CONFIG');

export type RecoveryConfig = { mode: 'disabled' } | {
  mode: 'smtp'; key: Buffer; webOrigin: string;
  smtp: { host: string; port: number; secure: boolean; user: string; password: string; from: string };
};

// Values can contain credentials. Every configuration error names only a setting.
export function recoveryConfig(env: NodeJS.ProcessEnv = process.env): RecoveryConfig {
  const mode = env.RECOVERY_DELIVERY ?? 'disabled';
  if (mode === 'disabled') return { mode };
  if (mode !== 'smtp') throw new Error('Invalid RECOVERY_DELIVERY');
  const encodedKey = env.RECOVERY_OUTBOX_KEY ?? '';
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encodedKey || key.every(byte => byte === key[0]))
    throw new Error('Invalid RECOVERY_OUTBOX_KEY');
  const host = env.SMTP_HOST ?? '';
  if (!isIP(host) && !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(host))
    throw new Error('Invalid SMTP_HOST');
  const rawPort = env.SMTP_PORT ?? '465', port = Number(rawPort);
  if (!/^\d{1,5}$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP_PORT');
  const tls = env.SMTP_TLS_MODE ?? (port === 465 ? 'implicit' : 'starttls');
  if (!['implicit', 'starttls'].includes(tls)) throw new Error('Invalid SMTP_TLS_MODE');
  const user = env.SMTP_USER ?? '', password = env.SMTP_PASSWORD ?? '';
  if (!user || user.length > 320 || /[\r\n\0]/.test(user)) throw new Error('Invalid SMTP_USER');
  if (!password || password.length > 1000 || /[\r\n\0]/.test(password)) throw new Error('Invalid SMTP_PASSWORD');
  const from = passwordRecoveryRequestSchema.safeParse({ email: env.SMTP_FROM });
  if (!from.success) throw new Error('Invalid SMTP_FROM');
  let web: URL;
  try { web = new URL(env.RECOVERY_WEB_URL ?? ''); } catch { throw new Error('Invalid RECOVERY_WEB_URL'); }
  if (web.protocol !== 'https:' || web.username || web.password || web.origin !== env.RECOVERY_WEB_URL ||
    web.hostname === 'localhost' || web.hostname.endsWith('.localhost') || /^127\./.test(web.hostname) ||
    /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(web.hostname) ||
    ['[::1]', '[::ffff:0:0]', '0.0.0.0'].includes(web.hostname)) throw new Error('Invalid RECOVERY_WEB_URL');
  return { mode, key, webOrigin: web.origin, smtp: { host, port, secure: tls === 'implicit', user, password, from: from.data.email } };
}
