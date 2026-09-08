-- Suite aislada: todos los datos y modificaciones de prueba se revierten.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT set_config('app.user_id','',true);
SELECT set_config('app.request_id','',true);
SELECT set_config('app.red_asistencial_id','',true);
CREATE TEMP TABLE audit_test_context AS SELECT
  gen_random_uuid() red_a,gen_random_uuid() red_b,
  gen_random_uuid() centro_a,gen_random_uuid() centro_b,
  gen_random_uuid() area_a,gen_random_uuid() area_b,
  gen_random_uuid() extra_centro,gen_random_uuid() extra_area,
  gen_random_uuid() actor_a,gen_random_uuid() actor_b,
  gen_random_uuid() request_a,gen_random_uuid() request_b;
GRANT SELECT ON audit_test_context TO essalud_app;
-- Una tabla temporal homonima no debe capturar escrituras del SECURITY DEFINER.
CREATE TEMP TABLE audit_logs(fake text);
GRANT SELECT ON pg_temp.audit_logs TO essalud_app;
ALTER TABLE app.centros_asistenciales ADD COLUMN _audit_test_secret text;

CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS void
LANGUAGE plpgsql AS $fn$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
  RAISE NOTICE 'AUDIT PASS: %',label;
END $fn$;
CREATE FUNCTION pg_temp.expect_error(command text,expected text,label text) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE;
  END;
  PERFORM pg_temp.assert_true(actual=expected,label || ' (SQLSTATE ' || expected || ')');
END $fn$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(boolean,text),
  pg_temp.expect_error(text,text,text) TO essalud_app;

SELECT pg_temp.assert_true((
  SELECT relrowsecurity AND relforcerowsecurity AND pg_get_userbyid(relowner)='essalud_owner'
  FROM pg_class WHERE oid='audit.audit_logs'::regclass
),'historial con RLS forzado y propietario separado');
SELECT pg_temp.assert_true((
  SELECT count(*)=7 AND bool_and(tgenabled='A') FROM pg_trigger
  WHERE NOT tgisinternal AND (
    (tgrelid IN ('app.redes_asistenciales'::regclass,'app.centros_asistenciales'::regclass,'app.areas'::regclass)
      AND tgname IN ('audit_row_change','reject_truncate'))
    OR (tgrelid='audit.audit_logs'::regclass AND tgname='audit_append_only'))
),'siete triggers de proteccion ENABLE ALWAYS');
SELECT pg_temp.assert_true((
  SELECT NOT rolsuper AND NOT rolcanlogin AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb
    AND NOT pg_has_role('essalud_app','essalud_audit_writer','MEMBER')
    AND NOT has_schema_privilege('essalud_audit_writer','audit','CREATE')
    AND NOT has_table_privilege('essalud_audit_writer','audit.audit_logs','UPDATE')
  FROM pg_roles WHERE rolname='essalud_audit_writer'
),'writer sin login, bypass ni facultad de modificar historial');
SELECT pg_temp.assert_true((
  SELECT prosecdef AND pg_get_userbyid(proowner)='essalud_audit_writer'
    AND proconfig @> ARRAY['search_path=pg_catalog, pg_temp']
  FROM pg_proc WHERE oid='audit.capture_change()'::regprocedure
),'SECURITY DEFINER limitado y search_path fijo');

INSERT INTO app.redes_asistenciales(red_asistencial_id,codigo,nombre)
SELECT red_a,'AA_' || upper(left(replace(red_a::text,'-',''),20)),'Red audit A' FROM audit_test_context
UNION ALL SELECT red_b,'AB_' || upper(left(replace(red_b::text,'-',''),20)),'Red audit B' FROM audit_test_context;
INSERT INTO app.centros_asistenciales(red_asistencial_id,centro_asistencial_id,codigo,nombre,tipo)
SELECT red_a,centro_a,'CENTRO','Centro audit A','OTRO' FROM audit_test_context
UNION ALL SELECT red_b,centro_b,'CENTRO','Centro audit B','OTRO' FROM audit_test_context;
INSERT INTO app.areas(red_asistencial_id,centro_asistencial_id,area_id,codigo,nombre)
SELECT red_a,centro_a,area_a,'AREA','Area audit A' FROM audit_test_context
UNION ALL SELECT red_b,centro_b,area_b,'AREA','Area audit B' FROM audit_test_context;
SELECT pg_temp.assert_true((
  SELECT count(*)=6 AND bool_and(actor_kind='DATABASE' AND user_id IS NULL
    AND request_id IS NULL AND db_session_user=session_user AND action='INSERT')
  FROM audit.audit_logs WHERE red_asistencial_id IN (SELECT red_a FROM audit_test_context UNION ALL SELECT red_b FROM audit_test_context)
),'bootstrap registra actor de base de datos sin inventar usuario');

