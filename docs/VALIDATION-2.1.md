# Validación 2.1 — 2026-09-10

Implementación directamente en el repositorio del usuario, rama main, base 01101a3. Nube pausada según confirmación del usuario; no se ejecutaron operaciones cloud.

## Aprobado

- Build NestJS/TypeScript y generación Prisma.
- 16 pruebas unitarias/HTTP: incluye las 11 anteriores y 5 de acceso local, identidad fija, validación, PATCH/DELETE, paginación y Swagger.
- PostgreSQL WASM/PGlite: migraciones aplicadas y repetidas; 22 verificaciones tenant, 34 de auditoría y 20 nuevas de tickets.
- Flujo completo por HTTP con NestJS, Prisma y PostgreSQL WASM: creación, consulta, listado, actualización, eliminación; aislamiento de dos redes; códigos diferentes; logs con requestId y snapshots. Se ejecutó la misma función de prueba usada por la integración nativa, con creación secuencial.
- Migraciones 0001 y 0002 intactas; no se cambiaron versiones de dependencias.

## Pendiente

Se intentó npm run api:test:integration: Docker Compose no está disponible desde esta sesión. Falta ejecutarlo con Docker Desktop activo para acreditar contenedores, autenticación SCRAM y creación concurrente en PostgreSQL nativo.

También falta el arranque persistente local con tickets:setup / tickets:up y su prueba tickets:check en el equipo del usuario. No se aplicaron migraciones a sus volúmenes ni se generaron credenciales locales durante esta sesión.

PGlite y las pruebas con dobles no sustituyen esas verificaciones. No se marca la subetapa lista ni se avanza a 2.2.

