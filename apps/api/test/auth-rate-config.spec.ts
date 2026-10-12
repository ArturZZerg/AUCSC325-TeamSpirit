import { randomBytes } from 'node:crypto';
import { authRateConfig } from '../src/auth-rate';

describe('authentication quotas configuration', () => {
  it.each([{}, { NODE_ENV: 'development' }, { NODE_ENV: 'test' }, { AUTH_RATE_KEY: '' }])('keeps local preview counters without a shared key %j', env => {
    expect(authRateConfig(env)).toEqual({ mode: 'local' });
  });
  it.each(['closed', 'verified'])('requires an independent shared key even with registration %s and SMTP disabled', mode => {
    expect(() => authRateConfig({ NODE_ENV: 'production', REGISTRATION_MODE: mode, RECOVERY_DELIVERY: 'disabled' })).toThrow('AUTH_RATE_KEY is required');
  });
  it('accepts one canonical random key without any mail configuration', () => {
    const key = randomBytes(32);
    expect(authRateConfig({ NODE_ENV: 'production', AUTH_RATE_KEY: key.toString('base64') })).toEqual({ mode: 'shared', key });
  });
  it.each(['secret-do-not-log', Buffer.alloc(32).toString('base64'), Buffer.alloc(32, 9).toString('base64'), randomBytes(31).toString('base64'), ` ${randomBytes(32).toString('base64')}`])('rejects invalid keys without echoing values', value => {
    try { authRateConfig({ AUTH_RATE_KEY: value }); throw new Error('Expected validation'); }
    catch (error) { expect((error as Error).message).toBe('Invalid AUTH_RATE_KEY'); expect((error as Error).message).not.toContain(value); }
  });
});
