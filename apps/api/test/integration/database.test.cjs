const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const request=require('supertest');
const {Database,PrismaTenantUnitOfWork}=require('../../dist/infrastructure/database');
const {createApplication}=require('../../dist/bootstrap');
const {readConfig}=require('../../dist/infrastructure/config');

test('Integracion en PostgreSQL y Redis desechables', {timeout:60000}, async t=>{
  assert.equal(process.env.ESSALUD_DISPOSABLE_TEST,'true','Ejecutar npm run api:test:integration desde la raiz');
  for(const key of ['DATABASE_URL','TEST_ADMIN_DATABASE_URL']) {
    const url=new URL(process.env[key]);
    assert.equal(url.pathname,'/essalud_test');
    assert.equal(url.hostname,'127.0.0.1');
  }
  const admin=new Client({connectionString:process.env.TEST_ADMIN_DATABASE_URL});
  await admin.connect();t.after(()=>admin.end());
  const db=new Database(process.env.DATABASE_URL,1);t.after(()=>db.onApplicationShutdown());
  const uow=new PrismaTenantUnitOfWork(db);
  const redA=randomUUID(),redB=randomUUID(),user=randomUUID();
  const context=(red=redA)=>({redAsistencialId:red,userId:user,requestId:randomUUID()});
  await admin.query('INSERT INTO app.redes_asistenciales(red_asistencial_id,codigo,nombre) VALUES ($1,\'TEST_A\',\'Red ficticia A\'),($2,\'TEST_B\',\'Red ficticia B\')',[redA,redB]);
  let centro;
  await t.test('conexion autentica essalud_api y rechaza salud de superusuario',async()=>{
    assert.equal(await db.check(),true);
    assert.deepEqual(await db.client.$queryRaw`SELECT current_user::text AS role`,[{role:'essalud_api'}]);
    const unsafe=new Database(process.env.TEST_ADMIN_DATABASE_URL,1);
    try {assert.equal(await unsafe.check(),false);} finally {await unsafe.onApplicationShutdown();}
  });
  await t.test('Prisma sin contexto no lee datos',async()=>{
    assert.deepEqual(await db.client.redAsistencial.findMany(),[]);
    assert.deepEqual(await db.client.auditLog.findMany(),[]);
  });
  await t.test('Prisma ve solo su red y no encuentra una red ajena',async()=>{
    const rows=await uow.run(context(),tx=>tx.redAsistencial.findMany());
    assert.deepEqual(rows.map(row=>row.redAsistencialId),[redA]);
    assert.deepEqual(await uow.run(context(),tx=>tx.redAsistencial.findMany({where:{redAsistencialId:redB}})),[]);
  });
  await t.test('escritura Prisma genera auditoria con usuario y request de la misma transaccion',async()=>{
    const ctx=context();
    centro=await uow.run(ctx,tx=>tx.centroAsistencial.create({data:{redAsistencialId:redA,codigo:'TEST_CENTRO',nombre:'Centro ficticio',tipo:'CAP'}}));
    const logs=await uow.run(ctx,tx=>tx.auditLog.findMany({where:{requestId:ctx.requestId}}));
    assert.equal(logs.length,1);assert.equal(logs[0].userId,user);assert.equal(logs[0].action,'INSERT');
    assert.equal(logs[0].oldValues,null);assert.equal(logs[0].newValues.nombre,'Centro ficticio');
    const actor=await uow.run(ctx,tx=>tx.$queryRaw`SELECT db_session_user::text AS session, db_effective_role::text AS role FROM audit.audit_logs WHERE request_id=${ctx.requestId}::uuid`);
    assert.deepEqual(actor,[{session:'essalud_api',role:'essalud_api'}]);
    assert.equal((await uow.run(context(redB),tx=>tx.auditLog.findMany({where:{requestId:ctx.requestId}}))).length,0);
  });
  await t.test('mapeo Prisma de areas mantiene relaciones compuestas y auditoria',async()=>{
    const ctx=context();
    const area=await uow.run(ctx,tx=>tx.area.create({data:{redAsistencialId:redA,
      centroAsistencialId:centro.centroAsistencialId,codigo:'TEST_AREA',nombre:'Area ficticia'}}));
    const where={redAsistencialId_centroAsistencialId_areaId:{redAsistencialId:redA,
      centroAsistencialId:centro.centroAsistencialId,areaId:area.areaId}};
    const loaded=await uow.run(ctx,tx=>tx.area.findUnique({where,include:{centro:true}}));
    assert.equal(loaded.centro.centroAsistencialId,centro.centroAsistencialId);
    await uow.run(ctx,tx=>tx.area.delete({where}));
    assert.equal(await uow.run(ctx,tx=>tx.auditLog.count({where:{requestId:ctx.requestId,entity:'app.areas'}})),2);
  });
  await t.test('rollback revierte negocio y auditoria',async()=>{
    const ctx=context();
    await assert.rejects(uow.run(ctx,async tx=>{
      await tx.centroAsistencial.create({data:{redAsistencialId:redA,codigo:'TEST_ROLLBACK',nombre:'Revertir',tipo:'CAP'}});
      throw new Error('rollback-test');
    }),/rollback-test/);
    assert.equal((await uow.run(context(),tx=>tx.centroAsistencial.count({where:{codigo:'TEST_ROLLBACK'}}))),0);
    assert.equal((await uow.run(context(),tx=>tx.auditLog.count({where:{requestId:ctx.requestId}}))),0);
  });
  await t.test('pool reutilizado limpia contexto despues de commit y rollback',async()=>{
    assert.deepEqual(await db.client.redAsistencial.findMany(),[]);
    const rows=await db.client.$queryRaw`SELECT nullif(current_setting('app.user_id',true),'') AS actor, nullif(current_setting('app.request_id',true),'') AS request`;
    assert.deepEqual(rows,[{actor:null,request:null}]);
    assert.deepEqual((await uow.run(context(redB),tx=>tx.redAsistencial.findMany())).map(row=>row.redAsistencialId),[redB]);
  });
  await t.test('runtime no puede escribir en otra red ni modificar auditoria',async()=>{
    await assert.rejects(uow.run(context(),tx=>tx.centroAsistencial.create({data:{redAsistencialId:redB,codigo:'WRONG_TENANT',nombre:'Rechazar',tipo:'CAP'}})));
    for(const sql of ['DELETE FROM audit.audit_logs','UPDATE audit.audit_logs SET action=\'DELETE\'','TRUNCATE audit.audit_logs']) {
      await assert.rejects(uow.run(context(),tx=>tx.$executeRawUnsafe(sql)));
    }
  });
  await t.test('UPDATE y DELETE por Prisma conservan old_values y new_values',async()=>{
    const ctx=context();
    const where={redAsistencialId_centroAsistencialId:{redAsistencialId:redA,centroAsistencialId:centro.centroAsistencialId}};
    await uow.run(ctx,tx=>tx.centroAsistencial.update({where,data:{nombre:'Centro actualizado'}}));
    const update=(await uow.run(ctx,tx=>tx.auditLog.findMany({where:{requestId:ctx.requestId,action:'UPDATE'}})))[0];
    assert.equal(update.oldValues.nombre,'Centro ficticio');assert.equal(update.newValues.nombre,'Centro actualizado');
    const deleted=context();await uow.run(deleted,tx=>tx.centroAsistencial.delete({where}));
    const log=(await uow.run(deleted,tx=>tx.auditLog.findMany({where:{requestId:deleted.requestId}})))[0];
    assert.equal(log.action,'DELETE');assert.equal(log.newValues,null);
  });
  await t.test('solicitudes concurrentes mantienen tenants separados',async()=>{
    const parallel=new Database(process.env.DATABASE_URL,3);
    const parallelUow=new PrismaTenantUnitOfWork(parallel);
    try {
      await Promise.all(Array.from({length:6},async(_,i)=>{
        const red=i%2?redA:redB;
        const result=await parallelUow.run(context(red),async tx=>{
          await tx.$queryRaw`SELECT pg_sleep(0.02)::text`;
          return tx.redAsistencial.findMany();
        });
        assert.deepEqual(result.map(row=>row.redAsistencialId),[red]);
      }));
    } finally {await parallel.onApplicationShutdown();}
  });
  await t.test('HTTP real: readiness 200, Redis caido 503 y liveness 200',async()=>{
    const app=await createApplication(readConfig(process.env),true);
    try {
      await app.init();const http=request(app.getHttpServer());
      let status;
      for(let i=0;i<25;i++) {
        status=await http.get('/api/v1/health/ready');
        if(status.status===200) break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      assert.equal(status.status,200);
      const {RedisProbe}=require('../../dist/infrastructure/redis-probe');
      app.get(RedisProbe).client.disconnect();
      await http.get('/api/v1/health/ready').expect(503);
      await http.get('/api/v1/health/live').expect(200);
    } finally {await app.close();}
  });
});
