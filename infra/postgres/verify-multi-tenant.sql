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

SELECT pg_temp.assert_true((
  SELECT count(*) = 3 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity
    AND pg_get_userbyid(c.relowner) = 'essalud_owner')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='app' AND c.relkind='r'
), 'RLS forzado y propietario en las tres tablas');

SELECT pg_temp.assert_true((
  SELECT NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole
    AND NOT rolcanlogin AND NOT pg_has_role('essalud_app','essalud_owner','MEMBER')
    AND NOT pg_has_role('essalud_app','essalud_migrator','MEMBER')
  FROM pg_roles WHERE rolname='essalud_app'
), 'rol de runtime restringido, sin membresia administrativa');

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

SET LOCAL ROLE essalud_app;
-- 1.3 exige contexto de actor y solicitud para las mutaciones del runtime.
SELECT set_config('app.user_id',gen_random_uuid()::text,true);
SELECT set_config('app.request_id',gen_random_uuid()::text,true);
SELECT set_config('app.red_asistencial_id','',true);
SELECT pg_temp.assert_true(
  NOT EXISTS(SELECT FROM app.redes_asistenciales) AND
  NOT EXISTS(SELECT FROM app.centros_asistenciales) AND
  NOT EXISTS(SELECT FROM app.areas), 'sin tenant no hay lecturas');
SELECT pg_temp.expect_error(format(
  'INSERT INTO app.centros_asistenciales(red_asistencial_id,codigo,nombre,tipo) VALUES(%L,''SIN_CTX'',''Sin contexto'',''OTRO'')',
  red_a), '42501', 'sin tenant se rechaza escritura') FROM test_context;

SELECT set_config('app.red_asistencial_id',red_a::text,true) FROM test_context;
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM app.redes_asistenciales)=1 AND
  (SELECT count(*) FROM app.centros_asistenciales)=1 AND
  (SELECT count(*) FROM app.areas)=1, 'tenant A ve solo su red, centro y area');
SELECT pg_temp.assert_true(
  NOT EXISTS(SELECT FROM app.redes_asistenciales WHERE red_asistencial_id=t.red_b) AND
  NOT EXISTS(SELECT FROM app.centros_asistenciales WHERE red_asistencial_id=t.red_b) AND
  NOT EXISTS(SELECT FROM app.areas WHERE red_asistencial_id=t.red_b),
  'filtro explicito por B tampoco permite leer B') FROM test_context t;
SELECT pg_temp.expect_error(format(
  'INSERT INTO app.centros_asistenciales(red_asistencial_id,codigo,nombre,tipo) VALUES(%L,''INTRUSO'',''Cruce rechazado'',''OTRO'')',
  red_b), '42501', 'INSERT de centro en otra red rechazado') FROM test_context;
SELECT pg_temp.expect_error(format(
  'INSERT INTO app.areas(red_asistencial_id,centro_asistencial_id,codigo,nombre) VALUES(%L,%L,''INTRUSO'',''Cruce rechazado'')',
  red_b,centro_b), '42501', 'INSERT de area en otra red rechazado') FROM test_context;
WITH touched AS (
  UPDATE app.centros_asistenciales SET nombre='Cambio ajeno'
  WHERE red_asistencial_id=(SELECT red_b FROM test_context) RETURNING 1
) SELECT pg_temp.assert_true((SELECT count(*) FROM touched)=0, 'UPDATE ajeno modifica cero filas');
WITH touched AS (
  DELETE FROM app.areas WHERE red_asistencial_id=(SELECT red_b FROM test_context) RETURNING 1
) SELECT pg_temp.assert_true((SELECT count(*) FROM touched)=0, 'DELETE ajeno elimina cero filas');
SELECT pg_temp.expect_error(format(
  'UPDATE app.areas SET red_asistencial_id=%L,centro_asistencial_id=%L WHERE area_id=%L',
  red_b,centro_b,area_a), '42501', 'WITH CHECK impide trasladar un area a otra red') FROM test_context;
