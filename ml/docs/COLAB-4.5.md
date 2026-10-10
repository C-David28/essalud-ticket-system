# Guía — modelo final, publicación controlada y reproducción, subetapa 4.5

Esta subetapa convierte el candidato aprobado de 4.4 en un artefacto identificado y verificable. **No despliega un servidor ni integra el modelo en la web.** Tampoco cambia Dataset V1, PostgreSQL, Redis, los tickets DEMO ni los entornos cloud.

La ejecución local de 4.4 consta en sus archivos; el usuario confirmó Colab y Actions. Esa confirmación humana debe distinguirse de una comprobación remota realizada por herramientas. No se vuelve a evaluar el test para producir el artefacto.

## 1. Qué se construye y qué se conserva

Modelo: `ticket-category-model-v1.0.0`. Receta seleccionada: TF-IDF combinado de palabras y caracteres + `LinearSVC(C=1)`, semilla 42. El protocolo sigue siendo `ticket-category-experiment-v1.0.0`.

**Se ajusta exclusivamente con los 160 registros de desarrollo, no con los 200.** Los 40 registros de ocho grupos finales permanecen fuera del ajuste. El notebook consulta las métricas guardadas de 4.4 como evidencia; no abre otra evaluación ni cambia el candidato usando el resultado del test.

Se mantienen los 18 pins científicos existentes y se agregan `skops==0.16.0`, `prettytable==3.18.0` y `wcwidth==0.9.2` para persistencia. El entorno de construcción usa Python 3.12 y 21 paquetes fijados; se instala en un venv propio, sin modificar paquetes globales de Colab.

La publicación local incluye:

- `ml/models/category-v1.0.0/model.skops`: pipeline completo, incluyendo vocabularios, IDF y clasificador.
- `metadata.json`: versión, receta, procedencia, métricas heredadas, hashes y dependencias.
- `verification.json`: comprobaciones de persistencia y carga.
- `MODEL-CARD.md`: objetivo, entradas/salidas, evidencia, usos y límites.
- `ml/modeling/approved-release.json`: hashes aprobados desde código revisado; no se obtiene de un ZIP arbitrario.

El score de SVM es un **margen**, no un porcentaje de confianza. No se ha validado calibración ni umbral de abstención. Esa política se completará antes de integrar ML; no inventar un porcentaje en la exposición.

## 2. Verificar localmente y publicar en GitHub

Desde CMD ejecuta:

```bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
py -3.12 --version
npm.cmd run ml:model:setup
npm.cmd run ml:model:check
npm.cmd run ml:model:test
npm.cmd run ml:model:notebook:check
```

