import { runtimeConfig } from '../src/runtime-config';
const production = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:secret@db.example.test/campusflow?sslmode=require',
  CORS_ORIGIN: 'https://app.example.test', CANVAS_MODE: 'disabled' };
describe('API startup configuration', () => {
  it('retains development defaults and native requests without an Origin header', () => {
    expect(runtimeConfig({})).toEqual({ port: 3000, host: '127.0.0.1', schema: 'public', corsOrigins: true });
    expect(runtimeConfig({ CORS_ORIGIN: 'http://localhost:8081, http://127.0.0.1:8093' }).corsOrigins)
      .toEqual(['http://localhost:8081', 'http://127.0.0.1:8093']);
  });
  it('accepts explicit production origins and a validated custom schema', () => {
    expect(runtimeConfig({ ...production, DATABASE_URL: `${production.DATABASE_URL}&schema=campusflow`,
      CORS_ORIGIN: 'https://app.example.test, https://campus.example.test', HOST: '0.0.0.0', PORT: '8080' }))
      .toEqual({ port: 8080, host: '0.0.0.0', schema: 'campusflow', corsOrigins: ['https://app.example.test', 'https://campus.example.test'] });
  });
  it.each(['*', 'null', 'http://app.example.test', 'https://localhost', 'https://127.0.0.1', 'https://[::1]',
    'https://user:secret@app.example.test', 'https://app.example.test/path', 'https://app.example.test/',
    'https://app.example.test?secret=value', 'https://app.example.test#anchor', 'https://app.example.test,', 'https://127.0.0.2',
    'https://app.localhost', 'https://0.0.0.0', 'https://[::ffff:127.0.0.1]'])('rejects unsafe production origin %s', origin => {
    expect(() => runtimeConfig({ ...production, CORS_ORIGIN: origin })).toThrow('CORS_ORIGIN');
  });
  it.each([{ DATABASE_URL: undefined }, { DATABASE_URL: 'mysql://user:secret@host/db' }, { DATABASE_URL: 'postgresql://host/' },
    { DATABASE_URL: 'postgresql://host/db?schema=x%22%3BSELECT' }, { DATABASE_URL: 'postgresql://host/db?schema=public&schema=private' },
    { CORS_ORIGIN: undefined }, { CANVAS_MODE: 'fixture' },
    { PORT: '0' }, { PORT: '3000.5' }, { PORT: '65536' }, { HOST: '' }, { NODE_ENV: 'prod' }])('fails before startup without exposing secret values %j', invalid => {
    try { runtimeConfig({ ...production, ...invalid }); throw new Error('Accepted invalid settings'); }
    catch (error) { expect((error as Error).message).not.toContain('secret'); expect((error as Error).message).not.toBe('Accepted invalid settings'); }
  });
});
