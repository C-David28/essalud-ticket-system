# Validación y evidencias — Subetapa 4.7

Fecha: 2026-10-10. Rama existente: `main`. Estado heredado: Model V1 aprobado y servicio 4.6 implementado. El usuario confirmó `ML_SERVICE_CHECK_OK`, contenedor saludable y ML Inference CI verde para **4.6**. Esa confirmación no verifica por sí sola la nueva integración 4.7.

## Verificaciones ejecutadas

| Verificación | Resultado observado |
| --- | --- |
| `api:build` | Aprobado, Prisma generate + TypeScript |
| `api:test` | 46/46: 27 heredadas y 19 de asistencia |
| `web:check` | TypeScript aprobado |
| Suite web completa, pool threads, un worker | 107/107 antes de las dos pruebas adicionales del proxy |
| Proxy final con UTF-8 y respuesta acotada | 45/45; las dos nuevas y las 43 previas aprobadas |
| `ml:integration:test` | 12/12 con conectores simulados, independientes de Docker |
| `ml:policy:check` | Reproducción exacta, fuentes OOF verificadas, constantes de Nest coincidentes |
| `ml:model:check` | `MODEL_V1_VERIFIED`, carga aprobada y predicción real; sin entrenamiento |
| `check` | Sintaxis de 35 scripts previos correcta; nuevos scripts ML comprobados por ejecución y tests |
| `ml:integration:setup` | Token conservado, solo cuatro variables en archivo ignorado |
| `ml:integration:config` | Compose combinado válido; no requiere acceso al motor |
| `git check-ignore` | `ml/outputs/service.env` e `integration.env` fuera de Git |

Las pruebas HTTP del backend usan un servidor local real con respuestas ML controladas para comprobar contrato, redirecciones, límites de bytes y timeout del cuerpo. Los conectores PostgreSQL/Redis son dobles; **46/46 no significa prueba contra PostgreSQL real**. Las pruebas React verifican el formulario real con servicios simulados: aceptar, cambiar, abstención, cancelación de respuesta tardía y envío exclusivamente humano.

Se corrigió un defecto detectado por pruebas: un validador sobre propiedades heredadas de `PickType` anulaba otros validadores personalizados de `class-validator`, incluyendo longitud. El DTO de asistencia declara sus restricciones explícitamente. No se modificó el DTO ni el flujo CRUD anteriores.

La selección del umbral no carga ni reentrena Model V1 y no reabre el holdout. La medición 93/97 sobre OOF es de selección, no de evaluación independiente de la nueva política. Ver [limitaciones por categoría y fold](ASSISTANCE-POLICY-4.7.md).

## Límites y comprobación pendiente

Docker Desktop responde acceso denegado al named pipe desde este entorno. `ml:integration:status` no pudo ejecutarse y el chequeo del flujo no pasó de la primera sugerencia pública. No se afirma haber comprobado aquí Docker 4.7, PostgreSQL operativo o el flujo completo.

`web:build` encontró un error de permisos de Windows al canonicalizar `jsc.baseUrl` desde SWC al cargar `next.config.ts`. Ocurrió también en una copia sin secretos dentro del workspace. TypeScript y las pruebas sí pudieron ejecutarse. No se alteraron las versiones/configuración de Next para ocultar esta restricción. El build exacto debe comprobarse con `ml:integration:up` en Docker/Linux o `web:build` en la consola del usuario.

Se solicitó al usuario ejecutar la comprobación Docker 4.7. Hasta recibir ese resultado:

- [x] Implementación, pruebas locales y configuración Compose revisadas.
- [ ] Build exacto de producción API/web/ML en Docker confirmado.
- [ ] `ml:integration:check`: Next → Nest → ML real y persistencia/auditoría PostgreSQL confirmados.
- [ ] `ml:integration:check -- --unavailable`: creación manual con ML detenido confirmada.
- [ ] `demo:check` con la integración iniciada confirmado.
- [ ] Demostración manual: aceptar/cambiar/abstenerse y ticket consultable.
- [ ] Commit publicado y Infrastructure CI **4.7** verde; artefactos guardados.

Los comandos y capturas están en [la guía 4.7](SUBETAPA-4.7.md). El checker deja recibos sin textos ni secretos; crea/elimina solo su ticket temporal, manteniendo auditoría. No modifica los 200 ejemplos sintéticos ni los 20 tickets DEMO originales.

Estado: **implementada; validación integral pendiente**. La siguiente subetapa sería 4.8, después de confirmar lo anterior y recibir autorización explícita.
