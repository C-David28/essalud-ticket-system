# Subetapa 3.3 — control de acceso, sedes y entornos

Esta entrega añade autenticación y autorización a la demostración local sin convertir las credenciales demo en un mecanismo institucional. El portal de solicitante permanece sin login y el espacio del personal exige una sesión firmada.

## Diseño implementado

- `app.usuarios_institucionales` conserva identidades por red y hashes scrypt; `app.usuario_accesos` relaciona cada identidad con un rol y, cuando el alcance es `SEDE`, con un centro activo.
- Las tablas tienen RLS forzado, lectura exclusiva para `essalud_app`, auditoría inmutable y protección contra `TRUNCATE`. Los hashes se excluyen de los snapshots de auditoría.
- `POST /api/v1/auth/login` valida las cuentas ficticias y emite un JWT HS256 de 15 minutos. Next.js lo guarda en una cookie `HttpOnly`, `SameSite=Strict` y lo reenvía desde sus rutas de servidor.
- Cada endpoint declara un permiso. El repositorio limita los datos a `PROPIO`, `SEDE`, `RED` o `NACIONAL`, mientras PostgreSQL mantiene el aislamiento por red.
- Los eventos SSE incluyen metadatos internos de sede y solicitante para aplicar el mismo filtro antes de enviarlos.
- `APP_ENVIRONMENT` separa `demo`, `development` e `institutional`. La API rechaza el CRUD y las cuentas locales fuera de `demo`. `SITE_RESOLUTION_MODE=configured` deja un puerto de configuración para una futura resolución por infraestructura de red.

Las cuentas incluidas son ficticias: `tecnico.n1`, `supervisor.red` y `admin.gctic`. La contraseña demo inicial es `Demo-RAP-2026!` y queda en el archivo ignorado `apps/api/.env.tickets`; se puede cambiar allí antes de volver a ejecutar `tickets:setup`.

## Verificación local en Windows

Ejecutar desde la raíz, un comando por vez y detenerse si alguno falla:

~~~bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
npm.cmd run check
npm.cmd run api:validate
npm.cmd run api:build
npm.cmd run api:test
npm.cmd run web:check
npm.cmd run web:test
npm.cmd run web:build
npm.cmd run web:smoke
npm.cmd run infra:up
npm.cmd run db:backup
npm.cmd run db:migrate
npm.cmd run db:migrate
npm.cmd run db:status
npm.cmd run db:access:check
npm.cmd run tickets:setup
npm.cmd run tickets:setup
npm.cmd run api:test:integration
npm.cmd run demo:up
npm.cmd run demo:check
~~~

La primera migración debe mostrar `APPLIED: 0007_access_control`; la segunda debe mostrar `SKIP`. `db:status` debe listar 0001–0007. `db:access:check` debe cerrar con 16 controles aprobados y `api:test:integration` debe eliminar su entorno desechable al finalizar.

## Comprobaciones manuales importantes

1. Abrir http://127.0.0.1:3000/tecnico sin sesión y confirmar la redirección a `/acceso`.
2. Iniciar con `tecnico.n1`: debe ver únicamente la sede configurada y no debe tener controles de asignación.
3. Cerrar sesión e iniciar con `supervisor.red`: debe ver la red y los controles de asignación. `admin.gctic` debe exponer el conjunto completo de permisos demo.
4. En una ventana privada, crear un ticket desde `/portal` sin login y confirmar que el portal sigue funcionando.
5. En las herramientas del navegador, comprobar que `essalud_staff_session` aparece como `HttpOnly` y desaparece al cerrar sesión.

## Git

~~~bat
git status --short
git diff --check
git add .github/workflows/ci.yml README.md package.json package-lock.json apps/api apps/web config/access.demo.json infra/postgres/migrations/0007_access_control.sql infra/postgres/verify-access.sql scripts docs/API.md docs/AUDIT.md docs/MULTI-TENANCY.md docs/ROADMAP.md docs/SUBETAPA-3.3.md docs/VALIDATION-3.3.md
git commit -m "feat(auth): add role and site access control"
~~~

No avanzar a 3.4 hasta completar estas verificaciones.
