import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export function docker(args, { input, binary = false } = {}) {
  const result = spawnSync('docker', ['compose', ...args], {
    cwd: projectRoot, input, encoding: binary ? undefined : 'utf8',
    timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new Error('No se pudo ejecutar Docker: ' + result.error.message);
  if (result.status !== 0) throw new Error(String(result.stderr || 'Docker termino con error'));
  return result;
}
export function postgres(sql) {
  const result = docker(['exec', '-T', 'postgres', 'sh', '-ec',
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At -f -',
  ], { input: sql });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.stdout) process.stdout.write(result.stdout);
  return result.stdout;
}
export function run(action) {
  try { action(); } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
