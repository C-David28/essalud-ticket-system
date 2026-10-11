# Subetapa 4.6 — Servicio independiente de inferencia ML

Esta subetapa convierte el modelo aprobado de 4.5 en una API local. No entrena otro modelo ni incorpora todavía el botón de sugerencia en el portal. La integración con NestJS y Next.js corresponde a 4.7.

El servicio recibe únicamente `titulo` y `descripcion`. Devuelve una categoría sugerida, un margen numérico del clasificador y la versión del modelo. No crea tickets, no consulta PostgreSQL ni Redis y no cambia estadísticas, mapas o auditoría.

## Qué estamos ejecutando

```text
Cliente de prueba → HTTP local → FastAPI → proceso de inferencia
                                              ↓
                                 Modelo V1 aprobado de 4.5
                                              ↓
Cliente de prueba ← JSON de sugerencia ← FastAPI
```

FastAPI atiende las solicitudes HTTP y valida los datos. Uvicorn ejecuta el servidor con un solo worker ASGI. Un proceso separado carga el modelo aprobado y realiza las inferencias. El proceso usa `spawn`, compatible con Windows y Linux, y se comunica mediante mensajes JSON acotados.

Se permite una inferencia en curso. Una segunda solicitud simultánea recibe `503` con el código `ML_BUSY`: no se acumula una cola de trabajo. El límite predeterminado de inferencia es de dos segundos. Si vence, se termina el proceso y el servicio queda no preparado hasta reiniciarlo. En esta entrega no existe recarga automática del modelo.

El artefacto, sus dependencias científicas y sus hashes de aprobación se reutilizan desde 4.5. Un modelo alterado o incompatible no debe superar la verificación de readiness.

## Contrato HTTP

| Ruta | Acceso | Función |
| --- | --- | --- |
| `GET /health/live` | Sin token | Indica que el servidor está funcionando. |
| `GET /health/ready` | Sin token | Responde `200` cuando el modelo está disponible; `503` si no lo está. |
| `GET /v1/model` | Header `X-ML-Token` | Permite consultar la identificación del modelo. |
| `POST /v1/predict` | Header `X-ML-Token` | Solicita una clasificación. |

Ejemplo de cuerpo de predicción, completamente ficticio:

```json
{
  "titulo": "Impresora local no responde",
  "descripcion": "La impresora de demostración no imprime desde el equipo de prueba y la cola queda detenida."
}
```

Los campos deben ser cadenas de texto: título entre 5 y 200 caracteres y descripción entre 10 y 5000, contando también los límites antes de recortar espacios. No se aceptan campos adicionales. La validación rechaza textos vacíos o formados únicamente por espacios. El cuerpo HTTP tiene un límite de 32 KiB y un plazo de recepción de cinco segundos.

La respuesta utiliza las categorías del dominio: `SOPORTE`, `REDES`, `INFRAESTRUCTURA` y `BIOMEDICO`.

**El score no es una probabilidad ni un porcentaje de confianza.** LinearSVC devuelve un margen bruto. La respuesta mantiene `score_type: raw_decision_margin_not_probability`, `probability: null` y `operational_threshold: null`. No se ha definido todavía un umbral de aceptación. La decisión final seguirá siendo humana.

Los errores tienen códigos controlados. No deben devolver el título, la descripción, el token, una ruta del equipo ni una traza interna.

## Arranque recomendado con Docker Desktop y CMD

### 1. Preparar Docker

Abre Docker Desktop y espera a que el motor figure en ejecución. Utiliza contenedores Linux, como en la infraestructura existente del proyecto.

Abre una ventana nueva de **CMD** y ejecuta:

```cmd
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
docker version
docker compose version
```

`docker version` debe mostrar tanto Client como Server. Si no aparece Server, termina de iniciar Docker Desktop antes de continuar.

### 2. Preparar el servicio y su configuración local

```cmd
npm.cmd run ml:service:setup
```

Este comando no instala Python: genera o conserva la credencial privada local en:

```text
ml/outputs/service.env
```

