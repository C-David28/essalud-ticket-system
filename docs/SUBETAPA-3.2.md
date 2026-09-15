# Subetapa 3.2 — estructura organizacional configurable

Esta entrega incorpora un catálogo institucional configurable por red sin usar datos institucionales como requisito. La demostración incluye una red, cuatro sedes, seis áreas y cinco roles ficticios; todos están identificados como datos de demostración.

## Diseño

- `config/organization.demo.json` es la fuente versionada de datos demo. Los UUID locales del archivo `.env` se resuelven mediante `$LOCAL_CENTER_ID` y `$LOCAL_AREA_ID` para conservar los tickets existentes.
- `tickets:setup` valida el catálogo y lo aplica con UPSERT dentro de la misma transacción que prepara los datos locales. Puede repetirse sin duplicar filas.
- La migración `0006_organizational_catalog.sql` añade `app.roles_institucionales`. Sus filas están aisladas por RLS, son de solo lectura para el runtime y todos sus cambios se auditan.
- `GET /api/v1/organization` consulta red, sedes, áreas y roles desde el tenant fijado por el servidor. La clave local continúa siendo un mecanismo exclusivo de demostración.
- `/organizacion` muestra la estructura en el espacio del personal. La asignación efectiva de permisos a identidades pertenece a 3.3.

Para incorporar otra organización de prueba se crea un archivo JSON con el mismo contrato y se valida antes de sembrarlo. No se debe editar una migración ya aplicada ni ejecutar `prisma db push`.

## Verificación local en Windows

Ejecutar desde la raíz, un comando por vez:

~~~bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
npm.cmd run check
npm.cmd run api:validate
npm.cmd run api:build
npm.cmd run api:test
npm.cmd run web:check
npm.cmd run web:test
npm.cmd run web:build
npm.cmd run db:backup
npm.cmd run db:migrate
npm.cmd run db:migrate
npm.cmd run db:status
npm.cmd run db:organization:check
npm.cmd run tickets:setup
npm.cmd run tickets:setup
npm.cmd run api:test:integration
npm.cmd run demo:up
npm.cmd run demo:check
~~~

La primera migración debe mostrar `APPLIED: 0006_organizational_catalog`; la segunda debe mostrar `SKIP`. `db:status` debe listar 0001–0006. Las dos ejecuciones de `tickets:setup` deben terminar correctamente.

## Comprobaciones manuales importantes

1. Abrir http://127.0.0.1:3000/organizacion y confirmar una red demo, cuatro sedes, seis áreas y cinco roles.
2. Recargar la página y comprobar que la información proviene de la API sin exponer `X-Local-Api-Key` al navegador.
3. Abrir http://127.0.0.1:3001/docs y ejecutar `GET /api/v1/organization` con la clave local; debe responder solo con el tenant configurado.
4. Crear y gestionar un ticket existente para confirmar que el portal y el tablero de la Etapa 2 siguen operativos.

## Git

~~~bat
git status --short
git diff --check
git add .github/workflows/ci.yml README.md package.json package-lock.json apps/api apps/web config infra/postgres/migrations/0006_organizational_catalog.sql infra/postgres/verify-organization.sql scripts docs/API.md docs/AUDIT.md docs/MULTI-TENANCY.md docs/ROADMAP.md docs/SUBETAPA-3.2.md docs/VALIDATION-3.2.md
git commit -m "feat(org): add configurable institutional catalog"
~~~

No avanzar a 3.3 hasta completar estas verificaciones.
