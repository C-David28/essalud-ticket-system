require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const request=require('supertest');
const {Test}=require('@nestjs/testing');
const {AppModule}=require('../../dist/app.module');
const {Database}=require('../../dist/infrastructure/database');
const {RedisProbe}=require('../../dist/infrastructure/redis-probe');
const {readConfig}=require('../../dist/infrastructure/config');
const {configureHttp}=require('../../dist/presentation/http');
async function fixture(t,production=false){
  const config=readConfig({NODE_ENV:production?'production':'test',DATABASE_URL:'postgresql://runtime:example@localhost/db',
    REDIS_URL:'redis://:example@localhost',CORS_ORIGINS:'http://localhost:3000'});
  const state={postgres:true,redis:true};
  const module=await Test.createTestingModule({imports:[AppModule.register(config)]})
    .overrideProvider(Database).useValue({check:async()=>state.postgres})
    .overrideProvider(RedisProbe).useValue({check:async()=>state.redis}).compile();
  const app=module.createNestApplication({logger:false,bodyParser:false});
  configureHttp(app,config,false);
  await app.init(); t.after(()=>app.close());
  return {http:request(app.getHttpServer()),state};
}
test('HTTP: informacion, liveness y readiness con cabeceras de seguridad',async t=>{
  const {http}=await fixture(t);
  const root=await http.get('/api/v1').expect(200);
  assert.equal(root.body.stage,'1.4');
  const live=await http.get('/api/v1/health/live').set('X-Request-Id','untrusted').expect(200);
  assert.deepEqual(live.body,{status:'ok'});
  assert.match(live.headers['x-request-id'],/^[a-f0-9-]{36}$/);
  assert.equal(live.headers['x-content-type-options'],'nosniff');
  assert.equal(live.headers['cache-control'],'no-store');
  assert.ok(!live.headers['x-powered-by']);
  assert.deepEqual((await http.get('/api/v1/health/ready').expect(200)).body,{status:'ok',checks:{postgres:'up',redis:'up'}});
});
test('HTTP: caida de dependencias devuelve 503; proceso sigue vivo',async t=>{
  const {http,state}=await fixture(t);
  state.postgres=false;
  assert.deepEqual((await http.get('/api/v1/health/ready').expect(503)).body,{status:'degraded',checks:{postgres:'down',redis:'up'}});
  await http.get('/api/v1/health/live').expect(200);
  state.postgres=true;state.redis=false;
  assert.equal((await http.get('/api/v1/health/ready').expect(503)).body.checks.redis,'down');
});
test('HTTP: Swagger describe exactamente las tres rutas tecnicas',async t=>{
  const {http}=await fixture(t);
  await http.get('/docs').expect(200);
  const response=await http.get('/docs-json').expect(200);
  assert.deepEqual(Object.keys(response.body.paths).sort(),['/api/v1','/api/v1/health/live','/api/v1/health/ready']);
  assert.ok(response.body.paths['/api/v1/health/ready'].get.responses['503']);
});
test('HTTP: produccion no publica Swagger por defecto',async t=>{
  const {http}=await fixture(t,true);
  await http.get('/docs').expect(404);await http.get('/docs-json').expect(404);
});
test('HTTP: CORS solo autoriza el origen configurado',async t=>{
  const {http}=await fixture(t);
  assert.equal((await http.get('/api/v1').set('Origin','http://localhost:3000')).headers['access-control-allow-origin'],'http://localhost:3000');
  assert.equal((await http.get('/api/v1').set('Origin','https://unknown.example')).headers['access-control-allow-origin'],undefined);
});
test('HTTP: entradas invalidas y rutas inexistentes no filtran contenido',async t=>{
  const {http}=await fixture(t);
  const malformed=await http.post('/api/v1').set('Content-Type','application/json').send('{"secret":').expect(400);
  assert.ok(!JSON.stringify(malformed.body).includes('secret'));
  await http.post('/api/v1').send({value:'x'.repeat(140*1024)}).expect(413);
  const missing=await http.get('/api/v1/tickets?password=secret').expect(404);
  assert.deepEqual(Object.keys(missing.body).sort(),['message','requestId','statusCode']);
  assert.equal(missing.headers['x-request-id'],missing.body.requestId);
});
