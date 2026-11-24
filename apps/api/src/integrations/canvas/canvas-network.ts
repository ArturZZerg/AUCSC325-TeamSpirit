import { LookupAddress, LookupOptions, lookup as dnsLookup } from 'node:dns';
import { Agent, request } from 'node:https';
import { BlockList, LookupFunction } from 'node:net';
import { Readable } from 'node:stream';

// Network access to a student-supplied Canvas host (issue #180). Checking the
// host's addresses before calling fetch() is not enough, because fetch resolves
// the name again and a hostile DNS server can answer differently the second
// time (DNS rebinding). Here the block-list check runs inside the resolver that
// opens each connection, so the address that was checked is the one used.

const blocked = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]] as const) blocked.addSubnet(network, prefix, 'ipv4');
// 6to4 (2002::/16) and Teredo (2001::/32) carry an IPv4 address that may be private.
// (BlockList also matches IPv4 rules against ::ffff:0:0/96, so that range must not be listed here.)
for (const [network, prefix] of [['::', 127], ['64:ff9b::', 96], ['2001::', 32], ['2002::', 16], ['fc00::', 7],
  ['fe80::', 10], ['ff00::', 8]] as const) blocked.addSubnet(network, prefix, 'ipv6');

/** The IPv4 address carried by an IPv4-mapped IPv6 address, dotted (::ffff:127.0.0.1) or hex (::ffff:7f00:1). */
function mappedIpv4(address: string): string | null {
  const dotted = /^(?:0{0,4}:){0,5}:?ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (dotted) return dotted[1];
  const hex = /^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (!hex) return null;
  const [high, low] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

/** Whether the API must not connect to this resolved address. */
export function isBlockedAddress({ address, family }: { address: string; family: number }): boolean {
  // An IPv4-mapped IPv6 address is checked as the IPv4 address it carries.
  const mapped = family === 6 ? mappedIpv4(address) : null;
  return mapped ? blocked.check(mapped, 'ipv4') : blocked.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

/** Raised when a Canvas host resolves to an address the API must not reach. */
export class BlockedAddressError extends Error {
  readonly code = 'ECANVASBLOCKED';
  constructor() { super('Canvas host resolves to a blocked address'); }
}

export type Resolve = (host: string) => Promise<LookupAddress[]>;
const systemResolve: Resolve = host => new Promise((resolve, reject) =>
  dnsLookup(host, { all: true, verbatim: true }, (error, addresses) => error ? reject(error) : resolve(addresses)));

/**
 * A connection-time resolver that refuses the host when any of its addresses is
 * blocked, matching the up-front check. It answers both single and `all` lookups.
 */
export function guardedLookup(resolve: Resolve = systemResolve): LookupFunction {
  return (hostname: string, options: LookupOptions, callback: (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => {
    resolve(hostname).then(addresses => {
      if (!addresses.length || addresses.some(isBlockedAddress)) return callback(new BlockedAddressError(), '');
      const usable = options.family === 4 || options.family === 6 ? addresses.filter(entry => entry.family === options.family) : addresses;
      if (!usable.length) return callback(Object.assign(new Error(`No IPv${options.family} address for ${hostname}`), { code: 'ENOTFOUND' }), '');
      if (options.all) callback(null, usable);
      else callback(null, usable[0].address, usable[0].family);
    }, (error: NodeJS.ErrnoException) => callback(error, ''));
  };
}

/**
 * The subset of fetch the Canvas client uses (HTTPS GET with headers and an abort
 * signal), sent over connections opened by `guardedLookup`. Redirects are refused,
 * as with `redirect: 'error'`. Keep-alive sockets come from a private agent, so a
 * socket opened without the guard is never reused.
 */
export function pinnedFetch(resolve: Resolve = systemResolve): typeof fetch {
  const agent = new Agent({ keepAlive: true, lookup: guardedLookup(resolve) });
  return ((input: string | URL | Request, init?: RequestInit) => new Promise<Response>((settle, reject) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== 'https:') return reject(new TypeError('Canvas requests must use HTTPS'));
    if (init?.method && init.method !== 'GET') return reject(new TypeError('Canvas requests must use GET'));
    // Canvas's edge refuses requests without a User-Agent, which fetch would have sent.
    const headers = { 'user-agent': 'CampusFlow', ...Object.fromEntries(new Headers(init?.headers)) };
    const req = request(url, { agent, headers, signal: init?.signal ?? undefined }, res => {
      try {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) throw new TypeError('Canvas redirects are refused');
        const headers = new Headers();
        for (const [name, value] of Object.entries(res.headers)) for (const entry of [value ?? []].flat()) headers.append(name, entry);
        const empty = status === 204 || status === 205 || status === 304;
        if (empty) res.resume();
        settle(new Response(empty ? null : Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>, { status, statusText: res.statusMessage, headers }));
      } catch (error) { res.destroy(); reject(error); }
    });
    req.on('error', reject);
    req.end();
  })) as typeof fetch;
}
