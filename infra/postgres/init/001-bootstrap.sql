-- Subetapa 1.1: preparación técnica, sin tablas de negocio.
-- La imagen oficial ejecuta este archivo únicamente al crear un volumen vacío.
BEGIN;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
COMMIT;
-- 1.2: migraciones, roles separados, redes, centros, áreas y aislamiento tenant.
-- 1.3: auditoría transaccional y restricciones append-only.
-- bootstrap_admin es administrador local. Nunca será el usuario de la API.
