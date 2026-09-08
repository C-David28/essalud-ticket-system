import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { docker } from './lib/postgres.mjs';
import { runtimeRoleSql } from './lib/api-role.mjs';

const root = new URL('../',import.meta.url);
const file = new URL('apps/api/.env',root);
try {
  const infra = parseEnv(readFileSync(new URL('.env',root),'utf8'));
  const existing = existsSync(file);
  const values = existing ? parseEnv(readFileSync(file,'utf8')) : {};
  const password = existing ? decodeURIComponent(new URL(values.DATABASE_URL).password) : randomBytes(32).toString('hex');
  if (existing && new URL(values.DATABASE_URL).username !== 'essalud_api') throw new Error('runtime');
  if (!infra.REDIS_PASSWORD) throw new Error('redis');
  const port = (value,fallback) => {
    const number=Number(value ?? fallback);
    if (!Number.isInteger(number) || number<1 || number>65535) throw new Error('puerto');
    return number;
  };
  if (!existing) {
    const db = `postgresql://essalud_api:${password}@127.0.0.1:${port(infra.POSTGRES_PORT,55432)}/${encodeURIComponent(infra.POSTGRES_DB || 'essalud_tickets')}`;
    const redis = `redis://:${encodeURIComponent(infra.REDIS_PASSWORD)}@127.0.0.1:${port(infra.REDIS_PORT,56379)}/0`;
    // Guardar primero permite reintentar con la misma clave si Docker no esta disponible.
    writeFileSync(file,`NODE_ENV=development\nHOST=127.0.0.1\nPORT=3001\nDATABASE_URL=${db}\nREDIS_URL=${redis}\nCORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000\nSWAGGER_ENABLED=true\n`,{flag:'wx',mode:0o600});
  }
  docker(['exec','-T','postgres','sh','-ec',
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -q -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f -'],
    {input:runtimeRoleSql(password)});
  console.log('OK: rol essalud_api aprovisionado; apps/api/.env disponible. Las claves existentes se conservaron.');
} catch {
  // psql podria incluir la sentencia PASSWORD en un error: no imprimir stderr ni el error recibido.
  console.error('No se completo api:setup. Verifica .env, apps/api/.env, Docker, migraciones y que essalud_api sea el rol gestionado por este proyecto. No borres tus archivos .env; corrige la causa y repite.');
  process.exitCode=1;
}
