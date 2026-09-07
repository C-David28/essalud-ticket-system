import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function compose(args, input) {
  const result = spawnSync('docker', ['compose', ...args], {
    cwd: root, encoding: 'utf8', input,
  });
  if (result.error) throw new Error(`No se pudo ejecutar Docker: ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Docker falló.');
  return result.stdout.trim();
}

try {
  compose(['config', '--quiet']);
  const sql = readFileSync(new URL('../infra/postgres/verify.sql', import.meta.url), 'utf8');
  const pg = compose(['exec', '-T', 'postgres', 'sh', '-ec',
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At',
  ], sql);
  if (!pg.split(/\r?\n/).includes('postgres-ok')) throw new Error('Respuesta PostgreSQL inesperada.');
  const pong = compose(['exec', '-T', 'redis', 'redis-cli', 'ping']);
  if (pong !== 'PONG') throw new Error(`Redis no está listo: ${pong}`);
  const denied = compose(['exec', '-T', 'redis', 'sh', '-ec', 'unset REDISCLI_AUTH; redis-cli ping']);
  if (!denied.includes('NOAUTH')) throw new Error('Redis permite acceso sin autenticación.');
  console.log('OK: PostgreSQL autenticado, SQL y permisos base; Redis PONG y rechazo sin clave.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
