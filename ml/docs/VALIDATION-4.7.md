# Validación y evidencias — Subetapa 4.7

Fecha: 2026-10-10. Rama existente: `main`. Estado heredado: Model V1 aprobado y servicio 4.6 implementado. El usuario confirmó `ML_SERVICE_CHECK_OK`, contenedor saludable y ML Inference CI verde para **4.6**. Esa confirmación no verifica por sí sola la nueva integración 4.7.

## Verificaciones ejecutadas

| Verificación | Resultado observado |
| --- | --- |
| `api:build` | Aprobado, Prisma generate + TypeScript |
| `api:test` | 46/46: 27 heredadas y 19 de asistencia |
| `web:check` | TypeScript aprobado |
| Suite web completa, pool threads, un worker | 107/107 antes de las dos pruebas adicionales del proxy |
| Proxy final con UTF-8, respuesta acotada y Origin real de Next | 81/81; conserva las 45 previas y añade 36 casos de regresión de Origin/Host |
| `ml:integration:test` | 18/18 con conectores simulados; incluye diagnósticos seguros y conservación del primer fallo |
| `ml:policy:check` | Reproducción exacta, fuentes OOF verificadas, constantes de Nest coincidentes |
| `ml:model:check` | `MODEL_V1_VERIFIED`, carga aprobada y predicción real; sin entrenamiento |
| `check` | Sintaxis de 35 scripts previos correcta; nuevos scripts ML comprobados por ejecución y tests |
| `ml:integration:setup` | Token conservado, solo cuatro variables en archivo ignorado |
| `ml:integration:config` | Compose combinado válido; no requiere acceso al motor |
| `git check-ignore` | `ml/outputs/service.env` e `integration.env` fuera de Git |

Las pruebas HTTP del backend usan un servidor local real con respuestas ML controladas para comprobar contrato, redirecciones, límites de bytes y timeout del cuerpo. Los conectores PostgreSQL/Redis son dobles; **46/46 no significa prueba contra PostgreSQL real**. Las pruebas React verifican el formulario real con servicios simulados: aceptar, cambiar, abstención, cancelación de respuesta tardía y envío exclusivamente humano.

Se corrigió un defecto detectado por pruebas: un validador sobre propiedades heredadas de `PickType` anulaba otros validadores personalizados de `class-validator`, incluyendo longitud. El DTO de asistencia declara sus restricciones explícitamente. No se modificó el DTO ni el flujo CRUD anteriores.

La selección del umbral no carga ni reentrena Model V1 y no reabre el holdout. La medición 93/97 sobre OOF es de selección, no de evaluación independiente de la nueva política. Ver [limitaciones por categoría y fold](ASSISTANCE-POLICY-4.7.md).

## Diagnóstico y corrección del HTTP 403

La ejecución original del checker devolvió **HTTP 403**, código controlado `ORIGIN_REJECTED`, en `sugerencia pública sin cookie`. Nest y el servicio ML respondieron **200** por separado, con Model V1 y contrato de score válidos. El proxy de tickets de Next respondió 200 sin cookie, confirmando el acceso público controlado al backend. Se compararon las variables configuradas sin publicar valores secretos; no se detectó desincronización de claves.

Next 16.3.4 construye la URL de petición a partir de la dirección de escucha `0.0.0.0:3000` y normaliza loopback a `localhost`. La guarda anterior comparaba `Origin` público directamente contra esa URL interna. La guarda corregida compara el origen canónico con `Host` y el protocolo efectivo; rechaza autoridades malformadas y `Sec-Fetch-Site` ajeno, e ignora `X-Forwarded-Host`. No se alteraron las guardas de Nest, permisos, tokens, validación de textos ni contrato ML.

Un harness aislado con las clases instaladas de Next pasó **11/11** y reprodujo **403 anterior → 200 corregido**. La suite permanente utiliza `NextRequest` real. Tras reconstruir únicamente web en Docker desde CMD, el flujo completo real obtuvo **`ML_INTEGRATION_CHECK_OK`**: sugerencia pública/autenticada, abstención, elección manual distinta a la sugerencia, creación/lectura, PostgreSQL, auditoría INSERT/DELETE y eliminación del ticket propio. Se guardó `ml/outputs/integration-recheck-tcp-available.json`.

