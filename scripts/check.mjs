import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (!pkg.private) throw new Error('El paquete raíz debe impedir publicaciones npm.');
for (const file of ['init-env.mjs', 'check.mjs', 'check-infra.mjs']) {
  const result = spawnSync(process.execPath, ['--check', `scripts/${file}`], {
    cwd: root, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Metadatos y sintaxis JavaScript correctos. Ejecutar infra:check para validar servicios.');
