import assert from 'node:assert/strict';
import { existsSync,readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const base=process.env.WEB_BASE_URL??'http://127.0.0.1:3000';
const envFile=new URL('../apps/api/.env.tickets',import.meta.url);
const localEnv=existsSync(envFile)?parseEnv(readFileSync(envFile,'utf8')):{};
const demoPassword=process.env.TICKETS_DEMO_PASSWORD??localEnv.TICKETS_DEMO_PASSWORD??'Demo-RAP-2026!';
const controller=new AbortController(),decoder=new TextDecoder();
let reader,buffer='',cookie='',phase='inicio';
class SafeCheckFailure extends Error {}
function expectStatus(response,expected) {
  if(response.status!==expected)throw new SafeCheckFailure(`HTTP ${response.status}; esperado ${expected}`);
}
async function timeout(promise,ms=10000) {
  let timer;
  try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),ms);})]);}
  finally {clearTimeout(timer);}
}
async function request(path='',options={}) {
  return fetch(new URL('/api/tickets'+path,base),{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},
    signal:AbortSignal.timeout(10000)});
}
async function nextTicketEvent(type) {
  for(;;) {
    while(buffer.includes('\n\n')) {
      const index=buffer.indexOf('\n\n'),frame=buffer.slice(0,index).replaceAll('\r','');buffer=buffer.slice(index+2);
      if(!frame.includes('event: ticket')) continue;
      const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
      const event=JSON.parse(data);if(event.type===type)return event;
    }
    const chunk=await timeout(reader.read());if(chunk.done)throw new Error('stream cerrado');
    buffer+=decoder.decode(chunk.value,{stream:true}).replaceAll('\r','');
  }
}
let ticketId;
try {
  phase='proteger paginas privadas';
  for(const path of ['/tecnico','/organizacion','/mapa']) {const response=await fetch(new URL(path,base),{redirect:'manual',signal:AbortSignal.timeout(10000)});
    assert.ok([307,308].includes(response.status));assert.equal(response.headers.get('location'),'/acceso');}
  phase='iniciar sesion como admin.gctic';
  const login=await fetch(new URL('/api/auth/login',base),{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({username:'admin.gctic',password:demoPassword}),signal:AbortSignal.timeout(10000)});
  expectStatus(login,200);cookie=(login.headers.get('set-cookie')??'').split(';',1)[0];assert.match(cookie,/^essalud_staff_session=/);
  phase='renderizar paginas del demo';
  for(const path of ['/portal','/acceso','/tecnico','/organizacion','/mapa']) {const response=await fetch(new URL(path,base),{headers:cookie?{Cookie:cookie}:{},signal:AbortSignal.timeout(10000)});
    expectStatus(response,200);assert.ok((await response.text()).includes(path==='/portal'?'¿Qué necesitas reportar?':path==='/acceso'?'Espacio del personal autorizado':path==='/organizacion'?'Cargando estructura organizacional':path==='/mapa'?'Cargando cobertura geográfica':'Tablero de atención'));}
  phase='consultar catalogo organizacional';
  const organization=await fetch(new URL('/api/organization',base),{headers:{Cookie:cookie},signal:AbortSignal.timeout(10000)});
  expectStatus(organization,200);
  const catalog=await organization.json();assert.ok(catalog.centers.length>=4);assert.ok(catalog.roles.length>=5);
  assert.ok(catalog.centers.every(center=>center.location&&Number.isFinite(center.location.latitude)&&Number.isFinite(center.location.longitude)));
  const center=catalog.centers.find(item=>item.active&&item.areas.some(area=>area.active));
  const area=center?.areas.find(item=>item.active);assert.ok(center&&area);
  phase='abrir canal SSE';
  const stream=await fetch(new URL('/api/tickets/events',base),{headers:{Accept:'text/event-stream',Cookie:cookie},signal:controller.signal});
  expectStatus(stream,200);assert.match(stream.headers.get('content-type')??'',/^text\/event-stream/);reader=stream.body.getReader();
  phase='crear ticket con sede y area del catalogo';
  const createdResponse=await request('',{method:'POST',body:JSON.stringify({titulo:'Demostracion SSE local',
    descripcion:'Solicitud ficticia creada para comprobar el tablero en tiempo real.',categoria:'SOPORTE',prioridad:'MEDIA',
    centroAsistencialId:center.centerId,areaId:area.areaId})});
  expectStatus(createdResponse,201);const created=await createdResponse.json();ticketId=created.ticketId;
  phase='recibir evento de creacion';
  const createdEvent=await nextTicketEvent('ticket.created');assert.equal(createdEvent.ticketId,ticketId);
  phase='consultar ticket creado';
  let list=await request('?page=1&pageSize=100');assert.ok((await list.json()).items.some(item=>item.ticketId===ticketId));
  phase='consultar capacidad de tecnicos';
  const technicians=await request('/asignacion/tecnicos');assert.equal(technicians.status,200);
  const available=await technicians.json();assert.ok(available.length>=2);assert.ok(available.every(item=>item.availableCapacity>=0));
  phase='asignar ticket automaticamente';
  const automatic=await request('/'+ticketId+'/asignacion/automatica',{method:'POST'});assert.equal(automatic.status,200);
  const assignmentEvent=await nextTicketEvent('ticket.assignment_changed');assert.equal(assignmentEvent.ticketId,ticketId);
  const assigned=await automatic.json();assert.ok(available.some(item=>item.technicianId===assigned.assignedTo));
  phase='cambiar ticket a EN_PROCESO';
  const changed=await request('/'+ticketId+'/estado',{method:'PATCH',body:JSON.stringify({estado:'EN_PROCESO',motivo:'Atencion iniciada durante la demostracion'})});
  assert.equal(changed.status,200);assert.equal((await nextTicketEvent('ticket.state_changed')).ticketId,ticketId);
  phase='eliminar ticket temporal';
  const removed=await request('/'+ticketId,{method:'DELETE'});assert.equal(removed.status,204);
  assert.equal((await nextTicketEvent('ticket.deleted')).ticketId,ticketId);ticketId=undefined;
  console.log('OK: interfaz, proxy protegido, asignacion por carga, persistencia y SSE verificados de extremo a extremo.');
} catch(error) {
  const detail=error instanceof SafeCheckFailure?' ('+error.message+')':'';
  console.error('Fallo demo:check en fase "'+phase+'"'+detail+'. Revisa demo:status y demo:logs; no se mostraron claves locales.');
  process.exitCode=1;
}
finally {controller.abort();if(ticketId)await request('/'+ticketId,{method:'DELETE'}).catch(()=>{});}
