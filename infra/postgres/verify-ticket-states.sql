-- Datos ficticios y transiciones revertidos al finalizar.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE state_context AS SELECT gen_random_uuid() red_a,gen_random_uuid() red_b,
  gen_random_uuid() centro,gen_random_uuid() area,gen_random_uuid() actor,gen_random_uuid() request;
GRANT SELECT ON state_context TO essalud_app;
CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'STATE FAIL: %',label; END IF;
  RAISE NOTICE 'STATE PASS: %',label;
END $fn$;
CREATE FUNCTION pg_temp.expect_error(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
  PERFORM pg_temp.assert_true(actual=expected,label||' (SQLSTATE '||expected||')');
END $fn$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean,text),pg_temp.expect_error(text,text,text) TO essalud_app;

SELECT pg_temp.assert_true((SELECT relrowsecurity AND relforcerowsecurity AND
  pg_get_userbyid(relowner)='essalud_owner' FROM pg_class WHERE oid='app.ticket_state_history'::regclass),
  'historial con propietario y RLS forzado');
SELECT pg_temp.assert_true((SELECT count(*)=1 AND bool_and(tgenabled='A') FROM pg_trigger
  WHERE tgrelid='app.ticket_state_history'::regclass AND NOT tgisinternal),'historial inmutable ENABLE ALWAYS');
SELECT pg_temp.assert_true(NOT has_table_privilege('essalud_app','app.ticket_state_history','INSERT') AND
  NOT has_table_privilege('essalud_app','app.ticket_state_history','UPDATE') AND
  NOT has_table_privilege('essalud_app','app.ticket_state_history','DELETE'),
  'runtime solo puede consultar historial');

INSERT INTO app.redes_asistenciales(red_asistencial_id,codigo,nombre)
SELECT red_a,'STATE_A','Red ficticia A' FROM state_context UNION ALL
SELECT red_b,'STATE_B','Red ficticia B' FROM state_context;
INSERT INTO app.centros_asistenciales(red_asistencial_id,centro_asistencial_id,codigo,nombre,tipo)
SELECT red_a,centro,'STATE_C','Centro ficticio','CAP' FROM state_context;
INSERT INTO app.areas(red_asistencial_id,centro_asistencial_id,area_id,codigo,nombre)
SELECT red_a,centro,area,'STATE_AR','Area ficticia' FROM state_context;

SET LOCAL ROLE essalud_app;
SELECT set_config('app.red_asistencial_id',red_a::text,true),set_config('app.user_id',actor::text,true),
  set_config('app.request_id',request::text,true) FROM state_context;
CREATE TEMP TABLE created_ticket AS
  SELECT ticket_id,codigo FROM app.tickets WHERE false;
INSERT INTO app.tickets(red_asistencial_id,centro_asistencial_id,area_id,titulo,descripcion,categoria,prioridad)
SELECT red_a,centro,area,'Ticket de estados','Descripcion ficticia de estados','SOPORTE','MEDIA' FROM state_context
RETURNING ticket_id,codigo;
INSERT INTO created_ticket SELECT ticket_id,codigo FROM app.tickets;

SELECT pg_temp.assert_true((SELECT count(*)=1 AND min(estado_anterior) IS NULL AND
  min(estado_nuevo)='ABIERTO' AND min(motivo)='Ticket creado' FROM app.ticket_state_history),
  'apertura registrada automaticamente');
SELECT pg_temp.expect_error('UPDATE app.tickets SET estado=''EN_PROCESO''','23514',
  'transicion sin motivo rechazada');
SELECT set_config('app.ticket_transition_reason','Atencion iniciada',true);
UPDATE app.tickets SET estado='EN_PROCESO';
SELECT pg_temp.assert_true((SELECT estado='EN_PROCESO' AND resolved_at IS NULL AND closed_at IS NULL FROM app.tickets),
  'ABIERTO pasa a EN_PROCESO');
SELECT pg_temp.expect_error('UPDATE app.tickets SET estado=''CERRADO''','23514','salto a CERRADO rechazado');
UPDATE app.tickets SET estado='EN_PROCESO';
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM app.ticket_state_history),
  'escribir el mismo estado no crea una transicion');