Setup instala solo en `ml/outputs/model-environment/.venv`. Necesita Python 3.12 disponible e Internet para descargar paquetes; check/test no exigen Docker ni servicios cloud. Si no tienes Python 3.12, usa su [instalador oficial](https://www.python.org/downloads/release/python-31210/) para Windows con el launcher `py`, o realiza la reproducción opcional en Colab. Python global 3.14 no sirve para este modelo fijado. Si tienes otro ejecutable 3.12, indica su ruta real con `set "ML_PYTHON=ruta-completa-a-python.exe"` antes de setup. Los otros comandos prefieren después el venv creado.

Para reconstruir la receta sin alterar la publicación:

```bat
npm.cmd run ml:model:rebuild
```

El resultado queda en una carpeta nueva bajo `ml/outputs/`; no cambies hashes ni reemplaces el artefacto aprobado. `ml:model:check` debe imprimir `MODEL_V1_VERIFIED`; sus scores son márgenes, no porcentajes.

Si el launcher de Windows está instalado, puedes comprobarlo con:

```bat
py -3.12 --version
```

Si no reconoce Python, no cambies los pins ni instales otras versiones a ciegas. Puedes reproducir el experimento en Colab sin configurar Python local. Si vas a usar un intérprete local existente, `ML_PYTHON` debe indicar su ruta real; no reutilices variables del sistema como HOME. Conserva el mensaje de error para resolverlo antes de declarar verificación local aprobada.

Después de las comprobaciones y del commit preparado por esta entrega:

```bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
git log -3 --oneline
git status --short
git push origin main
```

No uses `git add .` para incluir artefactos temporales, cambios ajenos o notebooks con salidas. No fuerces el push si aparece un conflicto o falta de acceso.

En [GitHub](https://github.com/C-David28/essalud-ticket-system), comprueba notebook, Model Card, metadatos y commit. Revisa los checks de esa publicación en **Actions**; no atribuyas un CI anterior a cambios nuevos. Los hashes verificables permiten identificar qué modelo se publicó, pero no significan validación institucional.

## 3. Reproducir opcionalmente en Google Colab

La publicación puede verificarse localmente. Colab permite guardar evidencia adicional de que la receta funciona en un entorno nuevo; no es un requisito para servir el archivo desde Google ni implica dejar una máquina encendida.

1. Entra con tu cuenta Google.
2. Después del push, abre [stage-4.5-model-v1.ipynb en Colab](https://colab.research.google.com/github/C-David28/essalud-ticket-system/blob/main/ml/notebooks/stage-4.5-model-v1.ipynb).
3. Si no aparece, confirma que publicaste el archivo. Puedes usar **Archivo → Abrir cuaderno → GitHub**, o subir el `.ipynb` local desde **Subir cuaderno**.
4. Elige **Archivo → Guardar una copia en Drive**.
5. Usa una máquina nueva: **Entorno de ejecución → Desconectar y eliminar entorno de ejecución** si reutilizas otra sesión.
6. Selecciona Python y acelerador **Ninguno/CPU**. Comprueba Python 3.12; si la imagen usa otra versión, conserva el error y ajustaremos el entorno de manera controlada.
7. Mantén `SOURCE_MODE = "github_public"`. No escribas tokens ni cambies el commit fijo de Dataset V1.
8. Pulsa **Conectar** y **Entorno de ejecución → Ejecutar todas**.

Las celdas incluyen el loader de 4.3, código de publicación, protocolo, particiones y evidencia de 4.4 identificados por hashes. La carga comprueba los mismos cinco archivos de Dataset V1; no descarga `.env`, bases de datos ni credenciales. La construcción utiliza el Python del venv mediante subproceso, no las versiones científicas globales del kernel.

La generación y verificación se ejecutan automáticamente en esta subetapa autorizada: entrena la receta congelada sobre 160 ejemplos, guarda un artefacto reconstruido y comprueba predicciones/clases/márgenes antes y después de cargarlo. No compara otros algoritmos ni reajusta con el holdout.

Para un repo privado, utiliza preferentemente `SOURCE_MODE = "upload"` con el ZIP de cinco archivos generado por `npm.cmd run ml:colab:export`. Si necesitas `github_secret`, sigue [la guía de secretos de 4.3](COLAB-4.3.md); nunca pegues su valor en una celda. `local_snapshot` está reservado a comprobaciones locales.

## 4. Interpretar el resultado y descargar

Revisa el reporte real y confirma:

- Dataset V1, commit `9d3103991911b1b06b9faca6dce779013dae3036` y hash del corpus.
- Candidato `linear-svc-c1`, parámetros y protocolo heredados de la selección congelada.
- 160 registros usados para ajustar y 40 fuera del ajuste.
- Python 3.12, dependencias fijadas y versión del serializer.
- Predicciones, clases y márgenes preservados por la persistencia, dentro de las tolerancias declaradas.
- Hashes del artefacto generado y trazabilidad; sin afirmar que una reconstrucción es una publicación oficial automáticamente.

La comprobación sobre desarrollo demuestra que guardar/cargar no altera el comportamiento; **no es una nueva métrica de generalización**. Accuracy final 1.0 y Macro F1 CV 0.86895 corresponden al experimento 4.4 registrado, no a una evaluación nueva realizada por 4.5.

En la última celda cambia **`DOWNLOAD_MODEL = False`** a **`True`** y ejecuta únicamente esa celda. Guarda el paquete descargado y sus reportes fuera de la carpeta del modelo aprobado. Conserva también una copia del notebook ejecutado fuera del repositorio; el notebook de Git permanece sin salidas.

Una reproducción puede generar un SHA distinto del binario por serialización, metadatos o plataforma, aunque sus predicciones sean equivalentes. Las tolerancias y resultados numéricos están en la verificación; no prometer bytes idénticos.

**No reemplaces el modelo aprobado ni su anchor con el paquete descargado de Colab.** Las reconstrucciones se conservan por separado y requieren revisión antes de aprobarlas. El loader por defecto rechaza archivos cuyos hashes no coinciden con la referencia revisada.

## 5. Seguridad y errores que no deben ocultarse

Skops audita tipos antes de reconstruir objetos. No se usa carga genérica de pickle/joblib ni se confía ciegamente en los tipos declarados por un archivo. Solo se permite el pipeline y entorno comprobados; nunca cargar modelos enviados por terceros para intentar ver qué contienen.

El SHA-256 garantiza correspondencia con una referencia esperada, **no firma digital ni autoría por sí solo**. La confianza comienza en el código/publicación revisados y su anchor, no en un manifiesto recibido junto con un binario desconocido.

| Problema | Acción |
| --- | --- |
| Python distinto de 3.12 | Conservar versión/error; no cambiar dependencias a ciegas |
| Hash de dataset o evidencia distinto | Usar commit/paquete correcto; no editar hash para que pase |
| Dependencia ausente o versión incompatible | Ejecutar setup del entorno ML, sin modificar paquetes globales |
| Tipo skops no revisado | Detener carga y revisar; no habilitar confianza automática |
| Modelo reconstruido distinto del aprobado | Mantenerlo separado y revisar equivalencia/procedencia; no cambiar anchor para ocultarlo |
| GitHub no encuentra archivo/commit | Comprobar push/acceso; ZIP permitido si el repo es privado |

Un fallo de carga debe quedar visible. No ignorar errores para afirmar que el modelo ya está listo. La tolerancia a fallos del servicio y la creación manual de tickets se implementarán en subetapas posteriores; 4.5 no crea ese servicio.

## 6. Evidencias y cierre

Guarda:

1. Commit, archivos de publicación y checks GitHub de 4.5.
2. Model Card con origen sintético y limitaciones.
3. Versión/hash del modelo, dataset y protocolo en metadatos.
4. Reporte de 160 registros de ajuste y holdout excluido.
5. Versiones del entorno y verificación de carga en proceso nuevo.
6. Si reproduces en Colab: notebook CPU, salida final y paquete descargado sin secretos.

Si utilizas Colab, comparte los JSON/reporte y confirma que proceden de esta ejecución antes de declararla verificada. No envíes tokens. La coincidencia debe revisarse como reproducción numérica y de receta; no asumir que métricas heredadas son una medición nueva.

**Detente después de 4.5.** La siguiente subetapa es 4.6, servicio independiente de inferencia; no se inicia automáticamente.

Referencias: [persistencia y compatibilidad scikit-learn](https://scikit-learn.org/1.6/model_persistence.html), [persistencia skops](https://skops.readthedocs.io/en/stable/persistence.html), [Google Colab FAQ](https://research.google.com/colaboratory/faq.html).
