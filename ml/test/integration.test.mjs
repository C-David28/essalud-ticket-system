import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { test } from 'node:test';
import { main, setupIntegration } from '../scripts/integration-command.mjs';
import { IntegrationCheckFailure, postgresTicketProbe, runIntegrationCheck } from '../scripts/integration-check.mjs';

const centerId = '11111111-1111-4111-8111-111111111111';
const areaId = '22222222-2222-4222-8222-222222222222';
const ticketId = '33333333-3333-4333-8333-333333333333';
const runId = '44444444-4444-4444-8444-444444444444';
const password = 'unit-private-password';

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'essalud-ml-integration-'));
  mkdirSync(join(root, 'ml/outputs'), { recursive: true });
  mkdirSync(join(root, 'apps/api'), { recursive: true });
  return root;
}

function removeWorkspace(root) {
  const target = resolve(root);
  assert.equal(dirname(target), resolve(tmpdir()));
  assert.ok(basename(target).startsWith('essalud-ml-integration-'));
  rmSync(target, { recursive: true, force: true });
}

function fakeStack({ mode = 'available', failAt = '', wrongOwner = false, cleanupFails = false } = {}) {
  const calls = [], probes = [];
  let created = null, removed = false;
  const fetcher = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, ...init });
    assert.equal(new URL(url).origin, 'http://127.0.0.1:3000');
    assert.equal(init.headers.Origin, 'http://127.0.0.1:3000');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    if (failAt === path) throw new Error('private-token ' + password);
    if (path === '/api/category-suggestion') {
      const body = JSON.parse(init.body);
      assert.deepEqual(Object.keys(body).sort(), ['descripcion', 'titulo']);
      const status = mode === 'unavailable' ? 'unavailable' : mode === 'disabled' ? 'disabled' :
        body.titulo.includes('Monitor') ? 'suggested' : 'abstained';
      return Response.json({ status, suggestion: status === 'suggested' ? {
        category: 'BIOMEDICO', score: 0.1, scoreType: 'raw_decision_margin_not_probability', probability: null,
        modelVersion: 'ticket-category-model-v1.0.0', policyVersion: 'category-assistance-policy-v1.0.0',
      } : null }, { status: mode === 'unavailable' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
    }
    if (path === '/api/auth/login') {
      assert.deepEqual(JSON.parse(init.body), { username: 'admin.gctic', password });
      assert.equal(init.headers.Cookie, undefined);
      return Response.json({ session: { authenticated: true } }, { headers: { 'Set-Cookie': 'essalud_staff_session=unit.private.token; HttpOnly; SameSite=Strict' } });
    }
    assert.equal(init.headers.Cookie, 'essalud_staff_session=unit.private.token');
    if (path === '/api/organization') return Response.json({ centers: [{ active: true, centerId, areas: [{ active: true, areaId }] }] });
    if (path === '/api/tickets' && init.method === 'POST') {
      const body = JSON.parse(init.body);
      assert.equal(body.categoria, 'SOPORTE');
      assert.equal(body.centroAsistencialId, centerId);
      assert.equal(body.areaId, areaId);
      created = { ...body, ticketId, codigo: 'INC-2026-9999' };
      return Response.json(created, { status: 201 });
    }
    assert.equal(path, '/api/tickets/' + ticketId);
    if (init.method === 'DELETE') {
      if (cleanupFails) return Response.json({ message: 'private' }, { status: 503 });
      removed = true;
      return new Response(null, { status: 204 });
    }
    if (removed) return Response.json({ message: 'not found' }, { status: 404 });
    return Response.json(wrongOwner ? { ...created, titulo: 'Otro ticket existente' } : created);
  };
  const postgresProbe = async (root, id) => {
    probes.push(id);
    assert.equal(id, ticketId);
    return { ticketCount: removed ? 0 : 1, category: removed ? null : 'SOPORTE', auditCount: removed ? 2 : 1,
      insertAudited: true, deleteAudited: removed };
  };
  return { fetcher, postgresProbe, calls, probes };
}

