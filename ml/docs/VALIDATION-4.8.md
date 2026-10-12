# Validación y evidencias — Subetapa 4.8

Fecha de registro: 2026-10-11. Rama existente: `main`. Base heredada: `afb6129`, corrección de Origin y flujo 4.7 verificado. Esta subetapa no cambia Dataset V1, modelo, política de abstención, proveedores ni configuración pública.

## Resultado de las verificaciones ejecutadas

| Comprobación | Resultado observado |
| --- | --- |
| `api:build` | Aprobado: Prisma generate y TypeScript |
| `api:test` | **52/52** aprobadas; aplicación, DTO, permisos, filtros/resumen y adaptador ML |
| `web:check` | TypeScript aprobado después de las últimas correcciones |
| Suite web completa (`pool=threads`, un worker) | **172/172**, 15 archivos, incluyendo interfaz, proxy, ML, paginación, mapa, SSE y cambios de principal |
| `ml:integration:test` | **25/25**, tres modos, health independiente, historial/reapertura/cierre, diagnósticos y limpieza segura |
| `ml:service:test` | **28/28**, carga del modelo aprobado, HTTP, validación, límites, proceso de inferencia, timeout y modelo no disponible |
| `ml:data:check` | 200 registros, cuatro categorías con 50 cada una, 40 familias, 37 grupos; checksums originales correctos |
| `ml:policy:check` | Política aprobada reproducida, umbral −0.06; sin reentrenar ni reabrir la prueba final |
| SHA-256 de `model.skops` | `b21536dc47439b428a9a182d784e1798af8611493ea6e756e53ece9f15528213`, idéntico a la aprobación |
| `check`, sintaxis de los scripts nuevos | Aprobados |
| `ml:integration:config` | Compose combinado válido |
| Secretos locales | `.env`, API env/tickets y ambos env ML siguen ignorados por Git |
| Regresión SQL y API en Docker desechable | **17/17**, controles SQL aprobados; log real de CMD con final `OK` |
| Build API/web Docker y comprobaciones HTTP 4.8 reales | Pendientes de cargar las imágenes finales desde CMD |
| Infrastructure CI 4.8 | Configurado; publicación y ejecución remota pendientes |

Las pruebas unitarias HTTP de Nest usan el servidor local y respuestas ML controladas; no equivalen a integración con PostgreSQL real. Las pruebas del checker utilizan conectores simulados y las React utilizan servicios simulados. La suite Python carga y ejecuta el modelo aprobado, sin entrenarlo. La integración real ejecutada desde CMD se verificó mediante `ml/outputs/stage48-api-integration.log`: migraciones y regresión SQL, autenticación, Prisma/RLS, auditoría, Redis, CRUD, asignación, filtros/resumen y health con Redis detenido, con **17/17 y cero fallos**. El entorno desechable fue independiente de la base operativa.

El pool predeterminado de Vitest encontró una restricción de archivos temporales en el sandbox de Windows. La suite completa se ejecutó correctamente con `npm.cmd run test --workspace @essalud/web -- --pool=threads --maxWorkers=1`; no se alteró la configuración del proyecto para ocultar esa restricción. El build nativo de Next sigue sujeto al problema de permisos SWC registrado en 4.7; debe validarse con el build Docker/Linux.

## Defectos corregidos durante la revisión

- Un ticket fuera de la primera página ya no depende de que la lista lo haya descargado: el detalle consulta su UUID por separado.
- El mapa y las cantidades del tablero utilizan agregados autorizados de PostgreSQL, no una lista truncada.
- Búsqueda y cambios de filtros reinician la página de forma atómica; crear desde Historial vuelve a Trabajo activo.
- Un enlace de mapa hacia una sede ausente/sin coordenadas selecciona una sede disponible del catálogo autorizado; no consulta la página de una sede fuera de ese catálogo.
- Lista, resumen, detalle y SSE comparten un ámbito de caché que incluye principal y permisos. Las mutaciones tienen una clave por principal: una respuesta pendiente de A no actualiza la caché de B.
- El portal omite explícitamente el JWT de soporte aunque exista una cookie previa. Esta opción solo reduce permisos al principal público existente; no acepta JWT ni privilegios del navegador.
- Los lectores HTTP ML cancelan cuerpos rechazados, incompletos, lentos o excesivos y liberan recursos. No se cambia el contrato V1 ni se convierte el margen SVM en una probabilidad.
- Una prueba de búsqueda esperaba resultados antes del debounce de 300 ms; se corrigió la espera, manteniendo la búsqueda real.
- La primera corrida Docker detectó letras minúsculas en el código de sede del nuevo fixture. Se corrigió el código sintético a mayúsculas, conservando `centros_asistenciales_codigo_check`; la repetición completa aprobó las 17 pruebas, incluido el nuevo fixture.

## Separación y compatibilidad

No hay migraciones, cambios de esquema, seeds, rotación de credenciales ni entrenamiento. Los más de 100 fixtures de paginación se generan exclusivamente bajo `ESSALUD_DISPOSABLE_TEST=true` en `essalud_test`, nunca en la base operativa. El checker real crea y elimina únicamente su ticket temporal, validando su identidad y conservando auditoría. No elimina el historial para simplificar la pantalla; Resuelto puede reabrirse y Cerrado sigue siendo terminal.

La API conserva el listado anterior por defecto (`view=all`) y su contrato de páginas. Los filtros y resúmenes reutilizan el contexto, visibilidad y unidad de trabajo existentes; no permiten ampliar PROPIO/SEDE/RED ni el tenant. No se desactivan guardas, RLS, triggers ni autenticación.

## Evidencias que conservar

1. Consolas de las suites aprobadas y log de integración Docker desechable.
2. `robustness-available-check.json`, `robustness-unavailable-check.json`, `robustness-disabled-check.json`, sin secretos ni textos.
3. Tablero Trabajo activo/Historial, filtros y navegación; petición Network con parámetros, excluyendo cabeceras privadas.
4. Detalle histórico consultado desde mapa y reapertura de un Resuelto.
5. Sugerencia, abstención y creación manual con ML detenido/desactivado; readiness de la API conservada.
6. Artifact `stage-4.8-robustness-check` y Actions verde cuando se publique el commit.

El siguiente paso del roadmap es **4.9**, únicamente con autorización del usuario y aprobación de la alternativa antes de migrar. No se inicia en esta entrega.
