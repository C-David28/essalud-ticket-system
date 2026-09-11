import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import {docker,projectRoot} from './lib/postgres.mjs';
import {runtimeRoleSql} from './lib/api-role.mjs';
import {buildMigrationSql} from './lib/migrations.mjs';
import {readFileSync} from 'node:fs';

// Solo este proyecto efimero se elimina al finalizar. Nunca se usa el nombre del .env.
const project='essalud-api-test-'+randomBytes(6).toString('hex');
async function availablePort(){
  const server=createServer();await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
const password=randomBytes(32).toString('hex');
const apiPassword=randomBytes(32).toString('hex');
const redisPassword=randomBytes(32).toString('hex');
const pgPort=await availablePort();let redisPort=await availablePort();
while(redisPort===pgPort) redisPort=await availablePort();
Object.assign(process.env,{COMPOSE_PROJECT_NAME:project,POSTGRES_DB:'essalud_test',POSTGRES_USER:'bootstrap_admin',
  POSTGRES_PASSWORD:password,POSTGRES_PORT:String(pgPort),REDIS_PASSWORD:redisPassword,REDIS_PORT:String(redisPort)});
function sql(input){
  return docker(['-p',project,'exec','-T','postgres','sh','-ec',
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -q -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f -'],{input});
}
let started=false;
try {
  docker(['version','--short']);
  console.log('Iniciando entorno desechable: '+project);
  started=true;
  docker(['-p',project,'up','-d','--wait','--wait-timeout','120']);
  sql(buildMigrationSql());sql(buildMigrationSql());
  for(const file of ['verify-multi-tenant.sql','verify-audit.sql','verify-tickets.sql']) {
    const result=sql(readFileSync(new URL('../infra/postgres/'+file,import.meta.url),'utf8'));
    process.stdout.write(result.stderr);
  }
  sql(runtimeRoleSql(apiPassword));sql(runtimeRoleSql(apiPassword));
  const code=await new Promise(resolve=>{
    const child=spawn(process.execPath,['--test','--test-concurrency=1','apps/api/test/integration/database.test.cjs'],{
      cwd:projectRoot,stdio:'inherit',env:{...process.env,ESSALUD_DISPOSABLE_TEST:'true',
        TEST_ADMIN_DATABASE_URL:`postgresql://bootstrap_admin:${password}@127.0.0.1:${pgPort}/essalud_test`,
        DATABASE_URL:`postgresql://essalud_api:${apiPassword}@127.0.0.1:${pgPort}/essalud_test`,
        REDIS_URL:`redis://:${redisPassword}@127.0.0.1:${redisPort}/0`,NODE_ENV:'test',PORT:'0'},
    });
    child.once('error',()=>resolve(1));child.once('exit',code=>resolve(code??1));
  });
  if(code!==0) throw new Error('tests');
  console.log('OK: regresion SQL e integracion Prisma/PostgreSQL/Redis en entorno desechable.');
} catch {
  console.error(started
    ? 'Fallo integracion. Revisa Docker y los resultados de pruebas anteriores; no se modifico la base local.'
    : 'Docker Compose no esta disponible. Inicia Docker Desktop y ejecuta este comando desde la raiz del repositorio.');
  process.exitCode=1;
} finally {
  if(started) {
    try {docker(['-p',project,'down','--volumes','--remove-orphans']);}
    catch {console.error('No se pudo limpiar el entorno de prueba. Ejecuta: docker compose -p '+project+' down --volumes --remove-orphans');process.exitCode=1;}
  }
}