test('setup conserva service.env y reemplaza únicamente las cuatro variables ML del overlay', () => {
  const root = workspace();
  try {
    const token = 'a'.repeat(64), service = 'ML_SERVICE_TOKEN=' + token + '\nML_DOCS_ENABLED=true\n';
    const tickets = 'TICKETS_LOCAL_KEY=' + 'b'.repeat(64) + '\nTICKETS_DEMO_PASSWORD=' + password + '\n';
    writeFileSync(join(root, 'ml/outputs/service.env'), service);
    writeFileSync(join(root, 'apps/api/.env.tickets'), tickets);
    writeFileSync(join(root, 'ml/outputs/integration.env'), 'LEGACY_PRIVATE_KEY=old\n');
    setupIntegration(root); setupIntegration(root);
    assert.equal(readFileSync(join(root, 'ml/outputs/service.env'), 'utf8'), service);
    assert.equal(readFileSync(join(root, 'apps/api/.env.tickets'), 'utf8'), tickets);
    assert.deepEqual(parseEnv(readFileSync(join(root, 'ml/outputs/integration.env'), 'utf8')), {
      ML_ASSIST_ENABLED: 'true', ML_SERVICE_URL: 'http://ml:8001', ML_SERVICE_TOKEN: token, ML_SERVICE_TIMEOUT_MS: '4000',
    });
  } finally { removeWorkspace(root); }
});

test('setup rechaza token ausente, inválido o duplicado sin mostrarlo', async () => {
  for (const service of ['', 'ML_SERVICE_TOKEN=private-secret\n', 'ML_SERVICE_TOKEN=' + 'c'.repeat(64) + '\nML_SERVICE_TOKEN=' + 'c'.repeat(64) + '\n']) {
    const root = workspace(), output = [];
    try {
      writeFileSync(join(root, 'ml/outputs/service.env'), service);
      assert.equal(await main(['setup'], { root, log: text => output.push(text), errorLog: text => output.push(text) }), 1);
      assert.ok(output.every(text => !text.includes('private-secret') && !text.includes('c'.repeat(64))));
      assert.equal(readFileSync(join(root, 'ml/outputs/service.env'), 'utf8'), service);
    } finally { removeWorkspace(root); }
  }
});

for (const mode of ['available', 'unavailable', 'disabled']) {
  test('checker: modo ' + mode + ' conserva la decisión manual y limpia sólo el ticket temporal', async () => {
    const stack = fakeStack({ mode });
    const receipt = await runIntegrationCheck({ root: '/unused', env: { TICKETS_DEMO_PASSWORD: password },
      unavailable: mode === 'unavailable', disabled: mode === 'disabled', ...stack, idFactory: () => runId });
    assert.equal(receipt.mode, mode);
    assert.equal(receipt.manual_category, 'SOPORTE');
    assert.equal(receipt.temporary_ticket_removed, true);
    assert.deepEqual(receipt.postgres, { ticket_count_after_delete: 0, audit_events: 2, insert_audited: true, delete_audited: true });
    const suggestions = stack.calls.filter(call => call.path === '/api/category-suggestion');
    assert.equal(suggestions.length, 3);
    assert.equal(suggestions[0].headers.Cookie, undefined);
    assert.equal(suggestions[1].headers.Cookie, undefined);
    assert.equal(suggestions[2].headers.Cookie, 'essalud_staff_session=unit.private.token');
    const deletes = stack.calls.filter(call => call.method === 'DELETE');
    assert.deepEqual(deletes.map(call => call.path), ['/api/tickets/' + ticketId]);
    assert.deepEqual(stack.probes, [ticketId, ticketId]);
    const serialized = JSON.stringify(receipt);
    for (const privateValue of [password, 'unit.private.token', 'multiparámetro', 'Solicitud ficticia', runId]) assert.ok(!serialized.includes(privateValue));
  });
}

test('checker limpia el ticket propio si falla la lectura SQL después de crearlo', async () => {
  const stack = fakeStack();
  await assert.rejects(runIntegrationCheck({ root: '/unused', env: { TICKETS_DEMO_PASSWORD: password },
    ...stack, postgresProbe: () => { throw new Error('private connection string'); }, idFactory: () => runId }),
  error => error instanceof IntegrationCheckFailure && error.phase === 'persistencia PostgreSQL' && error.cleanupPending === false && !error.message.includes('private'));
  assert.deepEqual(stack.calls.filter(call => call.method === 'DELETE').map(call => call.path), ['/api/tickets/' + ticketId]);
});

