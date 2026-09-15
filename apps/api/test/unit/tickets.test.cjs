require('reflect-metadata');
const {test}=require('node:test'), assert=require('node:assert/strict'), request=require('supertest');
const {randomUUID}=require('node:crypto');
const {Test}=require('@nestjs/testing');
const {AppModule}=require('../../dist/app.module');
const {Tickets}=require('../../dist/application/tickets');
const {TicketFailure}=require('../../dist/domain/ticket');
const {Database}=require('../../dist/infrastructure/database');
const {RedisProbe}=require('../../dist/infrastructure/redis-probe');
const {RedisTicketEvents}=require('../../dist/infrastructure/ticket-events');
const {PrismaTicketRepository}=require('../../dist/infrastructure/ticket-repository');
const {readConfig}=require('../../dist/infrastructure/config');
const {configureHttp}=require('../../dist/presentation/http');
const {ACCESS_TOKEN}=require('../../dist/presentation/access.guard');
const env={NODE_ENV:'test',DATABASE_URL:'postgresql://runtime:example@localhost/db',REDIS_URL:'redis://:example@localhost',
 TICKETS_LOCAL_ENABLED:'true',TICKETS_LOCAL_KEY:'a'.repeat(64),ACCESS_TOKEN_SECRET:'b'.repeat(64),TICKETS_LOCAL_RED_ID:randomUUID(),TICKETS_LOCAL_USER_ID:randomUUID()};
const admin={authenticated:true,redAsistencialId:env.TICKETS_LOCAL_RED_ID,userId:env.TICKETS_LOCAL_USER_ID,displayName:'Administrador demo',
 roles:['ADMIN_GCTIC'],scope:'NACIONAL',centerIds:[],permissions:['tickets:create','tickets:list','tickets:read','tickets:update','tickets:transition','tickets:history','tickets:assign','tickets:technicians','tickets:delete','tickets:events','organization:read']};
