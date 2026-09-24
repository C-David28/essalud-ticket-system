import {readFileSync} from "node:fs";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const categories=new Set(["SOPORTE","REDES","INFRAESTRUCTURA","BIOMEDICO"]);
const priorities=new Set(["BAJA","MEDIA","ALTA","CRITICA"]);
const states=new Set(["ABIERTO","EN_PROCESO","PENDIENTE","RESUELTO","CERRADO"]);
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const resolve=(value,env)=>{
  const tokens={$LOCAL_CENTER_ID:env.TICKETS_LOCAL_CENTRO_ID,$LOCAL_AREA_ID:env.TICKETS_LOCAL_AREA_ID,
    $TECH_1_ID:env.TICKETS_LOCAL_TECH_1_ID,$TECH_2_ID:env.TICKETS_LOCAL_TECH_2_ID,$TECH_3_ID:env.TICKETS_LOCAL_TECH_3_ID};
  return tokens[value]??value;
};
export function loadDemoTickets(env,source=new URL("../../config/tickets.demo.json",import.meta.url)){
  const config=JSON.parse(readFileSync(source,"utf8"));
  if(config.version!==1||!Array.isArray(config.tickets)||config.tickets.length!==20)throw new Error("Se requieren exactamente 20 tickets DEMO");
  const ids=new Set();
  return config.tickets.map((ticket,index)=>{
    const id=resolve(ticket.id,env),centerId=resolve(ticket.centerId,env),areaId=resolve(ticket.areaId,env);
    const assignedTechnicianId=ticket.assignedTechnicianId?resolve(ticket.assignedTechnicianId,env):null;
    if(!uuid.test(id)||!uuid.test(centerId)||!uuid.test(areaId)||(assignedTechnicianId&&!uuid.test(assignedTechnicianId))||ids.has(id))
      throw new Error("Identificador DEMO inválido o duplicado: "+index);
    ids.add(id);
    if(typeof ticket.title!=="string"||ticket.title.length<5||ticket.title.length>200||
      typeof ticket.description!=="string"||ticket.description.length<20||ticket.description.length>5000||
      !categories.has(ticket.category)||!priorities.has(ticket.priority)||!states.has(ticket.status)||
      !Number.isFinite(Date.parse(ticket.createdAt)))throw new Error("Ticket DEMO inválido: "+index);
    return {...ticket,id,centerId,areaId,assignedTechnicianId};
  });
}
export function demoTicketSeedSql(env,source){
  const red=env.TICKETS_LOCAL_RED_ID,user=env.TICKETS_LOCAL_USER_ID;
  if(!uuid.test(red)||!uuid.test(user))throw new Error("Contexto DEMO inválido");
  return loadDemoTickets(env,source).map((ticket,index)=>{
    const request="51000000-0000-4000-8000-"+String(index+1).padStart(12,"0");
    const transitions=ticket.status==="ABIERTO"?[]:ticket.status==="EN_PROCESO"?["EN_PROCESO"]:
      ticket.status==="PENDIENTE"?["EN_PROCESO","PENDIENTE"]:
      ticket.status==="RESUELTO"?["EN_PROCESO","RESUELTO"]:["EN_PROCESO","RESUELTO","CERRADO"];
    const assignment=ticket.assignedTechnicianId?
      "PERFORM set_config('app.ticket_assignment_reason','Asignacion preparada para demostracion',true);"+
      "UPDATE app.tickets SET assigned_to="+quote(ticket.assignedTechnicianId)+"::uuid,assignment_mode='MANUAL' WHERE red_asistencial_id="+quote(red)+"::uuid AND ticket_id="+quote(ticket.id)+"::uuid;":"";
    const changes=transitions.map(state=>"PERFORM set_config('app.ticket_transition_reason','Avance preparado para demostracion',true);"+
      "UPDATE app.tickets SET estado="+quote(state)+" WHERE red_asistencial_id="+quote(red)+"::uuid AND ticket_id="+quote(ticket.id)+"::uuid;").join("");
    return "DO $demo$ DECLARE affected integer; BEGIN "+
      "PERFORM set_config('app.red_asistencial_id',"+quote(red)+",true);"+
      "PERFORM set_config('app.user_id',"+quote(user)+",true);PERFORM set_config('app.request_id',"+quote(request)+",true);"+
      "PERFORM set_config('app.demo_seed_timestamp',"+quote(ticket.createdAt)+",true);"+
      "INSERT INTO app.tickets(red_asistencial_id,ticket_id,centro_asistencial_id,area_id,titulo,descripcion,categoria,prioridad,is_demo) VALUES ("+
      [quote(red)+"::uuid",quote(ticket.id)+"::uuid",quote(ticket.centerId)+"::uuid",quote(ticket.areaId)+"::uuid",quote(ticket.title),quote(ticket.description),quote(ticket.category),quote(ticket.priority),"true"].join(",")+
      ") ON CONFLICT(red_asistencial_id,ticket_id) DO NOTHING;GET DIAGNOSTICS affected=ROW_COUNT;"+
      "IF affected=1 THEN "+assignment+changes+" END IF; END $demo$;";
  }).join("\n    ");
}
