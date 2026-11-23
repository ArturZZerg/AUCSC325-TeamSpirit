import { LookupAddress } from 'node:dns';
import { CanvasHttpClient } from '../src/integrations/canvas/canvas-http';
import { BlockedAddressError, Resolve, guardedLookup, isBlockedAddress, pinnedFetch } from '../src/integrations/canvas/canvas-network';

// Issue #180: the address check must hold for the connection itself, not only
// for a lookup made before fetch() resolves the name again.

const origin = 'https://school.instructure.com';
const token = 'canvas-personal-token-0123456789abcdef';
const publicAddress: LookupAddress = { address: '93.184.216.34', family: 4 };
const resolver = (...answers: LookupAddress[][]) => {
  const resolve = jest.fn<Promise<LookupAddress[]>, [string]>();
  for (const answer of answers) resolve.mockResolvedValueOnce(answer);
  return resolve;
};
const lookupWith = (resolve: Resolve, options: { all?: boolean; family?: number }) => new Promise<{ error: NodeJS.ErrnoException | null; address: unknown; family?: number }>(done =>
  guardedLookup(resolve)('school.instructure.com', options, (error, address, family) => done({ error, address, family })));

describe('Canvas address block list', () => {
  it.each([
    ['127.0.0.1', 4], ['10.1.2.3', 4], ['169.254.169.254', 4], ['::1', 6], ['::ffff:127.0.0.1', 6], ['::ffff:7f00:1', 6],
    ['fd00::1', 6], ['fe80::1', 6], ['64:ff9b::a00:1', 6], ['2002:a00:1::1', 6], ['2001:0:a00:1::1', 6],
  ])('blocks %s', (address, family) => expect(isBlockedAddress({ address, family })).toBe(true));
  it.each([['93.184.216.34', 4], ['::ffff:93.184.216.34', 6], ['::ffff:5db8:d822', 6],['2606:4700::1111', 6], ['2001:db8:1::1', 6]])('allows %s', (address, family) =>
    expect(isBlockedAddress({ address, family })).toBe(false));
});

describe('Canvas connection-time lookup', () => {
  it('answers single and all-address lookups with public addresses', async () => {
    const v6 = { address: '2606:4700::1111', family: 6 };
    expect(await lookupWith(resolver([publicAddress, v6]), {})).toEqual({ error: null, address: '93.184.216.34', family: 4 });
    expect(await lookupWith(resolver([publicAddress, v6]), { all: true })).toMatchObject({ error: null, address: [publicAddress, v6] });
    expect(await lookupWith(resolver([publicAddress, v6]), { family: 6 })).toEqual({ error: null, address: '2606:4700::1111', family: 6 });
  });
  it('refuses the host when any address is blocked, or none resolve', async () => {
    expect((await lookupWith(resolver([publicAddress, { address: '127.0.0.1', family: 4 }]), { all: true })).error).toBeInstanceOf(BlockedAddressError);
    expect((await lookupWith(resolver([]), {})).error).toBeInstanceOf(BlockedAddressError);
    expect((await lookupWith(resolver([publicAddress]), { family: 6 })).error).toMatchObject({ code: 'ENOTFOUND' });
  });
  it('passes resolver failures through', async () => {
    const resolve = jest.fn<Promise<LookupAddress[]>, [string]>().mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOTFOUND' }));
    expect((await lookupWith(resolve, {})).error).toMatchObject({ code: 'ENOTFOUND' });
  });
});

describe('Canvas pinned fetch', () => {
  const signal = new AbortController().signal;

  it('refuses a host that rebinds to a private address after the up-front check', async () => {
    // The up-front check sees a public address; the connection is offered loopback.
    const resolve = resolver([{ address: '127.0.0.1', family: 4 }]);
    const http = Object.assign(new CanvasHttpClient(), { deps: { lookup: async () => [publicAddress], fetch: pinnedFetch(resolve) } });
    await expect(http.verify(origin, token, signal)).rejects.toMatchObject({ kind: 'invalid-url' });
    expect(resolve).toHaveBeenCalledWith('school.instructure.com');
  });
  it('checks again when a later page opens a new connection', async () => {
    const resolve = resolver([{ address: '169.254.169.254', family: 4 }], [{ address: '10.0.0.5', family: 4 }]);
    const fetch = pinnedFetch(resolve);
    await expect(fetch(`${origin}/api/v1/courses`, { signal })).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(fetch(`${origin}/api/v1/courses?page=2`, { signal })).rejects.toBeInstanceOf(BlockedAddressError);
    expect(resolve).toHaveBeenCalledTimes(2);
  });
  it('only sends HTTPS GET requests', async () => {
    const resolve = resolver();
    await expect(pinnedFetch(resolve)('http://school.instructure.com/api/v1/users/self')).rejects.toThrow('HTTPS');
    await expect(pinnedFetch(resolve)(`${origin}/api/v1/users/self`, { method: 'POST' })).rejects.toThrow('GET');
    expect(resolve).not.toHaveBeenCalled();
  });
});
