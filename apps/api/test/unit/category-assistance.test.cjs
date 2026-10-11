require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {randomUUID}=require('node:crypto');
const request=require('supertest');
const {Test}=require('@nestjs/testing');
const {Logger}=require('@nestjs/common');
const {AppModule}=require('../../dist/app.module');
const {SuggestCategory}=require('../../dist/application/suggest-category');
const {Tickets}=require('../../dist/application/tickets');
const {HttpCategoryClassifier}=require('../../dist/infrastructure/category-classifier');
const {Database}=require('../../dist/infrastructure/database');
const {RedisProbe}=require('../../dist/infrastructure/redis-probe');
const {RedisTicketEvents}=require('../../dist/infrastructure/ticket-events');
const {readConfig}=require('../../dist/infrastructure/config');
const {configureHttp}=require('../../dist/presentation/http');
const {ACCESS_TOKEN}=require('../../dist/presentation/access.guard');
const {AuthenticationFailure}=require('../../dist/domain/access');
const {ASSISTANCE_MIN_MARGIN,ASSISTANCE_MODEL_VERSION,ASSISTANCE_POLICY_VERSION}=require('../../dist/domain/category-classification');

const env={NODE_ENV:'test',DATABASE_URL:'postgresql://runtime:example@localhost/db',REDIS_URL:'redis://:example@localhost',
  TICKETS_LOCAL_ENABLED:'true',TICKETS_LOCAL_KEY:'a'.repeat(64),ACCESS_TOKEN_SECRET:'b'.repeat(64),
  TICKETS_LOCAL_RED_ID:randomUUID(),TICKETS_LOCAL_USER_ID:randomUUID()};
const token='c'.repeat(64);
const input={titulo:'Incidencia sintetica de demostracion',descripcion:'Descripcion sintetica suficiente para probar el contrato'};
const manualTicket={...input,centroAsistencialId:randomUUID(),areaId:randomUUID(),categoria:'REDES',prioridad:'MEDIA'};
const principal={authenticated:true,redAsistencialId:env.TICKETS_LOCAL_RED_ID,userId:env.TICKETS_LOCAL_USER_ID,
  displayName:'Personal de demostracion',roles:['TECNICO_N1'],scope:'SEDE',centerIds:[manualTicket.centroAsistencialId],
  permissions:['tickets:create','tickets:list','tickets:read','organization:read']};
const route='/api/v1/ml/category-suggestion';
const wirePrediction=(change={})=>({categoria_sugerida:'SOPORTE',score:0.15,
  score_type:'raw_decision_margin_not_probability',probability:null,operational_threshold:null,
  model_version:ASSISTANCE_MODEL_VERSION,...change});
const classifierConfig=(baseUrl,timeoutMs=1000)=>({enabled:true,baseUrl,token,timeoutMs});

