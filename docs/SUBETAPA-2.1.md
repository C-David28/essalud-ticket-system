# Subetapa 2.1 — CRUD local de tickets

La nube fue pausada por el usuario. Se trabaja en la misma rama main. No ejecutar despliegues Railway/Vercel ni cloud:db:prepare. Esta entrega no cambia las pantallas de demostración ni implementa la máquina de estados de 2.2.

## Arranque en CMD

Los cambios ya están en este repositorio: no aplicar parches de entregas anteriores.
Abrir Docker Desktop y esperar que el motor Linux esté listo. Ejecutar cada línea por separado; detenerse si falla alguna.

```bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
git branch --show-current
docker compose version
npm.cmd run check
npm.cmd run infra:up
npm.cmd run infra:check
npm.cmd run db:backup
npm.cmd run db:migrate
npm.cmd run db:migrate
npm.cmd run db:status
npm.cmd run db:check
npm.cmd run db:audit:check
npm.cmd run db:tickets:check
npm.cmd run api:setup
npm.cmd run tickets:setup
npm.cmd run tickets:up
npm.cmd run api:check
npm.cmd run tickets:check
```

Resultado esperado: main; servicios healthy; 0001/0002 conservadas y 0003_tickets aplicada una vez y luego SKIP; 22 + 34 + 20 comprobaciones SQL; CRUD HTTP correcto. tickets:up compila y ejecuta la API en Docker con PostgreSQL/Redis locales. No requiere ejecutar Node/NestJS como servidor en el host. No se modifica la base cloud.

tickets:setup conserva la clave en apps/api/.env.tickets y crea una red, centro y área **ficticios** propios para las pruebas. No carga el catálogo institucional real. El actor ficticio y la red se fijan en el servidor; no se aceptan del navegador. Los secretos existentes de apps/api/.env se mantienen.

## Endpoints

Base: http://127.0.0.1:3001/api/v1. Todas las operaciones de tickets requieren X-Local-Api-Key.

| Método | Ruta | Resultado |
| --- | --- | --- |
| POST | /tickets | 201; ticket con UUID y código generado |
| GET | /tickets?page=1&pageSize=20 | 200; items, page, pageSize, hasMore |
| GET | /tickets/:id | 200 o 404 |
| PATCH | /tickets/:id | 200; modifica título, descripción, categoría o prioridad |
| DELETE | /tickets/:id | 204; elimina la fila y conserva la auditoría |

:id es ticketId (UUID), no el código INC. Los tickets ajenos también devuelven 404.
Listas ordenadas por fecha e ID descendentes, pageSize máximo 100.
POST exige centroAsistencialId, areaId, titulo (5–200), descripcion (10–5000), categoria y prioridad.
Categorías: SOPORTE, REDES, INFRAESTRUCTURA, BIOMEDICO. Prioridades: BAJA, MEDIA, ALTA, CRITICA.
No se admiten campos desconocidos, null en PATCH ni PATCH vacío. Estado permanece ABIERTO; no se implementan transiciones.

## Verificación manual en Swagger

1. Abrir http://127.0.0.1:3001/docs.
2. Abrir apps/api/.env.tickets **solo en tu equipo**. Copiar el valor de TICKETS_LOCAL_KEY en Authorize → local-key. No enviarlo al chat ni a Git.
3. En POST /api/v1/tickets, reemplazar los UUID del ejemplo con TICKETS_LOCAL_CENTRO_ID y TICKETS_LOCAL_AREA_ID:

```json
{
  "centroAsistencialId": "REEMPLAZAR_CON_UUID_LOCAL",
  "areaId": "REEMPLAZAR_CON_UUID_LOCAL",
  "titulo": "Impresora de prueba sin conexión",
  "descripcion": "El equipo ficticio no responde a la impresión de una página de prueba.",
  "categoria": "SOPORTE",
  "prioridad": "MEDIA"
}
```