const body={centroAsistencialId:randomUUID(),areaId:randomUUID(),titulo:'Ticket de prueba',descripcion:'Descripcion suficientemente larga',categoria:'SOPORTE',prioridad:'MEDIA'};
async function fixture(t){
 const calls=[];
 const service={create:async(c,b)=>{calls.push(c);return {...b,codigo:'INC-2026-0001'};},list:async(c,p,size)=>({items:[],page:p,pageSize:size,hasMore:false}),
 get:async()=>{throw new TicketFailure('NOT_FOUND');},update:async(c,id,b)=>{if(!Object.keys(b).length)throw new TicketFailure('INVALID');return b;},
 transition:async(c,id,state,reason)=>{calls.push({state,reason});if(state==='CERRADO')throw new TicketFailure('CONFLICT');return {estado:state};},
 history:async()=>[{estadoAnterior:null,estadoNuevo:'ABIERTO',motivo:'Ticket creado'}],delete:async()=>{},
 technicians:async()=>[{technicianId:body.areaId,name:'Tecnico 01',activeLoad:0,maxCapacity:4,availableCapacity:4}],
 assign:async(c,id,technicianId,reason)=>{calls.push({technicianId,reason});return {ticketId:id,assignedTo:technicianId};},
 autoAssign:async(c,id)=>({ticketId:id,assignedTo:body.areaId}),
 assignmentHistory:async()=>[{assignmentMode:'MANUAL',newTechnicianId:body.areaId}],
 watch:(context,listener)=>{calls.push({watch:context.redAsistencialId,listener});return ()=>{};}};
 const config=readConfig(env);
 const mod=await Test.createTestingModule({imports:[AppModule.register(config)]}).overrideProvider(Database).useValue({check:async()=>true})
 .overrideProvider(RedisProbe).useValue({check:async()=>true})
 .overrideProvider(RedisTicketEvents).useValue({publish:async()=>{},subscribe:()=>()=>{}})
 .overrideProvider(ACCESS_TOKEN).useValue({verify:()=>admin,issue:()=>''})
 .overrideProvider(Tickets).useValue(service).compile();
 const app=mod.createNestApplication({logger:false,bodyParser:false});configureHttp(app,config,false);await app.init();t.after(()=>app.close());
 const raw=request(app.getHttpServer());
 const http=new Proxy(raw,{get(target,property){const value=Reflect.get(target,property);if(typeof value==='function'&&['get','post','patch','delete'].includes(property))
   return (...args)=>value.apply(target,args).set('Authorization','Bearer aaa.bbb.ccc');return typeof value==='function'?value.bind(target):value;}});
 return {http,raw,calls};
}
test('tickets local no puede activarse en produccion o cloud',()=>{
 for(const change of [{NODE_ENV:'production'},{RAILWAY_PROJECT_ID:'project'},{VERCEL:'1'},{HOST:'0.0.0.0'},
 {TICKETS_LOCAL_KEY:'secret'},{ACCESS_TOKEN_SECRET:'a'.repeat(64)},{TICKETS_LOCAL_RED_ID:'invalid'},{APP_ENVIRONMENT:'institutional'}]) assert.throws(()=>readConfig({...env,...change}));
});
test('clave requerida, solicitante público limitado e identidad solo del servidor',async t=>{
 const {http,raw,calls}=await fixture(t);
 await http.get('/api/v1/tickets').expect(401);
 await http.post('/api/v1/tickets').send(body).expect(401);
 const publicResult=await raw.post('/api/v1/tickets').set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).send(body).expect(201);
 assert.equal(calls[0].principal.authenticated,false);assert.equal(calls[0].userId,env.TICKETS_LOCAL_USER_ID);
 await raw.patch('/api/v1/tickets/'+randomUUID()).set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).send({titulo:'Intento público'}).expect(403);
 const res=await http.post('/api/v1/tickets').set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY)
 .set('X-Tenant-Id',randomUUID()).set('X-User-Id',randomUUID()).send(body).expect(201);
 assert.equal(publicResult.body.codigo,'INC-2026-0001');assert.equal(calls[1].redAsistencialId,env.TICKETS_LOCAL_RED_ID);
 assert.equal(calls[1].userId,env.TICKETS_LOCAL_USER_ID);assert.equal(calls[1].requestId,res.headers['x-request-id']);
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
  assert.deepEqual(Object.keys(spec.paths['/api/v1/tickets/events']),['get']);
});
test('asignacion manual y automatica validan entrada, clave y publican contrato',async t=>{
 const {http,calls}=await fixture(t),id=randomUUID(),base='/api/v1/tickets/'+id+'/asignacion';
 await http.get('/api/v1/tickets/asignacion/tecnicos').expect(401);
 const technicians=await http.get('/api/v1/tickets/asignacion/tecnicos').set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).expect(200);
 assert.equal(technicians.body[0].name,'Tecnico 01');
 for(const value of [{tecnicoId:'bad',motivo:'Motivo valido'},{tecnicoId:body.areaId,motivo:'x'},{tecnicoId:body.areaId}])
  await http.patch(base).set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).send(value).expect(400);
 const assigned=await http.patch(base).set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY)
  .send({tecnicoId:body.areaId,motivo:'  Asignacion por especialidad  '}).expect(200);
 assert.equal(assigned.body.assignedTo,body.areaId);assert.equal(calls.at(-1).reason,'Asignacion por especialidad');
 await http.post(base+'/automatica').expect(401);
 await http.post(base+'/automatica').set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).expect(200);
 const history=await http.get(base+'/historial').set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).expect(200);
 assert.equal(history.body[0].assignmentMode,'MANUAL');
 const spec=(await http.get('/docs-json').expect(200)).body;
 assert.ok(spec.paths['/api/v1/tickets/asignacion/tecnicos']);assert.ok(spec.paths['/api/v1/tickets/{id}/asignacion']);
 assert.ok(spec.paths['/api/v1/tickets/{id}/asignacion/automatica']);assert.ok(spec.paths['/api/v1/tickets/{id}/asignacion/historial']);
});

