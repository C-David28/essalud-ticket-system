# Validación y evidencias — subetapa 4.6

Fecha local: 2026-10-10 (America/Lima). Base heredada: commit `3e788b8`, rama `main`. Modelo: `ticket-category-model-v1.0.0`.

## Resultado implementado

API de inferencia independiente con FastAPI 0.143.0 y Uvicorn 0.54.0, Python 3.12. Reutiliza el loader aprobado de 4.5 y los tres archivos de Model V1, sin reentrenar ni abrir la prueba final. El servicio no dispone de conectores a PostgreSQL/Redis y no crea tickets. Dataset V1 y los 20 tickets DEMO operativos conservan su separación.

Se eligió Python para ejecutar directamente el pipeline científico ya aprobado. FastAPI aporta validación y OpenAPI; Uvicorn ejecuta HTTP. Un proceso persistente `spawn` carga el modelo una sola vez. Se admite una inferencia en curso; solicitudes simultáneas reciben `503 ML_BUSY`, evitando una cola sin límite. Un intercambio JSON en hilo controlado permite aplicar el deadline también al envío bloqueado de Windows. Al vencer, el padre termina el proceso, descarta el canal y responde `504`; readiness queda `503` hasta reinicio. Los tiempos de cierre del proceso/hilo son acotados y se añaden al deadline de inferencia. No hay recarga automática en esta subetapa.

`POST /v1/predict` recibe solamente título y descripción; `GET /v1/model` devuelve versión/categorías. Ambos exigen `X-ML-Token`. `/health/live` y `/health/ready` son abiertos. Límites: título 5–200, descripción 10–5000, UTF-8 válido, JSON hasta 32 KiB, recepción del cuerpo hasta cinco segundos e inferencia predeterminada hasta dos segundos. Respuestas inválidas, modelo ausente y fallos tienen códigos controlados. Los errores de validación no repiten la entrada. Logs contienen ruta controlada, estado, correlación y duración, sin textos/tokens/query strings.

Se conserva el margen SVM: `score_type=raw_decision_margin_not_probability`, `probability=null`, `operational_threshold=null`. No se inventa confianza calibrada ni un umbral. Modelo entrenado con datos sintéticos académicos, sin validación institucional.

Contenedor separado: `compose.ml.yaml`, proyecto `essalud-ml-local`, Python 3.12 slim, usuario 10001, filesystem de solo lectura, tmpfs, capacidades eliminadas y puerto publicado únicamente en loopback. El contexto Docker usa una allowlist propia para excluir datasets, venvs, secretos y código operativo. No se modifican Dockerfiles ni Compose del sistema de tickets.

## Comprobaciones ejecutadas

- Entorno aislado Python 3.12.14: dependencias runtime fijadas, conservando los nueve pins de carga de 4.5. Dependencias de pruebas separadas. `ml:service:python:setup` ejecutado desde cero en `ml/outputs/service-environment/.venv`: versiones verificadas y `pip check` correcto. Las 28 pruebas y el smoke HTTP real se repitieron con el launcher por defecto en ese entorno del repositorio, sin `ML_SERVICE_PYTHON` externo.
- **28 pruebas ML aprobadas**: 20 HTTP/ASGI/cancelación y ocho con procesos reales. Incluyen token ausente/erróneo/duplicado/Unicode; campos, límites, espacios, JSON inválido y surrogate no pareado; salud/docs; contrato y salida inválida; logs sin datos; concurrencia y cancelación de la solicitud con cierre del proceso; cuerpos fragmentados, Content-Length falso/enorme, tamaño y plazo total de recepción; carga real, caída del hijo, timeout de startup, respuesta excesiva, timeout de envío bloqueado, terminación y nuevo proceso/canal.
- **HTTP real aprobado**: servidor Uvicorn nuevo en puerto efímero, modelo aprobado, live/ready 200, metadata 200, acceso sin token 401, entrada inválida 422 y cuatro inferencias reales 200. Servidor cerrado limpiamente. Recibo local ignorado: `ml/outputs/service-check.json`. Estos ejemplos comprueban funcionamiento; no son una nueva evaluación de generalización.
- Márgenes observados para los cuatro ejemplos del checker: SOPORTE `-0.107617`, REDES `0.463997`, INFRAESTRUCTURA `-0.211461`, BIOMEDICO `0.445266` (redondeados). Un margen negativo es válido; no es un porcentaje.
- `ml:model:check`: `MODEL_V1_VERIFIED`, predicción real; artefacto SHA-256 `b21536dc47439b428a9a182d784e1798af8611493ea6e756e53ece9f15528213` conservado.
- `ml:data:check`: 200 registros, 50 por categoría, 40 familias, 37 grupos; hashes correctos.
- `check`: metadatos/sintaxis de los 35 scripts generales aprobados; launcher ML adicional comprobado con `node --check`.
- Regresión API: **27/27** pruebas existentes aprobadas.
- Regresión frontend: **26/26** pruebas, diez archivos, aprobadas con `npm run test --workspace @essalud/web -- --pool=threads --maxWorkers=1 --no-file-parallelism`. El comando normal tuvo primero un fallo de arranque de workers de Vitest en este entorno; no se cambió configuración ni código frontend para repetirlo de forma secuencial.
- `ml:service:setup` conserva el token al repetirlo; `git check-ignore ml/outputs/service.env` confirma exclusión. No se imprimió la credencial.
- `ml:service:config`: Docker Compose valida la configuración sin expandir/imprimir secretos.
- Resolución pip para Python 3.12/Linux x86_64: los 23 pins runtime tienen wheels compatibles y la resolución completa terminó correctamente. Esto **no** equivale a construir/ejecutar la imagen.

Starlette emitió una advertencia de deprecación para el cliente HTTPX de pruebas; todas las pruebas HTTP/ASGI pasaron. HTTPX sólo se instala en el entorno de pruebas, no en la imagen runtime.

## Verificaciones externas pendientes

El usuario confirmó que Docker Desktop está abierto. El entorno del agente no tiene acceso al named pipe del motor Linux; la solicitud específica de acceso al pipe no pudo ser representada por la herramienta. **No se afirma que la imagen haya sido construida ni que el contenedor esté healthy.** Se pidió al usuario ejecutar los comandos de la guía y aportar `ml:service:up`, `ml:service:check` y `ml:service:status`.

Se añadió **ML Inference CI**, separado de los workflows existentes, con pruebas, HTTP real y construcción/health/predicciones del contenedor Linux. Aún no se ha ejecutado en GitHub durante esta subetapa. Publicación del commit y comprobación Actions pendientes del usuario. No se ejecutan Colab, migraciones, Railway/Vercel ni despliegue público en 4.6.

## Evidencias y cierre

Guardar salida de 28 pruebas, salida `ML_SERVICE_CHECK_OK`, readiness/version, estado healthy del contenedor cuando se compruebe, respuesta JSON de predicción, rechazo 401/422 sin datos privados, commit y Actions real. Swagger puede mostrar el token en el curl: capturar únicamente cuerpo ficticio/respuesta, ocultando headers y credenciales.

Guía completa: [SUBETAPA-4.6.md](SUBETAPA-4.6.md). **API implementada y verificada localmente; cierre pendiente de verificar el contenedor real.** No avanzar a 4.7 sin autorización del usuario.
