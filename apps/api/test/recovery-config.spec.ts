import { recoveryConfig } from '../src/auth-recovery/recovery-config';

const smtp = { RECOVERY_DELIVERY: 'smtp', RECOVERY_OUTBOX_KEY: Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString('base64'),
  SMTP_HOST: 'mail.example.test', SMTP_USER: 'private-user', SMTP_PASSWORD: 'private-password', SMTP_FROM: 'CampusFlow@example.test',
  RECOVERY_WEB_URL: 'https://app.example.test' };
describe('recovery delivery configuration', () => {
  it('defaults to disabled without parsing unused credentials or selecting a provider', () => {
    expect(recoveryConfig({})).toEqual({ mode: 'disabled' });
    expect(recoveryConfig({ RECOVERY_DELIVERY: 'disabled', SMTP_PASSWORD: 'unused', RECOVERY_OUTBOX_KEY: 'unused' })).toEqual({ mode: 'disabled' });
  });
  it('requires explicit SMTP activation and canonical private key material', () => {
    const config = recoveryConfig(smtp);
    expect(config.mode).toBe('smtp'); if (config.mode !== 'smtp') throw new Error('SMTP configuration expected');
    expect(config.key).toHaveLength(32); expect(config.webOrigin).toBe('https://app.example.test');
    expect(config.smtp).toEqual({ host: 'mail.example.test', port: 465, secure: true, user: 'private-user', password: 'private-password', from: 'campusflow@example.test' });
    const starttls = recoveryConfig({ ...smtp, SMTP_PORT: '587' });
    if (starttls.mode !== 'smtp') throw new Error('SMTP configuration expected'); expect(starttls.smtp.secure).toBe(false);
  });
  it.each([
    { RECOVERY_DELIVERY: 'fixture' }, { RECOVERY_DELIVERY: '' }, { RECOVERY_OUTBOX_KEY: undefined }, { RECOVERY_OUTBOX_KEY: 'private-invalid' },
    { RECOVERY_OUTBOX_KEY: Buffer.alloc(32).toString('base64') }, { SMTP_HOST: 'https://mail.example.test/path' }, { SMTP_HOST: 'mail\r\ninvalid' },
    { SMTP_PORT: '0' }, { SMTP_PORT: '65536' }, { SMTP_PORT: '465.0' }, { SMTP_PORT: ' 465' }, { SMTP_TLS_MODE: 'plain' },
    { SMTP_USER: undefined }, { SMTP_PASSWORD: undefined }, { SMTP_PASSWORD: 'private\r\npassword' },
    { SMTP_FROM: 'invalid\r\nrecipient@example.test' }, { RECOVERY_WEB_URL: 'http://app.example.test' },
    { RECOVERY_WEB_URL: 'https://private-user:private-password@app.example.test' }, { RECOVERY_WEB_URL: 'https://app.example.test/reset' },
    { RECOVERY_WEB_URL: 'https://localhost' }, { RECOVERY_WEB_URL: 'https://127.0.0.1' },
    { RECOVERY_WEB_URL: 'https://[::1]' }, { RECOVERY_WEB_URL: 'https://[::ffff:127.0.0.1]' },
    { RECOVERY_WEB_URL: 'https://[::ffff:0.0.0.0]' }, { RECOVERY_WEB_URL: 'https://0.0.0.0' },
  ])('fails invalid configuration without echoing a credential or host value %j', invalid => {
    try { recoveryConfig({ ...smtp, ...invalid }); throw new Error('Invalid configuration accepted'); }
    catch (error) { expect((error as Error).message).toMatch(/^Invalid (RECOVERY_|SMTP_)[A-Z_]+$/); }
  });
});
