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
  constructor(phase, cleanupPending = false, temporaryTicketId = null) {
    super('Verificación local incompleta.');
    this.phase = phase;
    this.cleanupPending = cleanupPending;
    this.temporaryTicketId = temporaryTicketId;
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

export async function runIntegrationCheck({ root = projectRoot, env = process.env, unavailable = false, disabled = false,
  fetcher = fetch, postgresProbe = postgresTicketProbe, idFactory = randomUUID } = {}) {
  let phase = 'configuración local', cookie = '', ticketId = null, ticketInput = null;
  let cleanupDone = false, failure = null, receipt = null;
  const checks = [];
  let origin;
  async function request(path, { body, method = body ? 'POST' : 'GET', authenticated = false } = {}) {
    return fetcher(new URL(path, origin), { method, redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(authenticated ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  async function ownedTicket() {
    const response = await request('/api/tickets/' + ticketId, { authenticated: true });
    if (response.status === 404) return false;
    requireCheck(response.status === 200 && ownTicket(await response.json(), ticketInput, ticketId));
    return true;
  }
  async function suggestion(example, expectedStatus, authenticated = false) {
    const response = await request('/api/category-suggestion', { body: example, authenticated });
    requireCheck(response.status === (unavailable ? 503 : 200) && response.headers.get('cache-control')?.includes('no-store'));
    const data = await response.json();
    requireCheck(data.status === expectedStatus);
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
    phase = 'sugerencia pública sin cookie';
    await suggestion(examples.biomedical, expected);
    checks.push('public_without_cookie', unavailable ? 'ml_unavailable' : disabled ? 'ml_disabled' : 'biomedical_suggested');
    phase = 'abstención pública';
    await suggestion(examples.support, unavailable ? 'unavailable' : disabled ? 'disabled' : 'abstained');
    checks.push(unavailable ? 'public_unavailable' : disabled ? 'public_disabled' : 'support_abstained');

    phase = 'acceso admin.gctic';
    const login = await request('/api/auth/login', { body: { username: 'admin.gctic', password } });
    requireCheck(login.status === 200);
    cookie = staffCookie(login);
    checks.push('staff_login');
    phase = 'sugerencia autenticada';
    await suggestion(examples.biomedical, expected, true);
    checks.push('staff_suggestion');
    phase = 'catálogo organizacional';
    const organization = await request('/api/organization', { authenticated: true });
    requireCheck(organization.status === 200);
    const catalog = await organization.json();
    const center = catalog.centers?.find(item => item.active && item.areas?.some(area => area.active));
    const area = center?.areas.find(item => item.active);
    requireCheck(center && area && uuid.test(center.centerId) && uuid.test(area.areaId));
    checks.push('organization_catalog');

    const runId = idFactory();
    requireCheck(uuid.test(runId));
    ticketInput = { titulo: examples.biomedical.titulo + ' [4.7 ' + runId + ']',
      descripcion: examples.biomedical.descripcion + ' Solicitud ficticia temporal de integración local.',
      categoria: 'SOPORTE', prioridad: 'MEDIA', centroAsistencialId: center.centerId, areaId: area.areaId };
    phase = 'creación con categoría manual';
    const createdResponse = await request('/api/tickets', { body: ticketInput, authenticated: true });
    requireCheck(createdResponse.status === 201);
    const created = await createdResponse.json();
    requireCheck(uuid.test(created.ticketId));
    ticketId = created.ticketId;
    requireCheck(ownTicket(created, ticketInput, ticketId));
    checks.push('manual_ticket_created');
    phase = 'lectura del ticket mediante Next';
    requireCheck(await ownedTicket());
    checks.push('ticket_read_through_next');
    phase = 'persistencia PostgreSQL';
    const persisted = await postgresProbe(root, ticketId);
    requireCheck(persisted.ticketCount === 1 && persisted.category === 'SOPORTE' && persisted.insertAudited === true && persisted.auditCount >= 1);
    checks.push('postgres_manual_category', 'insert_audited');

    phase = 'limpieza del ticket temporal';
    requireCheck(await ownedTicket());
    const removed = await request('/api/tickets/' + ticketId, { method: 'DELETE', authenticated: true });
    requireCheck(removed.status === 204);
    cleanupDone = true;
    requireCheck((await request('/api/tickets/' + ticketId, { authenticated: true })).status === 404);
    const deleted = await postgresProbe(root, ticketId);
    requireCheck(deleted.ticketCount === 0 && deleted.category === null && deleted.auditCount >= 2 &&
      deleted.insertAudited === true && deleted.deleteAudited === true);
    checks.push('temporary_ticket_removed', 'postgres_ticket_absent', 'delete_audited');
    receipt = { checked_at: new Date().toISOString(), mode: unavailable ? 'unavailable' : disabled ? 'disabled' : 'available',
      origin, expected_model_version: modelVersion, policy_version: policyVersion, manual_category: 'SOPORTE',
      checks, postgres: { ticket_count_after_delete: deleted.ticketCount, audit_events: deleted.auditCount,
        insert_audited: deleted.insertAudited, delete_audited: deleted.deleteAudited }, temporary_ticket_removed: true };
  } catch {
    failure = new IntegrationCheckFailure(phase);
  } finally {
    if (ticketId && !cleanupDone) {
      try {
        if (await ownedTicket()) {
          const removed = await request('/api/tickets/' + ticketId, { method: 'DELETE', authenticated: true });
          requireCheck(removed.status === 204);
        }
        requireCheck((await request('/api/tickets/' + ticketId, { authenticated: true })).status === 404);
        cleanupDone = true;
      } catch {
        failure = new IntegrationCheckFailure(failure?.phase ?? 'limpieza del ticket temporal', true, ticketId);
      }
    }
  }
  if (failure) throw failure;
  return receipt;
}
