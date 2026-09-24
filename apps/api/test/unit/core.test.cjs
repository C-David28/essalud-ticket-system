const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readConfig}=require('../../dist/infrastructure/config');
const {tenantContext}=require('../../dist/domain/tenant-context');
const {CheckReadiness}=require('../../dist/application/check-readiness');
const env={DATABASE_URL:'postgresql://essalud_api:example@127.0.0.1/db',REDIS_URL:'redis://:example@127.0.0.1:6379'};
test('configuracion valida y Swagger desactivado por defecto en produccion',()=>{
  const production=readConfig({...env,NODE_ENV:'production'});assert.equal(production.swaggerEnabled,false);assert.equal(production.applicationEnvironment,'institutional');
  const development=readConfig(env);assert.equal(development.host,'127.0.0.1');assert.equal(development.applicationEnvironment,'development');
});
test('piloto publico exige habilitacion explicita y mantiene secretos separados',()=>{
  const config=readConfig({...env,NODE_ENV:'production',HOST:'::',APP_ENVIRONMENT:'demo',PUBLIC_DEMO_ENABLED:'true',
    TICKETS_LOCAL_ENABLED:'true',TICKETS_LOCAL_KEY:'a'.repeat(64),ACCESS_TOKEN_SECRET:'b'.repeat(64),
    TICKETS_LOCAL_RED_ID:randomUUID(),TICKETS_LOCAL_USER_ID:randomUUID()});
  assert.ok(config.localTickets);assert.equal(config.applicationEnvironment,'demo');
  assert.throws(()=>readConfig({...env,NODE_ENV:'production',HOST:'::',APP_ENVIRONMENT:'demo',
    TICKETS_LOCAL_ENABLED:'true',TICKETS_LOCAL_KEY:'a'.repeat(64),ACCESS_TOKEN_SECRET:'b'.repeat(64),
    TICKETS_LOCAL_RED_ID:randomUUID(),TICKETS_LOCAL_USER_ID:randomUUID()}),/solo demo local/);
});
test('configuracion rechaza puertos, origenes y URLs invalidos sin revelar claves',()=>{
  for(const override of [{PORT:'-1'},{PORT:'70000'},{PORT:'0'},{CORS_ORIGINS:'*'},
    {CORS_ORIGINS:'https://example.com/path'},{SWAGGER_ENABLED:'yes'},{APP_ENVIRONMENT:'unknown'},{SITE_RESOLUTION_MODE:'guess'},
    {DATABASE_URL:'invalid-secret-value'},{DATABASE_URL:'postgresql://admin@localhost/db'},
    {REDIS_URL:'http://:secret@localhost'}]) {
    assert.throws(()=>readConfig({...env,...override}),error=>!error.message.includes('secret')&&error.message.startsWith('Configuracion'));
  }
  assert.throws(()=>readConfig({...env,NODE_ENV:'test',APP_ENVIRONMENT:'demo',TICKETS_LOCAL_ENABLED:'true',
    TICKETS_LOCAL_KEY:'a'.repeat(64),ACCESS_TOKEN_SECRET:'b'.repeat(64),TICKETS_LOCAL_RED_ID:randomUUID(),
    TICKETS_LOCAL_USER_ID:randomUUID(),SITE_RESOLUTION_MODE:'network'}),/adaptador network no configurado/);
});
test('contexto valida UUID y no acepta un tenant arbitrario',()=>{
  const context={redAsistencialId:randomUUID().toUpperCase(),userId:randomUUID(),requestId:randomUUID()};
  assert.equal(tenantContext(context).redAsistencialId,context.redAsistencialId.toLowerCase());
  assert.ok(Object.isFrozen(tenantContext(context)));
  for(const field of Object.keys(context)) assert.throws(()=>tenantContext({...context,[field]:"';SET ROLE essalud_owner;--"}));
});
test('readiness informa salud y degrada cada dependencia por separado',async()=>{
  for(const postgres of [true,false]) for(const redis of [true,false]) {
    assert.deepEqual(await new CheckReadiness({check:async()=>postgres},{check:async()=>redis}).execute(),{
      status:postgres&&redis?'ok':'degraded',checks:{postgres:postgres?'up':'down',redis:redis?'up':'down'},
    });
  }
});
test('readiness limita espera y absorbe errores de conectores',async()=>{
  const check=new CheckReadiness({check:()=>new Promise(()=>{})},{check:async()=>{throw new Error('password-secret');}},20);
  assert.deepEqual(await check.execute(),{status:'degraded',checks:{postgres:'down',redis:'down'}});
});