function collectWarnings(t){
  const warnings=[];
  t.mock.method(Logger.prototype,'warn',(...args)=>warnings.push(args));
  return warnings;
}
function assertRedactedWarnings(warnings,count){
  assert.equal(warnings.length,count);
  // Boolean comparison avoids printing response bodies or credentials on failure.
  assert.ok(warnings.every(args=>args.length===1&&JSON.stringify(args[0])===JSON.stringify({event:'category_assistance_unavailable'})));
}
async function mockMlServer(t,handler){
  const requests=[],errors=[],timers=new Set();
  const server=createServer(async(req,res)=>{
    try {
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const captured={method:req.method,path:req.url,headers:req.headers,body:Buffer.concat(chunks)};
      requests.push(captured);
      await handler(req,res,captured,(callback,delay)=>{
        const timer=setTimeout(()=>{timers.delete(timer);callback();},delay);timers.add(timer);return timer;
      });
    } catch(error){errors.push(error);if(!res.headersSent)res.writeHead(500);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(async()=>{
    for(const timer of timers)clearTimeout(timer);
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    assert.equal(errors.length,0,'mock ML server failed');
  });
  return {baseUrl:'http://127.0.0.1:'+server.address().port,requests};
}
async function fixture(t,options={}){
  const config=readConfig({...env,...options.env}),assistanceCalls=[],creates=[];
  const state={principal:{...principal}};
  const builder=Test.createTestingModule({imports:[AppModule.register(config)]})
    .overrideProvider(Database).useValue({check:async()=>true})
    .overrideProvider(RedisProbe).useValue({check:async()=>true})
    .overrideProvider(RedisTicketEvents).useValue({publish:async()=>{},subscribe:()=>()=>{}})
    .overrideProvider(ACCESS_TOKEN).useValue({issue:()=>'',verify:value=>{
      if(value!=='aaa.bbb.ccc')throw new AuthenticationFailure();return state.principal;
    }})
    .overrideProvider(Tickets).useValue({create:async(context,value)=>{
      creates.push({context,input:value});return {...value,ticketId:randomUUID(),codigo:'INC-2026-0001'};
    }});
  if(!options.realProvider){
    builder.overrideProvider(SuggestCategory).useValue(new SuggestCategory({classify:async value=>{
      assistanceCalls.push(value);
      if(options.classifier)return options.classifier.classify(value);
      return {category:'SOPORTE',score:0.15,modelVersion:ASSISTANCE_MODEL_VERSION};
    }}));
  }
  const module=await builder.compile();
  const app=module.createNestApplication({logger:false,bodyParser:false});
  configureHttp(app,config,false);await app.init();t.after(()=>app.close());
  return {http:request(app.getHttpServer()),config,assistanceCalls,creates,state};
}
function postSuggestion(http,body=input){
  return http.post(route).set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).send(body);
}

test('asistencia: desactivada conserva resultado manual sin sugerencia',async()=>{
  assert.deepEqual(await new SuggestCategory(null).execute(input),{status:'disabled',suggestion:null});
});
test('asistencia: umbral inclusivo -0.06 ofrece una opcion humana sin probabilidad',async()=>{
  assert.equal(ASSISTANCE_MIN_MARGIN,-0.06);
  assert.equal(ASSISTANCE_MODEL_VERSION,'ticket-category-model-v1.0.0');
  assert.equal(ASSISTANCE_POLICY_VERSION,'category-assistance-policy-v1.0.0');
  for(const score of [ASSISTANCE_MIN_MARGIN-Number.EPSILON,ASSISTANCE_MIN_MARGIN,ASSISTANCE_MIN_MARGIN+Number.EPSILON,2.5]){
    const calls=[];
    const result=await new SuggestCategory({classify:async value=>{calls.push(value);
      return {category:'BIOMEDICO',score,modelVersion:ASSISTANCE_MODEL_VERSION};}}).execute(input);
    assert.equal(calls.length,1);assert.ok(calls[0]===input);
    if(score<ASSISTANCE_MIN_MARGIN)assert.deepEqual(result,{status:'abstained',suggestion:null});
    else assert.deepEqual(result,{status:'suggested',suggestion:{category:'BIOMEDICO',score,
      modelVersion:ASSISTANCE_MODEL_VERSION,scoreType:'raw_decision_margin_not_probability',probability:null,
      policyVersion:ASSISTANCE_POLICY_VERSION}});
  }
});
test('asistencia: error del clasificador devuelve unavailable sin copiar error ni texto',async()=>{
  const result=await new SuggestCategory({classify:async()=>{throw new Error(input.descripcion+' '+token);}}).execute(input);
  assert.deepEqual(result,{status:'unavailable',suggestion:null});
});

test('config ML: opt-in desactivado por defecto, valores inmutables y timeout acotado',()=>{
  const disabled=readConfig(env).mlAssistance;
  assert.deepEqual(disabled,{enabled:false,timeoutMs:4000});assert.ok(Object.isFrozen(disabled));
  assert.deepEqual(readConfig({...env,ML_ASSIST_ENABLED:'false',ML_SERVICE_URL:'bad',ML_SERVICE_TOKEN:'bad',ML_SERVICE_TIMEOUT_MS:'bad'}).mlAssistance,disabled);
  for(const url of ['http://localhost:8000/','http://127.0.0.1:8000','http://[::1]:8000',
    'http://ml:8000','http://category.internal:8000','https://ml.example.test']){
    for(const timeoutMs of [3000,4000,4500]){
      const configured=readConfig({...env,ML_ASSIST_ENABLED:'true',ML_SERVICE_URL:url,ML_SERVICE_TOKEN:token,ML_SERVICE_TIMEOUT_MS:String(timeoutMs)}).mlAssistance;
      assert.equal(configured.enabled,true);assert.equal(configured.baseUrl,new URL(url).origin);
      assert.ok(configured.token===token);assert.equal(configured.timeoutMs,timeoutMs);assert.ok(Object.isFrozen(configured));
    }
  }
});
test('config ML: rechaza flags, URLs, secretos reusados y timeouts invalidos sin filtrar token',()=>{
  const enabled={...env,ML_ASSIST_ENABLED:'true',ML_SERVICE_URL:'http://127.0.0.1:8000',ML_SERVICE_TOKEN:token};
  for(const flag of ['TRUE','1','yes',''])assert.throws(()=>readConfig({...enabled,ML_ASSIST_ENABLED:flag}));
  for(const url of ['', 'not a URL','ftp://ml:8000','http://public.example.test',
    'http://ml:8000/v1/predict','http://ml:8000?token=demo','http://ml:8000#fragment',
    'http://user:password@ml:8000','http://user@ml:8000','http://ml:99999'])
    assert.throws(()=>readConfig({...enabled,ML_SERVICE_URL:url}));
  for(const invalidToken of ['', 'secret','A'.repeat(64),'c'.repeat(63),env.TICKETS_LOCAL_KEY,env.ACCESS_TOKEN_SECRET]){
    assert.throws(()=>readConfig({...enabled,ML_SERVICE_TOKEN:invalidToken}),error=>{
      assert.ok(error.message==='Configuracion invalida o ausente: ML_SERVICE_TOKEN');return true;
    });
  }
  for(const timeout of ['2999','4501','3.5','abc','Infinity',''])
    assert.throws(()=>readConfig({...enabled,ML_SERVICE_TIMEOUT_MS:timeout}));
});

test('HTTP ML: POST envia exactamente dos textos y token servidor; acepta seis campos V1',async t=>{
  const warnings=collectWarnings(t);
  const server=await mockMlServer(t,(_req,res)=>res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(wirePrediction({score:-0.06}))));
  const result=await new HttpCategoryClassifier(classifierConfig(server.baseUrl)).classify(input);
  assert.deepEqual(result,{category:'SOPORTE',score:-0.06,modelVersion:ASSISTANCE_MODEL_VERSION});
  assert.equal(server.requests.length,1);const captured=server.requests[0],body=JSON.parse(captured.body);
  assert.equal(captured.method,'POST');assert.equal(captured.path,'/v1/predict');
  assert.equal(captured.headers['content-type'],'application/json');assert.ok(captured.headers['x-ml-token']===token);
  assert.deepEqual(Object.keys(body).sort(),['descripcion','titulo']);
  assert.ok(body.titulo===input.titulo&&body.descripcion===input.descripcion);
  assert.equal(captured.headers.authorization,undefined);assert.equal(captured.headers['x-local-api-key'],undefined);
  assertRedactedWarnings(warnings,0);
});
test('HTTP ML: rechaza contrato incompleto, alterado, no finito o con probabilidades',async t=>{
  const warnings=collectWarnings(t);
  const missing=wirePrediction();delete missing.operational_threshold;
  const renamed=wirePrediction();delete renamed.operational_threshold;renamed.threshold=null;
  const invalid=[null,[],missing,renamed,wirePrediction({extra:true}),wirePrediction({categoria_sugerida:'OTRA'}),
    wirePrediction({score:'0.15'}),wirePrediction({score:null}),wirePrediction({score_type:'probability'}),
    wirePrediction({probability:0.99}),wirePrediction({operational_threshold:-0.06}),wirePrediction({model_version:'another-model'})];
  let index=0;
  const server=await mockMlServer(t,(_req,res)=>res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(invalid[index++])));
  const classifier=new HttpCategoryClassifier(classifierConfig(server.baseUrl));
  for(const _value of invalid)await assert.rejects(classifier.classify(input),{message:'ML_UNAVAILABLE'});
  assert.equal(server.requests.length,invalid.length);assertRedactedWarnings(warnings,invalid.length);
});
test('HTTP ML: rechaza HTTP fallido, tipo incorrecto, JSON invalido y UTF-8 invalido sin registrar datos',async t=>{
  const warnings=collectWarnings(t),privateSentinel='DEMO_PRIVATE_RESPONSE_SENTINEL';
  const valid=JSON.stringify(wirePrediction());
  const bodies=[{status:503,type:'application/json',body:JSON.stringify({error:privateSentinel,token,text:input.descripcion})},
    {status:200,type:'text/plain',body:valid},{status:200,type:'application/json',body:'{"error":"'+privateSentinel+'"'},
    {status:200,type:'application/json',body:Buffer.from([0xff,0xfe])},
    {status:200,type:'application/json',body:valid.replace('0.15','1e999')},
    {status:200,type:undefined,body:valid}];
  let index=0;
  const server=await mockMlServer(t,(_req,res)=>{const response=bodies[index++];
    res.writeHead(response.status,response.type?{'Content-Type':response.type}:{}).end(response.body);});
  const classifier=new HttpCategoryClassifier(classifierConfig(server.baseUrl));
  for(const _value of bodies)await assert.rejects(classifier.classify(input),{message:'ML_UNAVAILABLE'});
  assert.equal(server.requests.length,bodies.length);assertRedactedWarnings(warnings,bodies.length);
});
test('HTTP ML: limita cuerpo completo a 4096 bytes aun con respuesta en chunks',async t=>{
  const warnings=collectWarnings(t),valid=JSON.stringify(wirePrediction());let index=0;
  const server=await mockMlServer(t,(_req,res)=>{
    const length=index++===0?4096:4097;
    res.writeHead(200,{'Content-Type':'application/json'});res.write(valid);res.end(' '.repeat(length-Buffer.byteLength(valid)));
  });
  const classifier=new HttpCategoryClassifier(classifierConfig(server.baseUrl));
  assert.equal((await classifier.classify(input)).category,'SOPORTE');
  await assert.rejects(classifier.classify(input),{message:'ML_UNAVAILABLE'});assertRedactedWarnings(warnings,1);
});
test('HTTP ML: redireccion se rechaza y no vuelve a enviar textos o token al destino',async t=>{
  const warnings=collectWarnings(t);
  const server=await mockMlServer(t,(_req,res,captured)=>{
    if(captured.path==='/v1/predict')res.writeHead(307,{Location:'/redirected'}).end();
    else res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(wirePrediction()));
  });
  await assert.rejects(new HttpCategoryClassifier(classifierConfig(server.baseUrl)).classify(input),{message:'ML_UNAVAILABLE'});
  assert.equal(server.requests.length,1);assert.equal(server.requests[0].path,'/v1/predict');assertRedactedWarnings(warnings,1);
});
test('HTTP ML: timeout cubre cuerpo lento despues de recibir cabeceras',async t=>{
  const warnings=collectWarnings(t),valid=JSON.stringify(wirePrediction());let index=0,delayedBodyStarted=false;
  const server=await mockMlServer(t,(_req,res,_captured,later)=>{
    res.writeHead(200,{'Content-Type':'application/json'});
    if(index++===0){res.end(valid);return;}
    delayedBodyStarted=true;res.write(valid.slice(0,10));later(()=>res.end(valid.slice(10)),300);
  });
  await new HttpCategoryClassifier(classifierConfig(server.baseUrl)).classify(input); // Warm the local connection.
  const started=performance.now();
  await assert.rejects(new HttpCategoryClassifier(classifierConfig(server.baseUrl,25)).classify(input),{message:'ML_UNAVAILABLE'});
  assert.ok(delayedBodyStarted);assert.ok(performance.now()-started<1000);assertRedactedWarnings(warnings,1);
});

