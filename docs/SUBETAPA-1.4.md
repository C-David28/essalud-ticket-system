# Subetapa 1.4 — instalación y verificación guiada

La salida compartida confirma 1.3: respaldo, migraciones aplicadas y repetibles, 22 pruebas multi-tenant y 34 de auditoría. Se revisó el repositorio real, limpio en el commit `8cbfc1e`, con remoto origin configurado. Esta entrega agrega únicamente el backend base. No avanzar a 1.5 hasta confirmar estas verificaciones.

Ejecutar los bloques **uno por uno en CMD**. Si un comando falla, detener ese bloque y compartir su salida, sin claves ni archivos .env.

## 1. Aplicar el parche sobre 1.3

El ZIP contiene el código completo. El parche conserva tu repositorio, historial y configuración.

```bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
git status --short
```

Debe salir vacío. Si aparecen cambios propios, conservarlos antes de aplicar; no usar reset ni borrar archivos.

```bat
set "PATCH=C:\Users\Stev\Documents\Codex\2026-09-06\master-prompt-sistema-enterprise-de-tickets-3\outputs\subetapa-1.4.patch"
git apply --check "%PATCH%"
git apply "%PATCH%"
git status --short
```

Los dos git apply deben terminar sin errores. Aparecerán nuevos archivos de API y cambios de configuración/documentación; no cambios en 0001/0002 ni compose.yaml. No volver a aplicar el mismo parche.

## 2. Instalar y compilar

```bat
node --version
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run check
npm.cmd run api:validate
npm.cmd run api:build
npm.cmd run api:test
```

Esperado: Node v24.x, 14 scripts correctos, schema Prisma válido, generación/compilación sin errores y **11 pruebas aprobadas, 0 fallos**. npm ci usa el lockfile; no necesita contraseñas PostgreSQL. La generación del cliente se hace explícitamente durante el build. No requiere Nest CLI global.

La instalación inicial necesita acceso a registry.npmjs.org y binaries.prisma.sh. Si Prisma informa que no puede descargar schema-engine, comprobar la conexión/proxy y repetir api:validate y api:build; no desactivar TLS ni modificar las migraciones para resolver una descarga.

## 3. Verificar y conectar la infraestructura existente

```bat
npm.cmd run infra:up
npm.cmd run infra:check
npm.cmd run db:backup
npm.cmd run db:migrate
npm.cmd run db:status
npm.cmd run db:check
npm.cmd run db:audit:check
npm.cmd run api:setup
npm.cmd run api:setup
```

Esperado: servicios Healthy; ambas migraciones **SKIP**; dos registros en el historial; 22 + 34 pruebas correctas; api:setup confirma el LOGIN restringido y conserva las claves al repetir. No se añade una migración 0003. El respaldo protege los datos previos al aprovisionamiento operativo; no se borran volúmenes.

El nuevo apps/api/.env queda ignorado por Git. La clave de API difiere del administrador. No necesitas copiar contraseñas manualmente.

## 4. Integración real en un entorno desechable

```bat
npm.cmd run api:test:integration
```

Esperado: proyecto essalud-api-test-..., 56 verificaciones SQL, 11 subpruebas de integración aprobadas y mensaje `OK: regresion SQL e integracion Prisma/PostgreSQL/Redis en entorno desechable.` Se limpia ese entorno automáticamente. La base essalud-tickets-local conserva sus datos. Puede tardar unos minutos.

## 5. Iniciar la API y comprobar Swagger

En la primera ventana:

```bat
npm.cmd run api:start
```

Dejarla abierta. En una segunda ventana CMD:

```bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
npm.cmd run api:check
curl.exe -i http://127.0.0.1:3001/api/v1/health/ready
```

Esperado: HTTP 200 y `{"status":"ok","checks":{"postgres":"up","redis":"up"}}`. Abrir `http://127.0.0.1:3001/docs`. Probar las tres rutas GET mediante **Try it out → Execute**. `/docs-json` entrega OpenAPI.

## 6. Comprobar degradación y recuperación

Con la API ejecutándose, en la segunda ventana:

```bat
docker compose stop redis
curl.exe -i http://127.0.0.1:3001/api/v1/health/ready
curl.exe -i http://127.0.0.1:3001/api/v1/health/live
docker compose start redis
npm.cmd run infra:up
npm.cmd run api:check
```

Durante la parada: readiness HTTP 503 y redis down, liveness HTTP 200. Tras recuperar Redis: api:check vuelve a pasar. Si Redis acaba de arrancar, esperar unos segundos y repetir el último comando.

## 7. Comprobar el contenedor de la API

Detener la API de la primera ventana con **Ctrl+C** para liberar 3001. Luego:

```bat
docker compose -f compose.yaml -f compose.api.yaml config --quiet
npm.cmd run api:up
npm.cmd run api:check
docker compose -f compose.yaml -f compose.api.yaml ps
curl.exe -i http://127.0.0.1:3001/docs
```

Esperado: API Healthy, api:check correcto y `/docs` HTTP 404 porque el contenedor usa producción. La imagen usa el usuario node, sin credenciales incluidas; Compose monta el filesystem de ejecución en solo lectura.

Para detener exclusivamente la API de Docker y volver a ejecución local:

```bat
docker compose -f compose.yaml -f compose.api.yaml stop api
npm.cmd run api:start
```

## 8. GitHub después de las pruebas

```bat
git diff --check
git status --short
git diff --stat
git add .dockerignore .gitignore .github/workflows/ci.yml README.md docs apps/api package.json package-lock.json compose.api.yaml scripts/api-setup.mjs scripts/api-check.mjs scripts/api-integration.mjs scripts/lib/api-role.mjs
git diff --cached --stat
git commit -m "feat(api): add NestJS backend with tenant transactions and health checks"
git branch --show-current
git push -u origin HEAD
```

Confirmar que el resumen no incluya .env, node_modules, dist ni backups. Abrir Actions y comprobar **Infrastructure CI** en verde. El workflow conserva los controles anteriores y agrega build, pruebas, aprovisionamiento repetible, integración y contenedor. La publicación no fue ejecutada desde esta entrega.

## Checklist y criterio de cierre

- [ ] Compilación y 11 pruebas de lógica/HTTP aprobadas.
- [ ] 0001/0002 mantienen sus checksums y ambas suites SQL pasan.
- [ ] api:setup funciona dos veces sin cambiar claves.
- [ ] Integración Docker desechable completa, sin fallos.
- [ ] Swagger local y tres endpoints GET funcionan.
- [ ] Readiness cambia 200 → 503 → 200 al detener y recuperar Redis.
- [ ] Contenedor API Healthy y Swagger desactivado en producción.
- [ ] Commit publicado y CI correcto.

Compartir las salidas de api:test:integration, api:check y el estado del contenedor para confirmar el cierre. Evidencia de desarrollo: [VALIDATION-1.4.md](VALIDATION-1.4.md). Preparación cloud: [CLOUD.md](CLOUD.md); despliegue público con HTTPS en 1.6.

Si api:setup falla: comprobar primero infra:check y db:status, revisar localmente las URLs y el rol gestionado. El script oculta errores que podrían contener claves. Si 3001 está ocupado, detener la instancia anterior antes de alternar entre Node y Docker. No usar el administrador como DATABASE_URL para resolver un readiness 503.
