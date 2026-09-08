# Estado actualizado de validación

La evidencia histórica siguiente corresponde a las primeras entregas. El usuario confirmó posteriormente las subetapas 1.2 y 1.3 en Docker. Estado vigente y límites de 1.4: [VALIDATION-1.4.md](VALIDATION-1.4.md).

# Evidencia de validación

## Infraestructura 1.1

El usuario compartió la ejecución correcta de env:init, check, infra:config, infra:up e infra:check. PostgreSQL y Redis aparecen Healthy, y la comprobación confirmó conexión SQL autenticada y rechazo Redis sin clave. El repositorio en Pictures conserva el commit e82775d, sin cambios pendientes y sin remoto configurado al revisarlo.

## Entrega 1.2

La migración y el SQL de comprobación se ejecutaron en una instancia temporal PGlite 0.3.15 con motor PostgreSQL 17.5. Es una compilación embebida de PostgreSQL; no equivale a haber ejecutado Docker Compose en el equipo del usuario.

Resultados verificados:

- Aplicación de la migración con historial y SHA-256.
- Repetición sin duplicar objetos ni registros.
- Las 22 verificaciones de aislamiento y restricciones completas.
- Ausencia de filas sintéticas retenidas al terminar.
- Rechazo de checksum modificado.
- Reversión de tablas, roles e historial ante un fallo introducido durante la migración en una base aislada.
- Lectura estructural YAML de Compose y GitHub Actions.
- Sintaxis JavaScript de todos los scripts.

Los paquetes empleados en esa prueba están en work/, fuera del proyecto y de la entrega; no añaden dependencias a la aplicación.

Pendiente en el equipo del usuario: pg_dump y pg_restore dentro del contenedor, ejecución de los scripts mediante Docker/psql, las 22 verificaciones contra su volumen real y GitHub Actions. El script de respaldo verifica formato y catálogo; no demuestra una restauración completa.

La subetapa 1.2 no se declara cerrada hasta revisar esos resultados con el usuario. No se ha desplegado cloud ni implementado la auditoría de 1.3.