SELECT set_config('app.ticket_transition_reason','Esperando repuesto',true);
UPDATE app.tickets SET estado='PENDIENTE';
SELECT pg_temp.assert_true((SELECT estado='PENDIENTE' FROM app.tickets),'EN_PROCESO pasa a PENDIENTE');
SELECT set_config('app.ticket_transition_reason','Repuesto recibido',true);
UPDATE app.tickets SET estado='EN_PROCESO';
SELECT pg_temp.assert_true((SELECT estado='EN_PROCESO' FROM app.tickets),'PENDIENTE vuelve a EN_PROCESO');
SELECT set_config('app.ticket_transition_reason','Solucion verificada',true);
UPDATE app.tickets SET estado='RESUELTO';
SELECT pg_temp.assert_true((SELECT estado='RESUELTO' AND resolved_at IS NOT NULL AND closed_at IS NULL FROM app.tickets),
  'RESUELTO registra fecha de resolucion');
SELECT set_config('app.ticket_transition_reason','Incidencia reaparecio',true);
UPDATE app.tickets SET estado='EN_PROCESO';
SELECT pg_temp.assert_true((SELECT resolved_at IS NULL AND closed_at IS NULL FROM app.tickets),
  'reapertura limpia fechas terminales');
SELECT set_config('app.ticket_transition_reason','Segunda solucion verificada',true);
UPDATE app.tickets SET estado='RESUELTO';
SELECT set_config('app.ticket_transition_reason','Conformidad registrada',true);
UPDATE app.tickets SET estado='CERRADO';
SELECT pg_temp.assert_true((SELECT estado='CERRADO' AND resolved_at IS NOT NULL AND closed_at>=resolved_at FROM app.tickets),
  'RESUELTO pasa a CERRADO con ambas fechas');
SELECT pg_temp.expect_error('UPDATE app.tickets SET estado=''EN_PROCESO''','23514','CERRADO es terminal');

UPDATE app.tickets SET titulo='Ticket cerrado editado';
SELECT pg_temp.assert_true((SELECT estado='CERRADO' AND resolved_at IS NOT NULL AND closed_at IS NOT NULL FROM app.tickets),
  'edicion de datos no altera estado ni fechas');
SELECT pg_temp.assert_true((SELECT count(*)=8 AND count(DISTINCT request_id)=1 AND
  bool_and(changed_by=(SELECT actor FROM state_context)) FROM app.ticket_state_history),
  'historial completo enlaza actor y solicitud');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM app.ticket_state_history
  WHERE estado_anterior='EN_PROCESO' AND estado_nuevo='PENDIENTE' AND motivo='Esperando repuesto'),
  'historial conserva origen destino y motivo');
SELECT pg_temp.assert_true((SELECT count(*)=8 FROM audit.audit_logs
  WHERE entity='app.tickets' AND action IN ('INSERT','UPDATE') AND
    (action='INSERT' OR old_values->>'estado' IS DISTINCT FROM new_values->>'estado')),
  'auditoria general captura apertura y siete transiciones');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM audit.audit_logs WHERE entity='app.tickets'
  AND old_values->>'estado'='RESUELTO' AND new_values->>'estado'='CERRADO'
  AND new_values->>'closed_at' IS NOT NULL),
  'auditoria incluye fecha de cierre');
SELECT pg_temp.expect_error('UPDATE app.ticket_state_history SET motivo=''Alterado''','42501',
  'runtime no modifica historial');
SELECT pg_temp.expect_error('TRUNCATE app.ticket_state_history','42501','runtime no trunca historial');

SELECT set_config('app.red_asistencial_id',red_b::text,true) FROM state_context;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM app.tickets) AND NOT EXISTS(SELECT FROM app.ticket_state_history),
  'otra red no consulta ticket ni historial');
RESET ROLE;
SELECT pg_temp.expect_error('UPDATE app.ticket_state_history SET motivo=''Alterado''','55000',
  'trigger bloquea mutacion administrativa del historial');
ROLLBACK;
