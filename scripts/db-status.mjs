import { postgres, run } from './lib/postgres.mjs';
run(() => postgres([
  "SELECT CASE WHEN to_regclass('infra_meta.schema_migrations') IS NULL THEN 'false' ELSE 'true' END AS ready \\gset",
  '\\if :ready',
  "SELECT version || ' | ' || checksum || ' | ' || applied_at::text FROM infra_meta.schema_migrations ORDER BY version;",
  '\\else',
  "\\echo PENDIENTE: ejecutar npm.cmd run db:migrate",
  '\\endif',
].join('\n')));
