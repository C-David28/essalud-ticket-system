import assert from 'node:assert/strict';
import { isIP } from 'node:net';

export function publicOrigin(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.origin !== raw || url.port || !url.hostname.includes('.') ||
        isIP(url.hostname.replace(/^\[|\]$/g, '')) || url.hostname.endsWith('.internal') ||
        url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')) throw new Error();
    return url.origin;
  } catch { throw new Error('Se requiere un origen publico HTTPS, sin ruta, puerto, credenciales ni barra final.'); }
}

export async function verifyCloud(webInput, apiInput, request = fetch) {
  const web = publicOrigin(webInput), api = publicOrigin(apiInput), checks = [];
  async function get(origin, path, init = {}) {
    try {
      return await request(origin + path, { signal: AbortSignal.timeout(15000), redirect: 'manual', ...init });
    } catch { throw new Error('Fallo de conexion o certificado TLS en ' + path); }
  }
  async function check(name, action) {
    try { await action(); checks.push(name); }
    catch { throw new Error('Verificacion fallida: ' + name); }
  }
  for (const [name, origin, path] of [['web', web, '/portal'], ['api', api, '/api/v1/health/live']]) {
    await check(name + ': HTTP redirige a HTTPS', async () => {
      const r = await get(origin.replace('https:', 'http:'), path);
      assert.ok([301, 302, 307, 308].includes(r.status));
      assert.equal(new URL(r.headers.get('location'), origin).href, origin + path);
      assert.ok(r.headers.get('location')?.startsWith('https://'));
    });
  }
  for (const [path, expected] of [
    ['/api/v1/health/live', { status: 'ok' }],
    ['/api/v1/health/ready', { status: 'ok', checks: { postgres: 'up', redis: 'up' } }],
  ]) await check('API ' + path, async () => {
    const r = await get(api, path); assert.equal(r.status, 200); assert.deepEqual(await r.json(), expected);
  });
  await check('identidad de API', async () => {
    const r = await get(api, '/api/v1'); assert.equal(r.status, 200);
    assert.equal((await r.json()).service, 'essalud-ticket-api');
  });
  for (const path of ['/docs', '/docs-json']) await check('Swagger deshabilitado ' + path, async () => {
    assert.equal((await get(api, path)).status, 404);
  });
  await check('CORS permite el frontend', async () => {
    const r = await get(api, '/api/v1/health/live', { headers: { Origin: web } });
    assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), web);
  });
  await check('CORS no permite un origen ajeno', async () => {
    const r = await get(api, '/api/v1/health/live', { headers: { Origin: 'https://untrusted.invalid' } });
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  });
  for (const [path, text] of [['/portal', 'Mis solicitudes'], ['/tecnico', 'Tablero de atención']]) {
    await check('frontend ' + path, async () => {
      const r = await get(web, path); assert.equal(r.status, 200);
      assert.ok(r.headers.get('content-type')?.includes('text/html'));
      const html = await r.text(); assert.ok(html.includes(text) && html.includes('Datos ficticios'));
    });
  }
  await check('frontend conecta con API', async () => {
    const r = await get(web, '/api/backend-health'); assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { status: 'ok' });
    assert.ok(r.headers.get('cache-control')?.includes('no-store'));
  });
  return { checkedAt: new Date().toISOString(), web, api, checks };
}
