import { userSchema, personalTaskSchema, todayResponseSchema } from '@campusflow/contracts';
import { pathToFileURL } from 'node:url';

const localHost = host => host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) ||
  /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(host) || ['[::1]', '[::ffff:0:0]', '0.0.0.0'].includes(host);
export function smokeConfig(env) {
  if (!['preview', 'production'].includes(env.RELEASE_MODE)) throw new Error('Set RELEASE_MODE to preview or production');
  const urls = {};
  for (const name of ['API_URL', 'WEB_URL']) {
    let url;
    try { url = new URL(env[name]); } catch { throw new Error(`Invalid ${name}`); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error(`Invalid ${name}`);
    if (env.RELEASE_MODE === 'production' && (url.protocol !== 'https:' || localHost(url.hostname)))
      throw new Error(`${name} must be a non-loopback HTTPS production target`);
    if (name === 'WEB_URL' && url.pathname !== '/') throw new Error('WEB_URL must be the web origin');
    urls[name] = url.toString().replace(/\/$/, '');
  }
  if (!env.RELEASE_BEARER || /\s/.test(env.RELEASE_BEARER)) throw new Error('Set RELEASE_BEARER for an authorized synthetic account');
  if (!userSchema.shape.id.safeParse(env.RELEASE_USER_ID).success) throw new Error('Set RELEASE_USER_ID for that synthetic account');
  return { mode: env.RELEASE_MODE, api: urls.API_URL, web: urls.WEB_URL, bearer: env.RELEASE_BEARER, userId: env.RELEASE_USER_ID };
}

async function read(response, label, maximum = 20_000_000) {
  if (Number(response.headers.get('content-length')) > maximum) throw new Error(`${label}: response is too large`);
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > maximum) throw new Error(`${label}: response is too large`);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function releaseSmoke(config, { report = console.log } = {}) {
  const get = async (url, label, { authenticated = false, expected = 200, origin = false } = {}) => {
    let response;
    try {
      response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000), headers: {
        ...(authenticated ? { Authorization: `Bearer ${config.bearer}` } : {}), ...(origin ? { Origin: config.web } : {}) } });
    } catch { throw new Error(`${label}: request failed or timed out; check target, TLS and redirects`); }
    if (response.status !== expected) { await response.body?.cancel(); throw new Error(`${label}: expected HTTP ${expected}, got ${response.status}`); }
    return response;
  };
  const json = async (response, label) => {
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(`${label}: expected JSON`);
    try { return JSON.parse((await read(response, label, 2_000_000)).toString()); }
    catch { throw new Error(`${label}: invalid or oversized JSON`); }
  };
  for (const [path, status] of [['live', 'alive'], ['ready', 'ready']]) {
    const label = `API ${path}`, response = await get(`${config.api}/health/${path}`, label, { origin: true });
    if (response.headers.get('access-control-allow-origin') !== config.web) throw new Error(`${label}: web origin is not allowed`);
    if (!response.headers.get('cache-control')?.includes('no-store')) throw new Error(`${label}: health response must not be cached`);
    const body = await json(response, label);
    if (JSON.stringify(body) !== JSON.stringify({ status })) throw new Error(`${label}: unexpected public health body`);
  }
  await (await get(`${config.api}/me`, 'Anonymous account boundary', { expected: 401 })).body?.cancel();
  const me = userSchema.strict().safeParse(await json(await get(`${config.api}/me`, 'Synthetic account', { authenticated: true }), 'Synthetic account'));
  if (!me.success || me.data.id !== config.userId) throw new Error('Synthetic account: wrong owner or invalid profile');
  for (const [path, schema] of [['tasks', personalTaskSchema.array()], ['today', todayResponseSchema]]) {
    const body = await json(await get(`${config.api}/${path}`, `API ${path}`, { authenticated: true }), `API ${path}`);
    if (!schema.safeParse(body).success) throw new Error(`API ${path}: response does not match its public contract`);
  }
  report(`API health, web CORS, authentication and saved daily data passed (${config.mode})`);

  const page = await get(config.web, 'Web entry');
  if (!page.headers.get('content-type')?.includes('text/html')) throw new Error('Web entry: expected HTML');
  if (page.headers.get('cross-origin-opener-policy') !== 'same-origin' ||
    !['require-corp', 'credentialless'].includes(page.headers.get('cross-origin-embedder-policy')))
    throw new Error('Web entry: SQLite requires COOP same-origin and COEP isolation');
  const html = (await read(page, 'Web entry', 2_000_000)).toString();
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(match => match[1]);
  if (!scripts.length) throw new Error('Web entry: no referenced JavaScript');
  const assets = [...scripts], checked = new Set(); let configured = false, wasm = 0;
  while (assets.length) {
    if (checked.size >= 50) throw new Error('Web assets: unexpected reference count');
    const url = new URL(assets.shift(), `${config.web}/`);
    if (url.origin !== config.web || url.search || url.hash) throw new Error('Web assets: unexpected origin or reference');
    if (checked.has(url.href)) continue;
    checked.add(url.href);
    const response = await get(url, 'Referenced web asset'), data = await read(response, 'Referenced web asset');
    if (url.pathname.endsWith('.wasm')) {
      if (!response.headers.get('content-type')?.includes('application/wasm') || !data.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109])))
        throw new Error('Web SQLite: invalid WASM response or MIME type');
      wasm++; continue;
    }
    if (!/javascript/.test(response.headers.get('content-type') ?? '') || /^\s*</.test(data.toString()))
      throw new Error('Referenced JavaScript: invalid MIME type or HTML fallback');
    const code = data.toString(); configured ||= code.includes(config.api);
    if (/focus\.qa@example\.test|campusflow-focus-qa-2026|Synthetic lost save acknowledgement/.test(code))
      throw new Error('Web artifact contains a synthetic QA fixture');
    for (const match of code.matchAll(/(?:\.\/|\/)?(?:assets\/|_expo\/static\/js\/web\/)[A-Za-z0-9_./@-]+\.(?:wasm|js)/g))
      assets.push(`/${match[0].replace(/^(?:\.\/|\/)/, '')}`);
  }
  if (!configured) throw new Error('Web bundle: configured API URL is absent; rebuild with the intended environment');
  if (!wasm) throw new Error('Web bundle: SQLite WASM reference is missing');
  report(`Web entry, ${checked.size} referenced assets and SQLite isolation passed (${config.mode})`);
  return { mode: config.mode, assets: checked.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await releaseSmoke(smokeConfig(process.env)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
