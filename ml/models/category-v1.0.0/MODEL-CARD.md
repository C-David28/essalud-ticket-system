# Model Card — Ticket Category Model V1

**Prototipo académico entrenado con SYNTHETIC / DEMO / ACADEMIC DATASET. No validado institucionalmente por EsSalud.**

Versión de esta publicación: `ticket-category-model-v1.0.0`. Fecha de la entrega: 2026-10-10. Candidato heredado: `linear-svc-c1`, seleccionado en `ticket-category-experiment-v1.0.0`. Los hashes, versiones instaladas, fecha de generación y procedencia exacta del artefacto publicado se registran en [metadata.json](metadata.json); las comprobaciones de persistencia están en [verification.json](verification.json).

## Objetivo y alcance

Sugerir una categoría de atención a partir del título y descripción de una incidencia en español. La persona sigue siendo responsable de aceptar, ignorar o cambiar esa sugerencia. El modelo no diagnostica la avería física ni sustituye procedimientos institucionales.

Esta publicación prepara un artefacto y su carga controlada. No incluye API HTTP, integración NestJS/Next.js ni despliegue: corresponden a otras subetapas. El sistema operativo de tickets conserva su funcionamiento independiente del módulo ML.

## Entradas y salidas

La aplicación futura recibe `titulo` y `descripcion`; el pipeline espera el texto formado exactamente por `trim(titulo) + LF + trim(descripcion)`. No se incorporan categoría elegida, prioridad, sede, usuario, grupo, familia, solución, historial ni metadatos del dataset. La preparación debe ser idéntica al entrenamiento.

Categorías exactas: `SOPORTE`, `REDES`, `INFRAESTRUCTURA`, `BIOMEDICO`. El orden interno de `classes_` del estimador puede diferir del orden del contrato de dominio; cada columna de score se interpreta mediante las clases del propio estimador.

La predicción es una categoría. `LinearSVC.decision_function` devuelve **márgenes de decisión**, no probabilidades ni porcentajes de confianza. No existe calibración probabilística ni umbral operativo de abstención validado en esta versión. Eso deberá resolverse con desarrollo antes de la integración; no inventar un porcentaje ni forzar una categoría cuando la futura política indique abstención.

Los límites de compatibilidad del dominio son título 5–200 y descripción 10–5000 caracteres después de trim. El corpus observado cubre descripciones de 49–391 caracteres; aceptar una entrada por longitud no demuestra calidad predictiva en todo el rango. Las futuras capas de inferencia y API deben validar sus entradas.

## Datos y metodología

Dataset: `tickets-category-dataset-v1.0.0`, commit `9d3103991911b1b06b9faca6dce779013dae3036`. SHA-256 del corpus UTF-8 con CRLF normalizado a LF: `2f571a40f063c4cce267352582f0bf78d2008d09ddc617ab54c7f8dd5ca21a69`.

El corpus tiene 200 registros sintéticos, 50 por categoría, 40 familias y 37 grupos de fuga. Los textos fueron redactados y revisados con asistencia de IA; no hubo revisión humana independiente ni datos institucionales privados. Ver [Dataset Card](../../datasets/v1.0.0/DATASET-CARD.md) y [guía de etiquetado](../../docs/LABELING-GUIDE.md).

**El artefacto se ajusta exclusivamente con los 160 registros de desarrollo, en 29 grupos. No se entrena con los 200 registros.** Se conservan los 40 registros finales de ocho grupos, diez por categoría, fuera del ajuste. No se redefine el holdout ni se seleccionan parámetros con sus resultados.

El experimento original usó cuatro folds de validación cruzada agrupada y reservó grupos indivisibles, incluidos los pares que atraviesan categorías. Solo título y descripción se transformaron dentro de cada pipeline de entrenamiento. Las métricas de abajo proceden de 4.4; 4.5 no vuelve a abrir el test para escoger otro modelo o umbral.

## Algoritmo y receta

Pipeline completo: `FeatureUnion` con TF-IDF de palabras de 1–2 términos y `char_wb` de fragmentos de 3–5 caracteres, seguido por `LinearSVC`.

- Texto en minúsculas y eliminación Unicode de tildes para representación.
- `sublinear_tf=True`, `min_df=1`, sin stopwords y pesos de ambas vistas de 1.0.
- `LinearSVC(C=1.0, dual="auto", max_iter=10000)`, semilla 42.
- Vocabularios, IDF, clases y coeficientes se persisten juntos; no guardar únicamente el clasificador.

Las dos regresiones logísticas comparadas incumplieron recall OOF biomédico; las SVM C=1 y C=4 cumplieron los gates y quedaron próximas dentro de la variabilidad. Se eligió el menor C según el protocolo previo, no por resultados del test.

## Evaluación registrada en 4.4

Evidencia: [selección congelada](../../experiments/experiment-v1.0.0/local-2026-10-07/selection.json), [métricas finales](../../experiments/experiment-v1.0.0/local-2026-10-07/final-metrics.json), [reporte](../../experiments/experiment-v1.0.0/local-2026-10-07/REPORT.md) y [análisis de errores](../../experiments/experiment-v1.0.0/local-2026-10-07/ERROR-ANALYSIS.md). Esos archivos registran la ejecución local; la confirmación del usuario de Colab/Actions debe identificarse como confirmación externa, sin atribuirla a estos archivos locales.

