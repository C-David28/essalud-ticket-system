# Subetapa 1.5 — Portal del usuario y tablero técnico

La 1.4 fue confirmada por el usuario sin errores. Se revisaron únicamente el workspace web, el contrato de salud, manifiestos npm, Dockerfile API y CI. Base de esta entrega: commit d1281d4. Se conservaron dos archivos sin seguimiento con nombres que parecen fragmentos de comandos; no forman parte del parche.

## Aplicar e iniciar (CMD, Windows)

Ejecutar cada comando y detenerse si falla. El parche se aplica una sola vez sobre 1.4 y conserva tus .env y datos.

```bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
git status --short
set "PATCH=C:\Users\Stev\Documents\Codex\2026-09-06\master-prompt-sistema-enterprise-de-tickets-3\outputs\subetapa-1.5.patch"
git apply --check "%PATCH%"
git apply "%PATCH%"
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run check
npm.cmd run web:build
npm.cmd run web:check
npm.cmd run web:test
npm.cmd run web:smoke
npm.cmd run web:dev
```

Abrir http://127.0.0.1:3000. El portal redirige a `/portal`; la navegación abre `/tecnico`. Los dos archivos sin seguimiento previos no impiden aplicar este parche; si aparecen cambios propios en archivos versionados, conservarlos antes de aplicar, sin reset ni borrados.

Esperado: build correcto, comprobación TypeScript sin errores, 13 pruebas aprobadas y mensaje `OK: frontend de produccion verificado`. web:smoke usa una API simulada temporal, no tu base PostgreSQL. web:dev queda ejecutándose hasta Ctrl+C. Para ejecutar el build de producción: detener web:dev y usar `npm.cmd run web:start`.

## Verificaciones manuales importantes

1. **Portal:** crear una solicitud con información ficticia, buscarla y abrir su detalle. Verificar que un formulario vacío muestre errores y que cancelar no cree registros.
2. **Kanban:** filtrar por centro o prioridad, abrir una tarjeta y cambiar su estado de prueba. Comprobar que aparece en la columna elegida. Probar Escape y navegación con Tab en el detalle. Volver al portal conserva cambios; recargar restaura los ejemplos.
3. **Pantallas:** comprobar ambas vistas en escritorio y móvil. El Kanban se desplaza horizontalmente dentro de su contenedor; los formularios deben poder recorrerse completos.
4. **API existente:** mantener NestJS ejecutándose en el puerto 3001; el indicador debe mostrar API disponible. Si se detiene, debe cambiar a API no disponible en la siguiente consulta (hasta 30 segundos). La maqueta debe seguir funcionando. Reiniciar la API al terminar.

Para iniciar NestJS en otra ventana se conservan `npm.cmd run api:start` (después de api:build) o `npm.cmd run api:up`, según tu modalidad de 1.4. No iniciar ambas en el mismo puerto. Si usas otra URL, copiar `apps\web\.env.example` a `apps\web\.env.local`, ajustar API_BASE_URL y reiniciar Next.js. No se requieren nuevas claves.

## Alcance y compatibilidad

- Solo maquetación interactiva: tickets DEMO, catálogo de ejemplo y cambios en memoria. No hay envío de tickets reales, persistencia, autenticación, SLA ni WebSockets.
- Las migraciones, los scripts db:*, la API HTTP y los controles tenant/auditoría permanecen intactos. No hay SQL nuevo que ejecutar.
- Se incorpora apps/web al workspace npm y se fija el lockfile. El Dockerfile API solo cambia los selectores de npm ci/prune para instalar su propio workspace, evitando incluir Next.js. Se agrega .next a .dockerignore.
- El indicador usa un adaptador GET del servidor Next.js hacia la API existente. No cambia el backend ni expone URLs internas al navegador.
- CI conserva las verificaciones previas y agrega build, tipos, pruebas del frontend y prueba HTTP de producción.

## Git y despliegue

Después de verificar:

```bat
git diff --check
git add .dockerignore .gitignore .github/workflows/ci.yml README.md package.json package-lock.json apps/api/Dockerfile apps/web scripts/web-smoke.mjs docs/SUBETAPA-1.5.md docs/VALIDATION-1.5.md docs/ROADMAP.md docs/CLOUD.md
git diff --cached --stat
git commit -m "feat(web): add user portal and technician kanban mockup"
git push -u origin HEAD
```

El add explícito evita incorporar los dos archivos ajenos sin seguimiento. Confirmar que no incluya .env, .next, node_modules ni backups y revisar CI en GitHub. No se ejecuta despliegue público: se mantiene en 1.6. Esta entrega ya proporciona el build Next.js que se utilizará allí.

La [evidencia de pruebas](VALIDATION-1.5.md) distingue las comprobaciones ejecutadas de las revisiones manuales. No avanzar a 1.6 dentro de esta entrega.
