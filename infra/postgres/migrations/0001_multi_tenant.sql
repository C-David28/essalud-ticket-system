-- Subetapa 1.2. Se ejecuta mediante db:migrate dentro de una transacción.
-- No editar una migración aplicada: el runner verifica su SHA-256.
DO $guard$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'El bootstrap local requiere un administrador PostgreSQL';
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname IN
    ('essalud_owner', 'essalud_migrator', 'essalud_app')) THEN
    RAISE EXCEPTION 'Ya existen roles reservados; revisar el cluster sin borrarlos';
  END IF;
END $guard$;

CREATE ROLE essalud_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE essalud_migrator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE essalud_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT essalud_owner TO essalud_migrator;
CREATE SCHEMA app AUTHORIZATION essalud_owner;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO essalud_app;

SET LOCAL ROLE essalud_owner;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE FUNCTION app.current_red_asistencial_id() RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $fn$
  SELECT NULLIF(current_setting('app.red_asistencial_id', true), '')::uuid;
$fn$;
GRANT EXECUTE ON FUNCTION app.current_red_asistencial_id() TO essalud_app;

CREATE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $fn$
BEGIN
  NEW.created_at := OLD.created_at;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $fn$;

CREATE TABLE app.redes_asistenciales (
  red_asistencial_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo varchar(30) NOT NULL UNIQUE CHECK (codigo ~ '^[A-Z0-9][A-Z0-9_-]{1,29}$'),
  nombre varchar(200) NOT NULL CHECK (length(btrim(nombre)) BETWEEN 2 AND 200),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app.centros_asistenciales (
  red_asistencial_id uuid NOT NULL,
  centro_asistencial_id uuid NOT NULL DEFAULT gen_random_uuid(),
  codigo varchar(30) NOT NULL CHECK (codigo ~ '^[A-Z0-9][A-Z0-9_-]{1,29}$'),
  nombre varchar(200) NOT NULL CHECK (length(btrim(nombre)) BETWEEN 2 AND 200),
  tipo varchar(20) NOT NULL CHECK (tipo IN ('HOSPITAL','CAP','POLICLINICO','POSTA','OTRO')),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (red_asistencial_id, centro_asistencial_id),
  UNIQUE (red_asistencial_id, codigo),
  FOREIGN KEY (red_asistencial_id) REFERENCES app.redes_asistenciales
    (red_asistencial_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE app.areas (
  red_asistencial_id uuid NOT NULL,
  centro_asistencial_id uuid NOT NULL,
  area_id uuid NOT NULL DEFAULT gen_random_uuid(),
  codigo varchar(30) NOT NULL CHECK (codigo ~ '^[A-Z0-9][A-Z0-9_-]{1,29}$'),
  nombre varchar(200) NOT NULL CHECK (length(btrim(nombre)) BETWEEN 2 AND 200),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (red_asistencial_id, centro_asistencial_id, area_id),
  UNIQUE (red_asistencial_id, centro_asistencial_id, codigo),
  FOREIGN KEY (red_asistencial_id, centro_asistencial_id)
    REFERENCES app.centros_asistenciales (red_asistencial_id, centro_asistencial_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TRIGGER touch_updated_at BEFORE UPDATE ON app.redes_asistenciales
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON app.centros_asistenciales
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON app.areas
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE app.redes_asistenciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.redes_asistenciales FORCE ROW LEVEL SECURITY;
ALTER TABLE app.centros_asistenciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.centros_asistenciales FORCE ROW LEVEL SECURITY;
ALTER TABLE app.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.areas FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_scope ON app.redes_asistenciales TO essalud_app
USING (red_asistencial_id = app.current_red_asistencial_id())
WITH CHECK (red_asistencial_id = app.current_red_asistencial_id());
CREATE POLICY tenant_scope ON app.centros_asistenciales TO essalud_app
USING (red_asistencial_id = app.current_red_asistencial_id())
WITH CHECK (red_asistencial_id = app.current_red_asistencial_id());
CREATE POLICY tenant_scope ON app.areas TO essalud_app
USING (red_asistencial_id = app.current_red_asistencial_id())
WITH CHECK (red_asistencial_id = app.current_red_asistencial_id());

-- Crear redes queda reservado a administración, no al runtime.
GRANT SELECT ON app.redes_asistenciales TO essalud_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.centros_asistenciales, app.areas TO essalud_app;
-- No se otorgan DDL, TRUNCATE, BYPASSRLS ni membresía de propietario a la aplicación.
RESET ROLE;
