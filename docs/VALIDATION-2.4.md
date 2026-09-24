# Evidencia de validación — subetapa 2.4

Fecha: 2026-09-12.

## Cobertura

Las pruebas automatizadas cubren validación HTTP, selección por menor carga, empate estable, límite de capacidad, asignaciones simultáneas, reasignación manual, técnicos inactivos o de otro tenant, tickets terminales, RLS, auditoría, historial inmutable y actualización SSE de tickets y cargas.

## Aprobado en esta sesión

- `npm.cmd run check`: sintaxis de 28 scripts correcta.
- `npm.cmd run api:validate` y `api:build`: Prisma y TypeScript correctos.
- `npm.cmd run api:test`: 21 de 21 pruebas correctas, incluida la regresión del bloqueo asesor compatible con Prisma.
- `npm.cmd run web:check`, `web:test` y `web:build`: TypeScript, 16 pruebas y build de producción correctos.
- `npm.cmd run web:smoke`: portal, Kanban, proxy protegido y SSE correctos.
- Validación auxiliar PostgreSQL: 22 pruebas multi-tenant, 34 de auditoría, 20 de tickets, 23 de estados y 21 de asignación correctas; migraciones repetibles.
- `git diff --check`: sin errores de espacios.

## Pendiente del entorno Docker

`npm.cmd run api:test:integration` no pudo iniciarse porque Docker Compose no está disponible dentro del entorno aislado de Codex. El cierre requiere ejecutar en el equipo del usuario los comandos de [SUBETAPA-2.4.md](SUBETAPA-2.4.md), comprobar la migración 0005 sobre el volumen existente y validar la demostración en `/portal` y `/tecnico`.

## Corrección del error HTTP 500

Corrección verificada el 2026-09-13.

La integración local identificó el primer `POST /api/v1/tickets/:id/asignacion/automatica` como la operación fallida. `pg_advisory_xact_lock` devuelve el tipo PostgreSQL `void`, que el adaptador Prisma PostgreSQL no deserializa. La consulta ahora conserva el mismo bloqueo transaccional y convierte su resultado a `text`; no se modificaron RLS, triggers, capacidad ni auditoría.


## Corrección de la validación de auditoría

La ejecución posterior confirmó que el endpoint automático ya responde correctamente. La prueba falló después porque buscaba la edición de contenido en la posición fija `logs[1]`; desde la subetapa 2.4, las asignaciones también generan eventos `UPDATE` anteriores. La prueba ahora identifica el evento por título y prioridad y comprueba su `request_id`, manteniendo la cobertura de las dos asignaciones, siete cambios de estado y eliminación. El escenario CRUD también sustituye su bus de eventos por uno local sin efectos para evitar conectarse por accidente al Redis del host; la propagación Redis real permanece cubierta en su prueba de integración independiente.