test('ruta asistencia: exige clave local y sesion valida antes de clasificar',async t=>{
  const {http,assistanceCalls,creates,state}=await fixture(t);
  await http.post(route).send(input).expect(401);
  await http.post(route).set('X-Local-Api-Key','d'.repeat(64)).send(input).expect(401);
  await postSuggestion(http).set('Authorization','Bearer invalid').expect(401);
  await postSuggestion(http).set('Authorization','Bearer bad.bad.bad').expect(401);
  state.principal={...principal,redAsistencialId:randomUUID()};
  await postSuggestion(http).set('Authorization','Bearer aaa.bbb.ccc').expect(401);
  assert.equal(assistanceCalls.length,0);assert.equal(creates.length,0);
});
test('ruta asistencia: solicitante publico y staff con tickets:create pueden pedir opcion sin crear',async t=>{
  const {http,assistanceCalls,creates,state}=await fixture(t);
  const publicResult=await postSuggestion(http).expect(200);
  assert.equal(publicResult.body.status,'suggested');assert.equal(publicResult.body.suggestion.probability,null);
  assert.equal(publicResult.headers['cache-control'],'no-store');
  assert.equal((await postSuggestion(http).set('Authorization','Bearer aaa.bbb.ccc').expect(200)).body.status,'suggested');
  state.principal={...principal,permissions:['tickets:read']};
  await postSuggestion(http).set('Authorization','Bearer aaa.bbb.ccc').expect(403);
  assert.equal(assistanceCalls.length,2);assert.equal(creates.length,0);
});
test('ruta asistencia: DTO solo permite dos strings validos y recorta antes de inferencia',async t=>{
  const {http,assistanceCalls,creates}=await fixture(t);
  for(const change of [{categoria:'REDES'},{prioridad:'ALTA'},{centroAsistencialId:randomUUID()},
    {areaId:randomUUID()},{redAsistencialId:randomUUID()},{solicitanteId:randomUUID()},{codigo:'INC-DEMO'},
    {titulo:null},{descripcion:null},{titulo:12},{descripcion:[]},{titulo:'    '},{descripcion:'corta'},
    {titulo:'x'.repeat(201)},{descripcion:'x'.repeat(5001)}])
    await postSuggestion(http,{...input,...change}).expect(400);
  for(const missing of [{},{titulo:input.titulo},{descripcion:input.descripcion}])
    await postSuggestion(http,missing).expect(400);
  assert.equal(assistanceCalls.length,0);
  await postSuggestion(http,{titulo:'  '+input.titulo+'  ',descripcion:'  '+input.descripcion+'  '}).expect(200);
  assert.equal(assistanceCalls.length,1);
  assert.deepEqual(Object.keys(assistanceCalls[0]).sort(),['descripcion','titulo']);
  assert.ok(assistanceCalls[0].titulo===input.titulo&&assistanceCalls[0].descripcion===input.descripcion);
  assert.equal(creates.length,0);
});
test('ruta asistencia: rechaza surrogates sin pareja antes de enviar a ML',async t=>{
  const {http,assistanceCalls,creates}=await fixture(t);
  for(const field of ['titulo','descripcion'])for(const surrogate of ['\ud800','\udfff'])
    await postSuggestion(http,{...input,[field]:input[field]+surrogate}).expect(400);
  assert.equal(assistanceCalls.length,0);assert.equal(creates.length,0);
  const validUnicode={titulo:'Revision de conexión 👨‍💻',descripcion:'El equipo muestra señal intermitente 🛠️ durante esta prueba sintética.'};
  await postSuggestion(http,validUnicode).expect(200);
  assert.equal(assistanceCalls.length,1);
  assert.ok(assistanceCalls[0].titulo===validUnicode.titulo&&assistanceCalls[0].descripcion===validUnicode.descripcion);
  assert.equal(creates.length,0);
});
test('ruta asistencia: abstencion no asigna categoria ni crea ticket',async t=>{
  const {http,creates}=await fixture(t,{classifier:{classify:async()=>({category:'BIOMEDICO',score:-0.061,modelVersion:ASSISTANCE_MODEL_VERSION})}});
  assert.deepEqual((await postSuggestion(http).expect(200)).body,{status:'abstained',suggestion:null});
  assert.equal(creates.length,0);
});
test('ruta asistencia: desactivada no necesita servicio ML y ticket manual conserva categoria elegida',async t=>{
  const {http,creates}=await fixture(t,{realProvider:true,env:{ML_ASSIST_ENABLED:'false'}});
  assert.deepEqual((await postSuggestion(http).expect(200)).body,{status:'disabled',suggestion:null});
  assert.equal(creates.length,0);
  const result=await http.post('/api/v1/tickets').set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).send(manualTicket).expect(201);
  assert.equal(result.body.categoria,'REDES');assert.equal(creates.length,1);assert.equal(creates[0].input.categoria,'REDES');
  assert.equal(Object.hasOwn(creates[0].input,'suggestion'),false);assert.equal(Object.hasOwn(creates[0].input,'score'),false);
  assert.equal(creates[0].context.principal.authenticated,false);
  assert.equal((await http.get('/api/v1/health/ready').expect(200)).body.status,'ok');
});
test('ruta asistencia: servicio ML offline no impide ticket manual ni afecta readiness',async t=>{
  const warnings=collectWarnings(t);
  const server=await mockMlServer(t,(_req,res)=>res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:token,text:input.descripcion})));
  const {http,creates}=await fixture(t,{realProvider:true,env:{ML_ASSIST_ENABLED:'true',ML_SERVICE_URL:server.baseUrl,ML_SERVICE_TOKEN:token}});
  assert.deepEqual((await postSuggestion(http).expect(200)).body,{status:'unavailable',suggestion:null});
  assert.equal(creates.length,0);assert.equal(server.requests.length,1);
  const result=await http.post('/api/v1/tickets').set('X-Local-Api-Key',env.TICKETS_LOCAL_KEY).send(manualTicket).expect(201);
  assert.equal(result.body.categoria,'REDES');assert.equal(creates.length,1);assert.equal(server.requests.length,1);
  assert.equal(Object.hasOwn(creates[0].input,'suggestion'),false);assert.equal(Object.hasOwn(creates[0].input,'score'),false);
  assert.equal((await http.get('/api/v1/health/ready').expect(200)).body.status,'ok');assertRedactedWarnings(warnings,1);
});
test('Swagger asistencia: contrato de entrada tiene exactamente titulo y descripcion',async t=>{
  const {http}=await fixture(t);
  const spec=(await http.get('/docs-json').expect(200)).body;
  const operation=spec.paths[route].post;
  assert.deepEqual(Object.keys(spec.paths[route]),['post']);
  const ref=operation.requestBody.content['application/json'].schema.$ref;
  const schema=spec.components.schemas[ref.split('/').at(-1)];
  assert.deepEqual(Object.keys(schema.properties).sort(),['descripcion','titulo']);
  assert.deepEqual(schema.required.sort(),['descripcion','titulo']);
  assert.ok(operation.responses['400']&&operation.responses['401']&&operation.responses['403']);
});