Este archivo está excluido de GitHub y del contexto de construcción Docker. No lo publiques, no lo pegues en conversaciones y no incluyas su contenido en capturas. El token es una credencial entre servicios; no pertenece al navegador del portal institucional.

Para la opción Docker no necesitas instalar Python en Windows. El contenedor incluye Python 3.12 y las dependencias del servicio; las instrucciones sin Docker aparecen más abajo.

### 3. Validar la configuración de Docker

```cmd
npm.cmd run ml:service:config
```

El comando debe terminar con código de salida cero. Utiliza esta validación sin imprimir la configuración expandida: la salida completa de `docker compose config` podría incluir variables privadas.

### 4. Construir y arrancar

```cmd
npm.cmd run ml:service:up
```

En el primer arranque Docker descarga la imagen de Python e instala las dependencias fijadas. Espera a que el comando termine. No ejecutes otra preparación de credenciales mientras esté construyendo.

El archivo `compose.ml.yaml` administra un proyecto independiente llamado `essalud-ml-local`. Sólo arranca el servicio ML. No levanta ni elimina los contenedores del sistema de tickets.

El puerto publicado es `127.0.0.1:8001`: puedes acceder desde esta PC, pero no es un enlace público para otros equipos. El contenedor ejecuta código con usuario sin privilegios y sistema de archivos de sólo lectura.

### 5. Verificar una predicción real

```cmd
npm.cmd run ml:service:check
npm.cmd run ml:service:status
```

El verificador lee la credencial local sin mostrarla y comprueba las rutas del servicio. Debe recibir una predicción real del modelo aprobado, con una categoría válida y su versión. No debe mostrar el token.

`ml:service:status` permite comprobar el estado del contenedor y su health check. Una categoría concreta o un score concreto no están garantizados para cualquier texto: son resultados del modelo, no valores escritos para la demostración.

### 6. Comprobar salud desde el navegador

Abre estas dos direcciones:

- `http://127.0.0.1:8001/health/live`
- `http://127.0.0.1:8001/health/ready`

Con el modelo cargado, ambas deben responder correctamente. En la pestaña Network de las herramientas del navegador puedes comprobar sus códigos HTTP. No necesitan token ni contienen datos operativos del sistema.

### 7. Consultar logs si hay un error

```cmd
npm.cmd run ml:service:logs
```

Conserva sólo mensajes de estado o error sin credenciales. Los logs del servicio deben contener eventos y códigos controlados, sin cuerpos de solicitudes. Si readiness responde `503`, revisa estos logs antes de concluir que el servicio está listo.

Si se produjo un timeout, el proceso de inferencia quedó detenido deliberadamente. Para volver a cargar el modelo:

```cmd
npm.cmd run ml:service:stop
npm.cmd run ml:service:up
npm.cmd run ml:service:check
```

No cambies el archivo de aprobación ni el artefacto para esconder un error de checksum o de compatibilidad.

### 8. Detener cuando termines

```cmd
npm.cmd run ml:service:stop
npm.cmd run ml:service:status
```

Esto detiene únicamente el servicio ML. Los datos y contenedores del sistema de tickets conservan su administración habitual.

## Demostración manual mediante Swagger local

La documentación interactiva está deshabilitada de manera predeterminada. La configuración local de Docker la habilita para demostrar este servicio de forma aislada.

1. Con el servicio comprobado, abre `http://127.0.0.1:8001/docs`.
2. Pulsa **Authorize**.
3. Abre `ml/outputs/service.env` privadamente en tu editor y copia únicamente el valor de `ML_SERVICE_TOKEN` al campo del header `X-ML-Token`. No agregues el texto `Bearer`.
4. Autoriza y cierra tanto el diálogo como el archivo antes de compartir pantalla.
5. Abre `POST /v1/predict`, pulsa **Try it out**, escribe el ejemplo ficticio anterior y pulsa **Execute**.
6. Muestra la categoría sugerida, `model_version` y la identificación del margen bruto. Explica que no se ha creado ningún ticket.
7. Si haces capturas de Swagger, incluye sólo el cuerpo ficticio y la respuesta. **Oculta el bloque curl, los headers y cualquier campo donde aparezca la credencial.**
8. Cambia el título a una cadena demasiado corta o añade un campo extra para mostrar un rechazo de validación sin revelar el texto en la respuesta de error.

