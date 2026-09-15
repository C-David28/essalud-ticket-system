BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %',msg; END IF; RAISE NOTICE 'ACCESS PASS: %',msg; END $$;
CREATE OR REPLACE FUNCTION pg_temp.expect_error(sql_text text,expected text,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql_text; RAISE EXCEPTION 'FAIL: %',msg;
EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>expected THEN RAISE; END IF; RAISE NOTICE 'ACCESS PASS: % (SQLSTATE %)',msg,SQLSTATE; END $$;

SELECT pg_temp.assert_true((SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class
  WHERE oid IN ('app.usuarios_institucionales'::regclass,'app.usuario_accesos'::regclass)),
  'usuarios y accesos tienen RLS forzado');
SELECT pg_temp.assert_true(has_table_privilege('essalud_app','app.usuarios_institucionales','SELECT')
  AND has_table_privilege('essalud_app','app.usuario_accesos','SELECT')
  AND NOT has_table_privilege('essalud_app','app.usuarios_institucionales','INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege('essalud_app','app.usuario_accesos','INSERT,UPDATE,DELETE,TRUNCATE'),
  'runtime solo puede consultar identidades y membresias');
SELECT pg_temp.assert_true((SELECT count(*)=4 FROM pg_trigger WHERE tgrelid IN
  ('app.usuarios_institucionales'::regclass,'app.usuario_accesos'::regclass)
  AND tgname IN ('audit_row_change','reject_truncate') AND tgenabled='A'),
  'auditoria y proteccion de truncate siempre activas');

INSERT INTO app.redes_asistenciales(red_asistencial_id,codigo,nombre) VALUES
 ('4a000000-0000-4000-8000-000000000001','ACCESS_A','Red ficticia A'),
 ('4b000000-0000-4000-8000-000000000001','ACCESS_B','Red ficticia B');
INSERT INTO app.centros_asistenciales(red_asistencial_id,centro_asistencial_id,codigo,nombre,tipo) VALUES
 ('4a000000-0000-4000-8000-000000000001','4a100000-0000-4000-8000-000000000001','SEDE_A','Sede ficticia A','HOSPITAL');
INSERT INTO app.roles_institucionales(red_asistencial_id,role_id,codigo,nombre,descripcion,alcance) VALUES
 ('4a000000-0000-4000-8000-000000000001','4a200000-0000-4000-8000-000000000001','TECNICO_N1','Tecnico N1','Rol ficticio de sede.','SEDE'),
 ('4a000000-0000-4000-8000-000000000001','4a200000-0000-4000-8000-000000000002','SUPERVISOR_RED','Supervisor','Rol ficticio de red.','RED'),
 ('4b000000-0000-4000-8000-000000000001','4b200000-0000-4000-8000-000000000001','SUPERVISOR_RED','Supervisor','Rol ficticio de otra red.','RED');
INSERT INTO app.usuarios_institucionales(red_asistencial_id,usuario_id,username,display_name,password_hash) VALUES
 ('4a000000-0000-4000-8000-000000000001','4a300000-0000-4000-8000-000000000001','tecnico.prueba','Tecnico de prueba','scrypt$v1$0123456789abcdef0123456789abcdef$0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
 ('4b000000-0000-4000-8000-000000000001','4b300000-0000-4000-8000-000000000001','supervisor.prueba','Supervisor de prueba','scrypt$v1$abcdef0123456789abcdef0123456789$abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789');
INSERT INTO app.usuario_accesos(red_asistencial_id,access_id,usuario_id,role_id,centro_asistencial_id) VALUES
 ('4a000000-0000-4000-8000-000000000001','4a400000-0000-4000-8000-000000000001','4a300000-0000-4000-8000-000000000001','4a200000-0000-4000-8000-000000000001','4a100000-0000-4000-8000-000000000001'),
 ('4b000000-0000-4000-8000-000000000001','4b400000-0000-4000-8000-000000000001','4b300000-0000-4000-8000-000000000001','4b200000-0000-4000-8000-000000000001',NULL);
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM audit.audit_logs WHERE entity='app.usuarios_institucionales'),
  'altas de usuarios auditadas');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM audit.audit_logs WHERE entity='app.usuarios_institucionales'
  AND (old_values ? 'password_hash' OR new_values ? 'password_hash')),
  'auditoria nunca almacena hashes de contraseña');
SELECT pg_temp.expect_error($sql$INSERT INTO app.usuario_accesos(red_asistencial_id,usuario_id,role_id)
  VALUES ('4a000000-0000-4000-8000-000000000001','4a300000-0000-4000-8000-000000000001','4a200000-0000-4000-8000-000000000001')$sql$,
  '23514','rol de sede exige una sede');
SELECT pg_temp.expect_error($sql$INSERT INTO app.usuario_accesos(red_asistencial_id,usuario_id,role_id,centro_asistencial_id)
  VALUES ('4a000000-0000-4000-8000-000000000001','4a300000-0000-4000-8000-000000000001','4a200000-0000-4000-8000-000000000002','4a100000-0000-4000-8000-000000000001')$sql$,
  '23514','rol de red rechaza una sede');
SELECT pg_temp.expect_error($sql$INSERT INTO app.usuario_accesos(red_asistencial_id,access_id,usuario_id,role_id,centro_asistencial_id)
  VALUES ('4a000000-0000-4000-8000-000000000001','4a400000-0000-4000-8000-000000000009','4b300000-0000-4000-8000-000000000001','4a200000-0000-4000-8000-000000000001','4a100000-0000-4000-8000-000000000001')$sql$,
  '23503','clave compuesta impide membresia con usuario de otra red');

SET LOCAL ROLE essalud_app;
SELECT set_config('app.red_asistencial_id','4a000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.user_id','4a500000-0000-4000-8000-000000000001',true);
SELECT set_config('app.request_id','4a600000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM app.usuarios_institucionales),'tenant consulta solo sus usuarios');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM app.usuario_accesos),'tenant consulta solo sus membresias');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM app.usuarios_institucionales
  WHERE red_asistencial_id='4b000000-0000-4000-8000-000000000001'),'filtro explicito no expone otra red');
SELECT pg_temp.expect_error('UPDATE app.usuarios_institucionales SET display_name=''Cambio''','42501','runtime no modifica usuarios');
SELECT pg_temp.expect_error('DELETE FROM app.usuario_accesos','42501','runtime no elimina membresias');
SELECT pg_temp.expect_error('TRUNCATE app.usuarios_institucionales','42501','runtime no trunca usuarios');
SELECT set_config('app.red_asistencial_id','',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM app.usuarios_institucionales),'sin tenant no consulta usuarios');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM app.usuario_accesos),'sin tenant no consulta membresias');
ROLLBACK;
SELECT 'OK: 16 verificaciones de acceso institucional; datos ficticios revertidos.';