Con ML realmente detenido se obtuvo también **`ML_INTEGRATION_CHECK_OK` en modo `--unavailable`**. Las sugerencias públicas y autenticadas devolvieron HTTP 503 con sugerencia nula, mientras la creación manual devolvió 201. La lectura, persistencia, auditoría y eliminación del ticket propio pasaron. Se guardó `ml/outputs/integration-recheck-tcp-unavailable.json`; no se simularon respuestas HTTP ni se alteró el modelo para provocar la caída.

Docker Desktop deniega acceso al named pipe desde el sandbox del agente. Para verificar PostgreSQL se ejecutaron los mismos SELECT del checker mediante su conector inyectable, sobre el puerto TCP local existente, con sesión de solo lectura y parámetros UUID. Las llamadas HTTP fueron reales, sin dobles. No se cambió el probe Docker predeterminado del comando. También se verificaron los recibos del comando estándar generado desde CMD: `integration-check.json` e `integration-unavailable-check.json`, ambos con ticket ausente y auditoría INSERT/DELETE confirmada.

En HTTP real, tanto `127.0.0.1` como `localhost` rechazaron Origin ausente, Origin ajeno, `X-Forwarded-Host` forjado y `Sec-Fetch-Site: cross-site` con 403. El mismo origen con cuerpo inválido devolvió 400; todas las respuestas conservaron `no-store`. `demo:check` aprobó interfaz, proxy protegido, asignación por carga, persistencia y SSE. El SHA-256 de `model.skops` coincide con la aprobación; no se ejecutaron setup, seeds, migraciones ni rotación de credenciales durante esta corrección.

Tras restaurar ML se repitió el chequeo completo, nuevamente aprobado. La readiness de Nest devolvió 200 durante la caída y después de restaurar ML. Nest sin clave de API y ML sin token rechazaron solicitudes con 401, confirmando que la corrección no desactiva sus guardas.

## Límites y comprobación pendiente

`web:build` encontró un error de permisos de Windows al canonicalizar `jsc.baseUrl` desde SWC al cargar `next.config.ts`. Ocurrió también en una copia sin secretos dentro del workspace. TypeScript y las pruebas sí pudieron ejecutarse. No se alteraron las versiones/configuración de Next para ocultar esta restricción. El build exacto debe comprobarse con `ml:integration:up` en Docker/Linux o `web:build` en la consola del usuario.

Estado después de la corrección:

- [x] Implementación, pruebas locales y configuración Compose revisadas.
- [x] Build Docker y contenedores saludables comunicados por el usuario; reconstrucción web confirmada por el usuario.
- [x] Next → Nest → ML real y persistencia/auditoría PostgreSQL confirmados por HTTP/TCP y recibo del comando estándar desde CMD.
- [x] `--unavailable`: creación manual con ML realmente detenido y PostgreSQL/auditoría confirmados por HTTP/TCP y recibo del comando estándar desde CMD.
- [x] ML restaurado y chequeo completo repetido con éxito.
- [x] `demo:check` con la integración iniciada confirmado.
- [ ] Demostración manual: aceptar/cambiar/abstenerse y ticket consultable.
- [ ] Commit publicado y Infrastructure CI **4.7** verde; artefactos guardados.

Los comandos y capturas están en [la guía 4.7](SUBETAPA-4.7.md). El checker deja recibos sin textos ni secretos; crea/elimina solo su ticket temporal, manteniendo auditoría. No modifica los 200 ejemplos sintéticos ni los 20 tickets DEMO originales.

Estado técnico local: **integración y fallback verificados contra los servicios reales; fallo corregido y ML restaurado**. La demostración manual y publicación/CI conservan su verificación propia. La siguiente subetapa sería 4.8 únicamente con autorización explícita.
