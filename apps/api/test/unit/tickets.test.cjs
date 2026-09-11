require('reflect-metadata');
const {test}=require('node:test'), assert=require('node:assert/strict'), request=require('supertest');
const {randomUUID}=require('node:crypto');
const {Test}=require('@nestjs/testing');
const {AppModule}=require('../../dist/app.module');
const {Tickets}=require('../../dist/application/tickets');
const {TicketFailure}=require('../../dist/domain/ticket');
const {Database}=require('../../dist/infrastructure/database');
const {RedisProbe}=require('../../dist/infrastructure/redis-probe');
const {readConfig}=require('../../dist/infrastructure/config');
const {configureHttp}=require('../../dist/presentation/http');
const env={NODE_ENV:'test',DATABASE_URL:'postgresql://runtime:example@localhost/db',REDIS_URL:'redis://:example@localhost',
 TICKETS_LOCAL_ENABLED:'true',TICKETS_LOCAL_KEY:'a'.repeat(64),TICKETS_LOCAL_RED_ID:randomUUID(),TICKETS_LOCAL_USER_ID:randomUUID()};
const body={centroAsistencialId:randomUUID(),areaId:randomUUID(),titulo:'Ticket de prueba',descripcion:'Descripcion suficientemente larga',categoria:'SOPORTE',prioridad:'MEDIA'};
async function fixture(t){
 const calls=[];
 const service={create:async(c,b)=>{calls.push(c);return {...b,codigo:'INC-2026-0001'};},list:async(c,p,size)=>({items:[],page:p,pageSize:size,hasMore:false}),
 get:async()=>{throw new TicketFailure('NOT_FOUND');},update:async(c,id,b)=>{if(!Object.keys(b).length)throw new TicketFailure('INVALID');return b;},
 transition:async(c,id,state,reason)=>{calls.push({state,reason});if(state==='CERRADO')throw new TicketFailure('CONFLICT');return {estado:state};},
 history:async()=>[{estadoAnterior:null,estadoNuevo:'ABIERTO',motivo:'Ticket creado'}],delete:async()=>{}};
 const config=readConfig(env);
 const mod=await Test.createTestingModule({imports:[AppModule.register(config)]}).overrideProvider(Database).useValue({check:async()=>true})
 .overrideProvider(RedisProbe).useValue({check:async()=>true}).overrideProvider(Tickets).useValue(service).compile();
 const app=mod.createNestApplication({logger:false,bodyParser:false});configureHttp(app,config,false);await app.init();t.after(()=>app.close());
 return {http:request(app.getHttpServer()),calls};
}
test('tickets local no puede activarse en produccion o cloud',()=>{
 for(const change of [{NODE_ENV:'production'},{RAILWAY_PROJECT_ID:'project'},{VERCEL:'1'},{HOST:'0.0.0.0'},
 {TICKETS_LOCAL_KEY:'secret'},{TICKETS_LOCAL_RED_ID:'invalid'}]) assert.throws(()=>readConfig({...env,...change}));
});
test('clave requerida para todos los endpoints; identidad solo del servidor',async t=>{
 const {http,calls}=await fixture(t);
 await http.get('/api/v1/tickets').expect(401);
 await http.post('/api/v1/tickets').send(body).expect(401);
 const res=await http.post('/api/v1/tickets').set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY)
 .set('X-Tenant-Id',randomUUID()).set('X-User-Id',randomUUID()).send(body).expect(201);
 assert.equal(calls[0].redAsistencialId,env.TICKETS_LOCAL_RED_ID);
 assert.equal(calls[0].userId,env.TICKETS_LOCAL_USER_ID);assert.equal(calls[0].requestId,res.headers['x-request-id']);
});
test('DTO rechaza sobreescritura de identidad/codigo/estado y contenido invalido',async t=>{
 const {http}=await fixture(t);
 for(const extra of [{redAsistencialId:randomUUID()},{codigo:'INC-2026-9999'},{estado:'CERRADO'},{solicitanteId:randomUUID()},
 {titulo:'   '},{descripcion:null},{categoria:'OTRA'},{prioridad:'URGENTE'},{areaId:'123'}]){
  await http.post('/api/v1/tickets').set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).send({...body,...extra}).expect(400);
 }
});
test('PATCH valida null, vacio e identidad; DELETE devuelve 204; ajeno 404',async t=>{
 const {http}=await fixture(t),id=randomUUID();
 for(const value of [{},{titulo:null},{estado:'CERRADO'},{areaId:randomUUID()}])
  await http.patch('/api/v1/tickets/'+id).set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).send(value).expect(400);
 await http.patch('/api/v1/tickets/'+id).set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).send({titulo:'Titulo nuevo'}).expect(200);
 await http.delete('/api/v1/tickets/'+id).set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).expect(204);
 await http.get('/api/v1/tickets/'+id).set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).expect(404);
 await http.get('/api/v1/tickets/not-uuid').set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).expect(400);
});
test('paginacion limitada y Swagger con cinco operaciones y clave local',async t=>{
 const {http}=await fixture(t);
 const page=await http.get('/api/v1/tickets').set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).expect(200);assert.equal(page.body.pageSize,20);
 for(const q of ['page=0','pageSize=101','pageSize=1.5','page=abc','redAsistencialId='+randomUUID()])
 await http.get('/api/v1/tickets?'+q).set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).expect(400);
 const spec=(await http.get('/docs-json').expect(200)).body;
 assert.deepEqual(Object.keys(spec.paths['/api/v1/tickets']).sort(),['get','post']);
 assert.deepEqual(Object.keys(spec.paths['/api/v1/tickets/{id}']).sort(),['delete','get','patch']);
 assert.equal(spec.components.securitySchemes['local-key'].name,'X-Local-Api-Key');
});
test('estado exige motivo, valida catalogo y convierte transicion invalida en 409',async t=>{
 const {http,calls}=await fixture(t),id=randomUUID(),url='/api/v1/tickets/'+id+'/estado';
 await http.patch(url).send({estado:'EN_PROCESO',motivo:'Atencion iniciada'}).expect(401);
 for(const value of [{estado:'INVALIDO',motivo:'Motivo valido'},{estado:'EN_PROCESO',motivo:'x'},
   {estado:'EN_PROCESO',motivo:null},{estado:'EN_PROCESO',motivo:'Motivo valido',actorId:randomUUID()}])
  await http.patch(url).set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).send(value).expect(400);
 const changed=await http.patch(url).set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY)
   .send({estado:'EN_PROCESO',motivo:'  Atencion iniciada  '}).expect(200);
 assert.equal(changed.body.estado,'EN_PROCESO');assert.equal(calls.at(-1).reason,'Atencion iniciada');
 await http.patch(url).set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY)
   .send({estado:'CERRADO',motivo:'Salto invalido'}).expect(409);
});
test('historial usa la clave local y Swagger publica las dos operaciones de estado',async t=>{
 const {http}=await fixture(t),id=randomUUID(),url='/api/v1/tickets/'+id+'/estado/historial';
 await http.get(url).expect(401);
 const history=await http.get(url).set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).expect(200);
 assert.deepEqual(history.body,[{estadoAnterior:null,estadoNuevo:'ABIERTO',motivo:'Ticket creado'}]);
 const spec=(await http.get('/docs-json').expect(200)).body;
 assert.deepEqual(Object.keys(spec.paths['/api/v1/tickets/{id}/estado']),['patch']);
 assert.deepEqual(Object.keys(spec.paths['/api/v1/tickets/{id}/estado/historial']),['get']);
});