SELECT pg_temp.expect_error(format(
  'INSERT INTO app.areas(red_asistencial_id,centro_asistencial_id,codigo,nombre) VALUES(%L,%L,''FK_CRUZADA'',''FK invalida'')',
  red_a,centro_b), '23503', 'FK compuesta impide centro de otra red') FROM test_context;
SELECT pg_temp.expect_error(format(
  'INSERT INTO app.centros_asistenciales(red_asistencial_id,codigo,nombre,tipo) VALUES(%L,''CENTRO'',''Duplicado'',''OTRO'')',
  red_a), '23505', 'codigo unico dentro de cada red') FROM test_context;
SELECT pg_temp.expect_error(format(
  'INSERT INTO app.centros_asistenciales(red_asistencial_id,codigo,nombre,tipo) VALUES(%L,''TIPO_MALO'',''Tipo invalido'',''INVALIDO'')',
  red_a), '23514', 'tipo de centro validado por CHECK') FROM test_context;
SELECT pg_temp.expect_error(format(
  'DELETE FROM app.centros_asistenciales WHERE red_asistencial_id=%L AND centro_asistencial_id=%L',
  red_a,centro_a), '23503', 'RESTRICT conserva centros con areas') FROM test_context;

DO $test$
DECLARE new_id uuid; affected integer; tenant_id uuid; original_created timestamptz;
BEGIN
  SELECT red_a INTO tenant_id FROM test_context;
  INSERT INTO app.centros_asistenciales(red_asistencial_id,codigo,nombre,tipo)
    VALUES(tenant_id,'NUEVO','Centro temporal','OTRO')
    RETURNING centro_asistencial_id,created_at INTO new_id,original_created;
  UPDATE app.centros_asistenciales SET nombre='Centro actualizado',created_at='2000-01-01',updated_at='2000-01-01'
    WHERE red_asistencial_id=tenant_id AND centro_asistencial_id=new_id;
  PERFORM pg_temp.assert_true(EXISTS(SELECT FROM app.centros_asistenciales
    WHERE red_asistencial_id=tenant_id AND centro_asistencial_id=new_id
      AND nombre='Centro actualizado' AND created_at=original_created
      AND updated_at >= original_created), 'INSERT y UPDATE propios; timestamps protegidos');
  DELETE FROM app.centros_asistenciales WHERE red_asistencial_id=tenant_id AND centro_asistencial_id=new_id;
  GET DIAGNOSTICS affected=ROW_COUNT;
  PERFORM pg_temp.assert_true(affected=1, 'DELETE propio permitido sin dependencias');
END $test$;
SELECT pg_temp.expect_error('TRUNCATE app.areas','42501','runtime no tiene TRUNCATE');
SELECT pg_temp.expect_error('ALTER TABLE app.areas DISABLE ROW LEVEL SECURITY','42501','runtime no puede desactivar RLS');
SELECT pg_temp.expect_error('SELECT * FROM infra_meta.schema_migrations','42501','runtime no accede al historial de migraciones');
SELECT set_config('app.red_asistencial_id',red_b::text,true) FROM test_context;
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM app.centros_asistenciales)=1 AND
  (SELECT count(*) FROM app.areas)=1 AND
  NOT EXISTS(SELECT FROM app.centros_asistenciales WHERE red_asistencial_id=t.red_a),
  'tenant B queda aislado de A') FROM test_context t;
ROLLBACK;

-- Misma conexion, siguiente transaccion: SET LOCAL no debe filtrar contexto.
BEGIN;
SET LOCAL ROLE essalud_app;
DO $test$
BEGIN
  IF app.current_red_asistencial_id() IS NOT NULL THEN RAISE EXCEPTION 'FAIL: contexto filtrado entre transacciones'; END IF;
  RAISE NOTICE 'PASS: contexto tenant se limpia al finalizar transaccion';
END $test$;
ROLLBACK;
SELECT 'OK: 22 verificaciones multi-tenant; datos ficticios revertidos.';
