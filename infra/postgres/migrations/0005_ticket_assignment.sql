-- 2.4: tecnicos, asignacion por carga e historial inmutable. No modificar 0001-0004.
SET LOCAL ROLE essalud_owner;

CREATE TABLE app.tecnicos_soporte (
  red_asistencial_id uuid NOT NULL,
  tecnico_id uuid NOT NULL DEFAULT gen_random_uuid(),
  nombre varchar(160) NOT NULL CHECK (length(btrim(nombre)) BETWEEN 3 AND 160),
  nivel varchar(2) NOT NULL CHECK (nivel IN ('N1','N2')),
  capacidad_maxima smallint NOT NULL DEFAULT 10 CHECK (capacidad_maxima BETWEEN 1 AND 100),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (red_asistencial_id,tecnico_id),
  UNIQUE (red_asistencial_id,nombre)
);
CREATE INDEX tecnicos_soporte_tenant_active_idx
  ON app.tecnicos_soporte(red_asistencial_id,activo,tecnico_id);
ALTER TABLE app.tecnicos_soporte ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tecnicos_soporte FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.tecnicos_soporte TO essalud_app
  USING (red_asistencial_id=app.current_red_asistencial_id());
GRANT SELECT ON app.tecnicos_soporte TO essalud_app;

ALTER TABLE app.tickets
  ADD COLUMN assigned_to uuid,
  ADD COLUMN assigned_at timestamptz,
  ADD COLUMN assignment_mode varchar(10),
  ADD CONSTRAINT tickets_assignment_consistency CHECK (
    (assigned_to IS NULL AND assigned_at IS NULL AND assignment_mode IS NULL)
    OR (assigned_to IS NOT NULL AND assigned_at IS NOT NULL AND assignment_mode IN ('MANUAL','AUTOMATICA'))
  ),
  ADD CONSTRAINT tickets_assigned_technician_fk
    FOREIGN KEY (red_asistencial_id,assigned_to)
    REFERENCES app.tecnicos_soporte(red_asistencial_id,tecnico_id) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX tickets_active_assignee_idx
  ON app.tickets(red_asistencial_id,assigned_to,estado)
  WHERE assigned_to IS NOT NULL AND estado IN ('ABIERTO','EN_PROCESO','PENDIENTE');

CREATE TABLE app.ticket_assignment_history (
  red_asistencial_id uuid NOT NULL,
  assignment_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  codigo varchar(40) NOT NULL,
  previous_technician_id uuid,
  new_technician_id uuid NOT NULL,
  assignment_mode varchar(10) NOT NULL CHECK (assignment_mode IN ('MANUAL','AUTOMATICA')),
  motivo varchar(500) NOT NULL CHECK (length(btrim(motivo)) BETWEEN 5 AND 500),
  changed_by uuid NOT NULL,
  request_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (red_asistencial_id,assignment_id),
  CHECK (previous_technician_id IS DISTINCT FROM new_technician_id)
);
CREATE INDEX ticket_assignment_history_ticket_idx
  ON app.ticket_assignment_history(red_asistencial_id,ticket_id,changed_at,assignment_id);
ALTER TABLE app.ticket_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ticket_assignment_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.ticket_assignment_history TO essalud_app
  USING (red_asistencial_id=app.current_red_asistencial_id());
CREATE POLICY assignment_append_internal ON app.ticket_assignment_history FOR INSERT TO essalud_owner
  WITH CHECK (red_asistencial_id=app.current_red_asistencial_id());
GRANT SELECT ON app.ticket_assignment_history TO essalud_app;