test('checker rechaza borrar un ticket cuyo texto no coincide con el marcador de esta ejecución', async () => {
  const stack = fakeStack({ wrongOwner: true });
  await assert.rejects(runIntegrationCheck({ root: '/unused', env: { TICKETS_DEMO_PASSWORD: password },
    ...stack, idFactory: () => runId }), error => error instanceof IntegrationCheckFailure && error.cleanupPending === true);
  assert.equal(stack.calls.filter(call => call.method === 'DELETE').length, 0);
});

test('checker informa limpieza pendiente sin propagar el cuerpo o error upstream', async () => {
  const stack = fakeStack({ cleanupFails: true });
  await assert.rejects(runIntegrationCheck({ root: '/unused', env: { TICKETS_DEMO_PASSWORD: password },
    ...stack, idFactory: () => runId }), error => error instanceof IntegrationCheckFailure && error.cleanupPending === true &&
      error.temporaryTicketId === ticketId && !error.message.includes(password));
});

test('checker no contacta hosts externos ni ejecuta modos incompatibles', async () => {
  for (const WEB_BASE_URL of ['https://example.com', 'http://user:private@localhost:3000', 'http://localhost:3000/path', 'http://localhost:80', 'http://localhost:3000?secret=1']) {
    let called = false;
    await assert.rejects(runIntegrationCheck({ env: { WEB_BASE_URL, TICKETS_DEMO_PASSWORD: password },
      fetcher: () => { called = true; } }), IntegrationCheckFailure);
    assert.equal(called, false);
  }
  await assert.rejects(runIntegrationCheck({ unavailable: true, disabled: true }), IntegrationCheckFailure);
});

test('sonda PostgreSQL sólo lee un UUID autorizado y no publica errores ni credenciales', () => {
  let called = false;
  assert.throws(() => postgresTicketProbe('/unused', "'; DELETE FROM app.tickets; --", () => { called = true; }));
  assert.equal(called, false);
  const data = { ticketCount: 1, category: 'SOPORTE', auditCount: 1, insertAudited: true, deleteAudited: false };
  assert.deepEqual(postgresTicketProbe('/unused', ticketId, (program, args, options) => {
    assert.equal(program, 'docker');
    assert.deepEqual(args.slice(0, 6), ['compose', '-f', 'compose.yaml', 'exec', '-T', 'postgres']);
    assert.ok(options.input.includes(ticketId));
    assert.ok(!/DELETE FROM|INSERT INTO|UPDATE app\./.test(options.input));
    assert.equal(options.timeout, 10000);
    return { status: 0, stdout: JSON.stringify(data), stderr: 'ignored private diagnostic' };
  }), data);
  assert.throws(() => postgresTicketProbe('/unused', ticketId, () => ({ status: 1, stderr: 'private-password' })),
    error => !error.message.includes('private-password'));
});

test('comando check conserva un recibo sin texto, cookie o password', async () => {
  const root = workspace(), output = [], stack = fakeStack();
  try {
    const status = await main(['check'], { root, env: { TICKETS_DEMO_PASSWORD: password },
      check: options => runIntegrationCheck({ ...options, ...stack, idFactory: () => runId }),
      log: text => output.push(text), errorLog: text => output.push(text) });
    assert.equal(status, 0);
    const receipt = JSON.parse(readFileSync(join(root, 'ml/outputs/integration-check.json'), 'utf8'));
    assert.equal(receipt.temporary_ticket_removed, true);
    assert.ok(output[0].startsWith('ML_INTEGRATION_CHECK_OK:'));
    assert.ok(!JSON.stringify(output).includes(password));
    assert.ok(!JSON.stringify(receipt).includes('unit.private.token'));
  } finally { removeWorkspace(root); }
});