test('aplicacion publica cambios confirmados con tenant y request, pero no publica fallos',async()=>{
 const published=[],listeners=new Map();
 const bus={publish:async event=>published.push(event),subscribe:(red,listener)=>{listeners.set(red,listener);return()=>listeners.delete(red);}};
 const ticket={ticketId:randomUUID(),centroAsistencialId:body.centroAsistencialId,solicitanteId:env.TICKETS_LOCAL_USER_ID};
 const repository={create:async()=>ticket,list:async()=>({items:[]}),get:async()=>ticket,update:async()=>ticket,
  transition:async()=>ticket,history:async()=>[],technicians:async()=>[],assign:async()=>ticket,autoAssign:async()=>ticket,
  assignmentHistory:async()=>[],delete:async()=>{},};
 const service=new Tickets(repository,bus),context={redAsistencialId:env.TICKETS_LOCAL_RED_ID,userId:env.TICKETS_LOCAL_USER_ID,requestId:randomUUID(),principal:admin};
 await service.create(context,body);await service.update(context,ticket.ticketId,{titulo:'Actualizado'});
 await service.transition(context,ticket.ticketId,'EN_PROCESO','Atencion iniciada');
 await service.assign(context,ticket.ticketId,randomUUID(),'Asignacion manual');await service.autoAssign(context,ticket.ticketId);
 await service.delete(context,ticket.ticketId);
 assert.deepEqual(published.map(event=>event.type),['ticket.created','ticket.updated','ticket.state_changed',
  'ticket.assignment_changed','ticket.assignment_changed','ticket.deleted']);
 assert.ok(published.every(event=>event.redAsistencialId===context.redAsistencialId&&event.eventId===context.requestId));
 const received=[];const stop=service.watch(context,event=>received.push(event));
 listeners.get(context.redAsistencialId)(published[0]);stop();assert.equal(received.length,1);assert.equal(listeners.size,0);
 const failed=new Tickets({...repository,create:async()=>{throw new TicketFailure('INVALID');}},bus);
 await assert.rejects(failed.create(context,body));assert.equal(published.length,6);
});

test('asignacion automatica convierte el bloqueo PostgreSQL void a un tipo compatible con Prisma',async()=>{
 const ticketId=randomUUID(),technicianId=randomUUID(),queries=[];
 const tx={
  $queryRaw:async(strings,...values)=>{
   queries.push({sql:strings.join('?'),values});
   if(queries.length===1)return[{acquired:''}];
   if(queries.length===2)return[{estado:'ABIERTO',assignedTo:null}];
   if(queries.length===3)return[{technicianId}];
   return[{}];
  },
  ticket:{findFirst:async()=>({ticketId,centroAsistencialId:body.centroAsistencialId,solicitanteId:env.TICKETS_LOCAL_USER_ID}),update:async({data})=>({ticketId,...data})},
 };
 const uow={run:async(_context,operation)=>operation(tx)};
 const repository=new PrismaTicketRepository(uow);
 const result=await repository.autoAssign({redAsistencialId:env.TICKETS_LOCAL_RED_ID,userId:env.TICKETS_LOCAL_USER_ID,requestId:randomUUID(),principal:admin},ticketId);
 assert.match(queries[0].sql,/pg_advisory_xact_lock[\s\S]*::text AS acquired/);
 assert.equal(result.assignedTo,technicianId);assert.equal(result.assignmentMode,'AUTOMATICA');
});

test('repositorio limita listados por solicitante y por sedes autorizadas',async()=>{
 const filters=[];const tx={ticket:{findMany:async options=>{filters.push(options.where);return[];}}};
 const repository=new PrismaTicketRepository({run:async(_context,operation)=>operation(tx)}),base={redAsistencialId:env.TICKETS_LOCAL_RED_ID,
  userId:env.TICKETS_LOCAL_USER_ID,requestId:randomUUID()};
 await repository.list({...base,principal:{...admin,authenticated:false,roles:['SOLICITANTE'],scope:'PROPIO',centerIds:[],permissions:['tickets:list']}},1,20);
 const centerA=randomUUID(),centerB=randomUUID();
 await repository.list({...base,principal:{...admin,roles:['TECNICO_N1'],scope:'SEDE',centerIds:[centerA,centerB],permissions:['tickets:list']}},1,20);
 await repository.list({...base,principal:{...admin,roles:['SUPERVISOR_RED'],scope:'RED',centerIds:[],permissions:['tickets:list']}},1,20);
 assert.deepEqual(filters,[
  {redAsistencialId:env.TICKETS_LOCAL_RED_ID,solicitanteId:env.TICKETS_LOCAL_USER_ID},
  {redAsistencialId:env.TICKETS_LOCAL_RED_ID,centroAsistencialId:{in:[centerA,centerB]}},
  {redAsistencialId:env.TICKETS_LOCAL_RED_ID},
 ]);
});
