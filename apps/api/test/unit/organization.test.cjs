require("reflect-metadata");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { randomUUID } = require("node:crypto");
const { Test } = require("@nestjs/testing");
const { AppModule } = require("../../dist/app.module");
const { GetOrganizationCatalog } = require("../../dist/application/get-organization-catalog");
const { Database } = require("../../dist/infrastructure/database");
const { RedisProbe } = require("../../dist/infrastructure/redis-probe");
const { RedisTicketEvents } = require("../../dist/infrastructure/ticket-events");
const { readConfig } = require("../../dist/infrastructure/config");
const { configureHttp } = require("../../dist/presentation/http");
const { ACCESS_TOKEN } = require("../../dist/presentation/access.guard");
const { PrismaOrganizationRepository } = require("../../dist/infrastructure/organization-repository");

const env = { NODE_ENV:"test", DATABASE_URL:"postgresql://runtime:example@localhost/db",
  REDIS_URL:"redis://:example@localhost", TICKETS_LOCAL_ENABLED:"true", TICKETS_LOCAL_KEY:"a".repeat(64),
  TICKETS_LOCAL_RED_ID:randomUUID(), TICKETS_LOCAL_USER_ID:randomUUID(),ACCESS_TOKEN_SECRET:"b".repeat(64) };

test("catálogo organizacional exige clave y deriva el tenant del servidor", async t => {
  const calls=[];
  const catalog={network:{networkId:env.TICKETS_LOCAL_RED_ID,code:"PASCO_DEMO",name:"Red demo",active:true},
    centers:[{centerId:randomUUID(),code:"SEDE_DEMO",name:"Sede demo",type:"CAP",active:true,areas:[]}],
    roles:[{roleId:randomUUID(),code:"TECNICO_N1",name:"Técnico N1",description:"Rol ficticio de prueba",scope:"SEDE",active:true}]};
  const service={execute:async context=>{calls.push(context);return catalog;}};
  const config=readConfig(env);
  const principal={authenticated:true,redAsistencialId:env.TICKETS_LOCAL_RED_ID,userId:randomUUID(),displayName:"Técnico demo",
    roles:["TECNICO_N1"],scope:"SEDE",centerIds:[catalog.centers[0].centerId],permissions:["organization:read"]};
  const mod=await Test.createTestingModule({imports:[AppModule.register(config)]})
    .overrideProvider(Database).useValue({check:async()=>true})
    .overrideProvider(RedisProbe).useValue({check:async()=>true})
    .overrideProvider(RedisTicketEvents).useValue({publish:async()=>{},subscribe:()=>()=>{}})
    .overrideProvider(ACCESS_TOKEN).useValue({verify:()=>principal,issue:()=>""})
    .overrideProvider(GetOrganizationCatalog).useValue(service).compile();
  const app=mod.createNestApplication({logger:false,bodyParser:false});configureHttp(app,config,false);await app.init();t.after(()=>app.close());
  const http=request(app.getHttpServer());
  await http.get("/api/v1/organization").expect(401);
  await http.get("/api/v1/organization").set("X-Local-Api-Key",env.TICKETS_LOCAL_KEY).expect(401);
  const response=await http.get("/api/v1/organization").set("X-Local-Api-Key",env.TICKETS_LOCAL_KEY).set("Authorization","Bearer aaa.bbb.ccc")
    .set("X-Tenant-Id",randomUUID()).expect(200);
  assert.deepEqual(response.body,catalog);
  assert.equal(calls[0].redAsistencialId,env.TICKETS_LOCAL_RED_ID);
  assert.equal(calls[0].requestId,response.headers["x-request-id"]);
  assert.equal(calls[0].userId,principal.userId);assert.deepEqual(calls[0].principal,principal);
});

test("catálogo de sede consulta solo centros y roles autorizados",async()=>{
  let query;const centerId=randomUUID(),roleId=randomUUID();
  const tx={redAsistencial:{findUnique:async options=>{query=options;return{redAsistencialId:env.TICKETS_LOCAL_RED_ID,
    codigo:"DEMO",nombre:"Red demo",activo:true,centros:[],roles:[]};}}};
  const repository=new PrismaOrganizationRepository({run:async(_context,operation)=>operation(tx)});
  const principal={authenticated:true,redAsistencialId:env.TICKETS_LOCAL_RED_ID,userId:randomUUID(),displayName:"Técnico demo",
    roles:["TECNICO_N1"],scope:"SEDE",centerIds:[centerId],permissions:["organization:read"]};
  await repository.catalog({redAsistencialId:env.TICKETS_LOCAL_RED_ID,userId:principal.userId,requestId:randomUUID(),principal});
  assert.deepEqual(query.include.centros.where,{centroAsistencialId:{in:[centerId]}});
  assert.deepEqual(query.include.roles.where,{codigo:{in:["TECNICO_N1"]}});
});
