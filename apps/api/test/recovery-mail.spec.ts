import { createTransport } from 'nodemailer';
import { randomBytes, randomUUID } from 'node:crypto';
import { type RecoveryConfig } from '../src/auth-recovery/recovery-config';
import { SmtpRecoveryMailer } from '../src/auth-recovery/recovery-mail';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
const create = jest.mocked(createTransport);
describe('private SMTP recovery delivery', () => {
  const config: Extract<RecoveryConfig, { mode: 'smtp' }> = { mode: 'smtp', key: randomBytes(32), webOrigin: 'https://app.example.test',
    smtp: { host: 'smtp.example.test', port: 465, secure: true, user: 'synthetic', password: 'private-synthetic', from: 'mail@example.test' } };
  const code = 'ABC123DEF456ABC123DEF456ABC123', email = 'student@example.test', id = randomUUID(), expiresAt = new Date('2026-10-11T23:15:00Z');
  const sendMail = jest.fn().mockResolvedValue({ accepted: [email] }), close = jest.fn();
  beforeEach(() => {
    jest.useRealTimers(); create.mockReset(); sendMail.mockReset().mockResolvedValue({ accepted: [email] }); close.mockReset();
    create.mockReturnValue({ sendMail, close } as unknown as ReturnType<typeof createTransport>);
  });
  afterEach(() => jest.useRealTimers());
  it('requires certificate-verified implicit TLS with bounded timeouts and no provider/file/URL logging', async () => {
    await new SmtpRecoveryMailer(config).send(id, { kind: 'code', email, code }, expiresAt);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ secure: true, requireTLS: false,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' }, logger: false, debug: false,
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000, disableFileAccess: true, disableUrlAccess: true }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('requires STARTTLS rather than silently falling back to cleartext on the alternative port', async () => {
    await new SmtpRecoveryMailer({ ...config, smtp: { ...config.smtp, port: 587, secure: false } }).send(id, { kind: 'code', email, code }, expiresAt);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false, requireTLS: true, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' } }));
  });
  it('sends an actionable grouped code, original UTC expiry and code-free recovery URL with stable message identity', async () => {
    await new SmtpRecoveryMailer(config).send(id, { kind: 'code', email, code }, expiresAt);
    expect(sendMail).toHaveBeenCalledWith({ from: config.smtp.from, to: email, messageId: `<${id}@example.test>`,
      subject: 'Reset your CampusFlow password', text: expect.stringContaining('ABC123-DEF456-ABC123-DEF456-ABC123') });
    const body = sendMail.mock.calls[0][0].text as string;
    expect(body).toContain(expiresAt.toISOString()); expect(body).toContain('https://app.example.test/recover');
    const url = body.match(/https:\/\/\S+/)![0]; expect(url).toBe('https://app.example.test/recover');
    expect(body).not.toContain(config.smtp.password);
  });
  it('sends the password-change notice without a password or reset code', async () => {
    await new SmtpRecoveryMailer(config).send(id, { kind: 'changed', email }, expiresAt);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: email, subject: 'Your CampusFlow password changed', text: expect.stringContaining('Previous sessions have been signed out') });
    expect(sendMail.mock.calls[0][0].text).not.toContain(code);
  });
  it('sends a purpose-specific verification code with password and unsolicited-account instructions, without private binding or code in the URL', async () => {
    const credentialHash = 'a'.repeat(64);
    await new SmtpRecoveryMailer(config).send(id, { kind: 'verify', email, code, credentialHash }, expiresAt);
    const message = sendMail.mock.calls[0][0];
    expect(message.subject).toBe('Verify your CampusFlow email');
    expect(message.text).toContain('ABC123-DEF456-ABC123-DEF456-ABC123');
    expect(message.text).toContain('account password'); expect(message.text).toContain('do not verify it');
    expect(message.text).toContain('Forgot password first'); expect(message.text).toContain(expiresAt.toISOString());
    expect(message.text.match(/https:\/\/\S+/)[0]).toBe('https://app.example.test/verify');
    expect(message.text).not.toContain(credentialHash); expect(message.text).not.toContain(config.smtp.password);
  });
  it('redacts provider failures and closes the transport', async () => {
    sendMail.mockRejectedValue(new Error(`SMTP rejection ${email} ${code} ${config.smtp.password}`));
    await expect(new SmtpRecoveryMailer(config).send(id, { kind: 'code', email, code }, expiresAt)).rejects.toThrow(/^Recovery delivery is unavailable$/);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('bounds a stalled provider by an overall deadline and cancels its connection', async () => {
    jest.useFakeTimers(); sendMail.mockImplementation(() => new Promise(() => undefined));
    const sending = new SmtpRecoveryMailer(config).send(id, { kind: 'code', email, code }, expiresAt);
    const rejected = expect(sending).rejects.toThrow(/^Recovery delivery is unavailable$/);
    await jest.advanceTimersByTimeAsync(45_000); await rejected; expect(close).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
  it('never creates a connection when globally disabled', async () => {
    await expect(new SmtpRecoveryMailer({ mode: 'disabled' }).send(id, { kind: 'code', email, code }, expiresAt)).rejects.toThrow('Recovery delivery is unavailable');
    expect(create).not.toHaveBeenCalled();
  });
});
