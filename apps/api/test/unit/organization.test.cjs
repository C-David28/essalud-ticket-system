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

const env = { NODE_ENV:"test", DATABASE_URL:"postgresql://runtime:example@localhost/db",
  REDIS_URL:"redis://:example@localhost", TICKETS_LOCAL_ENABLED:"true", TICKETS_LOCAL_KEY:"a".repeat(64),
  TICKETS_LOCAL_RED_ID:randomUUID(), TICKETS_LOCAL_USER_ID:randomUUID() };

test("catálogo organizacional exige clave y deriva el tenant del servidor", async t => {
  const calls=[];
  const catalog={network:{networkId:env.TICKETS_LOCAL_RED_ID,code:"PASCO_DEMO",name:"Red demo",active:true},
    centers:[{centerId:randomUUID(),code:"SEDE_DEMO",name:"Sede demo",type:"CAP",active:true,areas:[]}],
    roles:[{roleId:randomUUID(),code:"TECNICO_N1",name:"Técnico N1",description:"Rol ficticio de prueba",scope:"SEDE",active:true}]};
  const service={execute:async context=>{calls.push(context);return catalog;}};
  const config=readConfig(env);
  const mod=await Test.createTestingModule({imports:[AppModule.register(config)]})
    .overrideProvider(Database).useValue({check:async()=>true})
    .overrideProvider(RedisProbe).useValue({check:async()=>true})
    .overrideProvider(RedisTicketEvents).useValue({publish:async()=>{},subscribe:()=>()=>{}})
    .overrideProvider(GetOrganizationCatalog).useValue(service).compile();
  const app=mod.createNestApplication({logger:false,bodyParser:false});configureHttp(app,config,false);await app.init();t.after(()=>app.close());
  const http=request(app.getHttpServer());
  await http.get("/api/v1/organization").expect(401);
  const response=await http.get("/api/v1/organization").set("X-Local-Api-Key",env.TICKETS_LOCAL_KEY)
    .set("X-Tenant-Id",randomUUID()).expect(200);
  assert.deepEqual(response.body,catalog);
  assert.equal(calls[0].redAsistencialId,env.TICKETS_LOCAL_RED_ID);
  assert.equal(calls[0].requestId,response.headers["x-request-id"]);
});
