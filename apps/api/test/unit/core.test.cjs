const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readConfig}=require('../../dist/infrastructure/config');
const {tenantContext}=require('../../dist/domain/tenant-context');
const {CheckReadiness}=require('../../dist/application/check-readiness');
const env={DATABASE_URL:'postgresql://essalud_api:example@127.0.0.1/db',REDIS_URL:'redis://:example@127.0.0.1:6379'};
test('configuracion valida y Swagger desactivado por defecto en produccion',()=>{
  assert.equal(readConfig({...env,NODE_ENV:'production'}).swaggerEnabled,false);
  assert.equal(readConfig(env).host,'127.0.0.1');
});
test('configuracion rechaza puertos, origenes y URLs invalidos sin revelar claves',()=>{
  for(const override of [{PORT:'-1'},{PORT:'70000'},{PORT:'0'},{CORS_ORIGINS:'*'},
    {CORS_ORIGINS:'https://example.com/path'},{SWAGGER_ENABLED:'yes'},
    {DATABASE_URL:'invalid-secret-value'},{DATABASE_URL:'postgresql://admin@localhost/db'},
    {REDIS_URL:'http://:secret@localhost'}]) {
    assert.throws(()=>readConfig({...env,...override}),error=>!error.message.includes('secret')&&error.message.startsWith('Configuracion'));
  }
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
