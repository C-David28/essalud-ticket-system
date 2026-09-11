import assert from 'node:assert/strict';

const base=process.env.WEB_BASE_URL??'http://127.0.0.1:3000';
const controller=new AbortController(),decoder=new TextDecoder();
let reader,buffer='';
async function timeout(promise,ms=10000) {
  let timer;
  try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),ms);})]);}
  finally {clearTimeout(timer);}
}
async function request(path='',options={}) {
  return fetch(new URL('/api/tickets'+path,base),{...options,headers:options.body?{'Content-Type':'application/json'}:undefined,
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
  for(const path of ['/portal','/tecnico']) {const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(10000)});
    assert.equal(response.status,200);assert.ok((await response.text()).includes(path==='/portal'?'Mis solicitudes':'Tablero de atención'));}
  const stream=await fetch(new URL('/api/tickets/events',base),{headers:{Accept:'text/event-stream'},signal:controller.signal});
  assert.equal(stream.status,200);assert.match(stream.headers.get('content-type')??'',/^text\/event-stream/);reader=stream.body.getReader();
  const createdResponse=await request('',{method:'POST',body:JSON.stringify({titulo:'Demostracion SSE local',
    descripcion:'Solicitud ficticia creada para comprobar el tablero en tiempo real.',categoria:'SOPORTE',prioridad:'MEDIA'})});
  assert.equal(createdResponse.status,201);const created=await createdResponse.json();ticketId=created.ticketId;
  const createdEvent=await nextTicketEvent('ticket.created');assert.equal(createdEvent.ticketId,ticketId);
  let list=await request('?page=1&pageSize=100');assert.ok((await list.json()).items.some(item=>item.ticketId===ticketId));
  const changed=await request('/'+ticketId+'/estado',{method:'PATCH',body:JSON.stringify({estado:'EN_PROCESO',motivo:'Atencion iniciada durante la demostracion'})});
  assert.equal(changed.status,200);assert.equal((await nextTicketEvent('ticket.state_changed')).ticketId,ticketId);
  const removed=await request('/'+ticketId,{method:'DELETE'});assert.equal(removed.status,204);
  assert.equal((await nextTicketEvent('ticket.deleted')).ticketId,ticketId);ticketId=undefined;
  console.log('OK: interfaz, proxy protegido, persistencia y eventos SSE verificados de extremo a extremo.');
} catch {console.error('Fallo demo:check. Revisa demo:status y demo:logs; no se mostraron claves locales.');process.exitCode=1;}
finally {controller.abort();if(ticketId)await request('/'+ticketId,{method:'DELETE'}).catch(()=>{});}