4. Copiar ticketId del 201. Comprobar GET, PATCH con {"prioridad":"ALTA"}, DELETE 204 y GET posterior 404.
5. Intentar PATCH con {"estado":"CERRADO"}: debe responder 400. Sin Authorize, debe responder 401.

La clave y la identidad fijas son un acceso de pruebas local, no JWT/RBAC. Las rutas están deshabilitadas por defecto y la configuración rechaza habilitarlas en producción o en los proveedores cloud. compose.tickets.yaml mantiene la publicación en 127.0.0.1 y habilita Swagger solo para este flujo. No publicar este modo en una red compartida.

## Numeración, integridad y auditoría

PostgreSQL asigna INC-YYYY-NNNN usando el año de America/Lima y una secuencia global atómica. Ejemplo en 2026: INC-2026-0001. Cuatro dígitos es el mínimo: después de 9999 continúa con 10000, sin truncamiento. El consecutivo no se reinicia anualmente ni tras borrar tickets. Puede tener huecos por transacciones revertidas o pruebas; no es un contador de tickets vigentes.

RLS forzado aísla tickets por red; la FK compuesta obliga a que centro/área pertenezcan a esa red. El código, solicitante, IDs y fecha de creación son protegidos por la base. Al crear se valida que red, centro y área estén activos. No se reasigna la sede al editar.

INSERT, UPDATE y DELETE producen auditoría en la misma transacción, con usuario y requestId del servidor, identidad del ticket y valores anterior/nuevo. La eliminación es física de la fila de ticket, pero no elimina sus eventos. El log conserva el contenido de título y descripción; utilizar únicamente datos ficticios. 0001 y 0002 no se editaron: la ampliación está en 0003_tickets.sql.

## Pruebas esenciales

```bat
npm.cmd run api:build
npm.cmd run api:test
npm.cmd run api:test:integration
```

La última prueba crea infraestructura Docker desechable separada de tus datos, verifica las tres suites SQL y CRUD HTTP con PostgreSQL real, auditoría, dos redes y creación concurrente sin códigos repetidos. Incluye regresiones anteriores. CI también verifica el CRUD dentro del contenedor local. No confundir pruebas con dobles o PostgreSQL WASM con aprobación de Docker real.

Para apagar el entorno local conservando volúmenes:

```bat
npm.cmd run tickets:down
```

No añadir --volumes.

## Guardar en la misma rama

Después de que todas las pruebas pasen:

```bat
git branch --show-current
git diff --check
git add package.json package-lock.json compose.tickets.yaml .github/workflows/ci.yml README.md docs/ROADMAP.md docs/SUBETAPA-2.1.md docs/VALIDATION-2.1.md apps/api/prisma/schema.prisma apps/api/src/app.module.ts apps/api/src/application/tickets.ts apps/api/src/domain/ticket.ts apps/api/src/infrastructure/config.ts apps/api/src/infrastructure/database.ts apps/api/src/infrastructure/ticket-repository.ts apps/api/src/presentation/http.ts apps/api/src/presentation/local-tickets.guard.ts apps/api/src/presentation/tickets.controller.ts apps/api/src/presentation/tickets.dto.ts apps/api/test/unit/tickets.test.cjs apps/api/test/integration/database.test.cjs apps/api/test/integration/tickets-flow.cjs infra/postgres/migrations/0003_tickets.sql infra/postgres/verify-multi-tenant.sql infra/postgres/verify-audit.sql infra/postgres/verify-tickets.sql scripts/api-integration.mjs scripts/db-tickets-check.mjs scripts/tickets-setup.mjs scripts/tickets-check.mjs
git diff --cached --stat
git commit -m "feat(tickets): add local tenant-isolated CRUD with audit"
```

No se crea otra rama ni se realiza push automáticamente. Los cambios actuales están sin commit para tu revisión. Continuar a 2.2 solo tras verificar Docker y la checklist de esta subetapa.

