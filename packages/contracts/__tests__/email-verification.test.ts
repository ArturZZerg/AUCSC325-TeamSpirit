import { authCapabilitySchema, authResultSchema, emailVerificationConfirmSchema, emailVerificationRequestSchema, emailVerificationResultSchema, loginRequestSchema, registerRequestSchema } from '../src';

const credentials = { email: ' Student@Example.Test ', password: 'previous-password-123' }, code = 'abc123-def456-abc123-def456-abc123';
it('normalizes bounded identity email consistently without modifying passwords', () => {
  expect(emailVerificationRequestSchema.parse({ ...credentials, password: ' with spaces ' })).toEqual({ email: 'student@example.test', password: ' with spaces ' });
  expect(loginRequestSchema.parse(credentials).email).toBe('student@example.test');
  expect(registerRequestSchema.parse({ ...credentials, displayName: 'Student', timeZone: 'UTC' }).email).toBe('student@example.test');
});
it('requires the account password and normalizes a pasted verification code', () => {
  expect(emailVerificationConfirmSchema.parse({ ...credentials, code }).code).toBe(code.replace(/-/g, '').toUpperCase());
  expect(emailVerificationConfirmSchema.safeParse({ email: credentials.email, code }).success).toBe(false);
});
it.each([{ password: '' }, { password: 'a'.repeat(129) }, { code: '123456' }, { code: ' '.repeat(81) }, { email: 'a'.repeat(321) }, { token: code }, { userId: 'forged' }])('rejects invalid or forged verification fields: %j', patch => {
  expect(emailVerificationConfirmSchema.safeParse({ ...credentials, code, ...patch }).success).toBe(false);
});
it('keeps verification-required results separate from app-access sessions', () => {
  const result = { verificationRequired: true, codeRequested: false, expiresInMinutes: 15 };
  expect(authResultSchema.parse(result)).toEqual(result);
  for (const patch of [{ accessToken: 'leaked' }, { passwordHash: 'leaked' }, { expiresInMinutes: 60 }, { codeRequested: 'true' }])
    expect(authResultSchema.safeParse({ ...result, ...patch }).success).toBe(false);
  expect(emailVerificationResultSchema.parse({ verified: true })).toEqual({ verified: true });
  expect(emailVerificationResultSchema.safeParse({ verified: true, accessToken: 'leaked' }).success).toBe(false);
});
it('exposes only global registration and verification capabilities', () => {
  expect(authCapabilitySchema.parse({ registration: 'closed', verificationAvailable: false })).toEqual({ registration: 'closed', verificationAvailable: false });
  expect(authCapabilitySchema.safeParse({ registration: 'verified', verificationAvailable: true, emailExists: true }).success).toBe(false);
});
