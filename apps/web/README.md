# Web — portal y tablero de la subetapa 1.5

Next.js 16, React 19, Tailwind CSS 4, Lucide, componentes locales con patrón shadcn/ui y primitivas Radix, y TanStack React Query 5. El portal `/portal` permite consultar y crear solicitudes de demostración; `/tecnico` muestra el Kanban con filtros, detalle y movimiento de tarjetas de prueba.

Desde la raíz: `npm ci --ignore-scripts --no-audit --no-fund`, `npm run web:build`, `npm run web:check`, `npm run web:test`, `npm run web:smoke`. Para usarlo: `npm run web:dev` y abrir http://127.0.0.1:3000.

Los datos son ficticios y viven exclusivamente en la memoria de React Query. Navegar entre las dos vistas conserva los cambios; recargar inicia otra demostración. No se escriben tickets, usuarios ni audit logs en PostgreSQL. No hay autenticación simulada que se presente como real.

Solo `/api/backend-health` consulta el backend, mediante GET a `/api/v1/health/ready`, con timeout de cuatro segundos. La URL se configura opcionalmente mediante `API_BASE_URL` en `.env.local` (lado servidor); por defecto usa http://127.0.0.1:3001. La interfaz consulta cada 30 segundos y distingue conexión de demostración. El portal funciona aunque la API esté apagada.

`src/lib/demo-tickets.ts` contiene tipos, catálogo de ejemplo y validación; `src/components/providers.tsx` aísla el estado por sesión de página; `src/components/ticket-workspace.tsx` compone las vistas; `src/components/ui/` aloja las primitivas reutilizables. El adaptador HTTP de salud no acepta una URL enviada por el navegador y no expone credenciales. No se requiere modificar CORS ni los endpoints de NestJS.

Las sedes y áreas mostradas son referencias de maquetación; el catálogo institucional validado corresponde a 3.2. CRUD persistente, estados autorizados y tiempo real se implementan en la etapa 2; autenticación en 3.1 y PWA/offline en 3.4. El cambio visual de estado no es esa máquina de estados futura.

Las pruebas usan Vitest/Testing Library; web:smoke inicia Next.js de producción en el puerto 3105 con una API HTTP temporal y comprueba rutas y degradación/recuperación. `WEB_TEST_PORT` permite elegir otro puerto de prueba. No requiere Docker y termina ambos servidores al finalizar.

Guía y checklist: [SUBETAPA-1.5.md](../../docs/SUBETAPA-1.5.md). Fuentes: [Next.js](https://nextjs.org/docs/app/getting-started/installation), [shadcn/ui](https://ui.shadcn.com/docs/installation/manual), [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery).
