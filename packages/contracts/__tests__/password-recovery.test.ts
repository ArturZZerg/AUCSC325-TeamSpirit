import { passwordRecoveryAcceptedSchema, passwordRecoveryCapabilitySchema, passwordRecoveryRequestSchema, passwordResetRequestSchema, passwordResetResultSchema } from '../src';

describe('password recovery boundaries', () => {
  const reset = { email: 'Student@EXAMPLE.test', code: '123456-ABCDEF-123456-ABCDEF-123456', newPassword: 'new-long-password-123' };
  it('normalizes account addresses consistently while rejecting client ownership fields', () => {
    expect(passwordRecoveryRequestSchema.parse({ email: ' Student@EXAMPLE.test ' })).toEqual({ email: 'student@example.test' });
    expect(passwordRecoveryRequestSchema.safeParse({ email: reset.email, userId: 'other' }).success).toBe(false);
    expect(passwordRecoveryRequestSchema.safeParse({ email: 'x'.repeat(255) + '@example.test' }).success).toBe(false);
    expect(passwordRecoveryRequestSchema.safeParse({ email: 'student\r\n@example.test' }).success).toBe(false);
  });
  it('accepts a full safely pasted code without trimming or rewriting the new password', () => {
    const parsed = passwordResetRequestSchema.parse({ ...reset, code: ' 123456 abcdef\n123456-abcdef-123456 ', newPassword: '  new-password-123  ' });
    expect(parsed.code).toBe('123456ABCDEF123456ABCDEF123456'); expect(parsed.email).toBe('student@example.test');
    expect(parsed.newPassword).toBe('  new-password-123  ');
  });
  it.each(['123456', 'G'.repeat(30), '1'.repeat(31), '1'.repeat(81), '123456ABCDEF123456ABCDEF12345!'])('rejects unsafe/incomplete code %s', code => {
    expect(passwordResetRequestSchema.safeParse({ ...reset, code }).success).toBe(false);
  });
  it.each([11, 129])('enforces the registration password bounds at %s characters', length => {
    expect(passwordResetRequestSchema.safeParse({ ...reset, newPassword: 'x'.repeat(length) }).success).toBe(false);
  });
  it('bounds raw code input before whitespace normalization', () => {
    expect(passwordResetRequestSchema.safeParse({ ...reset, code: ' '.repeat(81) + reset.code }).success).toBe(false);
  });
  it('bounds raw email input before whitespace normalization', () => {
    expect(passwordRecoveryRequestSchema.safeParse({ email: ' '.repeat(321) + reset.email }).success).toBe(false);
  });
  it('keeps acknowledgments and capabilities free of account or bearer information', () => {
    expect(passwordRecoveryAcceptedSchema.parse({ accepted: true })).toEqual({ accepted: true });
    expect(passwordRecoveryAcceptedSchema.safeParse({ accepted: true, exists: true }).success).toBe(false);
    expect(passwordRecoveryAcceptedSchema.safeParse({ accepted: true, code: reset.code }).success).toBe(false);
    expect(passwordResetResultSchema.safeParse({ reset: true, accessToken: 'unexpected' }).success).toBe(false);
    expect(passwordRecoveryCapabilitySchema.parse({ available: false, expiresInMinutes: 15 }).available).toBe(false);
    expect(passwordRecoveryCapabilitySchema.safeParse({ available: true, expiresInMinutes: 60 }).success).toBe(false);
  });
});
