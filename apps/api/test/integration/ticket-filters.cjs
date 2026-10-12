require('reflect-metadata');
const assert=require('node:assert/strict'),request=require('supertest'),{randomUUID}=require('node:crypto');
const {Test}=require('@nestjs/testing');
const {AppModule}=require('../../dist/app.module');
const {Database,PrismaTenantUnitOfWork}=require('../../dist/infrastructure/database');
const {PrismaTicketRepository}=require('../../dist/infrastructure/ticket-repository');
const {RedisProbe}=require('../../dist/infrastructure/redis-probe');
const {RedisTicketEvents}=require('../../dist/infrastructure/ticket-events');
const {readConfig}=require('../../dist/infrastructure/config'),{configureHttp}=require('../../dist/presentation/http');
const {HmacAccessToken}=require('../../dist/infrastructure/access-token');

// Invocado solo por database.test.cjs dentro de essalud_test desechable; nunca usa la base local operativa.
exports.exerciseTicketFilters=async function({db,redA,redB}){
 assert.equal(process.env.ESSALUD_DISPOSABLE_TEST,'true');
 const url=new URL(process.env.DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/essalud_test');
 const key='a'.repeat(64),secret='b'.repeat(64),user=randomUUID(),other=randomUUID(),apps=[],fixtures=[];
 const uow=new PrismaTenantUnitOfWork(db),repository=new PrismaTicketRepository(uow);
 const principal=(red,actor=user,scope='NACIONAL',centerIds=[])=>({authenticated:true,redAsistencialId:red,userId:actor,
  displayName:'Prueba filtros',roles:[scope==='PROPIO'?'SOLICITANTE':scope==='SEDE'?'TECNICO_N1':'ADMIN_GCTIC'],scope,centerIds,
  permissions:['tickets:list','tickets:read']});
 const context=(red,actor=user)=>({redAsistencialId:red,userId:actor,requestId:randomUUID(),principal:principal(red,actor)});
 async function center(red){
  const fixture=await uow.run(context(red),async tx=>{
   const center=await tx.centroAsistencial.create({data:{redAsistencialId:red,codigo:'F48_'+randomUUID().slice(0,20).toUpperCase(),nombre:'Sede filtros 4.8',tipo:'CAP'}});
   const area=await tx.area.create({data:{redAsistencialId:red,centroAsistencialId:center.centroAsistencialId,codigo:'FILTROS',nombre:'Area filtros'}});
   return {red,centerId:center.centroAsistencialId,areaId:area.areaId};
  });fixtures.push(fixture);return fixture;
 }
 const input=(fixture,title,category='REDES',priority='MEDIA',description='Descripcion ficticia para filtros')=>({
  centroAsistencialId:fixture.centerId,areaId:fixture.areaId,titulo:title,descripcion:description,categoria:category,prioridad:priority});
 async function ticket(fixture,title,category,priority,actor=user,states=[],description){
  let result=await repository.create(context(fixture.red,actor),input(fixture,title,category,priority,description));
  for(const state of states)result=await repository.transition(context(fixture.red,actor),result.ticketId,state,'Transicion ficticia para prueba de filtros');
  return result;
 }
 async function httpFor(red){
  const config=readConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://unused:unused@localhost/db',REDIS_URL:'redis://:unused@localhost',
   TICKETS_LOCAL_ENABLED:'true',TICKETS_LOCAL_KEY:key,ACCESS_TOKEN_SECRET:secret,TICKETS_LOCAL_RED_ID:red,TICKETS_LOCAL_USER_ID:user});
  const ownedDb=new Proxy(db,{get(target,property){if(property==='onApplicationShutdown')return()=>{};
   const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;}});
  const module=await Test.createTestingModule({imports:[AppModule.register(config)]}).overrideProvider(Database).useValue(ownedDb)
   .overrideProvider(RedisProbe).useValue({check:async()=>true})
   .overrideProvider(RedisTicketEvents).useValue({publish:async()=>{},subscribe:()=>()=>{}}).compile();
  const app=module.createNestApplication({logger:false,bodyParser:false});configureHttp(app,config,false);await app.init();apps.push(app);
  return request(app.getHttpServer());
 }
 try {
  const a=await center(redA),b=await center(redA),foreign=await center(redB);
  await uow.run(context(redA),tx=>tx.ticket.createMany({data:Array.from({length:120},(_,index)=>({
   ...input(a,'Incidencia lote 4.8 '+String(index).padStart(3,'0')),redAsistencialId:redA,isDemo:true}))}));
  const open=await ticket(a,'Servidor AgujaTitulo','BIOMEDICO','CRITICA');
  await ticket(a,'Caso Aguja proceso','SOPORTE','ALTA',user,['EN_PROCESO']);
  await ticket(a,'Caso Aguja pendiente','INFRAESTRUCTURA','BAJA',other,['EN_PROCESO','PENDIENTE']);
  const resolved=await ticket(a,'Caso Aguja solucion','BIOMEDICO','CRITICA',user,['EN_PROCESO','RESUELTO']);
  const closed=await ticket(a,'Caso Aguja cerrado','SOPORTE','ALTA',other,['EN_PROCESO','RESUELTO','CERRADO']);
  const description=await ticket(b,'Caso segunda sede','REDES','ALTA',other,[],'AgujaDescripcion exclusivamente en descripcion');
  await ticket(b,'Caso segunda sede propio','SOPORTE','BAJA');
  await ticket(foreign,'AgujaTitulo fuera de red','BIOMEDICO','ALTA');
  const http=await httpFor(redA),httpB=await httpFor(redB),tokens=new HmacAccessToken(secret,900);
  const headers=scope=>({'X-Local-Api-Key':key,Authorization:'Bearer '+tokens.issue(principal(redA,user,scope,scope==='SEDE'?[a.centerId]:[]))});
  const get=async(path,filters={},scope='NACIONAL')=>(await http.get('/api/v1/tickets'+path).set(headers(scope)).query(filters).expect(200)).body;
  const list=(filters={},scope='NACIONAL')=>get('',filters,scope),summary=(filters={},scope='NACIONAL')=>get('/resumen',filters,scope);
  const first=await list({pageSize:100}),second=await list({page:2,pageSize:100}),third=await list({page:3,pageSize:100});
  assert.equal(first.items.length,100);assert.equal(first.hasMore,true);assert.equal(second.items.length,27);assert.equal(second.hasMore,false);
  assert.equal(third.items.length,0);assert.equal(third.hasMore,false);
  const ids=[...first.items,...second.items].map(item=>item.ticketId);assert.equal(new Set(ids).size,127);
  assert.deepEqual((await list({pageSize:100})).items.map(item=>item.ticketId),first.items.map(item=>item.ticketId));
  assert.ok(ids.includes(resolved.ticketId)&&ids.includes(closed.ticketId),'la vista all por defecto conserva el historial');
  const activeFirst=await list({view:'active',pageSize:100}),activeSecond=await list({view:'active',page:2,pageSize:100});
  assert.equal(activeFirst.items.length,100);assert.equal(activeFirst.hasMore,true);assert.equal(activeSecond.items.length,25);
  assert.equal(activeSecond.hasMore,false);assert.ok([...activeFirst.items,...activeSecond.items].every(item=>!['RESUELTO','CERRADO'].includes(item.estado)));
  const all=await summary();assert.equal(all.total,127);assert.equal(all.active,125);assert.equal(all.history,2);assert.equal(all.priority,5);
  assert.deepEqual(all.byState,{ABIERTO:123,EN_PROCESO:1,PENDIENTE:1,RESUELTO:1,CERRADO:1});
  assert.equal(all.centers.length,2);assert.deepEqual(all.centers.find(item=>item.centerId===a.centerId),{
   centerId:a.centerId,total:125,priority:4,byState:{ABIERTO:121,EN_PROCESO:1,PENDIENTE:1,RESUELTO:1,CERRADO:1}});
  assert.deepEqual(all.centers.find(item=>item.centerId===b.centerId),{
   centerId:b.centerId,total:2,priority:1,byState:{ABIERTO:2,EN_PROCESO:0,PENDIENTE:0,RESUELTO:0,CERRADO:0}});
  for(const [view,count] of [['active',125],['history',2]])assert.equal((await summary({view})).total,count);
  const history=await list({view:'history'});assert.deepEqual(new Set(history.items.map(item=>item.ticketId)),new Set([resolved.ticketId,closed.ticketId]));
  assert.deepEqual((await list({view:'active',estado:'CERRADO'})).items,[]);assert.equal((await summary({view:'active',estado:'CERRADO'})).total,0);
  for(const [search,id] of [['agujatitulo',open.ticketId],['agujadescripcion',description.ticketId],[open.codigo.toLowerCase(),open.ticketId]]){
   assert.deepEqual((await list({search})).items.map(item=>item.ticketId),[id]);assert.equal((await summary({search})).total,1);
  }
  for(const search of ['%',"' OR 1=1 --"]){assert.deepEqual((await list({search})).items,[]);assert.equal((await summary({search})).total,0);}
  assert.equal((await summary({search:'   '})).total,127);
  const combined={view:'history',estado:'RESUELTO',prioridad:'CRITICA',categoria:'BIOMEDICO',centroAsistencialId:a.centerId,search:'aguja'};
  assert.deepEqual((await list(combined)).items.map(item=>item.ticketId),[resolved.ticketId]);
  const combinedSummary=await summary(combined);assert.equal(combinedSummary.total,1);assert.equal(combinedSummary.history,1);assert.equal(combinedSummary.priority,1);
  assert.equal((await summary({estado:'EN_PROCESO'})).total,1);assert.equal((await summary({estado:'PENDIENTE'})).total,1);
  assert.equal((await summary({prioridad:'ALTA'})).total,3);assert.equal((await summary({categoria:'BIOMEDICO'})).total,2);
  const own=await summary({},'PROPIO');assert.equal(own.total,124);assert.equal(own.active,123);assert.equal(own.history,1);
  const ownPages=[await list({pageSize:100},'PROPIO'),await list({page:2,pageSize:100},'PROPIO')];
  assert.equal(ownPages[1].items.length,24);assert.ok(ownPages.flatMap(page=>page.items).every(item=>item.solicitanteId===user));
  assert.equal((await summary({search:'AgujaDescripcion'},'PROPIO')).total,0);
  const publicSummary=(await http.get('/api/v1/tickets/resumen').set('X-Local-Api-Key',key).expect(200)).body;
  assert.deepEqual(publicSummary,own);
  const seat=await summary({},'SEDE');assert.equal(seat.total,125);assert.deepEqual(seat.centers.map(item=>item.centerId),[a.centerId]);
  const seatPages=[await list({pageSize:100},'SEDE'),await list({page:2,pageSize:100},'SEDE')];
  assert.equal(seatPages[1].items.length,25);assert.ok(seatPages.flatMap(page=>page.items).every(item=>item.centroAsistencialId===a.centerId));
  for(const scope of ['PROPIO','SEDE']){
   const visible=(await list({view:'history'},scope)).items.map(item=>item.ticketId);
   assert.ok(visible.includes(resolved.ticketId));assert.equal(visible.includes(closed.ticketId),scope==='SEDE');
  }
  assert.deepEqual((await list({centroAsistencialId:b.centerId},'SEDE')).items,[]);
  assert.equal((await summary({centroAsistencialId:b.centerId},'SEDE')).total,0);
  assert.deepEqual((await list({centroAsistencialId:foreign.centerId})).items,[]);
  assert.equal((await summary({centroAsistencialId:foreign.centerId})).total,0);
  const foreignHeaders={'X-Local-Api-Key':key,Authorization:'Bearer '+tokens.issue(principal(redB))};
  assert.equal((await httpB.get('/api/v1/tickets/resumen').set(foreignHeaders).expect(200)).body.total,1);
  assert.equal((await httpB.get('/api/v1/tickets/resumen').set(foreignHeaders).query({centroAsistencialId:a.centerId}).expect(200)).body.total,0);
  for(const path of ['','/resumen'])for(const invalid of [{view:'otro'},{search:'x'.repeat(101)},{estado:'OTRO'},{prioridad:'OTRA'},
    {categoria:'OTRA'},{centroAsistencialId:'bad'},{userId:randomUUID()}])
   await http.get('/api/v1/tickets'+path).set(headers('NACIONAL')).query(invalid).expect(400);
  for(const invalid of [{page:100001},{pageSize:101},{page:0}])await http.get('/api/v1/tickets').set(headers('NACIONAL')).query(invalid).expect(400);
  assert.deepEqual(await db.client.ticket.groupBy({by:['centroAsistencialId','estado','prioridad'],_count:{_all:true}}),[],
   'RLS conserva el resumen vacio fuera del contexto transaccional');
 } finally {
  for(const app of apps)await app.close();
  for(const fixture of fixtures)await uow.run(context(fixture.red),async tx=>{
   await tx.ticket.deleteMany({where:{redAsistencialId:fixture.red,centroAsistencialId:fixture.centerId}});
   await tx.area.deleteMany({where:{redAsistencialId:fixture.red,centroAsistencialId:fixture.centerId}});
   await tx.centroAsistencial.deleteMany({where:{redAsistencialId:fixture.red,centroAsistencialId:fixture.centerId}});
  });
 }
};
