import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

export function buildMigrationSql(directory = new URL('../../infra/postgres/migrations/', import.meta.url)) {
  const files = readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
  if (!files.length) throw new Error('No hay migraciones SQL');
  const segments = files.map(file => {
    if (!/^[0-9]{4}_[a-z0-9_]+[.]sql$/.test(file)) throw new Error('Nombre de migracion invalido: ' + file);
    const version = file.slice(0, -4);
    const sql = readFileSync(new URL(file, directory), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const tag = '$migration_' + checksum + '$';
    if (sql.includes(tag)) throw new Error('Delimitador reservado en migracion');
    return [
      'DO $runner$',
      'DECLARE previous text;',
      'BEGIN',
      "  SELECT checksum INTO previous FROM infra_meta.schema_migrations WHERE version = '" + version + "';",
      "  IF previous IS NOT NULL AND previous <> '" + checksum + "' THEN",
      "    RAISE EXCEPTION 'Checksum distinto: " + version + ". No editar migraciones aplicadas';",
      '  ELSIF previous IS NOT NULL THEN',
      "    RAISE NOTICE 'SKIP: " + version + "';",
      '  ELSE',
      '    EXECUTE ' + tag + sql + tag + ';',
      "    INSERT INTO infra_meta.schema_migrations(version,checksum) VALUES ('" + version + "','" + checksum + "');",
      "    RAISE NOTICE 'APPLIED: " + version + "';",
      '  END IF;',
      'END $runner$;',
    ].join('\n');
  });
  return [
    'BEGIN;',
    "SET LOCAL lock_timeout = '10s';",
    "SET LOCAL statement_timeout = '60s';",
    'SET LOCAL search_path = pg_catalog;',
    'SELECT pg_advisory_xact_lock(73124, 12);',
    'CREATE SCHEMA IF NOT EXISTS infra_meta;',
    'REVOKE ALL ON SCHEMA infra_meta FROM PUBLIC;',
    'CREATE TABLE IF NOT EXISTS infra_meta.schema_migrations (',
    '  version text PRIMARY KEY, checksum varchar(64) NOT NULL,',
    '  applied_at timestamptz NOT NULL DEFAULT now()',
    ');',
    'REVOKE ALL ON infra_meta.schema_migrations FROM PUBLIC;',
    ...segments,
    'COMMIT;',
  ].join('\n');
}
