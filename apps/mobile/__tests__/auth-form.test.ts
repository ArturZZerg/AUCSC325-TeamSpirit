import { authFormSchema } from '../src/features/auth-form';

const values = { email: 'student@example.test', password: 'test-password-123', displayName: '', timeZone: 'America/Edmonton' };

describe('phone account forms', () => {
  it('allows existing users to sign in without filling a hidden name field', () => {
    expect(authFormSchema(false).safeParse(values).success).toBe(true);
  });

  it('requires a name when creating an account', () => {
    expect(authFormSchema(true).safeParse(values).success).toBe(false);
    expect(authFormSchema(true).safeParse({ ...values, displayName: 'Student' }).success).toBe(true);
  });

  it('validates registration password and timezone before sending a request', () => {
    expect(authFormSchema(true).safeParse({ ...values, displayName: 'Student', password: 'short' }).success).toBe(false);
    expect(authFormSchema(true).safeParse({ ...values, displayName: 'Student', timeZone: 'invalid-zone' }).success).toBe(false);
  });

  it('rejects invalid email and empty password at sign-in', () => {
    expect(authFormSchema(false).safeParse({ ...values, email: 'invalid' }).success).toBe(false);
    expect(authFormSchema(false).safeParse({ ...values, password: '' }).success).toBe(false);
  });
});