CREATE OR REPLACE FUNCTION app.prepare_ticket() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE n text; state_reason text; assignment_reason text;
BEGIN
  IF TG_OP='INSERT' THEN
    n := nextval('app.ticket_number_seq')::text;
    NEW.codigo := 'INC-' || to_char(clock_timestamp() AT TIME ZONE 'America/Lima','YYYY') || '-' || lpad(n,greatest(4,length(n)),'0');
    NEW.estado := 'ABIERTO'; NEW.created_at := clock_timestamp(); NEW.updated_at := NEW.created_at;
    NEW.resolved_at := NULL; NEW.closed_at := NULL; NEW.solicitante_id := nullif(current_setting('app.user_id',true),'')::uuid;
    NEW.assigned_to := NULL; NEW.assigned_at := NULL; NEW.assignment_mode := NULL;
  ELSE
    IF ROW(NEW.red_asistencial_id,NEW.ticket_id,NEW.centro_asistencial_id,NEW.area_id,NEW.codigo,NEW.solicitante_id)
       IS DISTINCT FROM ROW(OLD.red_asistencial_id,OLD.ticket_id,OLD.centro_asistencial_id,OLD.area_id,OLD.codigo,OLD.solicitante_id) THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Identidad del ticket inmutable';
    END IF;
    NEW.created_at := OLD.created_at; NEW.updated_at := clock_timestamp();
    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
      state_reason := nullif(btrim(current_setting('app.ticket_transition_reason',true)),'');
      IF state_reason IS NULL OR length(state_reason) NOT BETWEEN 5 AND 500 THEN
        RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Motivo de transicion requerido'; END IF;
      IF NOT ((OLD.estado='ABIERTO' AND NEW.estado='EN_PROCESO')
        OR (OLD.estado='EN_PROCESO' AND NEW.estado IN ('PENDIENTE','RESUELTO'))
        OR (OLD.estado='PENDIENTE' AND NEW.estado='EN_PROCESO')
        OR (OLD.estado='RESUELTO' AND NEW.estado IN ('EN_PROCESO','CERRADO'))) THEN
        RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Transicion de estado no permitida'; END IF;
      IF NEW.estado='RESUELTO' THEN NEW.resolved_at:=clock_timestamp();NEW.closed_at:=NULL;
      ELSIF NEW.estado='CERRADO' THEN NEW.resolved_at:=OLD.resolved_at;NEW.closed_at:=clock_timestamp();
      ELSE NEW.resolved_at:=NULL;NEW.closed_at:=NULL; END IF;
    ELSE NEW.resolved_at:=OLD.resolved_at;NEW.closed_at:=OLD.closed_at; END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      IF OLD.estado IN ('RESUELTO','CERRADO') OR NEW.estado IN ('RESUELTO','CERRADO') THEN
        RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ticket terminal no admite reasignacion'; END IF;
      assignment_reason:=nullif(btrim(current_setting('app.ticket_assignment_reason',true)),'');
      IF assignment_reason IS NULL OR length(assignment_reason) NOT BETWEEN 5 AND 500 THEN
        RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Motivo de asignacion requerido'; END IF;
      IF NEW.assigned_to IS NULL OR NEW.assignment_mode NOT IN ('MANUAL','AUTOMATICA') THEN
        RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Asignacion incompleta'; END IF;
      IF NOT EXISTS (SELECT FROM app.tecnicos_soporte t WHERE t.red_asistencial_id=NEW.red_asistencial_id
        AND t.tecnico_id=NEW.assigned_to AND t.activo) THEN
        RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Tecnico no disponible'; END IF;
      NEW.assigned_at:=clock_timestamp();
    ELSE NEW.assigned_at:=OLD.assigned_at;NEW.assignment_mode:=OLD.assignment_mode; END IF;
  END IF;
  RETURN NEW;
END $fn$;

CREATE FUNCTION app.capture_ticket_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE actor uuid:=nullif(current_setting('app.user_id',true),'')::uuid;
  request uuid:=nullif(current_setting('app.request_id',true),'')::uuid;
  reason text:=nullif(btrim(current_setting('app.ticket_assignment_reason',true)),'');
BEGIN
  IF NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN RETURN NULL; END IF;
  IF actor IS NULL OR request IS NULL OR reason IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Contexto requerido para historial de asignacion'; END IF;
  INSERT INTO app.ticket_assignment_history(red_asistencial_id,ticket_id,codigo,previous_technician_id,
    new_technician_id,assignment_mode,motivo,changed_by,request_id)
  VALUES(NEW.red_asistencial_id,NEW.ticket_id,NEW.codigo,OLD.assigned_to,NEW.assigned_to,
    NEW.assignment_mode,reason,actor,request);
  RETURN NULL;
