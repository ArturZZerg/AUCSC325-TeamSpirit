import { Inject, Injectable } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { RECOVERY_CONFIG, type RecoveryConfig } from './recovery-config';
import { formatRecoveryCode, type RecoveryEnvelope } from './recovery-secrets';

export const RECOVERY_MAILER = Symbol('RECOVERY_MAILER');
export interface RecoveryMailer {
  send(id: string, envelope: RecoveryEnvelope, expiresAt: Date): Promise<void>;
}

@Injectable()
export class SmtpRecoveryMailer implements RecoveryMailer {
  constructor(@Inject(RECOVERY_CONFIG) private readonly config: RecoveryConfig) {}
  async send(id: string, envelope: RecoveryEnvelope, expiresAt: Date): Promise<void> {
    if (this.config.mode !== 'smtp') throw new Error('Recovery delivery is unavailable');
    const config = this.config, smtp = config.smtp;
    const transport = createTransport({
      host: smtp.host, port: smtp.port, secure: smtp.secure, requireTLS: !smtp.secure,
      auth: { user: smtp.user, pass: smtp.password }, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    });
    const text = envelope.kind === 'code'
      ? `Use this code to reset your CampusFlow password:\n\n${formatRecoveryCode(envelope.code)}\n\nThe code expires at ${expiresAt.toISOString()} (UTC), 15 minutes after your request. Open Forgot password in CampusFlow and enter it with a new password.\n\nYou can also open ${config.webOrigin}/recover . This link contains no code.\n\nIf you did not request this, you can ignore this email. Your password has not changed. Never share this code.`
      : `Your CampusFlow password was changed. Previous sessions have been signed out.\n\nIf you did not make this change, open Forgot password in CampusFlow to secure your account. You can also open ${config.webOrigin}/recover .`;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        transport.sendMail({ from: smtp.from, to: envelope.email,
          messageId: `<${id}@${smtp.from.split('@')[1]}>`,
          subject: envelope.kind === 'code' ? 'Reset your CampusFlow password' : 'Your CampusFlow password changed', text }),
        new Promise<never>((_, reject) => { deadline = setTimeout(() => { transport.close(); reject(new Error('Recovery delivery is unavailable')); }, 45_000); }),
      ]);
    } catch { throw new Error('Recovery delivery is unavailable'); }
    finally { if (deadline) clearTimeout(deadline); transport.close(); }
  }
}
