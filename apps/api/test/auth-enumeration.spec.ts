jest.mock('../src/password', () => ({
  hashPassword: jest.fn(),
  verifyPassword: jest.fn().mockResolvedValue(false),
}));

import { AuthService } from '../src/auth';
import { verifyPassword } from '../src/password';

describe('authentication account-enumeration defenses', () => {
  it('performs password work when the login email does not exist', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const rates = { admitLogin: jest.fn(), loginFailed: jest.fn(), loginSucceeded: jest.fn() };
    const verification = { available: jest.fn().mockReturnValue(false) };
    const auth = new AuthService(prisma as never, verification as never, { mode: 'preview' }, rates as never);

    await expect(auth.login({ email: 'missing@example.test', password: 'wrong-password' })).rejects.toMatchObject({ status: 401 });
    expect(verifyPassword).toHaveBeenCalledWith('wrong-password', expect.stringMatching(/^scrypt:/));
  });
});
