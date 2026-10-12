import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const modelVersion = 'ticket-category-model-v1.0.0';
const policyVersion = 'category-assistance-policy-v1.0.0';
const diagnosticCodes = new Set(['ORIGIN_REJECTED', 'AUTH_REJECTED', 'PERMISSION_REJECTED', 'INVALID_INPUT',
  'ML_UNAVAILABLE', 'ML_DISABLED', 'UNEXPECTED_CONTRACT', 'TRANSPORT_FAILURE']);
const examples = {
  biomedical: {
    titulo: 'Monitor de signos sin lectura',
    descripcion: 'El monitor multiparámetro no registra la saturación con el sensor conectado y muestra una alarma técnica del equipo.',
  },
  support: {
    titulo: 'La aplicación no abre',
    descripcion: 'Al iniciar el programa de ofimática aparece un error y se cierra; otros programas de la computadora funcionan.',
  },
};

export class IntegrationCheckFailure extends Error {
  constructor(phase, cleanupPending = false, temporaryTicketId = null, diagnostic = {}) {
    super('Verificación local incompleta.');
    this.phase = phase;
    this.cleanupPending = cleanupPending;
    this.temporaryTicketId = temporaryTicketId;
    // Only bounded numeric HTTP statuses and a closed code enter the public diagnostic.
    this.diagnostic = Object.freeze({
      ...(Number.isInteger(diagnostic?.status) && diagnostic.status >= 100 && diagnostic.status <= 599 ? { status: diagnostic.status } : {}),
      ...(Number.isInteger(diagnostic?.expectedStatus) && diagnostic.expectedStatus >= 100 && diagnostic.expectedStatus <= 599 ? { expectedStatus: diagnostic.expectedStatus } : {}),
      code: diagnosticCodes.has(diagnostic?.code) ? diagnostic.code : 'UNEXPECTED_CONTRACT',
    });
  }
}

function requireCheck(condition) {
  if (!condition) throw new Error('Contrato de integración inesperado.');
}

function webOrigin(raw) {
  const origin = new URL(raw);
  requireCheck(origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname) &&
    origin.port === '3000' && !origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash);
  return origin.origin;
}

function ownTicket(ticket, input, id) {
  return ticket && ticket.ticketId === id && ticket.titulo === input.titulo && ticket.descripcion === input.descripcion &&
    ticket.categoria === input.categoria && ticket.centroAsistencialId === input.centroAsistencialId && ticket.areaId === input.areaId;
}

function staffCookie(response) {
  const values = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie') ?? ''];
  for (const value of values) {
    const match = value.match(/^essalud_staff_session=([A-Za-z0-9._-]{1,4096})(?:;|$)/);
    if (match) return 'essalud_staff_session=' + match[1];
  }
  throw new Error('Cookie de acceso ausente.');
}

