import { spawnSync } from 'node:child_process';

// Solo transporte privado Railway o loopback para ensayos locales. No imprimir URLs.
export function postgresEnvironment(env) {
  const fail = () => { throw new Error('Conexion cloud invalida: usa PostgreSQL privado Railway y confirma CLOUD_DATABASE_NAME.'); };
  let url;
  try { url = new URL(env.CLOUD_ADMIN_DATABASE_URL); } catch { return fail(); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let database, user, password;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
    user = decodeURIComponent(url.username); password = decodeURIComponent(url.password);
  } catch { return fail(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash ||
      !(host.endsWith('.railway.internal') || ['127.0.0.1', 'localhost', '::1'].includes(host)) ||
      !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(database) || database !== env.CLOUD_DATABASE_NAME ||
      !user || !password || /[\x00-\x1f]/.test(user + password)) return fail();
  return { ...process.env, PGHOST: host, PGPORT: url.port || '5432', PGUSER: user,
    PGPASSWORD: password, PGDATABASE: database, PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '10',
    PGOPTIONS: '', PGTARGETSESSIONATTRS: 'read-write',
    PGAPPNAME: 'essalud-cloud-ops' };
}

export function postgresTools(env) {
  function run(command, args, input) {
    const result = spawnSync(command, args, { env, input, encoding: 'utf8', timeout: 300_000,
      maxBuffer: 16 * 1024 * 1024 });
    // stderr de PostgreSQL puede incluir SQL y credenciales. Solo se informa la fase fuera de aqui.
    if (result.error || result.status !== 0) throw new Error('Fallo ' + command + '; revisar conectividad, permisos y version PostgreSQL 17.');
    return result.stdout.trim();
  }
  return {
    sql: sql => run('psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-f', '-'], sql),
    backup: file => run('pg_dump', ['--format=custom', '--file', file]),
    restore: file => run('pg_restore', ['--exit-on-error', '--single-transaction', '--dbname', env.PGDATABASE, file]),
  };
}
