# Evidencia de validación — subetapa 3.3

Fecha: 2026-09-15.

## Cobertura

- Migración acumulativa 0001–0007, dos tablas nuevas con RLS forzado y seed demo repetible.
- Dieciséis controles SQL de privilegios, integridad de membresías, aislamiento y ausencia de hashes en auditoría.
- Hash scrypt, firma y alteración de JWT, expiración, vínculo con tenant, permisos y alcances.
- Autenticación real mediante el repositorio Prisma, login HTTP y consulta de sesión en la integración desechable.
- Autorización de CRUD, asignación, catálogo y SSE, con filtros por solicitante, sede o red.
- Cookie HttpOnly y proxies Next.js; redirección de páginas privadas y continuidad del portal público.
- Rechazo del adaptador demo en producción, cloud o `APP_ENVIRONMENT=institutional`.

## Resultados en este entorno

- `api:build`: correcto; 26 pruebas unitarias aprobadas.
- `web:test`: 23 pruebas aprobadas; `web:build` y `web:smoke`: correctos.
- Migraciones 0001–0007 aplicadas dos veces en PostgreSQL embebido: correcto.
- `verify-access.sql`: correcto en PostgreSQL embebido.
- Seed repetido: tres usuarios, tres membresías y cero hashes copiados a auditoría.

Docker no está disponible en el entorno de edición. La comprobación final contra PostgreSQL 17, Redis y los contenedores reales debe ejecutarse con `db:access:check`, `api:test:integration` y `demo:check` según [la guía](SUBETAPA-3.3.md).

## Límites

El proveedor de identidad de esta entrega existe solo para la demostración local. El modo institucional no habilita estas cuentas y deberá conectarse más adelante con el proveedor aprobado. `ADMIN_GCTIC` expresa permisos funcionales nacionales, pero cada token permanece ligado a una red; el acceso entre redes requerirá selección explícita y autorización institucional. La resolución automática de sede por red queda detrás de `SITE_RESOLUTION_MODE` y todavía no está implementada.
