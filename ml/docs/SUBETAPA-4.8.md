# Subetapa 4.8 — robustez ML y consultas operativas paginadas

La asistencia sigue siendo opcional: pedir una sugerencia no crea un ticket y ninguna llamada ML forma parte de la transacción de creación. El usuario puede continuar con su categoría manual ante error, baja confianza, servicio detenido, modelo no cargado o configuración desactivada. Model V1, Dataset V1 y la política aprobada no se reentrenan ni se modifican.

## Archivos principales

| Responsabilidad | Archivos |
| --- | --- |
| Contrato, filtros y resumen | `apps/api/src/domain/ticket.ts`, `application/tickets.ts`, `presentation/tickets.dto.ts`, `presentation/tickets.controller.ts` |
| Consultas Prisma dentro del alcance autorizado | `apps/api/src/infrastructure/ticket-repository.ts` |
| Deadline y cancelación de inferencia | `apps/api/src/infrastructure/category-classifier.ts`, `apps/web/src/lib/category-assistance-client.ts` |
| Cliente paginado, caché y SSE | `apps/web/src/lib/ticket-client.ts`, `apps/web/src/components/providers.tsx` |
| Trabajo activo, historial y mapa | `apps/web/src/components/ticket-workspace.tsx`, `geographic-view.tsx`, `apps/web/src/app/globals.css` |
| Proxy público/personal y filtros | `apps/web/src/app/api/tickets/[[...path]]/route.ts`, `events/route.ts` |
| Regresión con más de 100 registros | `apps/api/test/integration/ticket-filters.cjs`, `database.test.cjs`, pruebas web de workspace/mapa/proxy |
| Comprobación integral y CI | `ml/scripts/integration-check.mjs`, `integration-command.mjs`, `ml/test/integration.test.mjs`, `.github/workflows/ci.yml`, `package.json` |
| Documentación y estado | `ml/docs/VALIDATION-4.8.md`, `ml/README.md`, `docs/ROADMAP.md` |

Las rutas abreviadas de cada fila son relativas a la misma carpeta del primer archivo. Esta entrega no necesita trabajo nuevo en Google Colab ni un despliegue público.

## Trabajo activo e historial

- **Trabajo activo:** Abierto, En Proceso y Pendiente. Es la vista inicial del tablero.
- **Historial:** Resuelto y Cerrado. Se consulta mediante páginas y filtros; no se borran registros para reducir la pantalla.
- Resuelto puede volver a En Proceso con motivo, según la máquina de estados existente. Cerrado continúa siendo terminal.

`GET /api/v1/tickets` conserva `items`, `page`, `pageSize`, `hasMore` y el comportamiento anterior sin filtros (`view=all`). Añade filtros opcionales:

| Parámetro | Contrato |
| --- | --- |
| `view` | `all`, `active`, `history`; valor API predeterminado `all` |
| `search` | Código, título o descripción; texto literal, sin distinguir mayúsculas; máximo 100 caracteres |
| `estado` | Uno de los cinco estados del dominio |
| `prioridad` | BAJA, MEDIA, ALTA, CRITICA |
| `categoria` | SOPORTE, REDES, INFRAESTRUCTURA, BIOMEDICO |
| `centroAsistencialId` | UUID de sede; siempre intersectado con el alcance autorizado |
| `page`, `pageSize` | Límites existentes: página 1–100000, tamaño 1–100 |

Los filtros se aplican en Prisma/PostgreSQL antes de paginar. No pueden ampliar el alcance PROPIO, SEDE o RED ni el tenant establecido por el servidor. `view=active&estado=CERRADO` devuelve cero resultados. La búsqueda escapa los comodines `%`, `_` y barra invertida; no interpreta SQL del usuario.

`GET /api/v1/tickets/resumen` usa los mismos filtros y permiso `tickets:list`. PostgreSQL agrupa por sede, estado y prioridad; devuelve totales y grupos, sin enviar todos los tickets al navegador. El tablero y el mapa utilizan esos totales. Los enlaces a detalles consultan por UUID, por lo que un ticket histórico o fuera de la página inicial sigue siendo accesible dentro del alcance autorizado.

No hay migraciones nuevas. Se conserva el índice de orden por red/fecha/UUID, RLS forzado, auditoría inmutable y los historiales anteriores. La paginación por desplazamiento mantiene compatibilidad; con volúmenes mayores podrá evaluarse un cursor y optimización de búsquedas según planes reales, sin cambiar el dominio.

Las claves de caché de React Query incluyen usuario, red, alcance, sedes, roles y permisos. Lista, resumen y detalle se invalidan juntos ante SSE, transición o asignación. El portal usa explícitamente el principal público existente, incluso si el navegador conserva una cookie del personal: `X-Ticket-Audience: public` y `?audience=public` solo omiten el JWT de soporte en Next, nunca conceden permisos. Las guardas, la clave de servidor y RLS siguen activos. Los controles de transición se muestran únicamente al personal que dispone del permiso.

La página contiene hasta 25 tickets; sus cantidades se identifican como cantidades de página. Los totales de ambas vistas y sedes proceden del resumen autorizado, independientemente de la página. Cambiar filtros vuelve a la primera página. Crear desde Historial vuelve a Trabajo activo. El mapa obtiene un resumen autorizado para todas las sedes y pagina únicamente los tickets de la sede seleccionada.

