import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { releaseSmoke, smokeConfig } from './release-smoke.mjs';

const id = '00000000-0000-4000-8000-000000000001';
const config = { RELEASE_MODE: 'preview', API_URL: 'http://127.0.0.1:3000', WEB_URL: 'http://127.0.0.1:8081', RELEASE_BEARER: 'private-test-token', RELEASE_USER_ID: id };
test('release modes require explicit identity and HTTPS production origins', () => {
  assert.equal(smokeConfig(config).mode, 'preview');
  for (const invalid of [{ RELEASE_MODE: undefined }, { RELEASE_MODE: 'production' }, { RELEASE_BEARER: undefined },
    { RELEASE_USER_ID: 'invalid' }, { API_URL: 'https://user:secret@example.test' }, { API_URL: 'https://example.test?secret=x' }, { WEB_URL: 'https://example.test/account' }])
    assert.throws(() => smokeConfig({ ...config, ...invalid }));
  for (const host of ['localhost', 'app.localhost', '127.0.0.2', '[::1]', '0.0.0.0', '[::ffff:127.0.0.1]'])
    assert.throws(() => smokeConfig({ ...config, RELEASE_MODE: 'production', API_URL: `https://${host}`, WEB_URL: 'https://app.example.test' }));
  assert.equal(smokeConfig({ ...config, RELEASE_MODE: 'production', API_URL: 'https://api.example.test', WEB_URL: 'https://app.example.test' }).mode, 'production');
});

async function fixture(t, variant = '') {
  const requests = [], reports = [];
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization });
    const origin = `http://127.0.0.1:${server.address().port}`;
    res.setHeader('Content-Type', 'application/json');
    const json = value => res.end(JSON.stringify(value));
    if (req.url.startsWith('/api/health/')) {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Access-Control-Allow-Origin', variant === 'cors' ? '*' : origin);
      if (variant === 'database' && req.url.endsWith('/ready')) { res.statusCode = 503; return json({ private: 'secret database error' }); }
      return json({ status: req.url.endsWith('/live') ? 'alive' : 'ready' });
    }
    if (req.url === '/api/me' && !req.headers.authorization) { res.statusCode = 401; return json({ private: 'not logged' }); }
    if (req.url === '/api/me') return json({ id: variant === 'owner' ? '00000000-0000-4000-8000-000000000002' : id,
      email: 'synthetic@example.test', displayName: 'Synthetic', timeZone: 'America/Edmonton', createdAt: '2025-01-01T00:00:00Z' });
    if (req.url === '/api/tasks') return json(variant === 'contract' ? { invalid: true } : []);
    if (req.url === '/api/today') return json({ date: '2025-01-01', timeZone: 'America/Edmonton', generatedAt: '2025-01-01T00:00:00Z',
      sourceStatus: { availability: 'notConnected', lastSuccessfulSyncAt: null, coveredFrom: null, coveredThrough: null }, items: [], upcoming: [], campusEvents: [] });
    if (req.url === '/assets/sqlite.wasm') {
      res.setHeader('Content-Type', variant === 'wasm' ? 'text/html' : 'application/wasm');
      return res.end(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
    }
    if (req.url === '/_expo/static/js/web/worker.js') {
      res.setHeader('Content-Type', 'text/javascript'); return res.end("const wasm='/assets/sqlite.wasm';");
    }
    if (req.url === '/entry.js') {
      if (variant === 'missing') { res.statusCode = 404; return res.end('private body'); }
      res.setHeader('Content-Type', variant === 'fallback' ? 'text/html' : 'text/javascript');
      return res.end(`const api='${variant === 'stale' ? 'https://old.example.test' : origin + '/api'}'; const worker='/_expo/static/js/web/worker.js'; ${variant === 'qa' ? "const secret='focus.qa@example.test';" : ''}`);
    }
    res.setHeader('Content-Type', 'text/html'); res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (variant !== 'isolation') res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.end('<html><script src="/entry.js"></script></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { requests, reports, run: () => releaseSmoke(smokeConfig({ ...config, API_URL: `${origin}/api`, WEB_URL: origin }), { report: message => reports.push(message) }) };
}
test('smoke verifies actual referenced assets and authenticated reads without mutating data or exposing identity', async t => {
  const { run, requests, reports } = await fixture(t);
  assert.deepEqual(await run(), { mode: 'preview', assets: 3 });
  assert.ok(requests.every(request => request.method === 'GET'));
  assert.ok(requests.some(request => request.url === '/assets/sqlite.wasm'));
  assert.ok(requests.filter(request => !['/api/me', '/api/tasks', '/api/today'].includes(request.url)).every(request => !request.authorization));
  assert.ok(reports.every(message => !message.includes('private-test-token') && !message.includes(id)));
});
for (const [variant, expected] of [['database', /expected HTTP 200, got 503/], ['cors', /origin is not allowed/], ['owner', /wrong owner/],
  ['contract', /public contract/], ['missing', /got 404/], ['fallback', /invalid MIME/], ['stale', /configured API URL is absent/],
  ['wasm', /invalid WASM/], ['isolation', /COOP/], ['qa', /QA fixture/]]) {
  test(`smoke rejects ${variant} and keeps failures private`, async t => {
    const { run } = await fixture(t, variant);
    await assert.rejects(run, error => { assert.match(error.message, expected); assert.ok(!error.message.includes('private-test-token') && !error.message.includes('secret database error')); return true; });
  });
}
