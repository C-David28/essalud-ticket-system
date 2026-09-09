# Subetapa 1.6 — aplicación y verificaciones

La 1.5 fue confirmada por el usuario. Esta entrega prepara cloud conservando SQL y pantallas. Faltan cuentas, publicación y evidencia HTTPS. No avanzar a 2.1.

## Aplicar el parche en CMD

Una línea a la vez; detenerse ante errores. Parche contra el commit 8efb28d de 1.5. No aplicar dos veces.

```bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
git status --short
set "PATCH=C:\Users\Stev\Documents\Codex\2026-09-06\master-prompt-sistema-enterprise-de-tickets-3\outputs\subetapa-1.6.patch"
git apply --check "%PATCH%"
git apply "%PATCH%"
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run check
npm.cmd run cloud:test
npm.cmd run cloud:test:integration
```

Docker Desktop debe estar activo para el último comando. Crea un proyecto aleatorio independiente, prueba cloud-ops con PostgreSQL 17, prepara/restaura dos veces y elimina únicamente ese entorno. No utiliza la base local ni sus claves.

## Regresión esencial

```bat
npm.cmd run api:build
npm.cmd run api:test
npm.cmd run web:build
npm.cmd run web:check
npm.cmd run web:test
npm.cmd run web:smoke
```

El smoke usa un backend simulado para comprobar caída y recuperación. No acredita conexión cloud. SQL 0001 y 0002 se reutilizan sin modificar checksums.

## GitHub

Tras aprobar las pruebas:

```bat
git diff --check
git add .gitattributes .github/workflows/ci.yml README.md docs/CLOUD.md docs/ROADMAP.md docs/SUBETAPA-1.6.md docs/VALIDATION-1.6.md package.json package-lock.json apps/api/Dockerfile apps/api/src/infrastructure/redis-probe.ts apps/web/vercel.json infra/cloud scripts/cloud-db.mjs scripts/cloud-check.mjs scripts/cloud-integration.mjs scripts/lib/cloud-postgres.mjs scripts/lib/cloud-schema.mjs scripts/lib/cloud-health.mjs scripts/test/cloud.test.mjs
git diff --cached --stat
git commit -m "feat(cloud): prepare Railway and Vercel deployment with restore checks"
git push -u origin HEAD
```

El add enumera solo esta entrega. Confirmar Infrastructure CI en verde sobre el commit: ahora incluye restauración real en contenedores. Nunca subir .env, dumps, claves ni tokens.

## Despliegue y cierre

Seguir [CLOUD.md](CLOUD.md): cuentas → Postgres/Redis → cloud-ops → API → Vercel → verificación pública. Registrar commit de ambos despliegues, URLs y resultados.

- [ ] cloud:test:integration y CI aprobados con Docker real.
- [ ] cloud-ops termina con código 0; restauración y respaldos persistentes verificados.
- [ ] Portal y tablero HTTPS sin login del proveedor, con API disponible.
- [ ] cloud:check pasa sus 12 verificaciones también después de reiniciar los servicios de datos.

Si falta cualquiera, **SUBETAPA AÚN NO ESTÁ LISTA**. Resultados y límites: [VALIDATION-1.6.md](VALIDATION-1.6.md).
