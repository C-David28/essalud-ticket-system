require('reflect-metadata');
const assert=require('node:assert/strict'), request=require('supertest'), {randomUUID}=require('node:crypto');
const {Test}=require('@nestjs/testing');
const {AppModule}=require('../../dist/app.module'),{Database,PrismaTenantUnitOfWork}=require('../../dist/infrastructure/database');
const {RedisProbe}=require('../../dist/infrastructure/redis-probe');
const {RedisTicketEvents}=require('../../dist/infrastructure/ticket-events');
const {readConfig}=require('../../dist/infrastructure/config'),{configureHttp}=require('../../dist/presentation/http');
exports.exerciseTickets=async function({db,redA,redB,centro,area,tech1,tech2,concurrent=true}){
 const key='a'.repeat(64),user=randomUUID(),apps=[];
 async function appFor(red){
  const config=readConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://unused:unused@localhost/db',REDIS_URL:'redis://:unused@localhost',
   TICKETS_LOCAL_ENABLED:'true',TICKETS_LOCAL_KEY:key,TICKETS_LOCAL_RED_ID:red,TICKETS_LOCAL_USER_ID:user});
  const mod=await Test.createTestingModule({imports:[AppModule.register(config)]}).overrideProvider(Database).useValue(db)
   .overrideProvider(RedisProbe).useValue({check:async()=>true})
   .overrideProvider(RedisTicketEvents).useValue({publish:async()=>{},subscribe:()=>()=>{}}).compile();
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
  const techList=(await a.get('/api/v1/tickets/asignacion/tecnicos').set('X-Local-Api-Key',key).expect(200)).body;
  assert.deepEqual(techList.map(item=>item.technicianId),[tech1,tech2]);assert.ok(techList.every(item=>item.activeLoad===0));
  await b.get('/api/v1/tickets/asignacion/tecnicos').set('X-Local-Api-Key',key).expect(200).expect([]);
  const autoBase=id=>'/api/v1/tickets/'+id+'/asignacion/automatica';
  let assigned=await a.post(autoBase(responses[0].body.ticketId)).set('X-Local-Api-Key',key).expect(200);
  assert.equal(assigned.body.assignedTo,tech1);assert.equal(assigned.body.assignmentMode,'AUTOMATICA');
  assigned=await a.post(autoBase(responses[1].body.ticketId)).set('X-Local-Api-Key',key).expect(200);
  assert.equal(assigned.body.assignedTo,tech2);
  const manual='/api/v1/tickets/'+responses[0].body.ticketId+'/asignacion';
  await a.patch(manual).set('X-Local-Api-Key',key).send({tecnicoId:tech2,motivo:'Reasignacion integral manual'}).expect(200);
  await a.patch(manual).set('X-Local-Api-Key',key).send({tecnicoId:tech2,motivo:'Asignacion repetida'}).expect(409);
  await b.patch(manual).set('X-Local-Api-Key',key).send({tecnicoId:tech1,motivo:'Intento ajeno'}).expect(404);
  const automatic=await Promise.all(responses.slice(2).map(response=>a.post(autoBase(response.body.ticketId)).set('X-Local-Api-Key',key)));
  assert.ok(automatic.every(response=>response.status===200));
  const balanced=(await a.get('/api/v1/tickets/asignacion/tecnicos').set('X-Local-Api-Key',key).expect(200)).body;
  assert.deepEqual(balanced.map(item=>item.activeLoad),[3,3]);
  await a.post(autoBase(responses[2].body.ticketId)).set('X-Local-Api-Key',key).expect(409);
  await a.patch('/api/v1/tickets/'+responses[1].body.ticketId+'/asignacion').set('X-Local-Api-Key',key)
    .send({tecnicoId:tech1,motivo:'Capacidad completa'}).expect(409);
  const assignments=(await a.get(manual+'/historial').set('X-Local-Api-Key',key).expect(200)).body;
  assert.deepEqual(assignments.map(item=>item.assignmentMode),['AUTOMATICA','MANUAL']);
  assert.deepEqual(assignments.map(item=>item.newTechnicianId),[tech1,tech2]);
  const raceUrl='/api/v1/tickets/'+responses[1].body.ticketId+'/estado';
  const race=await Promise.all([
   a.patch(raceUrl).set('X-Local-Api-Key',key).send({estado:'EN_PROCESO',motivo:'Tecnico A toma el ticket'}),
   a.patch(raceUrl).set('X-Local-Api-Key',key).send({estado:'EN_PROCESO',motivo:'Tecnico B toma el ticket'}),
  ]);
  assert.deepEqual(race.map(result=>result.status).sort(),[200,409]);
  await a.get('/api/v1/tickets/'+first.ticketId).set('X-Local-Api-Key',key).expect(200);
  await b.get('/api/v1/tickets/'+first.ticketId).set('X-Local-Api-Key',key).expect(404);
  await b.patch('/api/v1/tickets/'+first.ticketId).set('X-Local-Api-Key',key).send({titulo:'Cambio ajeno'}).expect(404);
  await b.delete('/api/v1/tickets/'+first.ticketId).set('X-Local-Api-Key',key).expect(404);
  await b.post('/api/v1/tickets').set('X-Local-Api-Key',key).send(input).expect(400);
  const list=await a.get('/api/v1/tickets?pageSize=1').set('X-Local-Api-Key',key).expect(200);
  assert.equal(list.body.items.length,1);assert.equal(list.body.hasMore,true);
  const patched=await a.patch('/api/v1/tickets/'+first.ticketId).set('X-Local-Api-Key',key).send({titulo:'Ticket actualizado',prioridad:'CRITICA'}).expect(200);
  assert.equal(patched.body.codigo,first.codigo);
  const stateUrl='/api/v1/tickets/'+first.ticketId+'/estado';
  await a.patch(stateUrl).set('X-Local-Api-Key',key).send({estado:'CERRADO',motivo:'Salto directo'}).expect(409);
  const route=[
   ['EN_PROCESO','Atencion tecnica iniciada'],['PENDIENTE','Esperando repuesto ficticio'],
   ['EN_PROCESO','Repuesto ficticio recibido'],['RESUELTO','Solucion inicial verificada'],
   ['EN_PROCESO','Incidencia ficticia reaparecida'],['RESUELTO','Solucion final verificada'],
   ['CERRADO','Conformidad ficticia registrada'],
  ];
  let stateResponse;
  for(const [estado,motivo] of route) stateResponse=await a.patch(stateUrl).set('X-Local-Api-Key',key).send({estado,motivo}).expect(200);
  assert.equal(stateResponse.body.estado,'CERRADO');assert.ok(stateResponse.body.resolvedAt);assert.ok(stateResponse.body.closedAt);
  await a.patch(stateUrl).set('X-Local-Api-Key',key).send({estado:'EN_PROCESO',motivo:'Intento terminal'}).expect(409);
  await b.patch(stateUrl).set('X-Local-Api-Key',key).send({estado:'EN_PROCESO',motivo:'Intento ajeno'}).expect(404);
  const history=(await a.get(stateUrl+'/historial').set('X-Local-Api-Key',key).expect(200)).body;
  assert.equal(history.length,8);assert.equal(history[0].estadoAnterior,null);assert.equal(history[0].estadoNuevo,'ABIERTO');
  assert.deepEqual(history.slice(1).map(item=>item.estadoNuevo),route.map(item=>item[0]));
  assert.deepEqual(history.slice(1).map(item=>item.motivo),route.map(item=>item[1]));
  assert.ok(history.every(item=>item.changedBy===user));
  await b.get(stateUrl+'/historial').set('X-Local-Api-Key',key).expect(404);
  const deletion=await a.delete('/api/v1/tickets/'+first.ticketId).set('X-Local-Api-Key',key).expect(204);
  await a.get('/api/v1/tickets/'+first.ticketId).set('X-Local-Api-Key',key).expect(404);
  const retainedHistory=await uow.run({redAsistencialId:redA,userId:user,requestId:randomUUID()},
    tx=>tx.ticketStateTransition.findMany({where:{ticketId:first.ticketId}}));
  assert.equal(retainedHistory.length,8);
  const retainedAssignments=await uow.run({redAsistencialId:redA,userId:user,requestId:randomUUID()},
    tx=>tx.ticketAssignmentHistory.findMany({where:{ticketId:first.ticketId}}));
  assert.equal(retainedAssignments.length,2);
  const logs=await uow.run({redAsistencialId:redA,userId:user,requestId:randomUUID()},tx=>tx.auditLog.findMany({where:{entity:'app.tickets',entityId:{path:['ticket_id'],equals:first.ticketId}},orderBy:{timestamp:'asc'}}));
  assert.equal(logs[0].action,'INSERT');assert.equal(logs.at(-1).action,'DELETE');
  assert.equal(logs.filter(l=>l.action==='UPDATE'&&l.oldValues.estado!==l.newValues.estado).length,7);
  assert.equal(logs[0].requestId,responses[0].headers['x-request-id']);
  const contentUpdate=logs.find(log=>log.action==='UPDATE'&&log.oldValues.titulo===input.titulo&&log.newValues.prioridad==='CRITICA');
  assert.ok(contentUpdate,'la auditoria debe conservar la edicion de contenido y prioridad');
  assert.equal(contentUpdate.requestId,patched.headers['x-request-id']);
  assert.ok(logs.some(l=>l.newValues?.estado==='CERRADO'&&l.newValues.closed_at));
  assert.equal(logs.filter(l=>l.action==='UPDATE'&&l.oldValues.assigned_to!==l.newValues.assigned_to).length,2);
  assert.equal(logs.at(-1).requestId,deletion.headers['x-request-id']);
  for(const r of responses.slice(1))await a.delete('/api/v1/tickets/'+r.body.ticketId).set('X-Local-Api-Key',key).expect(204);
  assert.deepEqual(await real.client.ticket.findMany(),[]);
 } finally {for(const app of apps)await app.close();}
};
