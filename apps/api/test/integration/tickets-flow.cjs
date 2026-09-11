require('reflect-metadata');
const assert=require('node:assert/strict'), request=require('supertest'), {randomUUID}=require('node:crypto');
const {Test}=require('@nestjs/testing');
const {AppModule}=require('../../dist/app.module'),{Database,PrismaTenantUnitOfWork}=require('../../dist/infrastructure/database');
const {RedisProbe}=require('../../dist/infrastructure/redis-probe');
const {readConfig}=require('../../dist/infrastructure/config'),{configureHttp}=require('../../dist/presentation/http');
exports.exerciseTickets=async function({db,redA,redB,centro,area,concurrent=true}){
 const key='a'.repeat(64),user=randomUUID(),apps=[];
 async function appFor(red){
  const config=readConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://unused:unused@localhost/db',REDIS_URL:'redis://:unused@localhost',
   TICKETS_LOCAL_ENABLED:'true',TICKETS_LOCAL_KEY:key,TICKETS_LOCAL_RED_ID:red,TICKETS_LOCAL_USER_ID:user});
  const mod=await Test.createTestingModule({imports:[AppModule.register(config)]}).overrideProvider(Database).useValue(db)
   .overrideProvider(RedisProbe).useValue({check:async()=>true}).compile();
  const app=mod.createNestApplication({logger:false,bodyParser:false});configureHttp(app,config,false);await app.init();apps.push(app);
  return request(app.getHttpServer());
 }
 // Los modulos comparten db; cerrar cada app llamaria al shutdown de db varias veces.
 // El llamador mantiene/cierra la conexion; el proxy conserva los metodos y omite solo shutdown.
 const real=db;db=new Proxy(real,{get(target,key){if(key==='onApplicationShutdown')return ()=>{};const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;}});
 try {
  const a=await appFor(redA),b=await appFor(redB),uow=new PrismaTenantUnitOfWork(db);
  const input={centroAsistencialId:centro,areaId:area,titulo:'Prueba integral ticket',descripcion:'Descripcion integral ficticia',categoria:'REDES',prioridad:'ALTA'};
  const create=()=>a.post('/api/v1/tickets').set('X-Local-Api-Key',key).send(input).expect(201);
  const responses=concurrent?await Promise.all(Array.from({length:6},create)):[await create(),await create()];
  assert.equal(new Set(responses.map(r=>r.body.codigo)).size,responses.length);
  const first=responses[0].body;
  assert.match(first.codigo,/^INC-\d{4}-\d{4,}$/);assert.equal(first.solicitanteId,user);
  await a.get('/api/v1/tickets/'+first.ticketId).set('X-Local-Api-Key',key).expect(200);
  await b.get('/api/v1/tickets/'+first.ticketId).set('X-Local-Api-Key',key).expect(404);
  await b.patch('/api/v1/tickets/'+first.ticketId).set('X-Local-Api-Key',key).send({titulo:'Cambio ajeno'}).expect(404);
  await b.delete('/api/v1/tickets/'+first.ticketId).set('X-Local-Api-Key',key).expect(404);
  await b.post('/api/v1/tickets').set('X-Local-Api-Key',key).send(input).expect(400);
  const list=await a.get('/api/v1/tickets?pageSize=1').set('X-Local-Api-Key',key).expect(200);
  assert.equal(list.body.items.length,1);assert.equal(list.body.hasMore,true);
  const patched=await a.patch('/api/v1/tickets/'+first.ticketId).set('X-Local-Api-Key',key).send({titulo:'Ticket actualizado',prioridad:'CRITICA'}).expect(200);
  assert.equal(patched.body.codigo,first.codigo);
  const deletion=await a.delete('/api/v1/tickets/'+first.ticketId).set('X-Local-Api-Key',key).expect(204);
  await a.get('/api/v1/tickets/'+first.ticketId).set('X-Local-Api-Key',key).expect(404);
  const logs=await uow.run({redAsistencialId:redA,userId:user,requestId:randomUUID()},tx=>tx.auditLog.findMany({where:{entity:'app.tickets',entityId:{path:['ticket_id'],equals:first.ticketId}},orderBy:{timestamp:'asc'}}));
  assert.deepEqual(logs.map(l=>l.action),['INSERT','UPDATE','DELETE']);
  assert.equal(logs[0].requestId,responses[0].headers['x-request-id']);
  assert.equal(logs[1].oldValues.titulo,input.titulo);assert.equal(logs[1].newValues.prioridad,'CRITICA');
  assert.equal(logs[2].requestId,deletion.headers['x-request-id']);
  for(const r of responses.slice(1))await a.delete('/api/v1/tickets/'+r.body.ticketId).set('X-Local-Api-Key',key).expect(204);
  assert.deepEqual(await real.client.ticket.findMany(),[]);
 } finally {for(const app of apps)await app.close();}
};

