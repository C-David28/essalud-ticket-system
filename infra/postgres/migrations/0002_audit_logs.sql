-- 1.3: migracion adicional; 0001 permanece sin cambios.
-- Ejecutar con db:migrate: transaccion y checksum a cargo del runner.
DO $guard$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'El bootstrap de auditoria requiere administrador PostgreSQL';
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='essalud_audit_writer') THEN
    RAISE EXCEPTION 'El rol reservado essalud_audit_writer ya existe; revisar sin borrarlo';
  END IF;
END $guard$;
CREATE ROLE essalud_audit_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA audit AUTHORIZATION essalud_owner;
REVOKE ALL ON SCHEMA audit FROM PUBLIC;
GRANT USAGE ON SCHEMA audit TO essalud_app, essalud_audit_writer;

SET LOCAL ROLE essalud_owner;
CREATE TABLE audit.audit_logs (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  red_asistencial_id uuid NOT NULL,
  centro_asistencial_id uuid,
  area_id uuid,
  user_id uuid,
  actor_kind varchar(8) NOT NULL CHECK (actor_kind IN ('USER','DATABASE')),
  db_session_user name NOT NULL,
  db_effective_role name NOT NULL,
  action varchar(6) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  entity text NOT NULL CHECK (entity IN ('app.redes_asistenciales','app.centros_asistenciales','app.areas')),
  entity_id jsonb NOT NULL CHECK (jsonb_typeof(entity_id)='object'),
  old_values jsonb,
  new_values jsonb,
  "timestamp" timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id uuid,
  transaction_id bigint NOT NULL DEFAULT txid_current(),
  CHECK (
    (actor_kind='USER' AND user_id IS NOT NULL AND request_id IS NOT NULL)
    OR (actor_kind='DATABASE' AND user_id IS NULL AND request_id IS NULL)
  ),
  CHECK (
    (action='INSERT' AND old_values IS NULL AND new_values IS NOT NULL AND jsonb_typeof(new_values)='object')
    OR (action='UPDATE' AND old_values IS NOT NULL AND new_values IS NOT NULL AND jsonb_typeof(old_values)='object' AND jsonb_typeof(new_values)='object')
    OR (action='DELETE' AND old_values IS NOT NULL AND new_values IS NULL AND jsonb_typeof(old_values)='object')
  )
);
-- No hay FK al catalogo: el historial sobrevive a sus eliminaciones.
CREATE INDEX audit_logs_tenant_time_idx ON audit.audit_logs (red_asistencial_id, "timestamp" DESC, audit_id);
CREATE INDEX audit_logs_tenant_entity_idx ON audit.audit_logs (red_asistencial_id, entity, "timestamp" DESC);
CREATE INDEX audit_logs_request_idx ON audit.audit_logs (red_asistencial_id, request_id) WHERE request_id IS NOT NULL;
ALTER TABLE audit.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_read_tenant ON audit.audit_logs FOR SELECT TO essalud_app
USING (red_asistencial_id=app.current_red_asistencial_id());
CREATE POLICY audit_append_internal ON audit.audit_logs FOR INSERT TO essalud_audit_writer
WITH CHECK (true);
GRANT SELECT ON audit.audit_logs TO essalud_app;
GRANT INSERT ON audit.audit_logs TO essalud_audit_writer;
REVOKE ALL ON audit.audit_logs FROM PUBLIC;

CREATE FUNCTION audit.reject_mutation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $fn$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',
    MESSAGE=format('%s no permitido sobre %I.%I',TG_OP,TG_TABLE_SCHEMA,TG_TABLE_NAME);
END $fn$;
REVOKE ALL ON FUNCTION audit.reject_mutation() FROM PUBLIC;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON audit.audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_mutation();
ALTER TABLE audit.audit_logs ENABLE ALWAYS TRIGGER audit_append_only;
RESET ROLE;

CREATE FUNCTION audit.capture_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  old_doc jsonb;
  new_doc jsonb;
  row_doc jsonb;
  row_key jsonb;
  old_key jsonb;
  actor uuid;
  request uuid;
  caller name;
  caller_is_super boolean;
  kind text;
  allowed_columns constant text[] := ARRAY[
    'red_asistencial_id','centro_asistencial_id','area_id','codigo','nombre',
    'tipo','activo','created_at','updated_at'
  ];
