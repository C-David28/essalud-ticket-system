import { OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { DependencyProbe } from '../domain/health';
import { TenantContext, tenantContext } from '../domain/tenant-context';

export async function assertRuntimeRole(tx: Pick<Prisma.TransactionClient, '$queryRaw'>): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ ok: boolean }>>`
    SELECT (
      NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb AND NOT r.rolreplication
      AND pg_has_role(current_user, 'essalud_app', 'USAGE')
      AND NOT pg_has_role(current_user, 'essalud_owner', 'MEMBER')
      AND NOT pg_has_role(current_user, 'essalud_migrator', 'MEMBER')
      AND NOT pg_has_role(current_user, 'essalud_audit_writer', 'MEMBER')
      AND NOT has_schema_privilege(current_user, 'app', 'CREATE')
      AND NOT has_schema_privilege(current_user, 'audit', 'CREATE')
      AND NOT has_table_privilege(current_user, 'audit.audit_logs', 'INSERT')
      AND NOT has_table_privilege(current_user, 'audit.audit_logs', 'UPDATE')
      AND NOT has_table_privilege(current_user, 'audit.audit_logs', 'DELETE')
      AND NOT has_table_privilege(current_user, 'audit.audit_logs', 'TRUNCATE')
    ) AS ok FROM pg_roles r WHERE r.rolname=current_user
  `;
  if (rows[0]?.ok !== true) throw new Error('La API requiere un rol PostgreSQL de runtime restringido');
}
export class Database implements DependencyProbe, OnApplicationShutdown {
  readonly pool: Pool;
  readonly client: PrismaClient;
  constructor(url: string, max = 5) {
    this.pool = new Pool({ connectionString: url, max, connectionTimeoutMillis: 1500,
      idleTimeoutMillis: 10000, statement_timeout: 2000, query_timeout: 2500 });
    this.pool.on('error', () => { /* Las sondas reflejan indisponibilidad sin imprimir secretos. */ });
    this.client = new PrismaClient({ adapter: new PrismaPg(this.pool), log: [] });
  }
  async check(): Promise<boolean> {
    try {
      await assertRuntimeRole(this.client);
      const rows = await this.client.$queryRaw<Array<{ ok: boolean }>>`
        SELECT count(*)=11 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity) AS ok
        FROM pg_class c WHERE c.oid IN (
          to_regclass('app.redes_asistenciales'),to_regclass('app.centros_asistenciales'),
          to_regclass('app.areas'),to_regclass('audit.audit_logs'),to_regclass('app.tickets'),
          to_regclass('app.ticket_state_history'),to_regclass('app.tecnicos_soporte'),
          to_regclass('app.ticket_assignment_history'),to_regclass('app.roles_institucionales'),
          to_regclass('app.usuarios_institucionales'),to_regclass('app.usuario_accesos')
        )
      `;
      return rows[0]?.ok === true;
    } catch { return false; }
  }
  async onApplicationShutdown(): Promise<void> {
    await this.client.$disconnect();
    await this.pool.end();
  }
}
// Adaptador interno: no se expone un endpoint que acepte este contexto del navegador.
export class PrismaTenantUnitOfWork {
  constructor(private readonly db: Database) {}
  async run<T>(input: TenantContext, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const context = tenantContext(input);
    return this.db.client.$transaction(async tx => {
      await assertRuntimeRole(tx);
      await tx.$queryRaw`
        SELECT set_config('app.red_asistencial_id', ${context.redAsistencialId}, true),
          set_config('app.user_id', ${context.userId}, true),
          set_config('app.request_id', ${context.requestId}, true)
      `;
      return operation(tx);
    }, { maxWait: 3000, timeout: 5000 });
  }
}
