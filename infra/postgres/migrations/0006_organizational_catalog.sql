-- 3.2: catalogo configurable de roles institucionales por red.
SET LOCAL ROLE essalud_owner;

CREATE TABLE app.roles_institucionales (
  red_asistencial_id uuid NOT NULL,
  role_id uuid NOT NULL DEFAULT gen_random_uuid(),
  codigo varchar(30) NOT NULL CHECK (codigo ~ '^[A-Z][A-Z0-9_]{2,29}$'),
  nombre varchar(120) NOT NULL CHECK (length(btrim(nombre)) BETWEEN 3 AND 120),
  descripcion varchar(500) NOT NULL CHECK (length(btrim(descripcion)) BETWEEN 10 AND 500),
  alcance varchar(12) NOT NULL CHECK (alcance IN ('PROPIO','SEDE','RED','NACIONAL')),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (red_asistencial_id,role_id),
  UNIQUE (red_asistencial_id,codigo),
  FOREIGN KEY (red_asistencial_id) REFERENCES app.redes_asistenciales(red_asistencial_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX roles_institucionales_tenant_active_idx
  ON app.roles_institucionales(red_asistencial_id,activo,codigo);
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON app.roles_institucionales
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE app.roles_institucionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.roles_institucionales FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.roles_institucionales TO essalud_app
  USING (red_asistencial_id=app.current_red_asistencial_id());
GRANT SELECT ON app.roles_institucionales TO essalud_app;
RESET ROLE;

ALTER TABLE audit.audit_logs DROP CONSTRAINT audit_logs_entity_check;
ALTER TABLE audit.audit_logs ADD CONSTRAINT audit_logs_entity_check CHECK (entity IN (
  'app.redes_asistenciales','app.centros_asistenciales','app.areas','app.tickets',
  'app.tecnicos_soporte','app.roles_institucionales'));

CREATE OR REPLACE FUNCTION audit.capture_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE old_doc jsonb;new_doc jsonb;row_doc jsonb;row_key jsonb;old_key jsonb;
  actor uuid;request uuid;caller name;caller_is_super boolean;kind text;
  allowed_columns constant text[]:=ARRAY['red_asistencial_id','centro_asistencial_id','area_id','codigo','nombre',
    'tipo','activo','created_at','updated_at','ticket_id','titulo','descripcion','categoria','prioridad','estado',
    'solicitante_id','resolved_at','closed_at','assigned_to','assigned_at','assignment_mode','tecnico_id','nivel',
    'capacidad_maxima','role_id','alcance'];
BEGIN
  IF TG_WHEN<>'AFTER' OR TG_LEVEL<>'ROW' OR TG_RELID NOT IN ('app.redes_asistenciales'::regclass,
    'app.centros_asistenciales'::regclass,'app.areas'::regclass,'app.tickets'::regclass,
    'app.tecnicos_soporte'::regclass,'app.roles_institucionales'::regclass)
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
    'ticket_id',row_doc->'ticket_id','tecnico_id',row_doc->'tecnico_id','role_id',row_doc->'role_id'));
  IF TG_OP='UPDATE' THEN
    old_key:=jsonb_strip_nulls(jsonb_build_object('red_asistencial_id',old_doc->'red_asistencial_id',
      'centro_asistencial_id',old_doc->'centro_asistencial_id','area_id',old_doc->'area_id',
      'ticket_id',old_doc->'ticket_id','tecnico_id',old_doc->'tecnico_id','role_id',old_doc->'role_id'));
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

CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON app.roles_institucionales
FOR EACH ROW EXECUTE FUNCTION audit.capture_change();
ALTER TABLE app.roles_institucionales ENABLE ALWAYS TRIGGER audit_row_change;
CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON app.roles_institucionales
FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_mutation();
ALTER TABLE app.roles_institucionales ENABLE ALWAYS TRIGGER reject_truncate;
RESET ROLE;
