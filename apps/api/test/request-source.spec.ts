import { requestSource, requestSourceMode } from '../src/request-source';
import { runtimeConfig } from '../src/runtime-config';

describe('account admission source boundary', () => {
  it('keeps socket identity by default even with a forged forwarded header', () => {
    expect(requestSourceMode({})).toBe('socket');
    expect(requestSource({ socket: { remoteAddress: '203.0.113.9' }, headers: { 'x-forwarded-for': '198.51.100.4' } }, 'socket')).toBe('203.0.113.9');
  });
  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])('accepts one client IP only from configured loopback peer %s', peer => {
    expect(requestSource({ socket: { remoteAddress: peer }, headers: { 'x-forwarded-for': '198.51.100.4' } }, 'loopback')).toBe('198.51.100.4');
    expect(requestSource({ socket: { remoteAddress: peer }, headers: { 'x-forwarded-for': '2001:db8::4' } }, 'loopback')).toBe('2001:db8::4');
  });
  it.each([undefined, '', 'unknown', '198.51.100.4, 203.0.113.9', ['198.51.100.4'], ' 198.51.100.4', '1'.repeat(512)])('falls back on absent, malformed, repeated or chained forwarded data %j', forwarded => {
    expect(requestSource({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': forwarded } }, 'loopback')).toBe('127.0.0.1');
  });
  it.each(['203.0.113.9', '10.0.0.4', '127.0.0.2', undefined])('does not trust another socket peer %s', peer => {
    expect(requestSource({ socket: { remoteAddress: peer }, headers: { 'x-forwarded-for': '198.51.100.4' } }, 'loopback')).toBe(peer ?? 'unknown');
  });
  it.each(['127.0.0.1', '::1'])('accepts explicit loopback startup binding %s', host => {
    expect(requestSourceMode({ AUTH_SOURCE_MODE: 'loopback', HOST: host })).toBe('loopback');
    expect(runtimeConfig({ AUTH_SOURCE_MODE: 'loopback', HOST: host }).host).toBe(host);
  });
  it.each([undefined, '0.0.0.0', '::', 'localhost', '10.0.0.4'])('refuses a proxy mode with ambiguous or public bind %s', host => {
    expect(() => runtimeConfig({ AUTH_SOURCE_MODE: 'loopback', HOST: host })).toThrow('loopback HOST');
  });
  it('rejects arbitrary proxy trust configuration without printing it', () => {
    expect(() => runtimeConfig({ AUTH_SOURCE_MODE: 'secret-proxy-setting' })).toThrow('Invalid AUTH_SOURCE_MODE');
  });
});
