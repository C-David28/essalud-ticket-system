-- 2.2: maquina de estados e historial transaccional. No modificar 0001-0003.
SET LOCAL ROLE essalud_owner;

ALTER TABLE app.tickets DROP CONSTRAINT tickets_estado_check;
ALTER TABLE app.tickets ADD CONSTRAINT tickets_estado_check
  CHECK (estado IN ('ABIERTO','EN_PROCESO','PENDIENTE','RESUELTO','CERRADO'));
ALTER TABLE app.tickets
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN closed_at timestamptz,
  ADD CONSTRAINT tickets_state_dates_check CHECK (
    (estado IN ('ABIERTO','EN_PROCESO','PENDIENTE') AND resolved_at IS NULL AND closed_at IS NULL)
    OR (estado='RESUELTO' AND resolved_at IS NOT NULL AND closed_at IS NULL)
    OR (estado='CERRADO' AND resolved_at IS NOT NULL AND closed_at IS NOT NULL AND closed_at>=resolved_at)
  );

CREATE TABLE app.ticket_state_history (
  red_asistencial_id uuid NOT NULL,
  transition_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  codigo varchar(40) NOT NULL,
  estado_anterior varchar(20),
  estado_nuevo varchar(20) NOT NULL,
  motivo varchar(500) NOT NULL CHECK (length(btrim(motivo)) BETWEEN 5 AND 500),
  changed_by uuid NOT NULL,
  request_id uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (red_asistencial_id,transition_id),
  CHECK (estado_anterior IS NULL OR estado_anterior IN ('ABIERTO','EN_PROCESO','PENDIENTE','RESUELTO','CERRADO')),
  CHECK (estado_nuevo IN ('ABIERTO','EN_PROCESO','PENDIENTE','RESUELTO','CERRADO')),
  CHECK (estado_anterior IS DISTINCT FROM estado_nuevo)
);
-- Sin FK: el historial de estados sobrevive a la eliminacion del ticket.
CREATE INDEX ticket_state_history_ticket_idx
  ON app.ticket_state_history(red_asistencial_id,ticket_id,changed_at,transition_id);

-- Recuperar la apertura de tickets creados en 2.1 desde su evento de auditoria.
-- Se hace antes de activar RLS sobre el historial; las tablas fuente ya tienen RLS forzado.
RESET ROLE;
DO $backfill_guard$
BEGIN
  IF EXISTS (
    SELECT FROM app.tickets t WHERE NOT EXISTS (
      SELECT FROM audit.audit_logs l
      WHERE l.entity='app.tickets' AND l.action='INSERT'
        AND l.entity_id->>'ticket_id'=t.ticket_id::text
        AND l.user_id IS NOT NULL AND l.request_id IS NOT NULL
    )
  ) THEN
    RAISE EXCEPTION 'Ticket 2.1 sin evento de auditoria de usuario; revisar antes de migrar';
  END IF;
END $backfill_guard$;
INSERT INTO app.ticket_state_history(
  red_asistencial_id,ticket_id,codigo,estado_anterior,estado_nuevo,motivo,
  changed_by,request_id,changed_at
)
SELECT t.red_asistencial_id,t.ticket_id,t.codigo,NULL,t.estado,
  'Estado inicial migrado desde 2.1',source.user_id,source.request_id,t.created_at
FROM app.tickets t
CROSS JOIN LATERAL (
  SELECT l.user_id,l.request_id FROM audit.audit_logs l
  WHERE l.entity='app.tickets' AND l.action='INSERT'
    AND l.entity_id->>'ticket_id'=t.ticket_id::text
    AND l.user_id IS NOT NULL AND l.request_id IS NOT NULL
  ORDER BY l."timestamp",l.audit_id LIMIT 1
) source;
SET LOCAL ROLE essalud_owner;

ALTER TABLE app.ticket_state_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.ticket_state_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.ticket_state_history TO essalud_app
  USING (red_asistencial_id=app.current_red_asistencial_id());
CREATE POLICY history_append_internal ON app.ticket_state_history FOR INSERT TO essalud_owner
  WITH CHECK (red_asistencial_id=app.current_red_asistencial_id());
