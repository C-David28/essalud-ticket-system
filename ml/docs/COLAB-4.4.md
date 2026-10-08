# Guía paso a paso — entrenamiento y evaluación, subetapa 4.4

El usuario confirmó la preparación de 4.3 y el CI de esa entrega fue verificado. La ejecución de 4.4 en Colab debe comprobarse por separado. No necesitas activar Docker, Railway, Vercel, PostgreSQL ni Redis.

El [notebook de entrenamiento](../notebooks/stage-4.4-training-v1.ipynb) contiene la preparación y el experimento. Trabaja únicamente con Dataset V1 sintético; no consulta ni modifica tickets operativos. El modelo versionado y el servicio de inferencia corresponden a 4.5 y 4.6.

## 1. Protocolo y separación de datos

Protocolo: `ticket-category-experiment-v1.0.0`. Semilla: `42`. Dataset: `tickets-category-dataset-v1.0.0`, del commit fijo `9d3103991911b1b06b9faca6dce779013dae3036`. Abrir el notebook desde `main` no cambia el commit de los datos; sus hashes se verifican antes de entrenar.

Se reservan **40 registros finales, 10 por categoría**; los otros **160 son desarrollo**. Cada `leakage_group_id` permanece indivisible, incluso cuando agrupa familias de categorías diferentes. Para reservar el test se seleccionan grupos mediante programación dinámica —búsqueda de una combinación de conteos—, con orden SHA y semilla fija. Se utilizan etiquetas y grupos, sin textos, predicciones ni resultados para elegir la partición.

El desarrollo utiliza cuatro particiones de validación cruzada agrupada (`StratifiedGroupKFold`). Cada turno entrena con una parte y valida con otra; ninguna familia relacionada cruza esa frontera. Las particiones y configuración se congelan antes del primer entrenamiento.

Se comparan:

- **Baseline:** `DummyClassifier(most_frequent)`, que predice la clase más frecuente sin aprender el contenido.
- **Regresión logística:** TF-IDF de palabras de 1–2 términos y fragmentos de 3–5 caracteres, combinados con `FeatureUnion`; valores `C=1` y `C=4`.
- **SVM lineal:** la misma representación y `LinearSVC`, con `C=1` y `C=4`.

TF-IDF convierte texto en números; vocabulario y pesos se aprenden solamente dentro del entrenamiento de cada partición. Se conservan las palabras funcionales, incluidas negaciones: no se usa una lista de stopwords. `C` controla la regularización, que limita el ajuste a los ejemplos. La comparación pequeña se fija de antemano.

Solo título y descripción son entradas. Categoría, justificación, familia, grupo, estilo e ID son etiquetas o controles y nunca características del modelo.

## 2. Publicar y comprobar GitHub

Cuando implementación y commit local estén terminados, abre CMD:

```bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
git log -3 --oneline
git status --short
git push origin main
```

No necesitas crear otra rama. No uses `git add .` para incluir cambios ajenos o salidas locales. Si falla el push, conserva el mensaje sin claves; no fuerces el envío.

