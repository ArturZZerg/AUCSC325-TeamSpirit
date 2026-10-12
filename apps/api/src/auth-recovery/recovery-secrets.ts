import { passwordRecoveryRequestSchema, passwordResetRequestSchema } from '@campusflow/contracts';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';

const envelopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('code'), email: passwordRecoveryRequestSchema.shape.email, code: passwordResetRequestSchema.shape.code }).strict(),
  z.object({ kind: z.literal('changed'), email: passwordRecoveryRequestSchema.shape.email }).strict(),
  z.object({ kind: z.literal('verify'), email: passwordRecoveryRequestSchema.shape.email, code: passwordResetRequestSchema.shape.code,
    credentialHash: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
]);
export type RecoveryEnvelope = z.infer<typeof envelopeSchema>;
export function verificationCredentialHash(encodedPassword: string): string {
  return createHash('sha256').update(encodedPassword).digest('hex');
}
function checkKey(key: Buffer) { if (key.length !== 32) throw new Error('Recovery message is unavailable'); }
function associatedData(id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new Error('Recovery message is unavailable');
  return Buffer.from(`campusflow-recovery-mail:v1:${id}`, 'utf8');
}
export function createRecoveryCode(): string { return formatRecoveryCode(randomBytes(15).toString('hex')); }
export function formatRecoveryCode(code: string): string { return passwordResetRequestSchema.shape.code.parse(code).match(/.{6}/g)!.join('-'); }
export function recoveryCodeHash(code: string): string {
  return createHash('sha256').update(passwordResetRequestSchema.shape.code.parse(code)).digest('hex');
}
export function recoveryRecipientHash(email: string): string {
  return createHash('sha256').update(passwordRecoveryRequestSchema.shape.email.parse(email)).digest('hex');
}
export function recoveryPrivateId(key: Buffer, scope: string, value: string): string {
  checkKey(key);
  return createHmac('sha256', key).update(JSON.stringify([scope, value])).digest('hex');
}
export function sealRecoveryEnvelope(key: Buffer, id: string, envelope: RecoveryEnvelope): string {
  checkKey(key);
  const parsed = envelopeSchema.safeParse(envelope);
  if (!parsed.success) throw new Error('Recovery message is unavailable');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(associatedData(id));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(parsed.data), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function openRecoveryEnvelope(key: Buffer, id: string, sealed: string): RecoveryEnvelope {
  try {
    checkKey(key);
    if (sealed.length > 4096) throw new Error();
    const parts = sealed.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') throw new Error();
    const [iv, tag, encrypted] = parts.slice(1).map(part => {
      if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error();
      const bytes = Buffer.from(part, 'base64url');
      if (bytes.toString('base64url') !== part) throw new Error();
      return bytes;
    });
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(associatedData(id)); decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    return envelopeSchema.parse(JSON.parse(plain));
  } catch { throw new Error('Recovery message is unavailable'); }
}