test('comando check oculta excepciones upstream que contienen credenciales', async () => {
  const root = workspace(), output = [], stack = fakeStack({ failAt: '/api/category-suggestion' });
  try {
    const status = await main(['check'], { root, env: { TICKETS_DEMO_PASSWORD: password },
      check: options => runIntegrationCheck({ ...options, ...stack, idFactory: () => runId }),
      log: text => output.push(text), errorLog: text => output.push(text) });
    assert.equal(status, 1);
    assert.ok(output[0].includes('sugerencia pública sin cookie'));
    assert.ok(!JSON.stringify(output).includes(password));
    assert.ok(!JSON.stringify(output).includes('private-token'));
    assert.equal(stack.calls.filter(call => call.method === 'DELETE').length, 0);
  } finally { removeWorkspace(root); }
});

test('IntegrationCheckFailure limita el diagnóstico a estados HTTP y un código conocido', () => {
  const secret = 'unit-private-diagnostic-token';
  const failure = new IntegrationCheckFailure('sugerencia pública sin cookie', false, null, {
    status: 403, expectedStatus: 200, code: 'ORIGIN_REJECTED', message: secret, error: secret,
    url: 'https://private.invalid/?token=' + secret, token: secret, body: secret,
  });
  assert.deepEqual(failure.diagnostic, { status: 403, expectedStatus: 200, code: 'ORIGIN_REJECTED' });
  assert.ok(Object.isFrozen(failure.diagnostic));
  assert.ok(!JSON.stringify(failure).includes(secret));
  for (const status of ['403', NaN, Infinity, 99, 600, 200.5]) {
    const invalid = new IntegrationCheckFailure('configuración local', false, null,
      { status, expectedStatus: '200', code: secret, message: secret });
    assert.deepEqual(invalid.diagnostic, { code: 'UNEXPECTED_CONTRACT' });
  }
});

test('comando distingue el origen, permisos, autenticación y estado ML sin mostrar el body', async () => {
  const secret = 'unit-private-upstream-body-token';
  const cases = [
    { status: 403, message: 'Origen no permitido.', code: 'ORIGIN_REJECTED' },
    { status: 403, message: 'Origen no permitido. ' + secret, code: 'PERMISSION_REJECTED' },
    { status: 403, message: 'No tienes permiso para solicitar una sugerencia de categoría.', code: 'PERMISSION_REJECTED' },
    { status: 401, message: secret, code: 'AUTH_REJECTED' },
    { status: 400, message: secret, code: 'INVALID_INPUT' },
    { status: 422, message: secret, code: 'INVALID_INPUT' },
    { status: 503, result: 'unavailable', code: 'ML_UNAVAILABLE' },
    { status: 200, result: 'disabled', code: 'ML_DISABLED' },
    { status: 200, result: 'unavailable', code: 'ML_UNAVAILABLE' },
    { status: 500, message: secret, code: 'UNEXPECTED_CONTRACT' },
    { status: 200, result: secret, code: 'UNEXPECTED_CONTRACT' },
  ];
  for (const item of cases) {
    const root = workspace(), output = [];
    let failure;
    try {
      const status = await main(['check'], { root, env: { TICKETS_DEMO_PASSWORD: password },
        check: async options => {
          try {
            return await runIntegrationCheck({ ...options, fetcher: async () => Response.json({
              message: item.message, status: item.result, suggestion: null, error: secret, token: secret,
              url: 'https://private.invalid/path?token=' + secret, titulo: 'private ticket text ' + secret,
            }, { status: item.status, headers: { 'Cache-Control': 'no-store' } }) });
          } catch (error) { failure = error; throw error; }
        }, log: text => output.push(text), errorLog: text => output.push(text) });
      assert.equal(status, 1);
      assert.ok(failure instanceof IntegrationCheckFailure);
      assert.equal(failure.phase, 'sugerencia pública sin cookie');
      assert.deepEqual(failure.diagnostic, { status: item.status, expectedStatus: 200, code: item.code });
      assert.ok(output[0].includes('HTTP ' + item.status + ' (esperado 200); ' + item.code));
      const published = JSON.stringify(output) + JSON.stringify(failure) + String(failure);
      for (const privateValue of [secret, password, 'https://private.invalid', 'private ticket text', item.message].filter(Boolean))
        assert.ok(!published.includes(privateValue));
    } finally { removeWorkspace(root); }
  }
});

