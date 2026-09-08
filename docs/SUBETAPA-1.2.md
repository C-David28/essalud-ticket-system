# Subetapa 1.2 — guía acompañada

Objetivo: instalar y verificar redes, centros y áreas con aislamiento por red en tu PostgreSQL existente. Ejecuta un paso a la vez. Si aparece un error, detente y comparte el comando y la salida; no avances a 1.3.

Esta guía usa CMD, la consola que mostraste. No requiere abrir PowerShell ni ejecutar como administrador.

## Paso 1. Aplicar los archivos de actualización

Se entrega un parche Git que parte del commit `e82775d` de tu 1.1. El parche no contiene `.env`, `.git`, respaldos ni cambios en `compose.yaml`. Su comprobación se realizó contra tu carpeta actual sin modificarla.

El archivo `subetapa-1.2.patch` está en la carpeta de entregas de esta conversación. Si lo descargaste en otra ubicación, cambia únicamente la ruta de PATCH.

```bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
git status --short
set "PATCH=C:\Users\Stev\Documents\Codex\2026-09-06\master-prompt-sistema-enterprise-de-tickets-3\outputs\subetapa-1.2.patch"
git apply --check "%PATCH%"
```

Resultado esperado: `git status --short` vacío antes de actualizar y `git apply --check` sin salida ni errores. Si aparecen cambios previos, revisarlos antes de aplicar; no descartarlos.

Solo después de esa comprobación:

```bat
git apply "%PATCH%"
npm.cmd run check
git status --short
```

Resultado esperado: `OK: metadatos y sintaxis de 9 scripts...`. Git mostrará archivos modificados y nuevos propios de la entrega. Si el parche informa que no aplica, no usar opciones de rechazo ni intentar forzarlo; puede que ya esté instalado. Comprobar la salida primero.

El ZIP completo es una alternativa para inspección o instalación nueva. Para actualizar tu copia existente, usar el parche facilita conservar tus archivos locales.

## Paso 2. Confirmar infraestructura

```bat
npm.cmd run infra:config
npm.cmd run infra:up
npm.cmd run infra:check
```

Esperado: configuración sin errores, ambos servicios saludables y el mismo mensaje OK de PostgreSQL y Redis que obtuviste en 1.1.

## Paso 3. Respaldo previo

```bat
npm.cmd run db:backup
```

Esperado: `OK: backup creado y catalogo legible: backups/before-migration-...dump`.

El script ejecuta pg_dump, comprueba la cabecera PGDMP y que pg_restore pueda leer su catálogo, y guarda un archivo nuevo sin sobrescribir respaldos previos. El límite del script es 64 MiB de salida para esta base piloto inicial; una base mayor requiere un respaldo por streaming. El archivo está excluido de Git. No es una prueba completa de restauración. Conservarlo.

## Paso 4. Ejecutar migración

```bat
npm.cmd run db:migrate
```

Esperado:

```text
NOTICE: APPLIED: 0001_multi_tenant
OK: migraciones verificadas por checksum.
```

El comando aplica el esquema, los roles y el historial en una transacción. Un error revierte la ejecución completa de ese intento. No edites `0001_multi_tenant.sql` después de aplicarlo.

## Paso 5. Comprobar repetibilidad e historial

```bat
npm.cmd run db:migrate
npm.cmd run db:status
```

La segunda ejecución debe mostrar `SKIP: 0001_multi_tenant`. Es normal que PostgreSQL avise que el esquema de metadatos ya existe. El historial debe mostrar una fila con `0001_multi_tenant`, su checksum y fecha.

Un error de checksum significa que el archivo aplicado cambió. Restaurar el archivo original y revisar la diferencia; no borrar el historial ni recalcular el checksum en la base para ocultar el cambio.

## Paso 6. Probar aislamiento e integridad

```bat
npm.cmd run db:check
```

Esperado: 22 avisos `PASS:` y esta línea final:

```text
OK: 22 verificaciones multi-tenant; datos ficticios revertidos.
```

Las pruebas verifican RLS forzado, rol restringido, ausencia de acceso sin tenant, lecturas y mutaciones cruzadas, claves foráneas compuestas, códigos únicos, tipo válido, borrado restringido, operaciones legítimas y limpieza del contexto. Los datos sintéticos se revierten al finalizar. Ningún centro institucional real se carga en esta subetapa.

Si una prueba falla, psql termina con error y Node devuelve código distinto de cero. No considerar una salida con algunos PASS como una ejecución aprobada.

## Paso 7. Commit, después de aprobar las verificaciones

```bat
git diff --check
git check-ignore .env
git add .
git diff --cached --stat
git commit -m "feat(db): add multi-tenant organizational schema and isolation checks"
```

`git check-ignore .env` debe mostrar `.env`. El resumen del commit no debe incluir `.env` ni `backups/`.

## Paso 8. GitHub y CI

Tu repositorio local todavía no tiene origin. Crear en tu cuenta personal un repositorio privado llamado `essalud-ticket-system`, sin README ni otros archivos iniciales. Sustituir TU_USUARIO:

```bat
git remote add origin https://github.com/TU_USUARIO/essalud-ticket-system.git
git push -u origin main
```

Si origin ya existe cuando llegues a este paso, comprobar `git remote -v` y no volver a añadirlo. Si el remoto tiene commits propios, no usar force push; revisar la integración.

En GitHub: abrir el repositorio → Actions → Infrastructure CI → última ejecución. Deben aprobarse el arranque, respaldo, migración, repetición, aislamiento e historial. El flujo no despliega servicios cloud.

## Punto de cierre

Compartir las salidas de `db:migrate` (primera y segunda ejecución), `db:status`, `db:check` y el resultado de CI. Hasta verificarlas, la 1.2 queda pendiente de aceptación en tu Docker. El siguiente trabajo será 1.3: audit logs transaccionales, sin implementarlos antes de cerrar esta revisión.

El despliegue público permanece en 1.6. [CLOUD.md](CLOUD.md) documenta cómo transportar el esquema a ese entorno cuando existan API y frontend.
