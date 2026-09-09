import { randomBytes } from 'node:crypto';
import { docker } from './lib/postgres.mjs';
const project = 'essalud-cloud-test-' + randomBytes(6).toString('hex');
Object.assign(process.env, { CLOUD_TEST_ADMIN_PASSWORD: randomBytes(32).toString('hex'), CLOUD_TEST_RUNTIME_PASSWORD: randomBytes(32).toString('hex') });
const args = ['-p', project, '-f', 'infra/cloud/compose.test.yaml'];
let started = false;
try {
  docker(['version', '--short']);
  started = true;
  docker([...args, 'build', 'ops']);
  docker([...args, 'up', '-d', '--wait', '--wait-timeout', '90', 'postgres']);
  for (let i = 0; i < 2; i++) {
    const result = docker([...args, 'run', '--rm', '--no-deps', 'ops']);
    process.stdout.write(result.stdout);
  }
  console.log('OK: imagen de operaciones, permisos de volumen, migraciones repetibles y restauracion real en PostgreSQL 17.');
} catch {
  console.error('Fallo cloud:test:integration. Se requiere Docker Desktop activo y acceso a las imagenes; revisar los resultados anteriores.');
  process.exitCode = 1;
} finally {
  if (started) try { docker([...args, 'down', '--volumes', '--remove-orphans']); }
  catch { console.error('No se pudo limpiar el proyecto de prueba: ' + project); process.exitCode = 1; }
}
