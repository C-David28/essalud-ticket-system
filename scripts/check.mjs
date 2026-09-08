import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (!pkg.private) throw new Error('El paquete raíz debe impedir publicaciones npm.');
const scripts = readdirSync(new URL('./', import.meta.url), { recursive: true })
  .filter(file => file.endsWith('.mjs'));
for (const file of scripts) {
  const result = spawnSync(process.execPath, ['--check', `scripts/${file}`], {
    cwd: root, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('OK: metadatos y sintaxis de ' + scripts.length + ' scripts. Validar servicios con infra:check y datos con db:check.');
