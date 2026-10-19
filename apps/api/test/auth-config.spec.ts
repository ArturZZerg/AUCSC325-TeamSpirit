import { registrationConfig } from '../src/auth-config';
import { randomBytes } from 'node:crypto';
import type { RecoveryConfig } from '../src/auth-recovery/recovery-config';
import { AuthGuard } from '../src/common';
import type { ExecutionContext } from '@nestjs/common';
import type { PrismaService } from '../src/prisma.service';

const disabled: RecoveryConfig = { mode: 'disabled' }, smtp: RecoveryConfig = { mode: 'smtp', key: randomBytes(32),
  webOrigin: 'https://app.example.test', smtp: { host: 'smtp.example.test', port: 465, secure: true, user: 'fixture', password: 'fixture', from: 'mail@example.test' } };
it('fails closed in production if a guard is constructed without its registration provider', async () => {
  const previous = process.env.NODE_ENV; let guard: AuthGuard;
  try {
    process.env.NODE_ENV = 'production';
    guard = new AuthGuard({ session: { findUnique: async () => ({ revokedAt: null, expiresAt: new Date(Date.now() + 60_000), user: { emailVerifiedAt: null } }) } } as unknown as PrismaService);
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
  const context = { switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer synthetic-preview-session' } }) }) } as unknown as ExecutionContext;
  await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
});
it.each([undefined, 'development', 'test'])('retains preview defaults only outside production: %s', NODE_ENV => {
  expect(registrationConfig(disabled, { NODE_ENV })).toEqual({ mode: 'preview' });
});
it('closes public signup by default without inventing verified users', () => {
  expect(registrationConfig(disabled, { NODE_ENV: 'production' })).toEqual({ mode: 'closed' });
});
it.each(['preview', 'invalid', '', 'verified-with-fixtures'])('rejects unsupported production modes without leaking the value: %s', REGISTRATION_MODE => {
  expect(() => registrationConfig(smtp, { NODE_ENV: 'production', REGISTRATION_MODE })).toThrow(/^Invalid REGISTRATION_MODE$/);
});
it('allows unverified production signup only with the explicit opt-in', () => {
  expect(registrationConfig(disabled, { NODE_ENV: 'production', REGISTRATION_MODE: 'preview', ALLOW_UNVERIFIED_SIGNUP: 'true' })).toEqual({ mode: 'preview' });
  for (const ALLOW_UNVERIFIED_SIGNUP of [undefined, '', 'false', 'TRUE', '1'])
    expect(() => registrationConfig(disabled, { NODE_ENV: 'production', REGISTRATION_MODE: 'preview', ALLOW_UNVERIFIED_SIGNUP })).toThrow(/^Invalid REGISTRATION_MODE$/);
  // The opt-in alone never opens signup.
  expect(registrationConfig(disabled, { NODE_ENV: 'production', ALLOW_UNVERIFIED_SIGNUP: 'true' })).toEqual({ mode: 'closed' });
});
it('requires SMTP for verified signup and permits an explicit closed deployment', () => {
  expect(() => registrationConfig(disabled, { REGISTRATION_MODE: 'verified' })).toThrow('requires SMTP');
  expect(registrationConfig(smtp, { NODE_ENV: 'production', REGISTRATION_MODE: 'verified' })).toEqual({ mode: 'verified' });
  expect(registrationConfig(disabled, { NODE_ENV: 'production', REGISTRATION_MODE: 'closed' })).toEqual({ mode: 'closed' });
});