END $fn$;
ALTER FUNCTION app.capture_ticket_assignment() OWNER TO essalud_owner;
REVOKE ALL ON FUNCTION app.capture_ticket_assignment() FROM PUBLIC,essalud_app;
CREATE TRIGGER capture_ticket_assignment AFTER UPDATE ON app.tickets
FOR EACH ROW EXECUTE FUNCTION app.capture_ticket_assignment();
ALTER TABLE app.tickets ENABLE ALWAYS TRIGGER capture_ticket_assignment;
CREATE TRIGGER assignment_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.ticket_assignment_history
FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_mutation();
ALTER TABLE app.ticket_assignment_history ENABLE ALWAYS TRIGGER assignment_history_immutable;
RESET ROLE;

ALTER TABLE audit.audit_logs DROP CONSTRAINT audit_logs_entity_check;
ALTER TABLE audit.audit_logs ADD CONSTRAINT audit_logs_entity_check CHECK (entity IN (
  'app.redes_asistenciales','app.centros_asistenciales','app.areas','app.tickets','app.tecnicos_soporte'));
CREATE OR REPLACE FUNCTION audit.capture_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE old_doc jsonb;new_doc jsonb;row_doc jsonb;row_key jsonb;old_key jsonb;
  actor uuid;request uuid;caller name;caller_is_super boolean;kind text;
  allowed_columns constant text[]:=ARRAY['red_asistencial_id','centro_asistencial_id','area_id','codigo','nombre',
    'tipo','activo','created_at','updated_at','ticket_id','titulo','descripcion','categoria','prioridad','estado',
    'solicitante_id','resolved_at','closed_at','assigned_to','assigned_at','assignment_mode','tecnico_id','nivel','capacidad_maxima'];
BEGIN
  IF TG_WHEN<>'AFTER' OR TG_LEVEL<>'ROW' OR TG_RELID NOT IN ('app.redes_asistenciales'::regclass,
    'app.centros_asistenciales'::regclass,'app.areas'::regclass,'app.tickets'::regclass,'app.tecnicos_soporte'::regclass)
    OR TG_OP NOT IN ('INSERT','UPDATE','DELETE') THEN RAISE EXCEPTION 'Trigger de auditoria fuera de alcance'; END IF;
  caller:=COALESCE(NULLIF(NULLIF(current_setting('role',true),'none'),''),session_user);
  SELECT rolsuper INTO caller_is_super FROM pg_roles WHERE rolname=caller;
  actor:=NULLIF(current_setting('app.user_id',true),'')::uuid;request:=NULLIF(current_setting('app.request_id',true),'')::uuid;
  IF actor IS NULL THEN
    IF caller_is_super IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Falta app.user_id'; END IF;
    kind:='DATABASE';request:=NULL;
  ELSE
    IF request IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Falta app.request_id';
    END IF;
    kind:='USER';
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN SELECT jsonb_object_agg(key,value) INTO old_doc FROM jsonb_each(to_jsonb(OLD)) WHERE key=ANY(allowed_columns);END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN SELECT jsonb_object_agg(key,value) INTO new_doc FROM jsonb_each(to_jsonb(NEW)) WHERE key=ANY(allowed_columns);END IF;
  row_doc:=COALESCE(new_doc,old_doc);
  row_key:=jsonb_strip_nulls(jsonb_build_object('red_asistencial_id',row_doc->'red_asistencial_id',
    'centro_asistencial_id',row_doc->'centro_asistencial_id','area_id',row_doc->'area_id',
    'ticket_id',row_doc->'ticket_id','tecnico_id',row_doc->'tecnico_id'));
  IF TG_OP='UPDATE' THEN
    old_key:=jsonb_strip_nulls(jsonb_build_object('red_asistencial_id',old_doc->'red_asistencial_id',
      'centro_asistencial_id',old_doc->'centro_asistencial_id','area_id',old_doc->'area_id',
      'ticket_id',old_doc->'ticket_id','tecnico_id',old_doc->'tecnico_id'));
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
CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON app.tecnicos_soporte
FOR EACH ROW EXECUTE FUNCTION audit.capture_change();
ALTER TABLE app.tecnicos_soporte ENABLE ALWAYS TRIGGER audit_row_change;
CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON app.tecnicos_soporte
FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_mutation();
ALTER TABLE app.tecnicos_soporte ENABLE ALWAYS TRIGGER reject_truncate;