GRANT SELECT ON app.ticket_state_history TO essalud_app;

CREATE OR REPLACE FUNCTION app.prepare_ticket() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE
  n text;
  reason text;
BEGIN
  IF TG_OP='INSERT' THEN
    n := nextval('app.ticket_number_seq')::text;
    NEW.codigo := 'INC-' || to_char(clock_timestamp() AT TIME ZONE 'America/Lima','YYYY') || '-' || lpad(n,greatest(4,length(n)),'0');
    NEW.estado := 'ABIERTO';
    NEW.created_at := clock_timestamp();
    NEW.updated_at := NEW.created_at;
    NEW.resolved_at := NULL;
    NEW.closed_at := NULL;
    NEW.solicitante_id := nullif(current_setting('app.user_id',true),'')::uuid;
  ELSE
    IF ROW(NEW.red_asistencial_id,NEW.ticket_id,NEW.centro_asistencial_id,NEW.area_id,NEW.codigo,NEW.solicitante_id)
       IS DISTINCT FROM ROW(OLD.red_asistencial_id,OLD.ticket_id,OLD.centro_asistencial_id,OLD.area_id,OLD.codigo,OLD.solicitante_id) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Identidad del ticket inmutable';
    END IF;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := clock_timestamp();
    IF NEW.estado IS DISTINCT FROM OLD.estado THEN
      reason := nullif(btrim(current_setting('app.ticket_transition_reason',true)),'');
      IF reason IS NULL OR length(reason) NOT BETWEEN 5 AND 500 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Motivo de transicion requerido';
      END IF;
      IF NOT (
        (OLD.estado='ABIERTO' AND NEW.estado='EN_PROCESO')
        OR (OLD.estado='EN_PROCESO' AND NEW.estado IN ('PENDIENTE','RESUELTO'))
        OR (OLD.estado='PENDIENTE' AND NEW.estado='EN_PROCESO')
        OR (OLD.estado='RESUELTO' AND NEW.estado IN ('EN_PROCESO','CERRADO'))
      ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Transicion de estado no permitida';
      END IF;
      IF NEW.estado='RESUELTO' THEN
        NEW.resolved_at := clock_timestamp(); NEW.closed_at := NULL;
      ELSIF NEW.estado='CERRADO' THEN
        NEW.resolved_at := OLD.resolved_at; NEW.closed_at := clock_timestamp();
      ELSE
        NEW.resolved_at := NULL; NEW.closed_at := NULL;
      END IF;
    ELSE
      NEW.resolved_at := OLD.resolved_at;
      NEW.closed_at := OLD.closed_at;
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

CREATE FUNCTION app.capture_ticket_state() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE
  actor uuid := nullif(current_setting('app.user_id',true),'')::uuid;
  request uuid := nullif(current_setting('app.request_id',true),'')::uuid;
  reason text;
BEGIN
  IF actor IS NULL OR request IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Contexto de actor requerido para historial de estados';
  END IF;
  IF TG_OP='INSERT' THEN
    reason := 'Ticket creado';
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
    reason := btrim(current_setting('app.ticket_transition_reason',true));
  ELSE
    RETURN NULL;
  END IF;
  INSERT INTO app.ticket_state_history(
    red_asistencial_id,ticket_id,codigo,estado_anterior,estado_nuevo,motivo,changed_by,request_id
  ) VALUES (
    NEW.red_asistencial_id,NEW.ticket_id,NEW.codigo,
    CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.estado END,NEW.estado,reason,actor,request
  );
  RETURN NULL;
END $fn$;
ALTER FUNCTION app.capture_ticket_state() OWNER TO essalud_owner;
REVOKE ALL ON FUNCTION app.capture_ticket_state() FROM PUBLIC,essalud_app;
CREATE TRIGGER capture_ticket_state AFTER INSERT OR UPDATE ON app.tickets
FOR EACH ROW EXECUTE FUNCTION app.capture_ticket_state();
ALTER TABLE app.tickets ENABLE ALWAYS TRIGGER capture_ticket_state;

CREATE TRIGGER state_history_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.ticket_state_history
FOR EACH STATEMENT EXECUTE FUNCTION audit.reject_mutation();
ALTER TABLE app.ticket_state_history ENABLE ALWAYS TRIGGER state_history_immutable;
RESET ROLE;

-- Incluir las nuevas fechas en el snapshot de auditoria sin alterar 0003.
CREATE OR REPLACE FUNCTION audit.capture_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  old_doc jsonb; new_doc jsonb; row_doc jsonb; row_key jsonb; old_key jsonb;
  actor uuid; request uuid; caller name; caller_is_super boolean; kind text;
  allowed_columns constant text[] := ARRAY[
    'red_asistencial_id','centro_asistencial_id','area_id','codigo','nombre','tipo','activo',
    'created_at','updated_at','ticket_id','titulo','descripcion','categoria','prioridad','estado',
    'solicitante_id','resolved_at','closed_at'
  ];
BEGIN
  IF TG_WHEN <> 'AFTER' OR TG_LEVEL <> 'ROW'
    OR TG_RELID NOT IN ('app.redes_asistenciales'::regclass,'app.centros_asistenciales'::regclass,
                       'app.areas'::regclass,'app.tickets'::regclass)
    OR TG_OP NOT IN ('INSERT','UPDATE','DELETE') THEN
    RAISE EXCEPTION 'Trigger de auditoria fuera de su alcance autorizado';
  END IF;
  caller := COALESCE(NULLIF(NULLIF(current_setting('role',true),'none'),''),session_user);
  SELECT rolsuper INTO caller_is_super FROM pg_roles WHERE rolname=caller;
  actor := NULLIF(current_setting('app.user_id',true),'')::uuid;
  request := NULLIF(current_setting('app.request_id',true),'')::uuid;
  IF actor IS NULL THEN
    IF caller_is_super IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Falta app.user_id para auditar la operacion';
    END IF;
    kind := 'DATABASE'; request := NULL;
  ELSE
    IF request IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Falta app.request_id para auditar la operacion'; END IF;
    kind := 'USER';
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT jsonb_object_agg(key,value) INTO old_doc FROM jsonb_each(to_jsonb(OLD)) WHERE key=ANY(allowed_columns);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT jsonb_object_agg(key,value) INTO new_doc FROM jsonb_each(to_jsonb(NEW)) WHERE key=ANY(allowed_columns);
  END IF;
  row_doc := COALESCE(new_doc,old_doc);
  row_key := jsonb_strip_nulls(jsonb_build_object(
    'red_asistencial_id',row_doc->'red_asistencial_id','centro_asistencial_id',row_doc->'centro_asistencial_id',
    'area_id',row_doc->'area_id','ticket_id',row_doc->'ticket_id'));
  IF TG_OP='UPDATE' THEN
    old_key := jsonb_strip_nulls(jsonb_build_object(
      'red_asistencial_id',old_doc->'red_asistencial_id','centro_asistencial_id',old_doc->'centro_asistencial_id',
      'area_id',old_doc->'area_id','ticket_id',old_doc->'ticket_id'));
    IF old_key IS DISTINCT FROM row_key THEN
      RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='La identidad institucional es inmutable; no reasignar claves';
    END IF;
  END IF;
  INSERT INTO audit.audit_logs(
    red_asistencial_id,centro_asistencial_id,area_id,user_id,actor_kind,db_session_user,
    db_effective_role,action,entity,entity_id,old_values,new_values,request_id
  ) VALUES ((row_doc->>'red_asistencial_id')::uuid,(row_doc->>'centro_asistencial_id')::uuid,
    (row_doc->>'area_id')::uuid,actor,kind,session_user,caller,TG_OP,TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME,
    row_key,old_doc,new_doc,request);
  RETURN NULL;
END $fn$;
ALTER FUNCTION audit.capture_change() OWNER TO essalud_audit_writer;
REVOKE ALL ON FUNCTION audit.capture_change() FROM PUBLIC,essalud_app;
