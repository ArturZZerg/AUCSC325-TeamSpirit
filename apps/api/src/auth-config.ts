import type { RecoveryConfig } from './auth-recovery/recovery-config';

export const REGISTRATION_CONFIG = Symbol('REGISTRATION_CONFIG');
export interface RegistrationConfig { mode: 'preview' | 'verified' | 'closed' }
export function registrationConfig(mail: RecoveryConfig, env: NodeJS.ProcessEnv = process.env): RegistrationConfig {
  const mode = env.REGISTRATION_MODE ?? (env.NODE_ENV === 'production' ? 'closed' : 'preview');
  // Production accepts unverified signup only with a second, explicit opt-in (ADR 018).
  const unverifiedAllowed = env.NODE_ENV !== 'production' || env.ALLOW_UNVERIFIED_SIGNUP === 'true';
  if (!['preview', 'verified', 'closed'].includes(mode) || mode === 'preview' && !unverifiedAllowed)
    throw new Error('Invalid REGISTRATION_MODE');
  if (mode === 'verified' && mail.mode !== 'smtp') throw new Error('REGISTRATION_MODE verified requires SMTP delivery');
  return { mode: mode as RegistrationConfig['mode'] };
}