-- Incluso con privilegios administrativos, las operaciones ordinarias son rechazadas.
SELECT pg_temp.expect_error('UPDATE audit.audit_logs SET action=action','55000','guard rechaza UPDATE administrativo');
SELECT pg_temp.expect_error('DELETE FROM audit.audit_logs','55000','guard rechaza DELETE administrativo');
SELECT pg_temp.expect_error('TRUNCATE audit.audit_logs','55000','guard rechaza TRUNCATE administrativo');
SELECT pg_temp.expect_error('TRUNCATE app.areas','55000','no se permite TRUNCATE de negocio sin auditoria');

SET LOCAL ROLE essalud_app;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM audit.audit_logs),'sin tenant no se puede leer auditoria');
SELECT pg_temp.expect_error('INSERT INTO audit.audit_logs DEFAULT VALUES','42501','runtime no puede fabricar eventos');
SELECT pg_temp.expect_error('UPDATE audit.audit_logs SET action=action','42501','runtime sin permiso UPDATE de eventos');
SELECT pg_temp.expect_error('DELETE FROM audit.audit_logs','42501','runtime sin permiso DELETE de eventos');
SELECT pg_temp.expect_error('TRUNCATE audit.audit_logs','42501','runtime sin permiso TRUNCATE de eventos');
SELECT pg_temp.expect_error('SELECT audit.capture_change()','42501','runtime no invoca directamente la funcion privilegiada');
SELECT pg_temp.expect_error('ALTER TABLE app.areas DISABLE TRIGGER audit_row_change','42501','runtime no desactiva el trigger de negocio');

SELECT set_config('app.red_asistencial_id',red_a::text,true) FROM audit_test_context;
SELECT pg_temp.assert_true((SELECT count(*) FROM audit.audit_logs)=3,'red A solo consulta sus tres eventos iniciales');
SELECT pg_temp.expect_error(format(
  'INSERT INTO app.centros_asistenciales(red_asistencial_id,codigo,nombre,tipo) VALUES(%L,''NO_ACTOR'',''Sin actor'',''OTRO'')',
  red_a),'42501','actor ausente rechaza mutacion') FROM audit_test_context;
SELECT set_config('app.user_id',actor_a::text,true) FROM audit_test_context;
SELECT pg_temp.expect_error(format(
  'INSERT INTO app.centros_asistenciales(red_asistencial_id,codigo,nombre,tipo) VALUES(%L,''NO_REQ'',''Sin request'',''OTRO'')',
  red_a),'42501','request ausente rechaza mutacion') FROM audit_test_context;
SELECT set_config('app.request_id',request_a::text,true) FROM audit_test_context;
SELECT set_config('app.user_id','uuid-invalido',true);
SELECT pg_temp.expect_error(format(
  'INSERT INTO app.centros_asistenciales(red_asistencial_id,codigo,nombre,tipo) VALUES(%L,''BAD_ACTOR'',''Actor invalido'',''OTRO'')',
  red_a),'22P02','actor invalido rechaza mutacion') FROM audit_test_context;
SELECT set_config('app.user_id',actor_a::text,true) FROM audit_test_context;
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM app.centros_asistenciales)=1 AND (SELECT count(*) FROM audit.audit_logs)=3,
  'fallos de contexto no dejan entidades ni eventos');

