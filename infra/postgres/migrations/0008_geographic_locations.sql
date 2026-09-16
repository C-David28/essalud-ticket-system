-- 3.4: ubicación configurable de sedes; Google Maps sigue siendo un adaptador opcional de presentación.
SET LOCAL ROLE essalud_owner;

ALTER TABLE app.centros_asistenciales
  ADD COLUMN latitude numeric(9,6),
  ADD COLUMN longitude numeric(9,6),
  ADD COLUMN location_source varchar(20),
  ADD CONSTRAINT centros_location_complete_check CHECK (
    (latitude IS NULL AND longitude IS NULL AND location_source IS NULL)
    OR (latitude IS NOT NULL AND longitude IS NOT NULL AND location_source IS NOT NULL
      AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
      AND location_source IN ('CONFIGURED','NETWORK','GEOCODED'))
  );

COMMENT ON COLUMN app.centros_asistenciales.latitude IS 'Coordenada institucional configurable; no implica geolocalizacion de personas';
COMMENT ON COLUMN app.centros_asistenciales.longitude IS 'Coordenada institucional configurable; no implica geolocalizacion de personas';
COMMENT ON COLUMN app.centros_asistenciales.location_source IS 'Origen controlado de la ubicacion: CONFIGURED, NETWORK o GEOCODED';
RESET ROLE;

-- Se amplía la lista explícita de auditoría. Las columnas futuras siguen excluidas por defecto.
CREATE OR REPLACE FUNCTION audit.capture_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE old_doc jsonb;new_doc jsonb;row_doc jsonb;row_key jsonb;old_key jsonb;
  actor uuid;request uuid;caller name;caller_is_super boolean;kind text;
  allowed_columns constant text[]:=ARRAY['red_asistencial_id','centro_asistencial_id','area_id','codigo','nombre',
    'tipo','activo','created_at','updated_at','ticket_id','titulo','descripcion','categoria','prioridad','estado',
    'solicitante_id','resolved_at','closed_at','assigned_to','assigned_at','assignment_mode','tecnico_id','nivel',
    'capacidad_maxima','role_id','alcance','usuario_id','access_id','username','display_name',
    'latitude','longitude','location_source'];
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