## Robustez de la asistencia

| Situación | Respuesta y comportamiento |
| --- | --- |
| Configuración desactivada | `disabled`, sugerencia nula; no llama ML |
| Margen bajo | `abstained`, sugerencia nula; se conserva elección humana |
| Servicio/modelo no disponible | `unavailable`, sugerencia nula; formulario manual disponible |
| Entrada inválida | Rechazo antes de inferencia; no crea ticket |
| Redirección o contrato/versiones inesperadas | Rechazo controlado; no reenvía credenciales al destino |
| Cuerpo lento, excesivo o UTF-8 inválido | Deadline total, límite 4096 bytes y cancelación del lector |

Se conserva el presupuesto de tiempos existente: inferencia 2 s, Nest 4 s, Next 5 s, navegador 10 s. Los logs muestran eventos y metadatos controlados, sin textos, tokens ni cookies. La readiness de Nest sigue dependiendo de PostgreSQL/Redis; la readiness de ML informa la carga del modelo por separado.

## Validación local desde CMD

Dentro de `C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system`:

```cmd
npm.cmd run api:build
npm.cmd run api:test
npm.cmd run web:check
npm.cmd run web:test
npm.cmd run ml:integration:test
npm.cmd run ml:service:test
npm.cmd run api:test:integration
```

La última suite crea exclusivamente infraestructura desechable `essalud-api-test-*`: ejecuta regresión SQL, autenticación, Prisma/RLS, auditoría, CRUD, asignación, Redis y un fixture de **127 tickets de prueba**, más uno de otra red, para comprobar paginación más allá de 100. No inserta ese fixture en la base operativa ni utiliza Dataset V1 para ello. El entorno de prueba se elimina al terminar; los volúmenes locales del sistema se conservan.

Después carga solo API/web modificados, manteniendo ML y las bases existentes:

```cmd
docker compose -f compose.yaml -f compose.api.yaml -f compose.tickets.yaml -f compose.demo.yaml -f compose.ml-integration.yaml up -d --build --no-deps --wait --wait-timeout 180 api web
npm.cmd run ml:robustness:check
npm.cmd run demo:check
```

Debe aparecer **`ML_ROBUSTNESS_CHECK_OK`**. El checker reutiliza la comprobación 4.7 y añade salud del backend independiente de ML, filtros, resumen, página vacía, resolución, historial, detalle directo, reapertura y cierre. Crea/elimina únicamente su ticket ficticio identificado con un UUID de ejecución; conserva su auditoría y deja un recibo sin textos o secretos en `ml/outputs/robustness-available-check.json`. Los huecos en códigos INC tras eliminar tickets temporales son normales.

Para una caída real:

```cmd
npm.cmd run ml:integration:stop-ml
npm.cmd run ml:robustness:check -- --unavailable
npm.cmd run ml:integration:start-ml
npm.cmd run ml:robustness:check
```

Para desactivación por configuración, abre **localmente** `ml/outputs/integration.env`, cambia únicamente `ML_ASSIST_ENABLED=true` a `ML_ASSIST_ENABLED=false` y guarda. No copies ni compartas su contenido. Recrea solo API para cargar el cambio:

```cmd
docker compose -f compose.yaml -f compose.api.yaml -f compose.tickets.yaml -f compose.demo.yaml -f compose.ml-integration.yaml up -d --no-deps --force-recreate --wait --wait-timeout 120 api
npm.cmd run ml:robustness:check -- --disabled
```

Restaura la misma línea a `true`, vuelve a ejecutar el comando de recreación API y `npm.cmd run ml:robustness:check`. No ejecutes setup, seeds ni migraciones para estas pruebas. La verificación y los recibos no contienen secretos; si algo falla comparte solo el diagnóstico controlado.

## Verificación manual y evidencias

1. Tablero: alterna **Trabajo activo / Historial**, busca código/texto y filtra por sede, estado, categoría o prioridad. Comprueba Anterior/Siguiente cuando existan varias páginas. Guarda captura y la petición Network con sus filtros, sin cabeceras privadas.
2. Abre un Resuelto desde Historial o mapa; vuelve a En Proceso con motivo. Debe aparecer en Trabajo activo, conservando el registro de transición. No intentes reabrir un Cerrado.
3. Formulario: prueba sugerencia/abstención y crea manualmente con ML detenido o desactivado. Guarda únicamente el aviso y la confirmación de creación.
4. Mapa: selecciona una sede, revisa totales y navega sus tickets. La lista geográfica sigue funcionando con Google Maps desactivado.
5. Conserva consola de pruebas aprobadas, recibos `robustness-*-check.json` y artifact **stage-4.8-robustness-check** de Infrastructure CI. Los 200 ejemplos ML siguen en archivos del módulo ML, fuera de dashboard, historial y mapas.

## GitHub y alcance

Se trabaja en `main`, excluyendo cambios previos ajenos a esta subetapa. Tras revisar el commit local:

```cmd
git status --short
git log -1 --oneline
git push origin main
```

Infrastructure CI ejecuta los tres modos (disponible, detenido, desactivado), restaura la asistencia y guarda recibos. No se afirma que Actions esté aprobado hasta ver su ejecución. Esta entrega no cambia proveedores ni despliegues públicos; la propuesta y eventual migración corresponden a 4.9, con autorización posterior.
