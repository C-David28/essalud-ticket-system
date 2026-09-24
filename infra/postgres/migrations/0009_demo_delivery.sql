-- Cierre de Etapa 3: procedencia geografica y datos de demostracion persistentes.
SET LOCAL ROLE essalud_owner;
ALTER TABLE app.centros_asistenciales ADD COLUMN address varchar(300), ADD COLUMN location_accuracy varchar(12);
UPDATE app.centros_asistenciales SET location_accuracy='DEMO' WHERE latitude IS NOT NULL AND location_accuracy IS NULL;
ALTER TABLE app.centros_asistenciales DROP CONSTRAINT centros_location_complete_check;
ALTER TABLE app.centros_asistenciales ADD CONSTRAINT centros_location_complete_check CHECK (
 (latitude IS NULL AND longitude IS NULL AND location_source IS NULL AND location_accuracy IS NULL)
 OR (latitude IS NOT NULL AND longitude IS NOT NULL AND location_source IS NOT NULL AND location_accuracy IS NOT NULL
 AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
 AND location_source IN ('CONFIGURED','NETWORK','GEOCODED') AND location_accuracy IN ('VERIFIED','REFERENCE','DEMO')));
ALTER TABLE app.tickets ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX tickets_demo_center_idx ON app.tickets(red_asistencial_id,is_demo,centro_asistencial_id,estado);
COMMENT ON COLUMN app.centros_asistenciales.address IS 'Direccion configurable; validar antes de uso institucional';
COMMENT ON COLUMN app.centros_asistenciales.location_accuracy IS 'Calidad declarada: VERIFIED, REFERENCE o DEMO';
COMMENT ON COLUMN app.tickets.is_demo IS 'Registro sintetico; no representa informacion institucional real';

CREATE OR REPLACE FUNCTION app.prepare_ticket() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE n text; state_reason text; assignment_reason text; seed_time timestamptz; caller_is_super boolean;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT rolsuper INTO caller_is_super FROM pg_roles WHERE rolname=session_user;
  IF caller_is_super THEN seed_time:=nullif(current_setting('app.demo_seed_timestamp',true),'')::timestamptz; END IF;
  n:=nextval('app.ticket_number_seq')::text;
  NEW.codigo:='INC-'||to_char(COALESCE(seed_time,clock_timestamp()) AT TIME ZONE 'America/Lima','YYYY')||'-'||lpad(n,greatest(4,length(n)),'0');
  NEW.estado:='ABIERTO'; NEW.created_at:=COALESCE(seed_time,clock_timestamp()); NEW.updated_at:=NEW.created_at;
  NEW.resolved_at:=NULL; NEW.closed_at:=NULL; NEW.solicitante_id:=nullif(current_setting('app.user_id',true),'')::uuid;
  NEW.assigned_to:=NULL; NEW.assigned_at:=NULL; NEW.assignment_mode:=NULL;
 ELSE
  IF ROW(NEW.red_asistencial_id,NEW.ticket_id,NEW.centro_asistencial_id,NEW.area_id,NEW.codigo,NEW.solicitante_id)
   IS DISTINCT FROM ROW(OLD.red_asistencial_id,OLD.ticket_id,OLD.centro_asistencial_id,OLD.area_id,OLD.codigo,OLD.solicitante_id)
   THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Identidad del ticket inmutable'; END IF;
  NEW.created_at:=OLD.created_at; NEW.updated_at:=clock_timestamp();
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
   state_reason:=nullif(btrim(current_setting('app.ticket_transition_reason',true)),'');
   IF state_reason IS NULL OR length(state_reason) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Motivo de transicion requerido'; END IF;
   IF NOT ((OLD.estado='ABIERTO' AND NEW.estado='EN_PROCESO') OR (OLD.estado='EN_PROCESO' AND NEW.estado IN ('PENDIENTE','RESUELTO'))
    OR (OLD.estado='PENDIENTE' AND NEW.estado='EN_PROCESO') OR (OLD.estado='RESUELTO' AND NEW.estado IN ('EN_PROCESO','CERRADO')))
    THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Transicion de estado no permitida'; END IF;
   IF NEW.estado='RESUELTO' THEN NEW.resolved_at:=clock_timestamp();NEW.closed_at:=NULL;
   ELSIF NEW.estado='CERRADO' THEN NEW.resolved_at:=OLD.resolved_at;NEW.closed_at:=clock_timestamp();
   ELSE NEW.resolved_at:=NULL;NEW.closed_at:=NULL; END IF;
  ELSE NEW.resolved_at:=OLD.resolved_at;NEW.closed_at:=OLD.closed_at; END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
   IF OLD.estado IN ('RESUELTO','CERRADO') OR NEW.estado IN ('RESUELTO','CERRADO') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ticket terminal no admite reasignacion'; END IF;
   assignment_reason:=nullif(btrim(current_setting('app.ticket_assignment_reason',true)),'');
   IF assignment_reason IS NULL OR length(assignment_reason) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Motivo de asignacion requerido'; END IF;
   IF NEW.assigned_to IS NULL OR NEW.assignment_mode NOT IN ('MANUAL','AUTOMATICA') THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Asignacion incompleta'; END IF;
   IF NOT EXISTS (SELECT FROM app.tecnicos_soporte t WHERE t.red_asistencial_id=NEW.red_asistencial_id AND t.tecnico_id=NEW.assigned_to AND t.activo)
    THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Tecnico no disponible'; END IF;
   NEW.assigned_at:=clock_timestamp();
  ELSE NEW.assigned_at:=OLD.assigned_at;NEW.assignment_mode:=OLD.assignment_mode; END IF;
 END IF;
 RETURN NEW;
END $fn$;
RESET ROLE;
UPDATE app.tickets SET is_demo=true WHERE is_demo=false;

CREATE OR REPLACE FUNCTION audit.capture_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE old_doc jsonb;new_doc jsonb;row_doc jsonb;row_key jsonb;old_key jsonb;
  actor uuid;request uuid;caller name;caller_is_super boolean;kind text;
  allowed_columns constant text[]:=ARRAY['red_asistencial_id','centro_asistencial_id','area_id','codigo','nombre',
    'tipo','activo','created_at','updated_at','ticket_id','titulo','descripcion','categoria','prioridad','estado',
    'solicitante_id','resolved_at','closed_at','assigned_to','assigned_at','assignment_mode','tecnico_id','nivel',
    'capacidad_maxima','role_id','alcance','usuario_id','access_id','username','display_name',
    'latitude','longitude','location_source','address','location_accuracy','is_demo'];
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
