# Subetapa 1.3 — aplicación y verificación paso a paso

La 1.2 fue validada en el Docker del usuario: respaldo, APPLIED, SKIP, historial y 22 PASS. El checksum aplicado de 0001 es:

```text
037a8fe5c7ce820820f9cbdd4df7948c77a417577d2e8372788f562461167c07
```

La 1.3 agrega 0002_audit_logs.sql; no cambia 0001, .env, Compose ni los volúmenes. Los archivos entregados están preparados para actualizar exactamente la copia 0.2.0 revisada. No aplicar de nuevo el parche 1.2.

Ejecutar los pasos en CMD uno por uno. Si hay un error, detenerse y compartirlo; no continuar con el siguiente comando. No avanzar a 1.4 hasta confirmar el resultado en tu Docker.

## 1. Registrar la 1.2 antes de actualizar

Al revisar el proyecto, sus cambios todavía no tenían commit. Guardar esa subetapa aprobada:

```bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
git status --short
git diff --check
git check-ignore .env
git add .
git diff --cached --stat
git commit -m "feat(db): add multi-tenant organizational schema and isolation checks"
```

.env debe aparecer como ignorado y el resumen no debe incluir respaldos ni credenciales. Si ya hiciste este commit, omitir git add y git commit; revisar git log -1 --oneline. No usar git reset para limpiar cambios.

El error de propietario quedó resuelto con safe.directory para esta ruta. Si reaparece en tu cuenta, ejecutar:

```bat
git config --global --add safe.directory "C:/Users/Stev/Pictures/SISTEMA DE TICKET/essalud-ticket-system"
```

## 2. Aplicar el parche y verificar archivos

El parche está en la carpeta de entregas. Si se descargó en otra ubicación, ajustar PATCH:

```bat
set "PATCH=C:\Users\Stev\Documents\Codex\2026-09-06\master-prompt-sistema-enterprise-de-tickets-3\outputs\subetapa-1.3.patch"
git apply --check "%PATCH%"
```

Esperado: sin errores. Solo después:

```bat
git apply "%PATCH%"
npm.cmd run check
git status --short
```

Esperado: versión 0.3.0 y sintaxis correcta de 10 scripts. Si el parche no aplica, comprobar si ya fue aplicado; no forzarlo. El ZIP contiene el código completo para consulta o instalación nueva; para actualizar el piloto se recomienda el parche.

## 3. Infraestructura y respaldo previo

```bat
npm.cmd run infra:up
npm.cmd run infra:check
npm.cmd run db:backup
```

Esperado: servicios Healthy, comprobación de PostgreSQL/Redis correcta y nuevo archivo backups/before-migration-...dump con catálogo legible. Conservar también el respaldo de la 1.2. El catálogo legible no demuestra una restauración completa.

## 4. Instalar auditoría

```bat
npm.cmd run db:migrate
```

Esperado:

```text
SKIP: 0001_multi_tenant
APPLIED: 0002_audit_logs
OK: migraciones verificadas por checksum.
```

Un error revierte este intento. No cambiar las migraciones ya registradas para ocultar errores de checksum.

## 5. Repetición e historial

```bat
npm.cmd run db:migrate
npm.cmd run db:status
```

La repetición debe mostrar SKIP para ambas migraciones. El historial debe tener dos filas: 0001_multi_tenant y 0002_audit_logs. El checksum de 0001 debe ser exactamente el indicado al principio de la guía.

## 6. Regresión y auditoría

```bat
npm.cmd run db:check
npm.cmd run db:audit:check
```

Resultados esperados:

- db:check: 22 mensajes PASS y el mismo OK multi-tenant de la 1.2.
- db:audit:check: 34 mensajes AUDIT PASS y la confirmación siguiente.

```text
OK: auditoria verificada; datos ficticios revertidos.
```

Son normales los NOTICE, UUID temporales y ROLLBACK de las suites. Algunas pruebas intentan acciones prohibidas y esperan su rechazo; estos resultados aparecen como AUDIT PASS con su SQLSTATE. Un ERROR sin manejar o la ausencia del OK final no es una ejecución aprobada.

La auditoría se valida para INSERT, UPDATE, DELETE, contexto de actor, aislamiento, rollback, rechazo de manipulación, conservación histórica y fallo del almacenamiento. Las pruebas dejan intactos los datos existentes.

## 7. Commit de 1.3 y GitHub, después de aprobar las pruebas

```bat
git diff --check
git add .
git diff --cached --stat
git commit -m "feat(audit): add transactional append-only audit logs"
git remote -v
```

Si ya existe origin y corresponde a tu cuenta personal:

```bat
git push -u origin main
```

Si aún no hay remoto, crear en GitHub un repositorio privado vacío llamado essalud-ticket-system, sin README inicial. Sustituir TU_USUARIO:

```bat
git remote add origin https://github.com/TU_USUARIO/essalud-ticket-system.git
git push -u origin main
```

Si el remoto tiene historia propia, revisar su integración antes de publicar; no usar force push. En GitHub → Actions, Infrastructure CI debe aprobar infraestructura, respaldo, migraciones, 22 verificaciones de aislamiento y 34 de auditoría.

## 8. Cierre de la subetapa

Compartir las salidas de check, db:migrate (ambas ejecuciones), db:status, db:check y db:audit:check. Registrar también el commit y resultado de CI.

La implementación está verificada en PostgreSQL 17.5 embebido, pero hasta aprobar estos resultados en Docker la 1.3 queda pendiente de cierre. El siguiente trabajo será 1.4: backend NestJS y adaptación de Prisma a las migraciones existentes.

El despliegue público sigue previsto para 1.6. [CLOUD.md](CLOUD.md) y [AUDIT.md](AUDIT.md) detallan la preparación de roles, restauración y retención.