export function postgresTicketProbe(root, ticketId, spawn = spawnSync) {
  requireCheck(uuid.test(ticketId));
  // The only interpolated SQL value has passed the UUID allowlist. No ticket text or credential enters SQL.
  const sql = `SET statement_timeout = '5s'; SET lock_timeout = '1s';
SELECT json_build_object(
  'ticketCount', (SELECT count(*) FROM app.tickets WHERE ticket_id = '${ticketId}'::uuid),
  'category', (SELECT categoria FROM app.tickets WHERE ticket_id = '${ticketId}'::uuid),
  'auditCount', (SELECT count(*) FROM audit.audit_logs WHERE entity = 'app.tickets' AND entity_id->>'ticket_id' = '${ticketId}'),
  'insertAudited', EXISTS(SELECT 1 FROM audit.audit_logs WHERE entity = 'app.tickets' AND entity_id->>'ticket_id' = '${ticketId}' AND action = 'INSERT'),
  'deleteAudited', EXISTS(SELECT 1 FROM audit.audit_logs WHERE entity = 'app.tickets' AND entity_id->>'ticket_id' = '${ticketId}' AND action = 'DELETE')
);`;
  const result = spawn('docker', ['compose', '-f', 'compose.yaml', 'exec', '-T', 'postgres', 'sh', '-ec',
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -q -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At -f -'],
  { cwd: root, input: sql, encoding: 'utf8', timeout: 10000, maxBuffer: 64 * 1024 });
  requireCheck(!result.error && result.status === 0);
  const data = JSON.parse(result.stdout.trim());
  requireCheck(Number.isSafeInteger(data.ticketCount) && Number.isSafeInteger(data.auditCount) &&
    typeof data.insertAudited === 'boolean' && typeof data.deleteAudited === 'boolean');
  return data;
}

export async function runIntegrationCheck({ root = projectRoot, env = process.env, unavailable = false, disabled = false, verifyHistory = false,
  fetcher = fetch, postgresProbe = postgresTicketProbe, idFactory = randomUUID } = {}) {
  let phase = 'configuración local', cookie = '', ticketId = null, ticketInput = null;
  let cleanupDone = false, failure = null, receipt = null;
  const checks = [];
  let diagnostic = { code: 'UNEXPECTED_CONTRACT' };
  let origin;
  async function request(path, { body, method = body ? 'POST' : 'GET', authenticated = false, expectedStatus = 200 } = {}) {
    diagnostic = { expectedStatus, code: 'TRANSPORT_FAILURE' };
    const response = await fetcher(new URL(path, origin), { method, redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(authenticated ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    diagnostic = { status: response.status, expectedStatus, code: 'UNEXPECTED_CONTRACT' };
    return response;
  }
  async function expectStatus(response, expectedStatus, suggestion = false) {
    if (response.status === expectedStatus) {
      if ([204, 404].includes(expectedStatus)) void response.body?.cancel().catch(() => {});
      return;
    }
    let code = response.status === 401 ? 'AUTH_REJECTED' : response.status === 403 ? 'PERMISSION_REJECTED' :
      [400, 422].includes(response.status) ? 'INVALID_INPUT' : suggestion && response.status === 503 ? 'ML_UNAVAILABLE' : 'UNEXPECTED_CONTRACT';
    if (suggestion && response.status === 403) {
      try {
        // Compare the known Next guard response; never retain or print its body.
        if ((await response.json())?.message === 'Origen no permitido.') code = 'ORIGIN_REJECTED';
      } catch { /* A malformed rejection stays a permission failure. */ }
    }
    void response.body?.cancel().catch(() => {});
    throw new IntegrationCheckFailure(phase, false, null, { status: response.status, expectedStatus, code });
  }
  async function ownedTicket() {
    const response = await request('/api/tickets/' + ticketId, { authenticated: true });
    if (response.status === 404) { void response.body?.cancel().catch(() => {}); return false; }
    await expectStatus(response, 200);
    requireCheck(ownTicket(await response.json(), ticketInput, ticketId));
    return true;
  }
  async function suggestion(example, expectedStatus, authenticated = false) {
    const expectedHttpStatus = unavailable ? 503 : 200;
    const response = await request('/api/category-suggestion', { body: example, authenticated, expectedStatus: expectedHttpStatus });
    await expectStatus(response, expectedHttpStatus, true);
    requireCheck(response.headers.get('cache-control')?.includes('no-store'));
    const data = await response.json();
    if (data.status !== expectedStatus) {
      const code = data.status === 'disabled' ? 'ML_DISABLED' : data.status === 'unavailable' ? 'ML_UNAVAILABLE' : 'UNEXPECTED_CONTRACT';
      throw new IntegrationCheckFailure(phase, false, null, { status: response.status, expectedStatus: expectedHttpStatus, code });
    }
    if (expectedStatus !== 'suggested') requireCheck(data.suggestion === null);
    else {
      const suggested = data.suggestion;
      requireCheck(suggested && suggested.category === 'BIOMEDICO' && Number.isFinite(suggested.score) && suggested.score >= -0.06 &&
        suggested.scoreType === 'raw_decision_margin_not_probability' && suggested.probability === null &&
        suggested.modelVersion === modelVersion && suggested.policyVersion === policyVersion);
    }
  }
  try {
    requireCheck(!(unavailable && disabled));
    origin = webOrigin(env.WEB_BASE_URL ?? 'http://127.0.0.1:3000');
    const ticketsFile = resolve(root, 'apps/api/.env.tickets');
    const localEnv = existsSync(ticketsFile) ? parseEnv(readFileSync(ticketsFile, 'utf8')) : {};
    const password = env.TICKETS_DEMO_PASSWORD ?? localEnv.TICKETS_DEMO_PASSWORD;
    requireCheck(typeof password === 'string' && password.length > 0);
    const expected = unavailable ? 'unavailable' : disabled ? 'disabled' : 'suggested';
    if (verifyHistory) {
      phase = 'salud del backend independiente de ML';
      const health = await request('/api/backend-health');
      await expectStatus(health, 200);
      requireCheck((await health.json())?.status === 'ok');
      checks.push('backend_ready_without_ml_dependency');
    }
    phase = 'sugerencia pública sin cookie';
    await suggestion(examples.biomedical, expected);
    checks.push('public_without_cookie', unavailable ? 'ml_unavailable' : disabled ? 'ml_disabled' : 'biomedical_suggested');
    phase = 'abstención pública';
    await suggestion(examples.support, unavailable ? 'unavailable' : disabled ? 'disabled' : 'abstained');
    checks.push(unavailable ? 'public_unavailable' : disabled ? 'public_disabled' : 'support_abstained');

    phase = 'acceso admin.gctic';
    const login = await request('/api/auth/login', { body: { username: 'admin.gctic', password } });
    await expectStatus(login, 200);
    try { cookie = staffCookie(login); } finally { void login.body?.cancel().catch(() => {}); }
    checks.push('staff_login');
    phase = 'sugerencia autenticada';
    await suggestion(examples.biomedical, expected, true);
    checks.push('staff_suggestion');
    phase = 'catálogo organizacional';
    const organization = await request('/api/organization', { authenticated: true });
    await expectStatus(organization, 200);
    const catalog = await organization.json();
    const center = catalog.centers?.find(item => item.active && item.areas?.some(area => area.active));
    const area = center?.areas.find(item => item.active);
    requireCheck(center && area && uuid.test(center.centerId) && uuid.test(area.areaId));
    checks.push('organization_catalog');

    diagnostic = { code: 'UNEXPECTED_CONTRACT' };
    const runId = idFactory();
    requireCheck(uuid.test(runId));
    ticketInput = { titulo: examples.biomedical.titulo + ' [' + (verifyHistory ? '4.8' : '4.7') + ' ' + runId + ']',
      descripcion: examples.biomedical.descripcion + ' Solicitud ficticia temporal de integración local.',
      categoria: 'SOPORTE', prioridad: 'MEDIA', centroAsistencialId: center.centerId, areaId: area.areaId };
    phase = 'creación con categoría manual';
    const createdResponse = await request('/api/tickets', { body: ticketInput, authenticated: true, expectedStatus: 201 });
    await expectStatus(createdResponse, 201);
    const created = await createdResponse.json();
    requireCheck(uuid.test(created.ticketId));
    ticketId = created.ticketId;
    requireCheck(ownTicket(created, ticketInput, ticketId));
    checks.push('manual_ticket_created');
    phase = 'lectura del ticket mediante Next';
    requireCheck(await ownedTicket());
    checks.push('ticket_read_through_next');
    phase = 'persistencia PostgreSQL';
    diagnostic = { code: 'UNEXPECTED_CONTRACT' };
    const persisted = await postgresProbe(root, ticketId);
    requireCheck(persisted.ticketCount === 1 && persisted.category === 'SOPORTE' && persisted.insertAudited === true && persisted.auditCount >= 1);
    checks.push('postgres_manual_category', 'insert_audited');

    if (verifyHistory) {
      const parameters = new URLSearchParams({ search: runId, centroAsistencialId: center.centerId,
        categoria: 'SOPORTE', prioridad: 'MEDIA' });
      async function verifyView(view, present, state) {
        const filter = new URLSearchParams(parameters); filter.set('view', view);
        const pageQuery = new URLSearchParams(filter); pageQuery.set('page', '1'); pageQuery.set('pageSize', '1');
        const response = await request('/api/tickets?' + pageQuery, { authenticated: true });
        await expectStatus(response, 200);
        const page = await response.json();
        requireCheck(page.page === 1 && page.pageSize === 1 && page.hasMore === false &&
          Array.isArray(page.items) && page.items.length === (present ? 1 : 0));
        if (present) requireCheck(ownTicket(page.items[0], ticketInput, ticketId) && page.items[0].estado === state);
        const summaryResponse = await request('/api/tickets/resumen?' + filter, { authenticated: true });
        await expectStatus(summaryResponse, 200);
        const summary = await summaryResponse.json();
        requireCheck(summary.total === (present ? 1 : 0) && summary.active + summary.history === summary.total &&
          summary.priority === 0 && Array.isArray(summary.centers) && summary.centers.length === (present ? 1 : 0));
        if (present) requireCheck(summary.byState[state] === 1 && summary.centers[0].centerId === center.centerId &&
          summary.centers[0].total === 1 && summary.centers[0].byState[state] === 1);
      }
      async function transition(state) {
        const response = await request('/api/tickets/' + ticketId + '/estado', { method: 'PATCH', authenticated: true,
          body: { estado: state, motivo: 'Verificación temporal de trazabilidad de la subetapa 4.8.' } });
        await expectStatus(response, 200);
        const ticket = await response.json();
        requireCheck(ownTicket(ticket, ticketInput, ticketId) && ticket.estado === state);
      }
      phase = 'trabajo activo paginado y resumen autorizado';
      await verifyView('active', true, 'ABIERTO'); await verifyView('history', false);
      const secondPage = new URLSearchParams(parameters); secondPage.set('view', 'active');
      secondPage.set('page', '2'); secondPage.set('pageSize', '1');
      const pageResponse = await request('/api/tickets?' + secondPage, { authenticated: true });
      await expectStatus(pageResponse, 200);
      const page = await pageResponse.json();
      requireCheck(page.page === 2 && page.items.length === 0 && page.hasMore === false);
      checks.push('server_filters_and_pagination', 'authorized_summary');
      phase = 'estados operativos y consulta del historial';
      for (const state of ['EN_PROCESO', 'PENDIENTE', 'EN_PROCESO', 'RESUELTO']) await transition(state);
      await verifyView('active', false); await verifyView('history', true, 'RESUELTO');
      requireCheck(await ownedTicket());
      checks.push('resolved_in_history', 'direct_detail_outside_active_page');
      phase = 'reapertura conservando trazabilidad';
      await transition('EN_PROCESO');
      await verifyView('active', true, 'EN_PROCESO'); await verifyView('history', false);
      checks.push('resolved_reopened');
      phase = 'cierre e historial inmutable';
      await transition('RESUELTO'); await transition('CERRADO');
      await verifyView('active', false); await verifyView('history', true, 'CERRADO');
      const historyResponse = await request('/api/tickets/' + ticketId + '/estado/historial', { authenticated: true });
      await expectStatus(historyResponse, 200);
      const history = await historyResponse.json();
      requireCheck(Array.isArray(history) && history.length === 8 && history[0].estadoAnterior === null &&
        history[0].estadoNuevo === 'ABIERTO' && history.at(-1).estadoNuevo === 'CERRADO');
      for (let index = 1; index < history.length; index++) requireCheck(history[index].estadoAnterior === history[index - 1].estadoNuevo);
      checks.push('closed_in_history', 'state_history_preserved');
    }

    phase = 'limpieza del ticket temporal';
    requireCheck(await ownedTicket());
    const removed = await request('/api/tickets/' + ticketId, { method: 'DELETE', authenticated: true, expectedStatus: 204 });
    await expectStatus(removed, 204);
    cleanupDone = true;
    await expectStatus(await request('/api/tickets/' + ticketId, { authenticated: true, expectedStatus: 404 }), 404);
    diagnostic = { code: 'UNEXPECTED_CONTRACT' };
    const deleted = await postgresProbe(root, ticketId);
    requireCheck(deleted.ticketCount === 0 && deleted.category === null && deleted.auditCount >= 2 &&
      deleted.insertAudited === true && deleted.deleteAudited === true);
    checks.push('temporary_ticket_removed', 'postgres_ticket_absent', 'delete_audited');
    receipt = { checked_at: new Date().toISOString(), mode: unavailable ? 'unavailable' : disabled ? 'disabled' : 'available',
      origin, expected_model_version: modelVersion, policy_version: policyVersion, manual_category: 'SOPORTE',
      ...(verifyHistory ? { stage: '4.8' } : {}), checks, postgres: { ticket_count_after_delete: deleted.ticketCount, audit_events: deleted.auditCount,
        insert_audited: deleted.insertAudited, delete_audited: deleted.deleteAudited }, temporary_ticket_removed: true };
  } catch (error) {
    failure = error instanceof IntegrationCheckFailure ? error : new IntegrationCheckFailure(phase, false, null, diagnostic);
  } finally {
    if (ticketId && !cleanupDone) {
      try {
        if (await ownedTicket()) {
          const removed = await request('/api/tickets/' + ticketId, { method: 'DELETE', authenticated: true, expectedStatus: 204 });
          await expectStatus(removed, 204);
        }
        await expectStatus(await request('/api/tickets/' + ticketId, { authenticated: true, expectedStatus: 404 }), 404);
        cleanupDone = true;
      } catch (error) {
        failure = new IntegrationCheckFailure(failure?.phase ?? 'limpieza del ticket temporal', true, ticketId,
          failure?.diagnostic ?? (error instanceof IntegrationCheckFailure ? error.diagnostic : diagnostic));
      }
    }
  }
  if (failure) throw failure;
  return receipt;
}
