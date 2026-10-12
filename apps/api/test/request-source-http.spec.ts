import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthController, AuthService } from '../src/auth';
import { AuthGuard } from '../src/common';

describe('HTTP account source policy', () => {
  let app: INestApplication;
  const login = jest.fn().mockResolvedValue({ accepted: true });
  const originalMode = process.env.AUTH_SOURCE_MODE, originalHost = process.env.HOST;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { login } }] })
      .overrideGuard(AuthGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication(); await app.init();
  });
  afterEach(() => {
    if (originalMode === undefined) delete process.env.AUTH_SOURCE_MODE; else process.env.AUTH_SOURCE_MODE = originalMode;
    if (originalHost === undefined) delete process.env.HOST; else process.env.HOST = originalHost;
    login.mockClear();
  });
  afterAll(async () => app?.close());
  const input = { email: 'native-acceptance@example.test', password: 'Synthetic-password-123' };
  it('ignores a forged forwarding header without opt-in proxy configuration', async () => {
    process.env.AUTH_SOURCE_MODE = 'socket';
    await request(app.getHttpServer()).post('/auth/login').set('X-Forwarded-For', '198.51.100.4').send(input).expect(201);
    expect(login).toHaveBeenCalledWith(input, expect.stringMatching(/^(::ffff:)?127\.0\.0\.1$|^::1$/));
  });
  it('passes one validated proxy client identity to authentication admission', async () => {
    process.env.AUTH_SOURCE_MODE = 'loopback'; process.env.HOST = '127.0.0.1';
    await request(app.getHttpServer()).post('/auth/login').set('X-Forwarded-For', '198.51.100.4').send(input).expect(201);
    expect(login).toHaveBeenCalledWith(input, '198.51.100.4');
  });
});
