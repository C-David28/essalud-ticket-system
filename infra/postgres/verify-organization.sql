BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %',msg; END IF; RAISE NOTICE 'ORG PASS: %',msg; END $$;
CREATE OR REPLACE FUNCTION pg_temp.expect_error(sql_text text,expected text,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql_text; RAISE EXCEPTION 'FAIL: %',msg;
EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>expected THEN RAISE; END IF; RAISE NOTICE 'ORG PASS: % (SQLSTATE %)',msg,SQLSTATE; END $$;

SELECT pg_temp.assert_true((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='app.roles_institucionales'::regclass),'roles con RLS forzado');
SELECT pg_temp.assert_true(NOT has_table_privilege('essalud_app','app.roles_institucionales','INSERT')
  AND has_table_privilege('essalud_app','app.roles_institucionales','SELECT'),'runtime solo consulta roles');
SELECT pg_temp.assert_true((SELECT tgenabled='A' FROM pg_trigger WHERE tgrelid='app.roles_institucionales'::regclass AND tgname='audit_row_change'),'auditoria de roles siempre activa');
SELECT pg_temp.assert_true((SELECT tgenabled='A' FROM pg_trigger WHERE tgrelid='app.roles_institucionales'::regclass AND tgname='reject_truncate'),'truncate de roles protegido');

INSERT INTO app.redes_asistenciales(red_asistencial_id,codigo,nombre) VALUES
 ('3a000000-0000-4000-8000-000000000001','ORG_A','Red ficticia A'),
 ('3b000000-0000-4000-8000-000000000001','ORG_B','Red ficticia B');
INSERT INTO app.centros_asistenciales(red_asistencial_id,centro_asistencial_id,codigo,nombre,tipo) VALUES
 ('3a000000-0000-4000-8000-000000000001','3a100000-0000-4000-8000-000000000001','SEDE_A','Sede ficticia A','HOSPITAL');
INSERT INTO app.areas(red_asistencial_id,centro_asistencial_id,area_id,codigo,nombre) VALUES
 ('3a000000-0000-4000-8000-000000000001','3a100000-0000-4000-8000-000000000001','3a200000-0000-4000-8000-000000000001','AREA_A','Area ficticia A');
INSERT INTO app.roles_institucionales(red_asistencial_id,role_id,codigo,nombre,descripcion,alcance) VALUES
 ('3a000000-0000-4000-8000-000000000001','3a300000-0000-4000-8000-000000000001','TECNICO_N1','Tecnico N1','Rol ficticio para pruebas de sede.','SEDE'),
 ('3b000000-0000-4000-8000-000000000001','3b300000-0000-4000-8000-000000000001','SUPERVISOR_RED','Supervisor','Rol ficticio para pruebas de red.','RED');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM audit.audit_logs WHERE entity='app.roles_institucionales'),'altas de roles auditadas');

SET LOCAL ROLE essalud_app;
SELECT set_config('app.red_asistencial_id','3a000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.user_id','3a400000-0000-4000-8000-000000000001',true);
SELECT set_config('app.request_id','3a500000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM app.redes_asistenciales),'tenant consulta su red');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM app.centros_asistenciales),'tenant consulta sus sedes');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM app.areas),'tenant consulta sus areas');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM app.roles_institucionales),'tenant consulta sus roles');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM app.roles_institucionales WHERE red_asistencial_id='3b000000-0000-4000-8000-000000000001'),'roles de otra red aislados');
SELECT pg_temp.expect_error('UPDATE app.roles_institucionales SET nombre=''Cambio''','42501','runtime no modifica roles');
SELECT pg_temp.expect_error('TRUNCATE app.roles_institucionales','42501','runtime no trunca roles');
SELECT set_config('app.red_asistencial_id','',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM app.roles_institucionales),'sin tenant no consulta roles');
ROLLBACK;
SELECT 'OK: 13 verificaciones de estructura organizacional; datos ficticios revertidos.';
