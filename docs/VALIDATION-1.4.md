# Evidencia y límites — subetapa 1.4

Fecha: 2026-09-08. Base revisada: repositorio del usuario en Pictures, limpio en `8cbfc1e`, con origin configurado. La salida adjunta confirma las 56 verificaciones SQL y migración 1.3 correctas en su Docker. No se alteró ese repositorio durante la preparación: se entrega parche y código completo.

## Ejecutado durante esta entrega

- Instalación de dependencias con versiones exactas y package-lock.json.
- `npm run check`: sintaxis y metadatos correctos, 14 scripts.
- `npm run api:validate`: schema Prisma válido.
- `npm run api:build`: generación del cliente y compilación TypeScript estricta correctas.
- `npm run api:test`: **11 pruebas aprobadas, 0 fallos**. Configuración, UUID, timeout, HTTP 200/503, liveness, Swagger/OpenAPI, CORS, request ID, cabeceras y errores 400/404/413.
- Migraciones aplicadas y repetidas; **22 pruebas multi-tenant y 34 de auditoría** ejecutadas sobre PostgreSQL WASM mediante PGlite.
- Aprovisionamiento del LOGIN restringido ejecutado dos veces.
- PrismaPg conectado por protocolo PostgreSQL a PGlite: lectura aislada, INSERT/UPDATE/DELETE auditados, actor/request, rollback conjunto, limpieza del contexto en el pool y rechazo de escritura ajena y borrado de auditoría.

PGlite y sus utilidades se instalaron fuera de la entrega. Esta validación auxiliar no cambia el stack del proyecto. En ese motor se estableció explícitamente la identidad de sesión de runtime: **no demuestra autenticación SCRAM ni concurrencia de PostgreSQL nativo**.

Se corrigieron el mapeo del tipo SQL name sin cambiar tablas, la respuesta 413 del parser HTTP y el cierre de recursos ante un error al abrir el puerto. El aprovisionamiento concede CONNECT solo si hace falta; la concesión redundante sobre template1 fallaba en el motor embebido.

## Pendiente de ejecutar en el entorno objetivo

- `api:test:integration` contra PostgreSQL 17 y Redis 7.4 reales en Docker, incluyendo login y concurrencia.
- Build y ejecución del Dockerfile y configuración Compose fusionada.
- Inicio y recuperación Redis en el equipo del usuario, Swagger en navegador y API Healthy.
- Publicación del commit y ejecución de GitHub Actions.

Docker Compose no es ejecutable en el entorno de esta sesión. El intento de PostgreSQL nativo también falló por restricciones de ejecución de Windows. No se presenta ninguna de esas pruebas como aprobada. La integración desechable y CI quedan preparados para ejecutarse desde el repositorio del usuario.

Se intentó `npm audit --omit=dev`, pero el endpoint de auditoría npm no respondió correctamente; no hay resultado de análisis de vulnerabilidades que afirmar.

En una copia limpia, npm ci instaló las 310 dependencias del lockfile. La descarga inicial del motor de Prisma desde binaries.prisma.sh falló en esta conexión; se reutilizó el mismo binario de Prisma 7.10.0 de la instalación de desarrollo para comprobar la compilación de esa copia. El binario no se incluye en el ZIP: la primera generación en el equipo del usuario requiere acceso a ese host.

También se verificaron la sintaxis YAML, los checksums conservados de compose.yaml y ambas migraciones, git diff --check y la aplicación del parche en una copia de 1.3. git apply --check pasó contra el repositorio real sin modificarlo. El ZIP contiene 75 archivos fuente y excluye secretos, dependencias instaladas y compilados.

El esquema SQL previo, permisos y checksums se conservan. No hay despliegue público, frontend, JWT ni CRUD de tickets en esta subetapa. Las verificaciones pendientes se resuelven siguiendo [SUBETAPA-1.4.md](SUBETAPA-1.4.md) antes de avanzar.
