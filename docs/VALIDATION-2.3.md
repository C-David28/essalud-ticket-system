# Evidencia de validación — subetapa 2.3

Fecha: 2026-09-11.

## Aprobado en esta sesión

- `npm.cmd run check`: sintaxis de 27 scripts correcta.
- `npm.cmd run api:build`: Prisma y TypeScript correctos.
- `npm.cmd run api:test`: 19 de 19 pruebas correctas.
- `npm.cmd run web:check`: TypeScript estricto correcto.
- `npm.cmd run web:test`: 14 de 14 pruebas correctas.
- `npm.cmd run web:build`: build de producción correcto, incluidas las rutas proxy y SSE.
- `npm.cmd run web:smoke`: páginas, salud, proxy protegido y streaming SSE correctos con backend simulado.

Las pruebas cubren publicación solo después de operaciones confirmadas, ausencia de publicación en fallos, metadatos de tenant/request, DTO y autenticación existentes, mapeo del contrato a la interfaz, creación persistente, transición válida y errores públicos.

## Pendiente en el equipo del usuario

El entorno aislado de esta sesión no tiene acceso a Docker Compose. Quedan pendientes:

- `npm.cmd run api:test:integration`, incluida propagación Redis real entre dos instancias y aislamiento por tenant.
- `npm.cmd run demo:config`, `demo:up`, `demo:status` y `demo:check`.
- Demostración en dos ventanas sin recargar y persistencia después de recargar.

La subetapa se considera cerrada cuando esas comprobaciones terminan sin errores.
