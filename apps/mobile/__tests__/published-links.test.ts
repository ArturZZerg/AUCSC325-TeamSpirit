import { publishedLink, validatePublishedLinks } from '../config/published-links.cjs';

it('normalizes configured HTTPS websites and allows absent links in a preview', () => {
  expect(publishedLink('https://Policy.Example.test/privacy')).toBe('https://policy.example.test/privacy');
  expect(() => validatePublishedLinks({})).not.toThrow();
  expect(() => validatePublishedLinks({ EXPO_PUBLIC_PRIVACY_URL: '', EXPO_PUBLIC_SUPPORT_URL: '' })).not.toThrow();
});
it.each([
  ['empty', undefined], ['whitespace', ' https://policy.example.test'], ['HTTP', 'http://policy.example.test'],
  ['script', 'javascript:alert(1)'], ['file', 'file:///policy'], ['credentials', 'https://user:secret@policy.example.test'],
  ['query', 'https://policy.example.test/?token=private'], ['fragment', 'https://policy.example.test/#private'],
  ['localhost', 'https://localhost/policy'], ['local subdomain', 'https://app.localhost/policy'],
  ['IPv4', 'https://127.0.0.1/policy'], ['IPv6', 'https://[::1]/policy'], ['malformed', 'https://'],
  ['oversized', `https://policy.example.test/${'x'.repeat(2048)}`],
])('rejects a %s website instead of opening it', (_label, value) => expect(publishedLink(value)).toBeUndefined());
it.each(['EXPO_PUBLIC_PRIVACY_URL', 'EXPO_PUBLIC_SUPPORT_URL'])('rejects malformed configured %s before export without echoing it', name => {
  const value = 'https://person:private-config-password@policy.example.test';
  expect(() => validatePublishedLinks({ [name]: value })).toThrow(new RegExp(name));
  try { validatePublishedLinks({ [name]: value }); } catch (error) { expect((error as Error).message).not.toContain('private-config-password'); }
});
it('applies validation in the actual Expo configuration before building', () => {
  const privacy = process.env.EXPO_PUBLIC_PRIVACY_URL, support = process.env.EXPO_PUBLIC_SUPPORT_URL;
  const config = jest.requireActual<() => { name: string }>('../app.config.cjs');
  try {
    process.env.EXPO_PUBLIC_PRIVACY_URL = 'https://policy.example.test/privacy'; process.env.EXPO_PUBLIC_SUPPORT_URL = 'https://person:private-config-password@support.example.test';
    expect(config).toThrow(/EXPO_PUBLIC_SUPPORT_URL must be/);
    process.env.EXPO_PUBLIC_SUPPORT_URL = 'https://support.example.test/help'; expect(config().name).toBe('CampusFlow');
  } finally {
    if (privacy === undefined) delete process.env.EXPO_PUBLIC_PRIVACY_URL; else process.env.EXPO_PUBLIC_PRIVACY_URL = privacy;
    if (support === undefined) delete process.env.EXPO_PUBLIC_SUPPORT_URL; else process.env.EXPO_PUBLIC_SUPPORT_URL = support;
  }
});
