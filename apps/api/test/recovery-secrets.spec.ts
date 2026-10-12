import { randomBytes, randomUUID } from 'node:crypto';
import { createRecoveryCode, formatRecoveryCode, openRecoveryEnvelope, recoveryCodeHash, recoveryPrivateId, recoveryRecipientHash, sealRecoveryEnvelope } from '../src/auth-recovery/recovery-secrets';

describe('private recovery credentials and durable mail envelopes', () => {
  const email = 'student@example.test', code = '123456ABCDEF123456ABCDEF123456';
  it('generates full random grouped codes and hashes safe paste forms identically', () => {
    const first = createRecoveryCode(), second = createRecoveryCode();
    expect(first).toMatch(/^[0-9A-F]{6}(?:-[0-9A-F]{6}){4}$/); expect(first).not.toBe(second);
    expect(formatRecoveryCode(code.toLowerCase())).toBe('123456-ABCDEF-123456-ABCDEF-123456');
    expect(recoveryCodeHash(formatRecoveryCode(code))).toBe(recoveryCodeHash(code.toLowerCase()));
    expect(recoveryCodeHash(code)).toMatch(/^[a-f0-9]{64}$/);
    expect(recoveryCodeHash(code)).not.toContain(code);
  });
  it.each(['', '123456', 'G'.repeat(30), '1'.repeat(31), '1'.repeat(81)])('rejects incomplete or malformed credential %s', value => {
    expect(() => recoveryCodeHash(value)).toThrow();
  });
  it('restores the same validated payload after restart without exposing its contents in storage', () => {
    const key = randomBytes(32), id = randomUUID(), envelope = { kind: 'code' as const, email, code };
    const first = sealRecoveryEnvelope(key, id, envelope), second = sealRecoveryEnvelope(key, id, envelope);
    expect(first).not.toBe(second); expect(first).not.toContain(email); expect(first).not.toContain(code);
    expect(openRecoveryEnvelope(Buffer.from(key), id, first)).toEqual(envelope);
    expect(openRecoveryEnvelope(key, id, second)).toEqual(envelope);
  });
  it('seals a password-change notice without storing any password or reset credential', () => {
    const key = randomBytes(32), id = randomUUID(), envelope = { kind: 'changed' as const, email };
    expect(openRecoveryEnvelope(key, id, sealRecoveryEnvelope(key, id, envelope))).toEqual(envelope);
  });
  it.each(['key', 'id', 'tag', 'payload', 'format', 'oversized'] as const)('rejects %s tampering with a private generic error', variant => {
    const key = randomBytes(32), id = randomUUID(); let selectedKey = key, selectedId = id;
    let sealed = sealRecoveryEnvelope(key, id, { kind: 'code', email, code });
    if (variant === 'key') selectedKey = randomBytes(32);
    if (variant === 'id') selectedId = randomUUID();
    if (variant === 'tag' || variant === 'payload') {
      const parts = sealed.split('.'), index = variant === 'tag' ? 2 : 3;
      parts[index] = (parts[index][0] === 'A' ? 'B' : 'A') + parts[index].slice(1); sealed = parts.join('.');
    }
    if (variant === 'format') sealed = sealed.replace('v1.', 'v2.');
    if (variant === 'oversized') sealed = 'x'.repeat(4097);
    expect(() => openRecoveryEnvelope(selectedKey, selectedId, sealed)).toThrow('Recovery message is unavailable');
  });
  it('separates private quota/recipient contexts and key material without storing the address', () => {
    const key = randomBytes(32), recipient = recoveryPrivateId(key, 'recipient', email);
    expect(recipient).toMatch(/^[a-f0-9]{64}$/); expect(recipient).not.toContain(email);
    expect(recoveryPrivateId(Buffer.from(key), 'recipient', email)).toBe(recipient);
    expect(recoveryPrivateId(key, 'source', email)).not.toBe(recipient);
    expect(recoveryPrivateId(randomBytes(32), 'recipient', email)).not.toBe(recipient);
  });
  it('rejects an incorrectly sized encryption key before creating an envelope', () => {
    expect(() => sealRecoveryEnvelope(randomBytes(16), randomUUID(), { kind: 'changed', email })).toThrow('Recovery message is unavailable');
  });
  it('identifies queued recipient material for erasure consistently even when delivery is disabled', () => {
    expect(recoveryRecipientHash(' Student@EXAMPLE.test ')).toBe(recoveryRecipientHash(email));
    expect(recoveryRecipientHash('other@example.test')).not.toBe(recoveryRecipientHash(email));
    expect(recoveryRecipientHash(email)).not.toContain(email);
  });
});
