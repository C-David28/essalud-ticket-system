# Validación 2.2 — 2026-09-10

Implementación directa en `main`, sobre `7456dae`. La nube permaneció pausada y no se ejecutaron comandos de despliegue.

## Aprobado en esta sesión

- Build de NestJS/TypeScript y generación de Prisma.
- 18 pruebas unitarias/HTTP: las 16 anteriores y 2 nuevas para transiciones, motivos, errores, historial y OpenAPI.
- PostgreSQL WASM/PGlite con aplicación repetida de las migraciones: 22 controles multi-tenant, 34 de auditoría, 20 de CRUD y 23 de estados.
- Flujo HTTP real de NestJS + Prisma + PostgreSQL WASM: grafo completo, reapertura, cierre terminal, marcas temporales, aislamiento de dos redes, historial y auditoría.
- Prueba de carrera con dos solicitudes sobre el mismo ticket: una acepta el cambio y otra devuelve `409`.
- Ensayo de actualización desde 2.1: un ticket previo se incorpora al historial con el actor y `requestId` originales de auditoría.
- `0001`, `0002` y `0003` no fueron editadas. No cambiaron las versiones de dependencias.

## Pendiente de confirmación local

- Ejecutar las cuatro suites SQL y `api:test:integration` en PostgreSQL 17 nativo mediante Docker Desktop.
- Migrar los volúmenes locales, reconstruir la API y aprobar `tickets:check`.
- Recorrer en Swagger la checklist manual de [SUBETAPA-2.2.md](SUBETAPA-2.2.md).

PGlite no sustituye la autenticación SCRAM ni el comportamiento del contenedor PostgreSQL oficial. La subetapa permanece pendiente hasta recibir esos resultados.
