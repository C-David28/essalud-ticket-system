-- Verificación de integración: conexión autenticada y escritura transaccional.
BEGIN;
DO $$
BEGIN
  IF current_setting('TimeZone') <> 'UTC' THEN
    RAISE EXCEPTION 'Se requiere UTC en PostgreSQL';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_namespace n,
      LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) acl
    WHERE n.nspname = 'public' AND acl.grantee = 0 AND acl.privilege_type = 'CREATE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC no debe crear objetos en el schema public';
  END IF;
END $$;
CREATE TEMP TABLE infrastructure_probe (id integer PRIMARY KEY);
INSERT INTO infrastructure_probe VALUES (1);
SELECT 'postgres-ok' FROM infrastructure_probe WHERE id = 1;
ROLLBACK;