test('respuestas no JSON no revelan el cuerpo y conservan el estado HTTP', async () => {
  for (const status of [200, 403]) {
    await assert.rejects(runIntegrationCheck({ root: '/unused', env: { TICKETS_DEMO_PASSWORD: password },
      fetcher: async () => new Response('<html>private upstream password=' + password + '</html>',
        { status, headers: { 'Cache-Control': 'no-store' } }) }), error => {
      assert.deepEqual(error.diagnostic, { status, expectedStatus: 200,
        code: status === 403 ? 'PERMISSION_REJECTED' : 'UNEXPECTED_CONTRACT' });
      assert.ok(!JSON.stringify(error).includes(password));
      return true;
    });
  }
});

test('fallos de transporte ocultan la excepción y conservan el HTTP esperado de cada modo', async () => {
  for (const flags of [[], ['--unavailable'], ['--disabled']]) {
    const root = workspace(), output = [];
    let failure;
    try {
      assert.equal(await main(['check', ...flags], { root, env: { TICKETS_DEMO_PASSWORD: password },
        check: async options => {
          try { return await runIntegrationCheck({ ...options, fetcher: async () => { throw new Error('private-token ' + password); } }); }
          catch (error) { failure = error; throw error; }
        }, log: text => output.push(text), errorLog: text => output.push(text) }), 1);
      const expectedStatus = flags.includes('--unavailable') ? 503 : 200;
      assert.deepEqual(failure.diagnostic, { expectedStatus, code: 'TRANSPORT_FAILURE' });
      assert.ok(output[0].includes('HTTP sin respuesta (esperado ' + expectedStatus + '); TRANSPORT_FAILURE'));
      assert.ok(!JSON.stringify(output).includes(password));
      assert.ok(!JSON.stringify(output).includes('private-token'));
    } finally { removeWorkspace(root); }
  }
});

test('diagnóstico de HTTP también identifica acceso, catálogo, creación y limpieza', async () => {
  const cases = [
    { path: '/api/auth/login', status: 401, expectedStatus: 200, code: 'AUTH_REJECTED', phase: 'acceso admin.gctic' },
    { path: '/api/organization', status: 403, expectedStatus: 200, code: 'PERMISSION_REJECTED', phase: 'catálogo organizacional' },
    { path: '/api/tickets', status: 400, expectedStatus: 201, code: 'INVALID_INPUT', phase: 'creación con categoría manual' },
    { path: '/api/tickets/' + ticketId, method: 'DELETE', status: 403, expectedStatus: 204,
      code: 'PERMISSION_REJECTED', phase: 'limpieza del ticket temporal' },
  ];
  for (const item of cases) {
    const stack = fakeStack();
    await assert.rejects(runIntegrationCheck({ root: '/unused', env: { TICKETS_DEMO_PASSWORD: password },
      ...stack, idFactory: () => runId, fetcher: async (url, init) => {
        if (new URL(url).pathname === item.path && (!item.method || init.method === item.method))
          return Response.json({ message: 'private rejected request ' + password }, { status: item.status });
        return stack.fetcher(url, init);
      } }), error => {
        assert.equal(error.phase, item.phase);
        assert.deepEqual(error.diagnostic, { status: item.status, expectedStatus: item.expectedStatus, code: item.code });
        assert.equal(error.cleanupPending, item.method === 'DELETE');
        assert.ok(!JSON.stringify(error).includes(password));
        return true;
      });
  }
});

test('una limpieza fallida conserva el primer diagnóstico y el ticket temporal pendiente', async () => {
  const stack = fakeStack({ cleanupFails: true });
  await assert.rejects(runIntegrationCheck({ root: '/unused', env: { TICKETS_DEMO_PASSWORD: password },
    ...stack, postgresProbe: () => { throw new Error('private postgres credential ' + password); }, idFactory: () => runId }), error => {
    assert.equal(error.phase, 'persistencia PostgreSQL');
    assert.equal(error.cleanupPending, true);
    assert.equal(error.temporaryTicketId, ticketId);
    assert.deepEqual(error.diagnostic, { code: 'UNEXPECTED_CONTRACT' });
    assert.ok(!JSON.stringify(error).includes(password));
    return true;
  });
});