INSERT INTO app.centros_asistenciales(red_asistencial_id,centro_asistencial_id,codigo,nombre,tipo,_audit_test_secret)
SELECT red_a,extra_centro,'NUEVO','Antes del cambio','OTRO','NO_DEBE_AUDITARSE' FROM audit_test_context;
SELECT pg_temp.assert_true(EXISTS(
  SELECT FROM audit.audit_logs l WHERE l.entity_id->>'centro_asistencial_id'=t.extra_centro::text
    AND l.entity='app.centros_asistenciales' AND l.action='INSERT'
    AND l.old_values IS NULL AND l.new_values->>'nombre'='Antes del cambio'
    AND l.user_id=t.actor_a AND l.request_id=t.request_a AND l.actor_kind='USER'
    AND l.db_effective_role='essalud_app' AND l.db_session_user=session_user
    AND l.transaction_id=txid_current() AND l."timestamp">=transaction_timestamp()
),'INSERT con actor, correlacion, identidad, timestamp y transaccion') FROM audit_test_context t;
SELECT pg_temp.assert_true(
  NOT EXISTS(SELECT FROM audit.audit_logs WHERE new_values ? '_audit_test_secret')
    AND NOT EXISTS(SELECT FROM pg_temp.audit_logs),
  'lista de campos excluye columnas nuevas y evita shadowing temporal');
UPDATE app.centros_asistenciales SET nombre='Despues del cambio'
WHERE centro_asistencial_id=(SELECT extra_centro FROM audit_test_context);
SELECT pg_temp.assert_true(EXISTS(
  SELECT FROM audit.audit_logs l WHERE l.entity_id->>'centro_asistencial_id'=t.extra_centro::text
    AND action='UPDATE' AND old_values->>'nombre'='Antes del cambio' AND new_values->>'nombre'='Despues del cambio'
    AND (new_values->>'updated_at')::timestamptz >= (old_values->>'updated_at')::timestamptz
),'UPDATE conserva valores anteriores y posteriores al trigger de timestamp') FROM audit_test_context t;
SELECT pg_temp.expect_error(format(
  'UPDATE app.centros_asistenciales SET centro_asistencial_id=gen_random_uuid() WHERE centro_asistencial_id=%L',
  extra_centro),'23514','identidad estable para relacionar historial') FROM audit_test_context;
DELETE FROM app.centros_asistenciales WHERE centro_asistencial_id=(SELECT extra_centro FROM audit_test_context);
SELECT pg_temp.assert_true((
  SELECT count(*)=3 FROM audit.audit_logs WHERE entity_id->>'centro_asistencial_id'=t.extra_centro::text
) AND EXISTS(
  SELECT FROM audit.audit_logs WHERE entity_id->>'centro_asistencial_id'=t.extra_centro::text
    AND action='DELETE' AND old_values->>'nombre'='Despues del cambio' AND new_values IS NULL
),'DELETE conserva historial despues de borrar el centro') FROM audit_test_context t;

INSERT INTO app.areas(red_asistencial_id,centro_asistencial_id,area_id,codigo,nombre)
SELECT red_a,centro_a,extra_area,'EXTRA','Area extra' FROM audit_test_context;
UPDATE app.areas SET nombre='Area modificada' WHERE area_id=(SELECT extra_area FROM audit_test_context);
DELETE FROM app.areas WHERE area_id=(SELECT extra_area FROM audit_test_context);
SELECT pg_temp.assert_true((
  SELECT count(*)=3 AND bool_and(entity='app.areas' AND red_asistencial_id=t.red_a
    AND centro_asistencial_id=t.centro_a AND area_id=t.extra_area
    AND entity_id->>'red_asistencial_id'=t.red_a::text)
  FROM audit.audit_logs WHERE area_id=t.extra_area
),'areas generan los tres eventos con identidad compuesta') FROM audit_test_context t;

