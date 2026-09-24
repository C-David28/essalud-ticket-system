-- Datos sintéticos dentro de una transacción: no se conserva ninguna fila de prueba.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TEMP TABLE test_context AS SELECT
  gen_random_uuid() red_a, gen_random_uuid() red_b,
  gen_random_uuid() centro_a, gen_random_uuid() centro_b,
  gen_random_uuid() area_a, gen_random_uuid() area_b;
GRANT SELECT ON test_context TO essalud_app;

CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $fn$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END $fn$;
CREATE FUNCTION pg_temp.expect_error(command text, expected text, label text) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE actual text;
BEGIN
  BEGIN
    EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE;
  END;
  PERFORM pg_temp.assert_true(actual = expected, label || ' (SQLSTATE ' || expected || ')');
END $fn$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean,text),
  pg_temp.expect_error(text,text,text) TO essalud_app;

INSERT INTO app.redes_asistenciales (red_asistencial_id,codigo,nombre)
SELECT red_a, 'QA_' || upper(left(replace(red_a::text,'-',''),20)), 'Red ficticia A' FROM test_context
UNION ALL
SELECT red_b, 'QB_' || upper(left(replace(red_b::text,'-',''),20)), 'Red ficticia B' FROM test_context;
INSERT INTO app.centros_asistenciales (red_asistencial_id,centro_asistencial_id,codigo,nombre,tipo)
SELECT red_a,centro_a,'CENTRO','Centro ficticio A','OTRO' FROM test_context
UNION ALL
SELECT red_b,centro_b,'CENTRO','Centro ficticio B','OTRO' FROM test_context;
INSERT INTO app.areas (red_asistencial_id,centro_asistencial_id,area_id,codigo,nombre)
SELECT red_a,centro_a,area_a,'AREA','Area ficticia A' FROM test_context
UNION ALL
SELECT red_b,centro_b,area_b,'AREA','Area ficticia B' FROM test_context;

SELECT pg_temp.assert_true((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='app.tickets'::regclass),'tickets RLS forzado');
SELECT pg_temp.assert_true((SELECT count(*)=5 AND bool_and(tgenabled='A') FROM pg_trigger WHERE tgrelid='app.tickets'::regclass AND NOT tgisinternal),'triggers de ticket activos');
SET LOCAL ROLE essalud_app;
SELECT set_config('app.user_id',gen_random_uuid()::text,true);
SELECT set_config('app.request_id',gen_random_uuid()::text,true);
SELECT set_config('app.red_asistencial_id','',true);
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM app.tickets),'sin tenant no lee tickets');
DO $test$
DECLARE t test_context%ROWTYPE; ticket app.tickets%ROWTYPE; changed int;
BEGIN
 SELECT * INTO t FROM test_context;
 PERFORM set_config('app.red_asistencial_id',t.red_a::text,true);
 INSERT INTO app.tickets(red_asistencial_id,centro_asistencial_id,area_id,codigo,titulo,descripcion,categoria,prioridad,solicitante_id)
 VALUES(t.red_a,t.centro_a,t.area_a,'IGNORAR','Prueba de ticket','Descripcion ficticia de prueba','SOPORTE','MEDIA',t.red_b) RETURNING * INTO ticket;
 PERFORM pg_temp.assert_true(ticket.codigo ~ '^INC-[0-9]{4}-[0-9]{4,}$' AND split_part(ticket.codigo,'-',2)=to_char(clock_timestamp() AT TIME ZONE 'America/Lima','YYYY'),'codigo generado por base');
 PERFORM pg_temp.assert_true(ticket.solicitante_id=current_setting('app.user_id')::uuid,'actor desde contexto confiable');
 PERFORM pg_temp.assert_true((SELECT count(*) FROM app.tickets)=1,'A ve su ticket');
 PERFORM set_config('app.red_asistencial_id',t.red_b::text,true);
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT FROM app.tickets),'B no ve ticket A');
 UPDATE app.tickets SET titulo='Ataque ajeno' WHERE ticket_id=ticket.ticket_id; GET DIAGNOSTICS changed=ROW_COUNT;
 PERFORM pg_temp.assert_true(changed=0,'UPDATE ajeno cero filas');
 DELETE FROM app.tickets WHERE ticket_id=ticket.ticket_id; GET DIAGNOSTICS changed=ROW_COUNT;
 PERFORM pg_temp.assert_true(changed=0,'DELETE ajeno cero filas');
 PERFORM pg_temp.expect_error(format('INSERT INTO app.tickets(red_asistencial_id,centro_asistencial_id,area_id,titulo,descripcion,categoria,prioridad) VALUES(%L,%L,%L,''Prueba valida'',''Descripcion valida'',''SOPORTE'',''MEDIA'')',t.red_b,t.centro_a,t.area_a),'23503','FK compuesta impide area ajena');
 PERFORM pg_temp.expect_error(format('INSERT INTO app.tickets(red_asistencial_id,centro_asistencial_id,area_id,titulo,descripcion,categoria,prioridad) VALUES(%L,%L,%L,''Prueba valida'',''Descripcion valida'',''SOPORTE'',''MEDIA'')',t.red_a,t.centro_a,t.area_a),'42501','INSERT en otra red rechazado');
 PERFORM set_config('app.red_asistencial_id',t.red_a::text,true);
 PERFORM pg_temp.expect_error('UPDATE app.tickets SET codigo=''CAMBIAR''','23514','codigo inmutable');
 PERFORM pg_temp.expect_error('UPDATE app.tickets SET estado=''CERRADO''','23514','estado reservado para 2.2');
 PERFORM pg_temp.expect_error('UPDATE app.tickets SET titulo=''''','23514','titulo invalido rechazado');
 UPDATE app.tickets SET titulo='Titulo de prueba editado' WHERE ticket_id=ticket.ticket_id;
 PERFORM pg_temp.assert_true((SELECT count(*) FROM audit.audit_logs WHERE entity='app.tickets')=2,'INSERT y UPDATE auditados');
 PERFORM pg_temp.assert_true(EXISTS(SELECT FROM audit.audit_logs WHERE entity='app.tickets' AND action='UPDATE' AND old_values->>'titulo'='Prueba de ticket' AND new_values->>'titulo'='Titulo de prueba editado' AND entity_id->>'ticket_id'=ticket.ticket_id::text),'snapshot y clave de ticket completos');
 PERFORM set_config('app.user_id','',true);
 PERFORM pg_temp.expect_error('UPDATE app.tickets SET titulo=''Sin actor valido''','42501','sin actor escritura revierte');
 PERFORM set_config('app.user_id',ticket.solicitante_id::text,true);
 DELETE FROM app.tickets WHERE ticket_id=ticket.ticket_id;
 PERFORM pg_temp.assert_true(NOT EXISTS(SELECT FROM app.tickets) AND (SELECT count(*) FROM audit.audit_logs WHERE entity='app.tickets')=3,'DELETE conserva auditoria');
 PERFORM pg_temp.expect_error('TRUNCATE app.tickets','42501','runtime sin TRUNCATE');
 PERFORM pg_temp.expect_error('SELECT setval(''app.ticket_number_seq'',1)','42501','runtime no reinicia secuencia');
END $test$;
ROLLBACK;
