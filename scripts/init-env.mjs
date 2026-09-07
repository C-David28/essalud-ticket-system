import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const template = readFileSync(new URL('.env.example', root), 'utf8');
const generated = template
  .replace(/^POSTGRES_PASSWORD=$/m, `POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}`)
  .replace(/^REDIS_PASSWORD=$/m, `REDIS_PASSWORD=${randomBytes(32).toString('hex')}`);
try {
  writeFileSync(new URL('.env', root), generated, { flag: 'wx', mode: 0o600 });
  console.log('.env creado con dos claves aleatorias. No lo subas a Git.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env ya existe; se conservaron sus valores.');
}