DO $test$
DECLARE before_count bigint; tenant uuid;
BEGIN
  SELECT red_a INTO tenant FROM audit_test_context;
  SELECT count(*) INTO before_count FROM audit.audit_logs;
  BEGIN
    INSERT INTO app.centros_asistenciales(red_asistencial_id,codigo,nombre,tipo)
      VALUES(tenant,'ROLLBACK','Se revierte','OTRO');
    RAISE EXCEPTION 'rollback de prueba';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT FROM app.centros_asistenciales WHERE codigo='ROLLBACK')
    AND (SELECT count(*) FROM audit.audit_logs)=before_count,'rollback revierte simultaneamente entidad y evento');
END $test$;

RESET ROLE;
REVOKE INSERT ON audit.audit_logs FROM essalud_audit_writer;
SET LOCAL ROLE essalud_app;
DO $test$
DECLARE before_count bigint; tenant uuid; rejected boolean:=false;
BEGIN
  SELECT red_a INTO tenant FROM audit_test_context;
  SELECT count(*) INTO before_count FROM audit.audit_logs;
  BEGIN
    INSERT INTO app.centros_asistenciales(red_asistencial_id,codigo,nombre,tipo)
      VALUES(tenant,'AUDIT_FAIL','Auditoria inaccesible','OTRO');
  EXCEPTION WHEN insufficient_privilege THEN rejected:=true;
  END;
  PERFORM pg_temp.assert_true(rejected AND NOT EXISTS(SELECT FROM app.centros_asistenciales WHERE codigo='AUDIT_FAIL')
    AND (SELECT count(*) FROM audit.audit_logs)=before_count,'falla del almacen de auditoria impide guardar el cambio');
END $test$;
RESET ROLE;
GRANT INSERT ON audit.audit_logs TO essalud_audit_writer;
SET LOCAL ROLE essalud_app;
SELECT pg_temp.expect_error(format(
  'INSERT INTO app.centros_asistenciales(red_asistencial_id,codigo,nombre,tipo) VALUES(%L,''CRUZADO'',''Otra red'',''OTRO'')',
  red_b),'42501','auditoria no permite eludir RLS del negocio') FROM audit_test_context;
SELECT pg_temp.assert_true(
  NOT EXISTS(SELECT FROM audit.audit_logs WHERE red_asistencial_id=t.red_b),
  'filtro explicito no permite consultar eventos de B') FROM audit_test_context t;
SELECT set_config('app.red_asistencial_id',red_b::text,true) FROM audit_test_context;
SELECT pg_temp.assert_true((SELECT count(*) FROM audit.audit_logs)=3 AND
  NOT EXISTS(SELECT FROM audit.audit_logs WHERE red_asistencial_id=t.red_a),
  'red B aislada de todo el historial de A') FROM audit_test_context t;

RESET ROLE;
SELECT set_config('app.user_id','',true);
SELECT set_config('app.request_id','',true);
DO $test$
DECLARE network uuid:=gen_random_uuid();
BEGIN
  INSERT INTO app.redes_asistenciales(red_asistencial_id,codigo,nombre)
  VALUES(network,'DEL_'||upper(left(replace(network::text,'-',''),20)),'Red eliminable');
  UPDATE app.redes_asistenciales SET nombre='Red renombrada' WHERE red_asistencial_id=network;
  DELETE FROM app.redes_asistenciales WHERE red_asistencial_id=network;
  PERFORM pg_temp.assert_true((SELECT count(*) FROM audit.audit_logs WHERE red_asistencial_id=network)=3,
    'historial de red conserva INSERT UPDATE DELETE tras eliminarla');
END $test$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE essalud_app;
DO $test$
BEGIN
  IF NULLIF(current_setting('app.user_id',true),'') IS NOT NULL
    OR NULLIF(current_setting('app.request_id',true),'') IS NOT NULL
    OR app.current_red_asistencial_id() IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: contexto filtrado entre transacciones';
  END IF;
  IF EXISTS(SELECT FROM audit.audit_logs) THEN RAISE EXCEPTION 'FAIL: auditoria visible sin tenant'; END IF;
  RAISE NOTICE 'AUDIT PASS: contexto de usuario, solicitud y tenant se limpia entre transacciones';
END $test$;
ROLLBACK;
SELECT 'OK: auditoria verificada; datos ficticios revertidos.';
