// Aprovisionamiento operativo: no modifica las migraciones 0001/0002.
export function runtimeRoleSql(password) {
  if (!/^[a-f0-9]{64}$/.test(password)) throw new Error('La clave de runtime debe ser hexadecimal de 32 bytes');
  return `BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL search_path=pg_catalog;
SELECT pg_advisory_xact_lock(73124,14);
DO $setup$
BEGIN
  IF to_regclass('audit.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'Primero aplicar las migraciones 1.2 y 1.3';
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='essalud_api') THEN
    IF NOT EXISTS (
      SELECT FROM pg_roles WHERE rolname='essalud_api'
      AND shobj_description(oid,'pg_authid')='essalud-ticket-system:runtime:v1'
      AND rolcanlogin AND rolinherit AND NOT rolsuper AND NOT rolbypassrls
      AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication
    ) THEN RAISE EXCEPTION 'Rol essalud_api existente no reconocido o inseguro'; END IF;
    IF EXISTS (
      SELECT FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
      WHERE m.member='essalud_api'::regrole AND (r.rolname<>'essalud_app' OR m.admin_option)
    ) THEN RAISE EXCEPTION 'Membresias inesperadas en essalud_api'; END IF;
  ELSE
    CREATE ROLE essalud_api LOGIN INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
    COMMENT ON ROLE essalud_api IS 'essalud-ticket-system:runtime:v1';
  END IF;
END $setup$;
ALTER ROLE essalud_api PASSWORD '${password}';
GRANT essalud_app TO essalud_api;
ALTER ROLE essalud_api SET search_path=pg_catalog,app;
ALTER ROLE essalud_api SET statement_timeout='5s';
ALTER ROLE essalud_api SET idle_in_transaction_session_timeout='10s';
DO $permissions$ BEGIN
  IF has_schema_privilege('essalud_api','app','CREATE')
    OR has_schema_privilege('essalud_api','audit','CREATE')
    OR has_table_privilege('essalud_api','audit.audit_logs','INSERT,UPDATE,DELETE,TRUNCATE')
    OR pg_has_role('essalud_api','essalud_owner','MEMBER')
    OR pg_has_role('essalud_api','essalud_migrator','MEMBER')
    OR pg_has_role('essalud_api','essalud_audit_writer','MEMBER')
  THEN RAISE EXCEPTION 'Privilegios inesperados en runtime'; END IF;
END $permissions$;
DO $grant$ BEGIN
  IF NOT has_database_privilege('essalud_api',current_database(),'CONNECT') THEN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO essalud_api',current_database());
  END IF;
END $grant$;
COMMIT;`;
}
