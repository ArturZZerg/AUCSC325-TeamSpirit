import type { RecoveryConfig } from './auth-recovery/recovery-config';

export const REGISTRATION_CONFIG = Symbol('REGISTRATION_CONFIG');
export interface RegistrationConfig { mode: 'preview' | 'verified' | 'closed' }
export function registrationConfig(mail: RecoveryConfig, env: NodeJS.ProcessEnv = process.env): RegistrationConfig {
  const mode = env.REGISTRATION_MODE ?? (env.NODE_ENV === 'production' ? 'closed' : 'preview');
  if (!['preview', 'verified', 'closed'].includes(mode) || env.NODE_ENV === 'production' && mode === 'preview')
    throw new Error('Invalid REGISTRATION_MODE');
  if (mode === 'verified' && mail.mode !== 'smtp') throw new Error('REGISTRATION_MODE verified requires SMTP delivery');
  return { mode: mode as RegistrationConfig['mode'] };
}
