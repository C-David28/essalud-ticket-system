# Subetapa 3.4 — Google Maps opcional para sedes e incidencias

Esta entrega añade una vista geográfica al espacio autenticado. Las coordenadas pertenecen a las sedes configuradas; los tickets se muestran alrededor de su sede y nunca registran la ubicación de una persona. La API aplica primero el tenant, rol y alcance por sede de 3.3.

## Diseño implementado

- La migración `0008_geographic_locations.sql` añade `latitude`, `longitude` y `location_source` a las sedes. Los tres valores son opcionales como conjunto, tienen rangos válidos y admiten únicamente `CONFIGURED`, `NETWORK` o `GEOCODED`.
- Los cambios geográficos entran en los snapshots de auditoría inmutable. La tabla conserva RLS forzado y el runtime no obtiene permisos nuevos.
- `config/organization.demo.json` contiene cuatro ubicaciones referenciales de demostración. Se reemplazan por configuración aprobada sin cambiar la API.
- `/mapa` combina el catálogo y los tickets que la sesión ya puede consultar. Muestra sedes e incidencias con marcadores seleccionables.
- Google Maps se carga bajo demanda en el navegador. Sin clave, sin red o ante un error del proveedor, permanece disponible una lista geográfica completa.

## Activar Google Maps localmente

Este paso es opcional para ejecutar el sistema, pero necesario para comprobar el mapa interactivo:

1. En Google Cloud, crear o elegir un proyecto, asociar facturación y habilitar **Maps JavaScript API**.
2. Crear una clave de API para navegador. Restringirla a **Websites (HTTP referrers)** con `http://127.0.0.1:3000/*` y `http://localhost:3000/*`, y limitar sus APIs a **Maps JavaScript API**.
3. Abrir `apps/api/.env.tickets` y añadir, sin comillas:

~~~env
GOOGLE_MAPS_BROWSER_KEY=TU_CLAVE_DE_NAVEGADOR
GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
~~~

4. No publicar ni compartir el archivo. La clave será visible en el navegador por diseño y debe quedar protegida mediante las restricciones anteriores. Para un entorno institucional se debe crear un Map ID propio.

Google documenta la [carga bajo demanda](https://developers.google.com/maps/documentation/javascript/load-maps-js-api), el requisito de Map ID para [Advanced Markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/start) y las [restricciones recomendadas de claves](https://developers.google.com/maps/api-security-best-practices).

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
npm.cmd run web:smoke
npm.cmd run infra:up
npm.cmd run db:backup
npm.cmd run db:migrate
npm.cmd run db:migrate
npm.cmd run db:status
npm.cmd run db:geography:check
npm.cmd run tickets:setup
npm.cmd run tickets:setup
npm.cmd run api:test:integration
npm.cmd run demo:down
npm.cmd run demo:up
npm.cmd run demo:check
~~~

La primera migración debe mostrar `APPLIED: 0008_geographic_locations`; la segunda debe mostrar `SKIP`. `db:status` debe listar 0001–0008. La verificación geográfica debe aprobar 12 controles y la integración debe eliminar su entorno desechable.

## Comprobaciones manuales importantes

1. Sin iniciar sesión, abrir http://127.0.0.1:3000/mapa y confirmar la redirección a `/acceso`.
2. Iniciar como `tecnico.n1`: `/mapa` debe mostrar solo su sede. Iniciar como `supervisor.red` o `admin.gctic`: debe mostrar las cuatro sedes demo.
3. Sin clave de Google, confirmar el aviso de mapa desactivado y que la lista de sedes sigue disponible.
4. Con la clave configurada, confirmar que aparece “Mapa interactivo activo”, que los marcadores de sede abren su resumen y que los marcadores `!` muestran una incidencia.
5. Crear un ticket desde `/portal`, volver a `/mapa` y confirmar que aparece en la sede correspondiente. Eliminarlo al terminar la demostración.

## Git

~~~bat
git status --short
git diff --check
git add .github/workflows/ci.yml README.md package.json package-lock.json apps/api apps/web config/organization.demo.json infra/postgres/migrations/0008_geographic_locations.sql infra/postgres/verify-geography.sql scripts docs/API.md docs/ROADMAP.md docs/SUBETAPA-3.4.md docs/VALIDATION-3.4.md
git commit -m "feat(maps): add optional geographic operations view"
~~~

No avanzar a 4.1 hasta completar estas verificaciones.