Si no deseas manejar la credencial durante una exposición, utiliza `npm.cmd run ml:service:check`: realiza la llamada autenticada sin imprimirla.

No habilites CORS ni expongas este token en Next.js para acceder directamente desde el portal. La comunicación del sistema será NestJS → servicio ML en 4.7.

## Ejecución local sin contenedor, opcional

Usa esta alternativa sólo cuando el contenedor ML esté detenido, para evitar que ambos intenten ocupar el mismo puerto:

```cmd
npm.cmd run ml:service:setup
npm.cmd run ml:service:python:setup
npm.cmd run ml:service:start
```

La preparación Python requiere Python 3.12. Reutiliza la instalación de 4.5; si no se detecta, comprueba `py -0p` y configura `ML_PYTHON` con la ruta real. Se instala en `ml/outputs/service-environment/.venv`, sin alterar los entornos anteriores.

Mantén esa ventana abierta. En una segunda ventana de CMD situada en el repositorio, ejecuta `npm.cmd run ml:service:check`. Para detener el servidor iniciado directamente, vuelve a su ventana y pulsa **Ctrl+C**.

## Pruebas y criterio de cierre

```cmd
npm.cmd run ml:service:python:setup
npm.cmd run ml:service:test
npm.cmd run ml:service:smoke
npm.cmd run ml:model:check
npm.cmd run ml:data:check
npm.cmd run check
```

Las pruebas de esta subetapa deben comprobar predicción, validación, autenticación, respuesta controlada, límites de cuerpo, modelo no disponible, concurrencia, timeout y cierre del proceso. La verificación de 4.5 confirma que se mantiene el artefacto aprobado. La del dataset confirma que sigue separado de PostgreSQL operativo.

Los resultados concretos y el número real de pruebas se registran en la documentación de validación después de ejecutarlas. Esta guía describe el procedimiento; no sustituye esas ejecuciones ni afirma resultados que todavía no se han observado.

Para dar por completada 4.6 deben estar comprobados tanto el servicio aislado como el contenedor real. No es necesario volver a entrenar, ejecutar Google Colab, preparar la base de datos ni desplegar en Railway/Vercel durante esta subetapa.

## Evidencias para el informe

- Salida de las pruebas automatizadas, con su resultado real.
- Salida de `ml:service:check`, sin credenciales.
- Estado saludable del contenedor ML en `ml:service:status`.
- Respuesta de readiness y versión del modelo.
- Solicitud ficticia y predicción en Swagger, ocultando headers y curl.
- Ejemplo de entrada inválida rechazada y mensaje controlado.
- Diagrama del servicio independiente y referencia al artefacto de 4.5.

El origen del modelo continúa siendo un dataset sintético académico. Esta demostración no constituye validación institucional ni permite afirmar que el modelo tiene una probabilidad calibrada de acertar en incidencias reales.

Al completar las verificaciones, detenerse. La siguiente subetapa recomendada es **4.7: integración con NestJS y Next.js**, únicamente después de la autorización del usuario.

## GitHub y estado de publicación

El commit de esta entrega se prepara en la rama actual `main`, sin añadir cambios ajenos ni secretos. Para publicarlo, ejecuta `git push origin main`. En GitHub → Actions, comprueba **ML Inference CI** y los workflows existentes. El workflow nuevo ejecuta pruebas Python, HTTP real y construcción/validación del contenedor Linux; un archivo de workflow preparado no equivale a una ejecución aprobada. Guarda la ejecución verde después de observarla.

Referencias: [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/), [validación de cuerpos](https://fastapi.tiangolo.com/tutorial/body/), [multiprocessing Python 3.12](https://docs.python.org/3.12/library/multiprocessing.html) y [contextos Docker](https://docs.docker.com/build/building/context/#dockerignore-files).
