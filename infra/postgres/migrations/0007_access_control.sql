-- 3.3: identidades, membresias y alcance por sede. No contiene datos institucionales reales.
SET LOCAL ROLE essalud_owner;

CREATE TABLE app.usuarios_institucionales (
  red_asistencial_id uuid NOT NULL,
  usuario_id uuid NOT NULL DEFAULT gen_random_uuid(),
  username varchar(120) NOT NULL CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,119}$'),
  display_name varchar(160) NOT NULL CHECK (length(btrim(display_name)) BETWEEN 3 AND 160),
  password_hash varchar(200) NOT NULL CHECK (password_hash ~ '^scrypt[$]v1[$][a-f0-9]{32}[$][a-f0-9]{64}$'),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (red_asistencial_id,usuario_id),
  UNIQUE (red_asistencial_id,username),
  FOREIGN KEY (red_asistencial_id) REFERENCES app.redes_asistenciales(red_asistencial_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE app.usuario_accesos (
  red_asistencial_id uuid NOT NULL,
  access_id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  role_id uuid NOT NULL,
  centro_asistencial_id uuid,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (red_asistencial_id,access_id),
  UNIQUE NULLS NOT DISTINCT (red_asistencial_id,usuario_id,role_id,centro_asistencial_id),
  FOREIGN KEY (red_asistencial_id,usuario_id)
    REFERENCES app.usuarios_institucionales(red_asistencial_id,usuario_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (red_asistencial_id,role_id)
    REFERENCES app.roles_institucionales(red_asistencial_id,role_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (red_asistencial_id,centro_asistencial_id)
    REFERENCES app.centros_asistenciales(red_asistencial_id,centro_asistencial_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE FUNCTION app.validate_user_access() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE role_scope text; role_active boolean; center_active boolean;
BEGIN
  SELECT alcance,activo INTO role_scope,role_active FROM app.roles_institucionales
    WHERE red_asistencial_id=NEW.red_asistencial_id AND role_id=NEW.role_id;
  IF role_scope IS NULL OR NOT role_active THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Rol institucional no disponible';
  END IF;
  IF role_scope='SEDE' AND NEW.centro_asistencial_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='El alcance SEDE requiere centro';
  END IF;
  IF role_scope<>'SEDE' AND NEW.centro_asistencial_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='El alcance del rol no admite centro';
  END IF;
  IF NEW.centro_asistencial_id IS NOT NULL THEN
    SELECT activo INTO center_active FROM app.centros_asistenciales
      WHERE red_asistencial_id=NEW.red_asistencial_id AND centro_asistencial_id=NEW.centro_asistencial_id;
    IF center_active IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Centro asistencial no disponible';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER validate_user_access BEFORE INSERT OR UPDATE ON app.usuario_accesos
FOR EACH ROW EXECUTE FUNCTION app.validate_user_access();
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON app.usuarios_institucionales
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON app.usuario_accesos
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX usuarios_institucionales_active_idx
  ON app.usuarios_institucionales(red_asistencial_id,activo,username);
CREATE INDEX usuario_accesos_user_idx
  ON app.usuario_accesos(red_asistencial_id,usuario_id,activo);
CREATE INDEX usuario_accesos_center_idx
  ON app.usuario_accesos(red_asistencial_id,centro_asistencial_id) WHERE activo;

ALTER TABLE app.usuarios_institucionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.usuarios_institucionales FORCE ROW LEVEL SECURITY;
ALTER TABLE app.usuario_accesos ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.usuario_accesos FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.usuarios_institucionales TO essalud_app
  USING (red_asistencial_id=app.current_red_asistencial_id());
CREATE POLICY tenant_scope ON app.usuario_accesos TO essalud_app
  USING (red_asistencial_id=app.current_red_asistencial_id());
GRANT SELECT ON app.usuarios_institucionales,app.usuario_accesos TO essalud_app;
RESET ROLE;

ALTER TABLE audit.audit_logs DROP CONSTRAINT audit_logs_entity_check;
ALTER TABLE audit.audit_logs ADD CONSTRAINT audit_logs_entity_check CHECK (entity IN (
  'app.redes_asistenciales','app.centros_asistenciales','app.areas','app.tickets',
  'app.tecnicos_soporte','app.roles_institucionales','app.usuarios_institucionales','app.usuario_accesos'));

CREATE OR REPLACE FUNCTION audit.capture_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE old_doc jsonb;new_doc jsonb;row_doc jsonb;row_key jsonb;old_key jsonb;
  actor uuid;request uuid;caller name;caller_is_super boolean;kind text;
  allowed_columns constant text[]:=ARRAY['red_asistencial_id','centro_asistencial_id','area_id','codigo','nombre',
    'tipo','activo','created_at','updated_at','ticket_id','titulo','descripcion','categoria','prioridad','estado',
    'solicitante_id','resolved_at','closed_at','assigned_to','assigned_at','assignment_mode','tecnico_id','nivel',
    'capacidad_maxima','role_id','alcance','usuario_id','access_id','username','display_name'];
BEGIN
  IF TG_WHEN<>'AFTER' OR TG_LEVEL<>'ROW' OR TG_RELID NOT IN ('app.redes_asistenciales'::regclass,
    'app.centros_asistenciales'::regclass,'app.areas'::regclass,'app.tickets'::regclass,
    'app.tecnicos_soporte'::regclass,'app.roles_institucionales'::regclass,
    'app.usuarios_institucionales'::regclass,'app.usuario_accesos'::regclass)
    OR TG_OP NOT IN ('INSERT','UPDATE','DELETE') THEN RAISE EXCEPTION 'Trigger de auditoria fuera de alcance'; END IF;
  caller:=COALESCE(NULLIF(NULLIF(current_setting('role',true),'none'),''),session_user);
  SELECT rolsuper INTO caller_is_super FROM pg_roles WHERE rolname=caller;
  actor:=NULLIF(current_setting('app.user_id',true),'')::uuid;
  request:=NULLIF(current_setting('app.request_id',true),'')::uuid;
  IF actor IS NULL THEN
    IF caller_is_super IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Falta app.user_id'; END IF;
    kind:='DATABASE';request:=NULL;
  ELSE
    IF request IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Falta app.request_id'; END IF;
    kind:='USER';
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN SELECT jsonb_object_agg(key,value) INTO old_doc FROM jsonb_each(to_jsonb(OLD)) WHERE key=ANY(allowed_columns);END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN SELECT jsonb_object_agg(key,value) INTO new_doc FROM jsonb_each(to_jsonb(NEW)) WHERE key=ANY(allowed_columns);END IF;
  row_doc:=COALESCE(new_doc,old_doc);
  row_key:=jsonb_strip_nulls(jsonb_build_object('red_asistencial_id',row_doc->'red_asistencial_id',
    'centro_asistencial_id',row_doc->'centro_asistencial_id','area_id',row_doc->'area_id',
    'ticket_id',row_doc->'ticket_id','tecnico_id',row_doc->'tecnico_id','role_id',row_doc->'role_id',
    'usuario_id',row_doc->'usuario_id','access_id',row_doc->'access_id'));
  IF TG_OP='UPDATE' THEN
    old_key:=jsonb_strip_nulls(jsonb_build_object('red_asistencial_id',old_doc->'red_asistencial_id',
      'centro_asistencial_id',old_doc->'centro_asistencial_id','area_id',old_doc->'area_id',
      'ticket_id',old_doc->'ticket_id','tecnico_id',old_doc->'tecnico_id','role_id',old_doc->'role_id',
      'usuario_id',old_doc->'usuario_id','access_id',old_doc->'access_id'));
    IF old_key IS DISTINCT FROM row_key THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Identidad institucional inmutable';END IF;
  END IF;
  INSERT INTO audit.audit_logs(red_asistencial_id,centro_asistencial_id,area_id,user_id,actor_kind,
    db_session_user,db_effective_role,action,entity,entity_id,old_values,new_values,request_id)
  VALUES((row_doc->>'red_asistencial_id')::uuid,(row_doc->>'centro_asistencial_id')::uuid,
    (row_doc->>'area_id')::uuid,actor,kind,session_user,caller,TG_OP,TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME,
    row_key,old_doc,new_doc,request);
  RETURN NULL;
END $fn$;
ALTER FUNCTION audit.capture_change() OWNER TO essalud_audit_writer;
REVOKE ALL ON FUNCTION audit.capture_change() FROM PUBLIC,essalud_app;
GRANT USAGE ON SCHEMA app TO essalud_audit_writer;

CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON app.usuarios_institucionales
FOR EACH ROW EXECUTE FUNCTION audit.capture_change();
ALTER TABLE app.usuarios_institucionales ENABLE ALWAYS TRIGGER audit_row_change;
CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON app.usuarios_institucionales
FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_mutation();
ALTER TABLE app.usuarios_institucionales ENABLE ALWAYS TRIGGER reject_truncate;
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON app.usuario_accesos
FOR EACH ROW EXECUTE FUNCTION audit.capture_change();
ALTER TABLE app.usuario_accesos ENABLE ALWAYS TRIGGER audit_row_change;
CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON app.usuario_accesos
FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_mutation();
ALTER TABLE app.usuario_accesos ENABLE ALWAYS TRIGGER reject_truncate;
