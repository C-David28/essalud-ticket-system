# Subetapa 2.4 — asignación manual y automática por carga

Esta entrega continúa en `main`, conserva los flujos validados hasta 2.3 y funciona con Docker Compose local. Railway y Vercel permanecen pausados.

## Funcionamiento

- Cada red tiene su propio catálogo de técnicos N1/N2 y una capacidad máxima.
- La asignación manual exige técnico activo, capacidad disponible y un motivo de 5 a 500 caracteres.
- La asignación automática elige la menor carga activa; en empate usa nombre e identificador para obtener un resultado estable.
- Un bloqueo transaccional por tenant serializa asignaciones simultáneas y evita superar la capacidad.
- Solo cuentan los tickets `ABIERTO`, `EN_PROCESO` y `PENDIENTE`. Los tickets `RESUELTO` o `CERRADO` no admiten asignación.
- Cada cambio queda en `ticket_assignment_history`, en `audit.audit_logs` y genera `ticket.assignment_changed` por SSE.

## Actualizar y validar en CMD

Abre Docker Desktop. Desde la raíz del repositorio ejecuta cada comando por separado y detente si alguno falla:

```bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
git branch --show-current
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
npm.cmd run db:ticket-states:check
npm.cmd run db:ticket-assignment:check
npm.cmd run tickets:setup
npm.cmd run api:build
npm.cmd run api:test
npm.cmd run web:check
npm.cmd run web:test
npm.cmd run web:build
npm.cmd run api:test:integration
```

La rama debe ser `main`. La primera migración debe mostrar `APPLIED: 0005_ticket_assignment`; la segunda, `SKIP`. `db:status` debe listar 0001–0005 con sus checksums. El respaldo se crea antes de alterar el esquema.

## Demostración local

```bat
npm.cmd run demo:config
npm.cmd run demo:up
npm.cmd run demo:status
npm.cmd run demo:check
start http://127.0.0.1:3000/portal
start http://127.0.0.1:3000/tecnico
```

En el tablero técnico se muestran las cargas actuales. Crea un ticket ficticio desde el portal; en su detalle prueba **Asignar por menor carga**. Crea otro ticket, elige otro técnico, escribe el motivo y usa **Asignar manualmente**. Las tarjetas y cargas deben actualizarse sin recargar.

Para detener todo sin borrar volúmenes:

```bat
npm.cmd run demo:down
```

No uses `down --volumes` porque elimina la base local.

## Guardar en la misma rama

Después de aprobar todas las comprobaciones:

```bat
git status --short
git diff --check
git add .github/workflows/ci.yml README.md package.json package-lock.json apps/api apps/web infra/postgres/migrations/0005_ticket_assignment.sql infra/postgres/verify-ticket-assignment.sql scripts/api-check.mjs scripts/api-integration.mjs scripts/db-ticket-assignment-check.mjs scripts/demo-check.mjs scripts/tickets-check.mjs scripts/tickets-setup.mjs docs/API.md docs/ROADMAP.md docs/SUBETAPA-2.4.md docs/VALIDATION-2.4.md
git diff --cached --stat
git commit -m "feat(tickets): assign tickets by technician workload"
```

No avanzar a 3.1 hasta completar esta guía.
