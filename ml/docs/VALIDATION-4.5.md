# Validación y evidencias — subetapa 4.5

Inicio: 2026-10-09; cierre local: 2026-10-10 (America/Lima). Versión: `ticket-category-model-v1.0.0`.

## Resultado y procedencia

Artefacto experimental generado y cargado en procesos separados: [pipeline completo](../models/category-v1.0.0/model.skops), [metadatos](../models/category-v1.0.0/metadata.json), [verificación](../models/category-v1.0.0/verification.json) y [Model Card](../models/category-v1.0.0/MODEL-CARD.md).

Se continúa desde commit `1d4e5508bbfb41d219fa073436d2a9a620118730`. El usuario confirmó Colab y Actions de 4.4; esa confirmación no convierte los archivos locales de evaluación en resultados de otra ejecución. Los reportes 4.4, su marcador de apertura final, Dataset V1 y notebooks 4.3/4.4 permanecen intactos.

TF-IDF palabras 1–2 + caracteres `char_wb` 3–5, `LinearSVC(C=1, dual=auto, max_iter=10000)`, seed 42. Se reconstruye únicamente el candidato seleccionado y se ajustan vocabularios, IDF y clasificador sobre los mismos **160 registros de desarrollo**. Los 40 reservados no participan en fit ni se vuelven a evaluar; no se selecciona modelo/umbral con el holdout. Solo título y descripción entran al pipeline.

SHA-256 del binario publicado: `b21536dc47439b428a9a182d784e1798af8611493ea6e756e53ece9f15528213`; tamaño: **357940 bytes**. Las fechas UTC reales constan en metadatos. Fuente de confianza: [referencia aprobada en código](../modeling/approved-release.json). Hash binario usa bytes originales; hashes textuales normalizan CRLF a LF. Un hash verifica integridad frente a una referencia confiada; no es una firma digital.

Métricas **heredadas de 4.4**, sin mediciones nuevas de generalización: Macro F1 CV 0.8689545080461889, desviación 0.09386092249277633; accuracy/Macro F1 final 1.0 sobre 40 ejemplos de ocho grupos sintéticos. Se conservan 21 errores OOF. No hay validación institucional ni confianza probabilística: el score es un margen SVM, puede ser negativo y no se muestra como porcentaje. Calibración/abstención operativa quedan pendientes antes de la integración.

## Persistencia y compatibilidad

- Skops 0.16.0 guarda todo el pipeline. No se utiliza carga genérica pickle/joblib ni se aprueban automáticamente tipos declarados por un archivo.
- Tamaño, integridad de binario/metadatos/verificación, Python 3.12 y nueve pins de runtime se comprueban antes de deserializar. Se audita ZIP y tipos desconocidos; este pipeline no requiere excepciones a la lista de confianza.
- Después se comprueban estructura del pipeline, clases y pesos finitos. El orden interno de clases es alfabético y se conserva; el contrato del dominio mantiene sus cuatro etiquetas.
- Reconstrucciones se guardan en outputs y tienen recibo diagnóstico, que el loader no toma como aprobación. La publicación V1 no se sobrescribe. Para otra versión, revisar experimento, fuentes, resultados y tipos antes de cambiar una referencia aprobada; conservar la versión anterior para rollback. Todavía no hay servicio/despliegue que requiera migración.
- Construcción en venv separado: los 18 pins científicos de 4.3/4.4 más skops/prettytable/wcwidth, 21 en total. No se modifican paquetes globales ni dependencias npm de aplicación.

## Verificaciones ejecutadas

En Windows, Python 3.12.14, CPU, 21 paquetes fijados y pip 25.1.1; `pip check` sin incompatibilidades.

- Guardar/cargar conserva las **160 predicciones de desarrollo**; máximo cambio de margen **0.0**. Esto prueba persistencia, no rendimiento de generalización.
- `ml:model:setup` ejecutado desde cero en el proyecto: entorno listo en `ml/outputs/model-environment/.venv`, 21 pins/pip check aprobados. El launcher usa después ese venv sin configuración adicional.
- Reconstrucción en ese segundo entorno comparada con el modelo aprobado: 160 predicciones idénticas y diferencia máxima de margen **0.0**; binarios con hashes diferentes. Evidencia temporal: `ml/outputs/model-environment/reproduction-comparison.json`, fuera de Git. No utiliza el holdout.
- `ml:model:check` en un proceso nuevo: `MODEL_V1_VERIFIED` y predicción real local.
- 13 pruebas del modelo: pipeline/vocabulario/clases, métricas trazables, alteración de los tres archivos antes de carga, dependencias/Python incompatibles, tipos desconocidos, ZIP inválido/rutas/tamaños, campos y longitudes, exclusión del holdout y bloqueo de sobrescritura.
- Regresión heredada: 28 pruebas de dataset, 22 de preparación segura y 12 del experimento aprobadas; hashes y notebooks heredados sincronizados.
- Notebook 4.5: ocho celdas ejecutadas mediante subproceso con entorno aislado; descarga pública real de los cinco inputs del commit Dataset V1; construcción y roundtrip completos, sin test final ni acceso operativo. Notebook versionado sin outputs ni credenciales.
- Sintaxis/metadatos de 35 scripts generales aprobados; workflow ML incluye check/tests/reconstrucción 4.5 y conserva Infrastructure CI.

No se ejecutó una sesión de Google Colab 4.5 ni el nuevo workflow remoto desde esta herramienta. El notebook se ejecutó localmente; las comprobaciones externas posteriores al push permanecen identificadas como pendientes. No se afirma salud actual del cloud ni se ejecutan migraciones/servicios Docker porque no cambiaron componentes operativos.

## Acciones y evidencias

Seguir [guía 4.5](COLAB-4.5.md): publicar el commit en la misma rama con `git push origin main`, comprobar Actions de ese commit. Si se desea evidencia académica adicional, abrir notebook en Colab CPU/Python 3.12, ejecutar desde sesión nueva y descargar el ZIP; no reemplazar automáticamente el modelo aprobado.

Guardar Model Card, versión/hash y particiones de metadatos, `MODEL_V1_VERIFIED`, pruebas aprobadas, commit/Actions. Para Colab opcional: entorno, `MODEL_V1_REPRODUCED`, roundtrip y ZIP. El informe debe distinguir métricas 4.4, comprobaciones de persistencia 4.5 y origen sintético.

**4.5 implementada y verificada localmente.** Publicación/CI del nuevo commit y reproducción Colab 4.5 opcional quedan al usuario. Siguiente subetapa recomendada, únicamente con autorización: **4.6 — servicio independiente de inferencia**.
