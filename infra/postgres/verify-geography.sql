BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assert_true(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %',msg; END IF; RAISE NOTICE 'GEO PASS: %',msg; END $$;
CREATE OR REPLACE FUNCTION pg_temp.expect_error(sql_text text,expected text,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql_text; RAISE EXCEPTION 'FAIL: %',msg;
EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>expected THEN RAISE; END IF; RAISE NOTICE 'GEO PASS: % (SQLSTATE %)',msg,SQLSTATE; END $$;

SELECT pg_temp.assert_true((SELECT count(*)=3 FROM information_schema.columns WHERE table_schema='app'
  AND table_name='centros_asistenciales' AND column_name IN ('latitude','longitude','location_source')),
  'catalogo de sedes contiene los tres campos geograficos');
SELECT pg_temp.assert_true((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
  WHERE oid='app.centros_asistenciales'::regclass),'sedes conservan RLS forzado');
SELECT pg_temp.assert_true((SELECT tgenabled='A' FROM pg_trigger WHERE tgrelid='app.centros_asistenciales'::regclass
  AND tgname='audit_row_change'),'auditoria geografica siempre activa');

INSERT INTO app.redes_asistenciales(red_asistencial_id,codigo,nombre) VALUES
 ('4a000000-0000-4000-8000-000000000001','GEO_A','Red geografica ficticia A'),
 ('4b000000-0000-4000-8000-000000000001','GEO_B','Red geografica ficticia B');
INSERT INTO app.centros_asistenciales(red_asistencial_id,centro_asistencial_id,codigo,nombre,tipo,latitude,longitude,location_source) VALUES
 ('4a000000-0000-4000-8000-000000000001','4a100000-0000-4000-8000-000000000001','GEO_SEDE_A','Sede ficticia A','HOSPITAL',-10.686800,-76.256500,'CONFIGURED'),
 ('4b000000-0000-4000-8000-000000000001','4b100000-0000-4000-8000-000000000001','GEO_SEDE_B','Sede ficticia B','CAP',-10.575500,-75.405300,'NETWORK');
INSERT INTO app.centros_asistenciales(red_asistencial_id,centro_asistencial_id,codigo,nombre,tipo) VALUES
 ('4a000000-0000-4000-8000-000000000001','4a100000-0000-4000-8000-000000000002','GEO_NULL','Sede sin ubicacion','OTRO');
SELECT pg_temp.assert_true((SELECT latitude IS NULL AND longitude IS NULL AND location_source IS NULL
  FROM app.centros_asistenciales WHERE centro_asistencial_id='4a100000-0000-4000-8000-000000000002'),
  'ubicacion es opcional y completa');
SELECT pg_temp.expect_error($q$INSERT INTO app.centros_asistenciales(red_asistencial_id,centro_asistencial_id,codigo,nombre,tipo,latitude,longitude,location_source)
 VALUES('4a000000-0000-4000-8000-000000000001','4a100000-0000-4000-8000-000000000003','BAD_LAT','Invalida','OTRO',91,-76,'CONFIGURED')$q$,'23514','latitud fuera de rango rechazada');
SELECT pg_temp.expect_error($q$INSERT INTO app.centros_asistenciales(red_asistencial_id,centro_asistencial_id,codigo,nombre,tipo,latitude)
 VALUES('4a000000-0000-4000-8000-000000000001','4a100000-0000-4000-8000-000000000004','PARTIAL','Incompleta','OTRO',-10)$q$,'23514','ubicacion parcial rechazada');
SELECT pg_temp.expect_error($q$INSERT INTO app.centros_asistenciales(red_asistencial_id,centro_asistencial_id,codigo,nombre,tipo,latitude,longitude,location_source)
 VALUES('4a000000-0000-4000-8000-000000000001','4a100000-0000-4000-8000-000000000005','BAD_SOURCE','Origen invalido','OTRO',-10,-76,'DEVICE')$q$,'23514','origen no controlado rechazado');
SELECT pg_temp.assert_true((SELECT new_values->>'latitude'='-10.686800' AND new_values->>'location_source'='CONFIGURED'
  FROM audit.audit_logs WHERE entity='app.centros_asistenciales' AND entity_id->>'centro_asistencial_id'='4a100000-0000-4000-8000-000000000001'),
  'alta de coordenadas queda auditada');

SET LOCAL ROLE essalud_app;
SELECT set_config('app.red_asistencial_id','4a000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.user_id','4a400000-0000-4000-8000-000000000001',true);
SELECT set_config('app.request_id','4a500000-0000-4000-8000-000000000001',true);
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM app.centros_asistenciales),'tenant ve solo sus sedes geograficas');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM app.centros_asistenciales WHERE red_asistencial_id='4b000000-0000-4000-8000-000000000001'),
  'tenant no consulta ubicaciones de otra red');
UPDATE app.centros_asistenciales SET latitude=-10.700000,longitude=-76.260000,location_source='GEOCODED'
 WHERE centro_asistencial_id='4a100000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM audit.audit_logs WHERE entity='app.centros_asistenciales' AND action='UPDATE'
  AND user_id='4a400000-0000-4000-8000-000000000001' AND request_id='4a500000-0000-4000-8000-000000000001'
  AND old_values->>'latitude'='-10.686800' AND new_values->>'latitude'='-10.700000'),
  'cambio geografico conserva actor, solicitud y valores');
SELECT set_config('app.red_asistencial_id','',true);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM app.centros_asistenciales),'sin tenant no se exponen coordenadas');
ROLLBACK;
SELECT 'OK: 12 verificaciones geograficas; datos ficticios revertidos.';