En [GitHub](https://github.com/C-David28/essalud-ticket-system):

1. Comprueba que `ml/notebooks/stage-4.4-training-v1.ipynb` aparece en `main`.
2. Abre **Actions → ML Preparation CI** del commit. Incorpora controles del experimento y desarrollo; no abre la prueba final para elegir modelos.
3. Guarda capturas del commit y CI. Un CI verde no confirma la ejecución de tu cuenta Colab.

Este notebook no despliega el sistema ni publica un modelo.

## 3. Abrir Colab y preparar el entorno

1. Inicia sesión en Google y abre [el notebook 4.4 en Colab](https://colab.research.google.com/github/C-David28/essalud-ticket-system/blob/main/ml/notebooks/stage-4.4-training-v1.ipynb).
2. Si no aparece, comprueba el push. También puedes entrar en [Colab](https://colab.research.google.com), elegir **Archivo → Abrir cuaderno → GitHub** y pegar la URL, o subir el `.ipynb` local desde **Subir cuaderno**.
3. Elige **Archivo → Guardar una copia en Drive**.
4. Usa un entorno nuevo: **Entorno de ejecución → Desconectar y eliminar entorno de ejecución**, si reutilizas otra sesión.
5. En **Entorno de ejecución → Cambiar tipo de entorno de ejecución**, selecciona Python y acelerador **Ninguno/CPU**. No hace falta GPU.
6. En configuración deja `SOURCE_MODE = "github_public"`, `INSTALL_DEPENDENCIES = True` y `RUN_COMPARISON = True`. Conserva hashes, semilla y protocolo.
7. En la celda de prueba final conserva inicialmente **`RUN_FINAL_TEST = False`**.

El notebook reutiliza el loader seguro de 4.3, verifica cinco archivos y mantiene las 18 dependencias fijadas. Usa un venv separado del Python global de Colab. Entrena mediante `experiment_python` en un subproceso; no cambies las celdas para usar versiones científicas globales del kernel.

Si el repo es privado, prefiere `SOURCE_MODE = "upload"` y el ZIP de cinco archivos generado con `npm.cmd run ml:colab:export`. Las instrucciones para subirlo o utilizar opcionalmente `github_secret` mediante Colab Secrets están en [COLAB-4.3.md](COLAB-4.3.md). No escribas tokens en celdas. `local_snapshot` está reservado a pruebas locales, no a Colab.

## 4. Ejecutar desarrollo sin abrir el test

1. Pulsa **Conectar**, si aparece, y **Entorno de ejecución → Ejecutar todas**.
2. Espera descargas y entrenamiento. Con `RUN_FINAL_TEST = False`, la comparación se ejecuta y la prueba final permanece sin evaluar.
3. Comprueba versión/hash, 200 registros, 40 reservados, 160 de desarrollo y separación de grupos.
4. Revisa tabla de candidatos y decisión congelada. Las cifras deben proceder de esa ejecución.

La selección utiliza Macro F1 de validación y recall por categoría de predicciones **OOF**: cada registro es predicho por un modelo que no lo entrenó. Criterios heredados:

- Macro F1 de CV **≥ 0.70**.
- Recall OOF de **cada** categoría **≥ 0.60**.
- Mejora absoluta de Macro F1 **≥ 0.10** frente al baseline con las mismas particiones.

Son criterios previos, no resultados obtenidos. Dentro de la variabilidad fijada por el protocolo, se favorecen regresión logística y `C=1` por simplicidad y salida probabilística. No cambies el criterio después de observar resultados.

Un candidato seleccionado no se declara apto si incumple requisitos. Las probabilidades de regresión logística son estimaciones no calibradas, no certeza; LinearSVC devuelve márgenes, no porcentajes de confianza.

Si aparece un fallo, conserva celda y mensaje sin secretos. Resuelve errores técnicos antes del test; no cambies etiquetas, grupos, semilla, parámetros o umbrales para buscar un resultado favorable.

## 5. Evaluar una sola vez el candidato congelado

Después de comprobar que existe una decisión congelada y comprender el resultado de desarrollo:

1. Localiza la celda de **prueba final**.
2. Cambia allí `RUN_FINAL_TEST = False` a **`True`**.
3. Ejecuta **solamente esa celda**.
4. Revisa métricas finales, matrices, aciertos, errores y reporte.

El candidato y parámetros se fijan antes; se ajusta con los 160 registros de desarrollo para predecir los 40 reservados. Las etiquetas finales sirven para medirlo, nunca para entrenarlo.

El notebook bloquea repetir la prueba final en la misma carpeta de resultados. No borres el bloqueo, cambies carpeta ni reinicies para ensayar variantes y conservar el mejor resultado. Si repites desde un entorno nuevo para demostrar reproducibilidad, conserva exactamente protocolo y datos y declara que repites el mismo experimento: no es otra evaluación independiente.

Un test bajo debe documentarse e impide declarar aptitud experimental. No retocar utilizando sus errores como validación. Una mejora posterior requiere otra versión y una evaluación correctamente declarada.

## 6. Descargar y revisar resultados

En la última celda establece **`DOWNLOAD_RESULTS = True`** y ejecútala para descargar el ZIP. Conserva esa evidencia fuera del repositorio hasta revisarla.

Incluye:

- JSON de comparación, configuración y decisión congelada.
- Métricas finales: accuracy, precision/recall/F1 por categoría, Macro F1 y agregados.
- Matrices de confusión en conteos y normalizadas, con PNG/PDF/CSV.
- CSV de aciertos y errores con categoría real, predicción y material para analizar confusiones.
- Reporte Markdown, versiones del entorno y hashes.

Los archivos finales solo existen después de evaluar el test. No se crea `joblib` ni un modelo publicado; el artefacto versionado se prepara en 4.5.

En la matriz, filas indican categoría real y columnas categoría predicha. La diagonal contiene aciertos; las demás celdas muestran confusiones. Con 10 casos finales por categoría, un error cambia su recall en 0.10. Estos números no constituyen validación institucional.

## 7. Qué enviar y qué evidencias guardar

Envía el ZIP o los JSON de comparación, decisión y métricas finales. Confirma que seguiste desarrollo → decisión congelada → prueba final. No compartas tokens. Se comprobarán dataset, protocolo, hashes, versiones y métricas antes de confirmar tu ejecución Colab.

Guarda capturas de:

1. Commit y CI de 4.4.
2. Colab en CPU y versión/hash del dataset.
3. Distribución de desarrollo/prueba y separación de grupos.
4. Comparación CV y decisión antes de abrir el test.
5. Métricas por categoría y matrices finales.
6. Aciertos y errores explicados, incluidos casos fronterizos.
7. ZIP y reporte con entorno y hashes.

Los textos son **SYNTHETIC / DEMO / ACADEMIC DATASET**. Resultados satisfactorios demostrarían funcionamiento sobre ese corpus, no desempeño validado en incidencias reales de EsSalud.

**Detente después de 4.4.** No ejecutar versionamiento de modelo, inferencia, integración web ni despliegue sin autorización para la siguiente subetapa.

Referencias oficiales de la versión utilizada: [validación por grupos](https://scikit-learn.org/1.6/modules/generated/sklearn.model_selection.StratifiedGroupKFold.html), [pipelines y fuga de información](https://scikit-learn.org/1.6/common_pitfalls.html), [baseline DummyClassifier](https://scikit-learn.org/1.6/modules/generated/sklearn.dummy.DummyClassifier.html), [métricas por categoría](https://scikit-learn.org/1.6/modules/generated/sklearn.metrics.classification_report.html).
