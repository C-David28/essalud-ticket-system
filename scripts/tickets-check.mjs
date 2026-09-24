import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const env=parseEnv(readFileSync(new URL('../apps/api/.env.tickets',import.meta.url),'utf8'));
const apiBase='http://127.0.0.1:3001/api/v1',base=apiBase+'/tickets';
const keyHeaders={'Content-Type':'application/json','X-Local-Api-Key':env.TICKETS_LOCAL_KEY};
let headers=keyHeaders,phase='comprobar rechazo sin clave';
class SafeCheckFailure extends Error {}
function expectStatus(response,expected) {
  if(response.status!==expected)throw new SafeCheckFailure(`HTTP ${response.status}; esperado ${expected}`);
  return response;
}
const input={centroAsistencialId:env.TICKETS_LOCAL_CENTRO_ID,areaId:env.TICKETS_LOCAL_AREA_ID,
  titulo:'Prueba local de soporte',descripcion:'Equipo ficticio para verificar el CRUD local.',categoria:'SOPORTE',prioridad:'MEDIA'};
const created=[];
const req=(suffix='',options={})=>fetch(base+suffix,{headers,signal:AbortSignal.timeout(10000),...options});
try {
  expectStatus(await req('',{headers:{}}),401);
  phase='autenticar admin.gctic';
  const login=expectStatus(await fetch(apiBase+'/auth/login',{method:'POST',headers:keyHeaders,
    body:JSON.stringify({username:'admin.gctic',password:env.TICKETS_DEMO_PASSWORD}),signal:AbortSignal.timeout(10000)}),201);
  const authenticated=await login.json();assert.equal(typeof authenticated.token,'string');
  headers={...keyHeaders,Authorization:'Bearer '+authenticated.token};
  phase='validar campos reservados';
  expectStatus(await req('',{method:'POST',body:JSON.stringify({...input,redAsistencialId:randomUUID()})}),400);
  phase='crear tickets';
  for(let i=0;i<2;i++){
    const r=expectStatus(await req('',{method:'POST',body:JSON.stringify(input)}),201);
    const t=await r.json();created.push(t.ticketId);assert.match(t.codigo,/^INC-\d{4}-\d{4,}$/);
  }
  phase='leer y paginar tickets';
  expectStatus(await req('/'+created[0]),200);
  const list=expectStatus(await req('?page=1&pageSize=1'),200);
  assert.equal((await list.json()).items.length,1);
  phase='rechazar estado en endpoint de edicion';
  expectStatus(await req('/'+created[0],{method:'PATCH',body:JSON.stringify({estado:'CERRADO'})}),400);
  phase='consultar tecnicos';
  const technicians=expectStatus(await req('/asignacion/tecnicos'),200);
  const techs=await technicians.json();assert.ok(techs.length>=2);
  phase='asignar automaticamente';
  const automatic=expectStatus(await req('/'+created[0]+'/asignacion/automatica',{method:'POST'}),200);
  const automaticTicket=await automatic.json();assert.equal(automaticTicket.assignmentMode,'AUTOMATICA');
  const otherTechnician=techs.find(technician=>technician.technicianId!==automaticTicket.assignedTo);assert.ok(otherTechnician);
  phase='reasignar manualmente';
  expectStatus(await req('/'+created[0]+'/asignacion',{method:'PATCH',body:JSON.stringify({tecnicoId:otherTechnician.technicianId,
    motivo:'Reasignacion manual de prueba'})}),200);
  phase='consultar historial de asignacion';
  const assignments=expectStatus(await req('/'+created[0]+'/asignacion/historial'),200);
  assert.deepEqual((await assignments.json()).map(item=>item.assignmentMode),['AUTOMATICA','MANUAL']);
  phase='editar contenido y prioridad';
  const update=expectStatus(await req('/'+created[0],{method:'PATCH',body:JSON.stringify({titulo:'Titulo corregido de prueba',prioridad:'ALTA'})}),200);
  assert.equal((await update.json()).prioridad,'ALTA');
  const state='/'+created[0]+'/estado';
  phase='rechazar salto de estado';
  expectStatus(await req(state,{method:'PATCH',body:JSON.stringify({estado:'CERRADO',motivo:'Salto invalido'})}),409);
  phase='recorrer maquina de estados';
  for(const [estado,motivo] of [
    ['EN_PROCESO','Atencion local iniciada'],['PENDIENTE','Esperando repuesto ficticio'],
    ['EN_PROCESO','Repuesto ficticio recibido'],['RESUELTO','Solucion local verificada'],
    ['CERRADO','Conformidad local registrada'],
  ]) {
    const response=expectStatus(await req(state,{method:'PATCH',body:JSON.stringify({estado,motivo})}),200);
    assert.equal((await response.json()).estado,estado);
  }
  phase='rechazar reapertura de ticket cerrado';
  expectStatus(await req(state,{method:'PATCH',body:JSON.stringify({estado:'EN_PROCESO',motivo:'Intento terminal'})}),409);
  phase='consultar historial de estados';
  const history=expectStatus(await req(state+'/historial'),200);
  const events=await history.json();assert.equal(events.length,6);assert.equal(events[0].estadoNuevo,'ABIERTO');
  assert.deepEqual(events.slice(1).map(event=>event.estadoNuevo),['EN_PROCESO','PENDIENTE','EN_PROCESO','RESUELTO','CERRADO']);
  phase='eliminar tickets temporales';
  for(const id of created){
    expectStatus(await req('/'+id,{method:'DELETE'}),204);
    expectStatus(await req('/'+id),404);
  }
  console.log('OK: CRUD, estados, asignacion manual/automatica e historiales locales.');
} catch(error) {
  const detail=error instanceof SafeCheckFailure?' ('+error.message+')':'';
  console.error('Fallo tickets:check en fase "'+phase+'"'+detail+'. Revisar tickets:setup, tickets:up y la salud local de la API.');
  process.exitCode=1;
}
finally { for(const id of created) await req('/'+id,{method:'DELETE'}).catch(()=>{}); }
