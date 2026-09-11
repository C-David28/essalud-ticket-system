-- 2.1: conservar 0001 y 0002; numeracion global atomica, sin reinicio anual.
SET LOCAL ROLE essalud_owner;
CREATE SEQUENCE app.ticket_number_seq AS bigint NO CYCLE;
GRANT USAGE ON SEQUENCE app.ticket_number_seq TO essalud_app;
CREATE TABLE app.tickets (
  red_asistencial_id uuid NOT NULL,
  ticket_id uuid NOT NULL DEFAULT gen_random_uuid(),
  centro_asistencial_id uuid NOT NULL,
  area_id uuid NOT NULL,
  codigo varchar(40) NOT NULL UNIQUE,
  titulo varchar(200) NOT NULL CHECK (length(btrim(titulo)) BETWEEN 5 AND 200),
  descripcion varchar(5000) NOT NULL CHECK (length(btrim(descripcion)) BETWEEN 10 AND 5000),
  categoria varchar(20) NOT NULL CHECK (categoria IN ('SOPORTE','REDES','INFRAESTRUCTURA','BIOMEDICO')),
  prioridad varchar(10) NOT NULL CHECK (prioridad IN ('BAJA','MEDIA','ALTA','CRITICA')),
  estado varchar(20) NOT NULL DEFAULT 'ABIERTO' CHECK (estado='ABIERTO'),
  solicitante_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (red_asistencial_id,ticket_id),
  FOREIGN KEY (red_asistencial_id,centro_asistencial_id,area_id)
    REFERENCES app.areas(red_asistencial_id,centro_asistencial_id,area_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX tickets_tenant_created_idx ON app.tickets(red_asistencial_id,created_at DESC,ticket_id DESC);
ALTER TABLE app.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tickets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.tickets TO essalud_app
USING (red_asistencial_id=app.current_red_asistencial_id())
WITH CHECK (red_asistencial_id=app.current_red_asistencial_id());
GRANT SELECT,INSERT,UPDATE,DELETE ON app.tickets TO essalud_app;
CREATE FUNCTION app.prepare_ticket() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog AS $fn$
DECLARE n text;
BEGIN
  IF TG_OP='INSERT' THEN
    n := nextval('app.ticket_number_seq')::text;
    NEW.codigo := 'INC-' || to_char(clock_timestamp() AT TIME ZONE 'America/Lima','YYYY') || '-' || lpad(n,greatest(4,length(n)),'0');
    NEW.created_at := clock_timestamp();
    NEW.updated_at := NEW.created_at;
    NEW.solicitante_id := nullif(current_setting('app.user_id',true),'')::uuid;
  ELSE
    IF ROW(NEW.red_asistencial_id,NEW.ticket_id,NEW.centro_asistencial_id,NEW.area_id,NEW.codigo,NEW.solicitante_id)
       IS DISTINCT FROM ROW(OLD.red_asistencial_id,OLD.ticket_id,OLD.centro_asistencial_id,OLD.area_id,OLD.codigo,OLD.solicitante_id) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Identidad del ticket inmutable';
    END IF;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER prepare_ticket BEFORE INSERT OR UPDATE ON app.tickets
FOR EACH ROW EXECUTE FUNCTION app.prepare_ticket();
ALTER TABLE app.tickets ENABLE ALWAYS TRIGGER prepare_ticket;
ALTER TABLE audit.audit_logs DROP CONSTRAINT audit_logs_entity_check;
ALTER TABLE audit.audit_logs ADD CONSTRAINT audit_logs_entity_check
CHECK (entity IN ('app.redes_asistenciales','app.centros_asistenciales','app.areas','app.tickets'));
RESET ROLE;
CREATE OR REPLACE FUNCTION audit.capture_change() RETURNS trigger
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
    'tipo','activo','created_at','updated_at','ticket_id','titulo','descripcion','categoria','prioridad','estado','solicitante_id'
  ];
BEGIN
  IF TG_WHEN <> 'AFTER' OR TG_LEVEL <> 'ROW'
    OR TG_RELID NOT IN ('app.redes_asistenciales'::regclass,
                       'app.centros_asistenciales'::regclass,'app.areas'::regclass,'app.tickets'::regclass)
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
    'area_id',row_doc->'area_id', 'ticket_id',row_doc->'ticket_id'
  ));
  IF TG_OP='UPDATE' THEN
    old_key := jsonb_strip_nulls(jsonb_build_object(
      'red_asistencial_id',old_doc->'red_asistencial_id',
      'centro_asistencial_id',old_doc->'centro_asistencial_id',
      'area_id',old_doc->'area_id', 'ticket_id',old_doc->'ticket_id'
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


CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON app.tickets
FOR EACH ROW EXECUTE FUNCTION audit.capture_change();
ALTER TABLE app.tickets ENABLE ALWAYS TRIGGER audit_row_change;
CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON app.tickets
FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_mutation();
ALTER TABLE app.tickets ENABLE ALWAYS TRIGGER reject_truncate;
