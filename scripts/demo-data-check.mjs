import {existsSync,readFileSync} from "node:fs";
import {parseEnv} from "node:util";
import {postgres} from "./lib/postgres.mjs";
import {loadDemoTickets} from "./lib/ticket-demo-config.mjs";
try{
  const file=new URL("../apps/api/.env.tickets",import.meta.url);
  if(!existsSync(file))throw new Error("Ejecuta primero npm.cmd run tickets:setup");
  const env=parseEnv(readFileSync(file,"utf8")),tickets=loadDemoTickets(env);
  const ids=tickets.map(ticket=>"'"+ticket.id+"'::uuid").join(",");
  const output=postgres(`DO $$ DECLARE total int;centers int;states int;priorities int;categories int; BEGIN
    SELECT count(*),count(DISTINCT centro_asistencial_id),count(DISTINCT estado),count(DISTINCT prioridad),count(DISTINCT categoria)
      INTO total,centers,states,priorities,categories FROM app.tickets
      WHERE red_asistencial_id='${env.TICKETS_LOCAL_RED_ID}'::uuid AND ticket_id IN (${ids}) AND is_demo;
    IF total<>20 OR centers<>4 OR states<>5 OR priorities<>4 OR categories<>4 THEN
      RAISE EXCEPTION 'Distribucion DEMO invalida: %, %, %, %, %',total,centers,states,priorities,categories;
    END IF;
    IF EXISTS(SELECT FROM app.tickets t LEFT JOIN app.centros_asistenciales c USING(red_asistencial_id,centro_asistencial_id)
      LEFT JOIN app.areas a USING(red_asistencial_id,centro_asistencial_id,area_id)
      WHERE t.ticket_id IN (${ids}) AND (c.centro_asistencial_id IS NULL OR a.area_id IS NULL)) THEN
      RAISE EXCEPTION 'Ticket DEMO sin sede o area valida'; END IF;
    IF (SELECT count(*) FROM app.ticket_state_history WHERE ticket_id IN (${ids}))<40 THEN
      RAISE EXCEPTION 'Historial DEMO incompleto'; END IF;
  END $$;
  SELECT count(*)||' tickets DEMO; 4 sedes; 5 estados; 4 prioridades; 4 categorias'
  FROM app.tickets WHERE ticket_id IN (${ids}) AND is_demo;`);
  if(!output.includes("20 tickets DEMO"))throw new Error("La base no confirmó los 20 tickets");
  console.log("OK: 20 tickets DEMO persistentes, distribuidos y enlazados con historial.");
}catch(error){console.error("Fallo demo:data:check:",error.message);process.exitCode=1;}
