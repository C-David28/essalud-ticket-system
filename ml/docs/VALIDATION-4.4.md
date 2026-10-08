# Validación y resultados — subetapa 4.4

Fecha: 2026-10-07. Experimento: `ticket-category-experiment-v1.0.0`.

## Estado

Entrenamiento, comparación y evaluación **ejecutados localmente**, con métricas reales. Pendiente publicar/verificar CI actualizado y reproducir 4.4 en Google Colab. La confirmación previa del usuario corresponde a 4.3, no a este experimento.

Frontend, API, PostgreSQL/RLS, auditoría, Redis, Maps, Dockerfiles, seeds y despliegues no se modificaron. Dataset V1 y notebook 4.3 intactos. No se exporta modelo ni se crea servicio/integración web.

## Protocolo previo al entrenamiento

[Protocolo](../experiments/experiment-v1.0.0/protocol.json) y [particiones](../experiments/experiment-v1.0.0/splits.json): semilla 42; 160 registros de desarrollo en 29 grupos; 40 finales en ocho grupos, diez por categoría. Selección de holdout por conteos/grupos y orden SHA, sin textos ni resultados. Se congelaron archivo/hash antes del primer ajuste; commit `414636a` conserva protocolo y particiones antes de abrir prueba final.

CV agrupada de cuatro folds, con validaciones de 40, 35, 40 y 45 registros. Todas las clases presentes; ningún grupo o familia cruza train/validación/test. Solo título y descripción son inputs. TF-IDF de palabras 1–2 y caracteres 3–5 ajusta vocabulario/IDF dentro del pipeline de cada entrenamiento y conserva negaciones.

Presupuesto previo: baseline mayoría; LogisticRegression C=1/4; LinearSVC C=1/4. Gates: Macro F1 medio CV >=0.70, recall OOF de cada clase >=0.60, mejora sobre baseline >=0.10. Primero se filtran candidatos aptos y después se aplican preferencia de algoritmo/C dentro de la dispersión observada.

Datos, grupos, semilla, parámetros y umbrales no se cambiaron en función de métricas. Se repitieron comprobaciones de desarrollo tras correcciones de cache/completitud de reportes, manteniendo protocolo y resultados. Test final abierto una vez; la ejecución posterior del notebook leyó resultados existentes sin volver a ajustarlo/evaluarlo.

## Resultados medidos

| Candidato | Macro F1 medio CV | Desviación entre folds | Recall OOF BIOMEDICO | Todos los gates CV |
| --- | ---: | ---: | ---: | --- |
| Dummy mayoría | 0.0670 | 0.0196 | 0.500 | Baseline |
| LogisticRegression C=1 | 0.8074 | 0.1451 | 0.500 | No |
| LogisticRegression C=4 | 0.8428 | 0.1193 | 0.575 | No |
| LinearSVC C=1 | 0.8690 | 0.0939 | 0.700 | Sí |
| LinearSVC C=4 | 0.8671 | 0.0968 | 0.700 | Sí |

Candidato elegido solo con desarrollo: **LinearSVC C=1**. Las regresiones incumplieron recall biomédico. Ambas SVM quedaron próximas dentro de la variabilidad y se prefirió menor C. Mejora Macro F1 CV sobre baseline: aproximadamente 0.8019.

Prueba final, luego de ajustar exclusivamente con los 160 de desarrollo:

- Accuracy, Macro F1 y F1 ponderado: **1.0000**.
- Precision, recall y F1 por clase: **1.0000**, soporte diez por clase.
- 40/40 aciertos, cero fallos. Matriz diagonal con diez por clase; normalizada con uno por clase.
- Baseline final: accuracy 0.2500, Macro F1 0.1000.
- Gates CV y test aprobados: `EXPERIMENTAL_CANDIDATE_ACCEPTED`.

Son mediciones sobre **ocho grupos sintéticos finales**, no validación institucional. No eliminan los **21 errores OOF de desarrollo**: tres SOPORTE, tres REDES, tres INFRAESTRUCTURA y doce BIOMEDICO. Se conservan errores reales y no se fabrican fallos del test. La desviación entre folds no es un intervalo de confianza; las 200 filas no son 200 escenarios independientes.

SVM entrega márgenes, no porcentajes de confianza. No se calibró el candidato ni se fijó umbral operativo. Curvas de probabilidad de las regresiones usan solo desarrollo OOF. Una política de abstención requiere validación con desarrollo antes de integrar el modelo en futuras subetapas.

## Artefactos y pruebas

[Reporte local](../experiments/experiment-v1.0.0/local-2026-10-07/REPORT.md) y [análisis de errores](../experiments/experiment-v1.0.0/local-2026-10-07/ERROR-ANALYSIS.md): comparación por fold/OOF, decisión congelada, métricas, matrices PNG/PDF/CSV, tiempos reales y ejemplos correctos/incorrectos. JSON identifica hashes de dataset, protocolo, splits, fuentes, requisitos y versiones. `result-manifest.json` verifica los resultados publicados, normalizando LF en texto. No hay modelo serializado ni secretos.

Entorno real: Python 3.12.14, scikit-learn 1.6.1, las 18 dependencias fijadas y pip 25.1.1; `pip check` aprobado. CPU.

- 28 pruebas de dataset y 22 de preparación/seguridad aprobadas.
- 12 pruebas nuevas: cobertura/grupos/clases, reproducción de particiones, independencia de textos al reservar grupos, fuga, inputs sin metadatos, gates, vocabulario ajustado solo en train, márgenes SVM, holdout envenenado excluido y bloqueo de reapertura.
- Nueve celdas compiladas y ejecutadas localmente: desarrollo deja test cerrado; apertura explícita evalúa solo candidato y baseline; lectura posterior no repite evaluación.
- Notebook limpio y sincronizado; sintaxis/metadatos de 35 scripts aprobados.
- Descarga pública real de los cinco archivos GitHub V1 verificada por hashes.
- Gráficos de comparación y matriz revisados visualmente. YAML del workflow parseado; CI prepara/tests/ejecuta desarrollo sin abrir el test. Infrastructure CI conserva su configuración.

Se corrigieron cache Matplotlib dentro del experimento, temporales de pruebas dentro de ML y marcador de éxito publicado después de CSV/figuras/reporte. Mediciones previas al render se preservan para diagnóstico. Restricciones transitorias de Windows afectaron unidad E y temporales pip: la ejecución se recuperó y se usaron temporales aislados sin cambiar dependencias ni paquetes globales.

## Cierre manual

Seguir [COLAB-4.4.md](COLAB-4.4.md). Guardar commit/Actions, Colab CPU, hashes/distribución, comparación y decisión antes de test, métricas/matrices, errores OOF y ZIP. Enviar comparación, selección, métricas y análisis para verificar la reproducción externa.

Siguiente subetapa, solo con autorización después de confirmar esta: **4.5 — modelo final/versionamiento**. No iniciada.