BEGIN
  IF TG_WHEN <> 'AFTER' OR TG_LEVEL <> 'ROW'
    OR TG_RELID NOT IN ('app.redes_asistenciales'::regclass,
                       'app.centros_asistenciales'::regclass,'app.areas'::regclass)
    OR TG_OP NOT IN ('INSERT','UPDATE','DELETE') THEN
    RAISE EXCEPTION 'Trigger de auditoria fuera de su alcance autorizado';
  END IF;

  -- SECURITY DEFINER cambia current_user; role conserva el SET ROLE del llamador.
  caller := COALESCE(NULLIF(NULLIF(current_setting('role',true),'none'),''), session_user);
  SELECT rolsuper INTO caller_is_super FROM pg_roles WHERE rolname=caller;
  actor := NULLIF(current_setting('app.user_id',true),'')::uuid;
  request := NULLIF(current_setting('app.request_id',true),'')::uuid;
  IF actor IS NULL THEN
    IF caller_is_super IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Falta app.user_id para auditar la operacion';
    END IF;
    kind := 'DATABASE';
    request := NULL;
  ELSE
    IF request IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Falta app.request_id para auditar la operacion';
    END IF;
    kind := 'USER';
  END IF;

  -- Proyeccion explicita: futuras columnas no se copian automaticamente al log.
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT jsonb_object_agg(key,value) INTO old_doc
    FROM jsonb_each(to_jsonb(OLD)) WHERE key=ANY(allowed_columns);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT jsonb_object_agg(key,value) INTO new_doc
    FROM jsonb_each(to_jsonb(NEW)) WHERE key=ANY(allowed_columns);
  END IF;
  row_doc := COALESCE(new_doc,old_doc);
  row_key := jsonb_strip_nulls(jsonb_build_object(
    'red_asistencial_id',row_doc->'red_asistencial_id',
    'centro_asistencial_id',row_doc->'centro_asistencial_id',
    'area_id',row_doc->'area_id'
  ));
  IF TG_OP='UPDATE' THEN
    old_key := jsonb_strip_nulls(jsonb_build_object(
      'red_asistencial_id',old_doc->'red_asistencial_id',
      'centro_asistencial_id',old_doc->'centro_asistencial_id',
      'area_id',old_doc->'area_id'
    ));
    IF old_key IS DISTINCT FROM row_key THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='La identidad institucional es inmutable; no reasignar claves';
    END IF;
  END IF;

  INSERT INTO audit.audit_logs (
    red_asistencial_id,centro_asistencial_id,area_id,user_id,actor_kind,
    db_session_user,db_effective_role,action,entity,entity_id,old_values,new_values,request_id
  ) VALUES (
    (row_doc->>'red_asistencial_id')::uuid,
    (row_doc->>'centro_asistencial_id')::uuid,
    (row_doc->>'area_id')::uuid,actor,kind,session_user,caller,TG_OP,
    TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,row_key,old_doc,new_doc,request
  );
  RETURN NULL;
END $fn$;
ALTER FUNCTION audit.capture_change() OWNER TO essalud_audit_writer;
REVOKE ALL ON FUNCTION audit.capture_change() FROM PUBLIC, essalud_app;
-- Solo el trigger puede invocarla desde el runtime; sin DDL ni membresia del writer.
GRANT USAGE ON SCHEMA app TO essalud_audit_writer;

CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON app.redes_asistenciales
FOR EACH ROW EXECUTE FUNCTION audit.capture_change();
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON app.centros_asistenciales
FOR EACH ROW EXECUTE FUNCTION audit.capture_change();
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON app.areas
FOR EACH ROW EXECUTE FUNCTION audit.capture_change();
ALTER TABLE app.redes_asistenciales ENABLE ALWAYS TRIGGER audit_row_change;
ALTER TABLE app.centros_asistenciales ENABLE ALWAYS TRIGGER audit_row_change;
ALTER TABLE app.areas ENABLE ALWAYS TRIGGER audit_row_change;

CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON app.redes_asistenciales
FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_mutation();
CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON app.centros_asistenciales
FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_mutation();
CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON app.areas
FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_mutation();
ALTER TABLE app.redes_asistenciales ENABLE ALWAYS TRIGGER reject_truncate;
ALTER TABLE app.centros_asistenciales ENABLE ALWAYS TRIGGER reject_truncate;
ALTER TABLE app.areas ENABLE ALWAYS TRIGGER reject_truncate;
