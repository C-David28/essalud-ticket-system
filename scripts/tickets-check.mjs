import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const env=parseEnv(readFileSync(new URL('../apps/api/.env.tickets',import.meta.url),'utf8'));
const base='http://127.0.0.1:3001/api/v1/tickets';
const headers={'Content-Type':'application/json','X-Local-Api-Key':env.TICKETS_LOCAL_KEY};
const input={centroAsistencialId:env.TICKETS_LOCAL_CENTRO_ID,areaId:env.TICKETS_LOCAL_AREA_ID,
  titulo:'Prueba local de soporte',descripcion:'Equipo ficticio para verificar el CRUD local.',categoria:'SOPORTE',prioridad:'MEDIA'};
const created=[];
const req=(suffix='',options={})=>fetch(base+suffix,{headers,signal:AbortSignal.timeout(10000),...options});
try {
  assert.equal((await req('',{headers:{}})).status,401);
  assert.equal((await req('',{method:'POST',body:JSON.stringify({...input,redAsistencialId:randomUUID()})})).status,400);
  for(let i=0;i<2;i++){
    const r=await req('',{method:'POST',body:JSON.stringify(input)});assert.equal(r.status,201);
    const t=await r.json();created.push(t.ticketId);assert.match(t.codigo,/^INC-\d{4}-\d{4,}$/);
  }
  assert.equal((await req('/'+created[0])).status,200);
  const list=await req('?page=1&pageSize=1');assert.equal(list.status,200);
  assert.equal((await list.json()).items.length,1);
  assert.equal((await req('/'+created[0],{method:'PATCH',body:JSON.stringify({estado:'CERRADO'})})).status,400);
  const update=await req('/'+created[0],{method:'PATCH',body:JSON.stringify({titulo:'Titulo corregido de prueba',prioridad:'ALTA'})});
  assert.equal(update.status,200);assert.equal((await update.json()).prioridad,'ALTA');
  for(const id of created){
    assert.equal((await req('/'+id,{method:'DELETE'})).status,204);
    assert.equal((await req('/'+id)).status,404);
  }
  console.log('OK: clave local, validacion, CREATE/READ/LIST/UPDATE/DELETE y rechazo de cambios de estado.');
} catch { console.error('Fallo tickets:check. Revisar tickets:setup, tickets:up y la salud local de la API.');process.exitCode=1; }
finally { for(const id of created) await req('/'+id,{method:'DELETE'}).catch(()=>{}); }

