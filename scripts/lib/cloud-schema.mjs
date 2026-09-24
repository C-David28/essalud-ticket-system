import { readFileSync } from 'node:fs';
import { buildMigrationSql } from './migrations.mjs';
import { runtimeRoleSql } from './api-role.mjs';

const sqlFile = name => readFileSync(new URL('../../infra/postgres/' + name, import.meta.url), 'utf8');
export async function verifyCloudSchema(sql) {
  for(const file of ['verify-multi-tenant.sql','verify-audit.sql','verify-tickets.sql','verify-ticket-states.sql',
    'verify-ticket-assignment.sql','verify-organization.sql','verify-access.sql','verify-geography.sql'])
    await sql(sqlFile(file));
}
export async function prepareCloudSchema(sql, password) {
  // Validar antes de cualquier escritura; reutilizar SQL y checksums canonicos.
  const role = runtimeRoleSql(password);
  await sql(sqlFile('init/001-bootstrap.sql'));
  await sql(buildMigrationSql()); await sql(buildMigrationSql());
  await sql(role); await sql(role);
  await verifyCloudSchema(sql);
}
