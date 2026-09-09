import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicOrigin, verifyCloud } from '../lib/cloud-health.mjs';
import { postgresEnvironment } from '../lib/cloud-postgres.mjs';
import { prepareCloudSchema } from '../lib/cloud-schema.mjs';

const web = 'https://web.example.com', api = 'https://api.example.com';
const base = { CLOUD_ADMIN_DATABASE_URL: 'postgresql://admin:secret@postgres.railway.internal:5432/railway', CLOUD_DATABASE_NAME: 'railway' };
test('conexion privada: nombre explicito, claves codificadas y sin URL en errores', () => {
  const env = postgresEnvironment(base);
  assert.equal(env.PGHOST, 'postgres.railway.internal'); assert.equal(env.PGDATABASE, 'railway');
  assert.equal(postgresEnvironment({ ...base, CLOUD_ADMIN_DATABASE_URL: base.CLOUD_ADMIN_DATABASE_URL.replace('secret', 'a%40b') }).PGPASSWORD, 'a@b');
  for (const changes of [ { CLOUD_DATABASE_NAME: 'otra' }, { CLOUD_ADMIN_DATABASE_URL: 'secret' },
    { CLOUD_ADMIN_DATABASE_URL: base.CLOUD_ADMIN_DATABASE_URL.replace('postgres.railway.internal', 'evil.example.com') },
    { CLOUD_ADMIN_DATABASE_URL: base.CLOUD_ADMIN_DATABASE_URL + '?options=unsafe' },
    { CLOUD_ADMIN_DATABASE_URL: base.CLOUD_ADMIN_DATABASE_URL.replace('/railway', '/railway%00') } ]) {
    assert.throws(() => postgresEnvironment({ ...base, ...changes }), e => !e.message.includes('secret'));
  }
});
test('rechaza HTTP, credenciales, rutas, puertos e IP como evidencia publica', () => {
  assert.equal(publicOrigin(web), web);
  for (const url of ['http://web.example.com', web + '/', web + '/portal', web + '?x=1', 'https://u:p@web.example.com',
    'https://web.example.com:8443', 'https://127.0.0.1', 'https://[::1]', 'https://foo.railway.internal']) assert.throws(() => publicOrigin(url));
});
function response(url, init) {
  const u = new URL(url);
  if (u.protocol === 'http:') return new Response(null, { status: 308, headers: { location: url.replace('http:', 'https:') } });
  let body = { status: 'ok' }, status = 200;
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (u.pathname === '/api/v1/health/ready') body.checks = { postgres: 'up', redis: 'up' };
  if (u.pathname === '/api/v1') body = { service: 'essalud-ticket-api' };
  if (u.pathname.startsWith('/docs')) status = 404;
  if (init.headers?.Origin === web) headers['access-control-allow-origin'] = web;
  if (['/portal', '/tecnico'].includes(u.pathname)) {
    headers['content-type'] = 'text/html';
    return new Response('Datos ficticios · Mis solicitudes · Tablero de atención', { headers });
  }
  return new Response(JSON.stringify(body), { status, headers });
}
test('verificador produce 12 resultados solo si toda la cadena pasa', async () => {
  const evidence = await verifyCloud(web, api, response);
  assert.equal(evidence.checks.length, 12); assert.equal(evidence.web, web);
});
test('rechaza API degradada, frontend desconectado, login del proveedor y certificado invalido', async () => {
  for (const path of ['/api/v1/health/ready', '/api/backend-health', '/portal']) {
    await assert.rejects(verifyCloud(web, api, (url, init) => new URL(url).protocol === 'https:' && new URL(url).pathname === path
      ? new Response('unavailable', { status: 503 }) : response(url, init)), /Verificacion fallida/);
  }
  await assert.rejects(verifyCloud(web, api, () => { throw new Error('certificate invalid'); }), /Verificacion fallida/);
});
test('rechaza redireccion ajena y Swagger expuesto', async () => {
  await assert.rejects(verifyCloud(web, api, () => new Response(null, { status: 308, headers: { location: 'https://other.example.com/portal' } })));
  await assert.rejects(verifyCloud(web, api, (url, init) => url === api + '/docs' ? new Response('Swagger') : response(url, init)));
});
test('valida clave antes de SQL y aborta al primer fallo de migracion', async () => {
  let calls = 0;
  await assert.rejects(prepareCloudSchema(() => calls++, 'invalid')); assert.equal(calls, 0);
  await assert.rejects(prepareCloudSchema(() => { calls++; throw new Error('db-failed'); }, 'a'.repeat(64)), /db-failed/);
  assert.equal(calls, 1);
});