| Medida | Resultado observado |
| --- | ---: |
| Macro F1 medio de CV agrupada | 0.8689545080461889 |
| Desviación entre folds | 0.09386092249277633 |
| Macro F1 medio CV del baseline | 0.06701388888888889 |
| Predicciones correctas OOF | 139/160 |
| Errores OOF | 21 |
| Accuracy final | 1.0000 |
| Macro F1 final | 1.0000 |
| F1 ponderado final | 1.0000 |
| Aciertos finales | 40/40 |

En la prueba final, precision, recall y F1 de las cuatro categorías fueron 1.0000, con soporte diez por clase. La matriz tiene diez en cada celda diagonal y cero fuera de ella. El baseline final obtuvo accuracy 0.25 y Macro F1 0.10.

**El resultado final perfecto no elimina los errores de desarrollo:** tres SOPORTE, tres REDES, tres INFRAESTRUCTURA y doce BIOMEDICO. No se fabrican errores ni se ocultan esas confusiones. Ocho grupos sintéticos finales no representan toda la variabilidad de reportes reales; un solo error cambiaría el recall de su categoría en 0.10. La desviación de CV no es un intervalo de confianza.

Los gates académicos definidos antes del experimento fueron Macro F1 CV ≥0.70, recall OOF por categoría ≥0.60 y mejora Macro F1 ≥0.10 sobre baseline; también se contrastaron en el test. Su aprobación permite una evolución experimental, no certificación institucional.

## Persistencia, integridad y compatibilidad

Artefacto: [model.skops](model.skops), con `skops==0.16.0` y Python 3.12. Se conservan los 18 pins científicos de 4.3/4.4 y se agregan únicamente dependencias de persistencia fijadas: `prettytable==3.18.0`, `wcwidth==0.9.2`. El entorno de construcción verifica 21 paquetes; la carga exige el subconjunto de nueve paquetes de ejecución fijado en código. Las versiones efectivamente comprobadas están en los archivos de publicación.

Skops evita la carga genérica basada en pickle. Antes de reconstruir objetos, el loader comprueba el origen local autorizado, tamaño, hashes y compatibilidad de entorno. Los tipos no confiados deben rechazarse o compararse con una lista explícita revisada en código; nunca confiar automáticamente en todo lo declarado por el archivo o su manifiesto. Este pipeline utiliza tipos estándar y no requiere ejecutar funciones personalizadas serializadas.

**Un SHA-256 detecta cambios respecto a un valor esperado; no es una firma ni prueba de autoría por sí solo.** La referencia confiada está en [approved-release.json](../../modeling/approved-release.json), junto al código revisado; no se toma de un manifiesto recibido con un binario desconocido. El loader por defecto no aprueba automáticamente reconstrucciones. No cargar artefactos enviados por usuarios ni ubicaciones arbitrarias. Mantener Python 3.12, `skops`, scikit-learn, NumPy y SciPy compatibles y fijados; una versión distinta exige revisión y nueva prueba controlada, no ignorar avisos.

La verificación compara predicciones, clases y márgenes antes/después de persistir y desde un proceso nuevo usando desarrollo. No constituye nueva evaluación de generalización ni utiliza el holdout. Una reproducción puede conservar comportamiento numérico dentro de tolerancias declaradas sin producir bytes/SHA idénticos: serialización ZIP, metadatos y plataforma pueden variar. No declarar igualdad binaria si no se midió.

## Uso esperado y usos no recomendados

Uso esperado: demostración académica y sugerencia opcional supervisada sobre categorías del dominio. No usar para diagnóstico médico, estimación de gravedad, priorización obligatoria, asignación autónoma, recomendaciones clínicas ni creación automática de tickets.

No enviar pacientes, DNI, historias clínicas, credenciales ni datos privados al entrenamiento. No presentar desempeño sintético como validación nacional de EsSalud. No activar la integración institucional sin evaluación con datos autorizados, revisión humana y controles operativos.

## Limitaciones y evolución

Corpus pequeño, balance artificial y fuente asistida única; vocabulario y síntomas son más claros que muchos reportes reales. Excluye incidentes insuficientemente descritos o con múltiples averías independientes. Puede fallar ante otras especialidades, idiomas, descripciones largas, ambigüedades o distribución real distinta. El área biomédica presentó mayor cantidad de fallos OOF.

La futura inferencia deberá tener timeout, respuesta de indisponibilidad, activación/desactivación y continuidad manual. Esas funciones no están implementadas en el artefacto 4.5. Se conservan Dataset V1, experimento y modelo por versión para reproducir o reemplazar una publicación de manera controlada.

La licencia de reutilización del dataset/modelo debe decidirla el responsable del proyecto; publicarlo en GitHub no concede aprobación institucional ni una licencia implícita de datos reales.

Referencias: [persistencia scikit-learn 1.6.1](https://scikit-learn.org/1.6/model_persistence.html), [persistencia segura skops](https://skops.readthedocs.io/en/stable/persistence.html), [cambios de skops](https://skops.readthedocs.io/en/stable/changes.html).
