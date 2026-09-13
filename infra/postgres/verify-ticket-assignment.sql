-- Datos ficticios; toda la prueba se revierte.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE assignment_context AS SELECT gen_random_uuid() red_a,gen_random_uuid() red_b,
  gen_random_uuid() centro,gen_random_uuid() area,gen_random_uuid() actor,gen_random_uuid() request,
  gen_random_uuid() tech_1,gen_random_uuid() tech_2,gen_random_uuid() tech_inactive,gen_random_uuid() tech_foreign;
GRANT SELECT ON assignment_context TO essalud_app;
CREATE FUNCTION pg_temp.assert_assignment(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSIGN FAIL: %',label;END IF;RAISE NOTICE 'ASSIGN PASS: %',label;END $fn$;
CREATE FUNCTION pg_temp.assignment_error(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE actual text;BEGIN BEGIN EXECUTE command;EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE;END;
PERFORM pg_temp.assert_assignment(actual=expected,label||' (SQLSTATE '||expected||')');END $fn$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_assignment(boolean,text),pg_temp.assignment_error(text,text,text) TO essalud_app;

SELECT pg_temp.assert_assignment((SELECT count(*)=2 AND bool_and(relrowsecurity AND relforcerowsecurity)
  FROM pg_class WHERE oid IN ('app.tecnicos_soporte'::regclass,'app.ticket_assignment_history'::regclass)),
  'catalogo e historial tienen RLS forzado');
SELECT pg_temp.assert_assignment(NOT has_table_privilege('essalud_app','app.tecnicos_soporte','INSERT') AND
  NOT has_table_privilege('essalud_app','app.ticket_assignment_history','INSERT') AND
  has_table_privilege('essalud_app','app.tecnicos_soporte','SELECT'),'runtime solo consulta catalogo e historial');
SELECT pg_temp.assert_assignment((SELECT count(*)=1 AND bool_and(tgenabled='A') FROM pg_trigger
  WHERE tgrelid='app.ticket_assignment_history'::regclass AND NOT tgisinternal),'historial inmutable ENABLE ALWAYS');

INSERT INTO app.redes_asistenciales(red_asistencial_id,codigo,nombre)
SELECT red_a,'ASSIGN_A','Red A' FROM assignment_context UNION ALL SELECT red_b,'ASSIGN_B','Red B' FROM assignment_context;
INSERT INTO app.centros_asistenciales(red_asistencial_id,centro_asistencial_id,codigo,nombre,tipo)
SELECT red_a,centro,'ASSIGN_C','Centro ficticio','CAP' FROM assignment_context;
INSERT INTO app.areas(red_asistencial_id,centro_asistencial_id,area_id,codigo,nombre)
SELECT red_a,centro,area,'ASSIGN_AR','Area ficticia' FROM assignment_context;
INSERT INTO app.tecnicos_soporte(red_asistencial_id,tecnico_id,nombre,nivel,capacidad_maxima,activo)
SELECT red_a,tech_1,'Tecnico A1','N1',2,true FROM assignment_context UNION ALL
SELECT red_a,tech_2,'Tecnico A2','N2',3,true FROM assignment_context UNION ALL
SELECT red_a,tech_inactive,'Tecnico inactivo','N1',2,false FROM assignment_context UNION ALL
SELECT red_b,tech_foreign,'Tecnico B1','N1',2,true FROM assignment_context;

SET LOCAL ROLE essalud_app;
SELECT set_config('app.red_asistencial_id',red_a::text,true),set_config('app.user_id',actor::text,true),
  set_config('app.request_id',request::text,true) FROM assignment_context;
SELECT pg_temp.assert_assignment((SELECT count(*)=3 FROM app.tecnicos_soporte),'catalogo aislado muestra solo tecnicos de la red');
SELECT pg_temp.assignment_error('INSERT INTO app.tecnicos_soporte(red_asistencial_id,nombre,nivel) SELECT red_a,''Ilegal'',''N1'' FROM assignment_context',
  '42501','runtime no administra tecnicos');
CREATE TEMP TABLE assigned_tickets(ticket_id uuid,position int);
WITH rows AS (INSERT INTO app.tickets(red_asistencial_id,centro_asistencial_id,area_id,titulo,descripcion,categoria,prioridad)
  SELECT red_a,centro,area,'Ticket asignable '||n,'Descripcion ficticia de asignacion','SOPORTE','MEDIA'
  FROM assignment_context CROSS JOIN generate_series(1,3)n RETURNING ticket_id)
INSERT INTO assigned_tickets SELECT ticket_id,row_number() OVER() FROM rows;
SELECT pg_temp.assert_assignment((SELECT bool_and(assigned_to IS NULL AND assigned_at IS NULL AND assignment_mode IS NULL)
  FROM app.tickets),'creacion siempre inicia sin asignacion');
SELECT pg_temp.assignment_error('UPDATE app.tickets SET assigned_to=(SELECT tech_1 FROM assignment_context),assignment_mode=''MANUAL''
  WHERE ticket_id=(SELECT ticket_id FROM assigned_tickets WHERE position=1)','23514','asignacion sin motivo rechazada');
SELECT set_config('app.ticket_assignment_reason','Asignacion manual inicial',true);
UPDATE app.tickets SET assigned_to=(SELECT tech_1 FROM assignment_context),assignment_mode='MANUAL'
WHERE ticket_id=(SELECT ticket_id FROM assigned_tickets WHERE position=1);
SELECT pg_temp.assert_assignment((SELECT assigned_to=(SELECT tech_1 FROM assignment_context) AND assigned_at IS NOT NULL
  AND assignment_mode='MANUAL' FROM app.tickets WHERE ticket_id=(SELECT ticket_id FROM assigned_tickets WHERE position=1)),
  'asignacion manual registra tecnico fecha y modo');
SELECT pg_temp.assert_assignment((SELECT count(*)=1 AND bool_and(previous_technician_id IS NULL AND motivo='Asignacion manual inicial')
  FROM app.ticket_assignment_history),'historial registra primera asignacion');
UPDATE app.tickets SET assigned_at='2000-01-01',assignment_mode='AUTOMATICA'
WHERE ticket_id=(SELECT ticket_id FROM assigned_tickets WHERE position=1);
SELECT pg_temp.assert_assignment((SELECT assignment_mode='MANUAL' AND assigned_at>'2020-01-01' FROM app.tickets
  WHERE ticket_id=(SELECT ticket_id FROM assigned_tickets WHERE position=1)),'campos derivados no se alteran sin cambiar tecnico');
SELECT pg_temp.assert_assignment((SELECT count(*)=1 FROM app.ticket_assignment_history),'edicion sin cambio de tecnico no agrega historial');
SELECT set_config('app.ticket_assignment_reason','Reasignacion a segundo tecnico',true);
UPDATE app.tickets SET assigned_to=(SELECT tech_2 FROM assignment_context),assignment_mode='MANUAL'
WHERE ticket_id=(SELECT ticket_id FROM assigned_tickets WHERE position=1);
SELECT pg_temp.assert_assignment((SELECT count(*)=2 AND count(*) FILTER(WHERE previous_technician_id=(SELECT tech_1 FROM assignment_context)
  AND new_technician_id=(SELECT tech_2 FROM assignment_context))=1 FROM app.ticket_assignment_history),'reasignacion conserva origen y destino');
SELECT set_config('app.ticket_assignment_reason','Intento tecnico inactivo',true);
SELECT pg_temp.assignment_error('UPDATE app.tickets SET assigned_to=(SELECT tech_inactive FROM assignment_context),assignment_mode=''MANUAL''
  WHERE ticket_id=(SELECT ticket_id FROM assigned_tickets WHERE position=2)','23514','tecnico inactivo rechazado');
SELECT pg_temp.assignment_error('UPDATE app.tickets SET assigned_to=(SELECT tech_foreign FROM assignment_context),assignment_mode=''MANUAL''
  WHERE ticket_id=(SELECT ticket_id FROM assigned_tickets WHERE position=2)','23514','tecnico de otra red rechazado');
SELECT pg_temp.assert_assignment((SELECT count(*)=2 FROM audit.audit_logs WHERE entity='app.tickets' AND action='UPDATE'
  AND old_values->>'assigned_to' IS DISTINCT FROM new_values->>'assigned_to'),'auditoria captura las dos asignaciones');
SELECT pg_temp.assert_assignment((SELECT count(*)=2 AND bool_and(changed_by=(SELECT actor FROM assignment_context))
  AND bool_and(request_id=(SELECT request FROM assignment_context)) FROM app.ticket_assignment_history),
  'historial enlaza actor y solicitud');
SELECT pg_temp.assignment_error('UPDATE app.ticket_assignment_history SET motivo=''Alterado''','42501','runtime no modifica historial');
SELECT pg_temp.assignment_error('TRUNCATE app.ticket_assignment_history','42501','runtime no trunca historial');

SELECT set_config('app.ticket_transition_reason','Atencion iniciada',true);
UPDATE app.tickets SET estado='EN_PROCESO' WHERE ticket_id=(SELECT ticket_id FROM assigned_tickets WHERE position=3);
SELECT set_config('app.ticket_transition_reason','Solucion verificada',true);
UPDATE app.tickets SET estado='RESUELTO' WHERE ticket_id=(SELECT ticket_id FROM assigned_tickets WHERE position=3);
SELECT set_config('app.ticket_assignment_reason','Asignacion tardia rechazada',true);
SELECT pg_temp.assignment_error('UPDATE app.tickets SET assigned_to=(SELECT tech_1 FROM assignment_context),assignment_mode=''MANUAL''
  WHERE ticket_id=(SELECT ticket_id FROM assigned_tickets WHERE position=3)','23514','ticket resuelto no admite asignacion');
SELECT set_config('app.red_asistencial_id',red_b::text,true) FROM assignment_context;
SELECT pg_temp.assert_assignment((SELECT count(*)=1 FROM app.tecnicos_soporte) AND NOT EXISTS(SELECT FROM app.tickets)
  AND NOT EXISTS(SELECT FROM app.ticket_assignment_history),'otra red queda aislada');
RESET ROLE;
SELECT pg_temp.assignment_error('UPDATE app.ticket_assignment_history SET motivo=''Alterado''','55000',
  'trigger bloquea mutacion administrativa del historial');
ROLLBACK;
