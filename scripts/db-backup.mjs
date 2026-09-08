import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { docker, projectRoot, run } from './lib/postgres.mjs';
run(() => {
  const dump = docker(['exec', '-T', 'postgres', 'sh', '-ec',
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom',
  ], { binary: true }).stdout;
  if (!dump.subarray(0, 5).equals(Buffer.from('PGDMP'))) throw new Error('Backup PostgreSQL invalido');
  docker(['exec', '-T', 'postgres', 'pg_restore', '--list'], { input: dump });
  const directory = join(projectRoot, 'backups');
  mkdirSync(directory, { recursive: true });
  const name = 'before-migration-' + new Date().toISOString().replace(/[:.]/g, '-') + '.dump';
  writeFileSync(join(directory, name), dump, { flag: 'wx', mode: 0o600 });
  console.log('OK: backup creado y catalogo legible: backups/' + name);
  console.log('La lectura del catalogo no sustituye una prueba completa de restauracion.');
});
