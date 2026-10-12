# Machine Learning — clasificación asistida de incidencias

Estado: diseño 4.1, Dataset V1 de 4.2 y preparación 4.3 confirmados. **Experimento 4.4 ejecutado localmente**, con Colab/Actions confirmados por el usuario. **4.5 publica Model V1**, pipeline completo, Model Card y carga verificada. **4.6 incorpora el servicio independiente**, con Docker y Actions confirmados por el usuario el 2026-10-10. **4.7 integra la asistencia en NestJS/Next.js**, con HTTP real y fallback verificados. **4.8 añade robustez y consultas paginadas de trabajo activo/historial**; el resultado de cada comprobación se registra en su validación, sin asumir el estado de Actions.

El modelo recibe únicamente título y descripción en español para sugerir una categoría existente. La persona decide la categoría final. Crear y gestionar tickets continúa siendo posible sin ML.

## Documentación vigente

- [Diseño formal del experimento](docs/EXPERIMENT-4.1.md).
- [Guía de etiquetado](docs/LABELING-GUIDE.md).
- [Esquema y versionamiento del dataset](docs/DATASET-SCHEMA.md).
- [Plantilla Dataset Card](docs/templates/DATASET-CARD.md).
- [Plantilla Model Card](docs/templates/MODEL-CARD.md).
- [Plantilla de reporte experimental](docs/templates/EXPERIMENT-REPORT.md).
- [Validación y evidencias de 4.1](docs/VALIDATION-4.1.md).
- [Dataset Card V1: 200 registros separados del sistema operativo](datasets/v1.0.0/DATASET-CARD.md).
- [Validación y evidencias de 4.2](docs/VALIDATION-4.2.md).
- [Guía GitHub y Colab 4.3, paso a paso](docs/COLAB-4.3.md).
- [Notebook de preparación Dataset V1](notebooks/stage-4.3-dataset-v1.ipynb).
- [Validación y evidencias de 4.3](docs/VALIDATION-4.3.md).
- [Guía de entrenamiento y evaluación 4.4](docs/COLAB-4.4.md).
- [Notebook 4.4 con prueba final protegida](notebooks/stage-4.4-training-v1.ipynb).
- [Protocolo congelado](experiments/experiment-v1.0.0/protocol.json) y [particiones](experiments/experiment-v1.0.0/splits.json).
- [Model Card V1](models/category-v1.0.0/MODEL-CARD.md), [metadatos](models/category-v1.0.0/metadata.json) y [verificación de persistencia](models/category-v1.0.0/verification.json).
- [Guía de publicación/reproducción 4.5](docs/COLAB-4.5.md), [notebook](notebooks/stage-4.5-model-v1.ipynb) y [validación 4.5](docs/VALIDATION-4.5.md).
- [Servicio de inferencia 4.6, comandos CMD y demostración](docs/SUBETAPA-4.6.md) y [validación 4.6](docs/VALIDATION-4.6.md).
- [Integración asistida 4.7 y guía Docker](docs/SUBETAPA-4.7.md), [política externa de abstención](docs/ASSISTANCE-POLICY-4.7.md) y [validación/evidencias](docs/VALIDATION-4.7.md).
- [Robustez, historial y regresión 4.8](docs/SUBETAPA-4.8.md), [validación y evidencias](docs/VALIDATION-4.8.md).
- [Resultados locales medidos](experiments/experiment-v1.0.0/local-2026-10-07/REPORT.md), [errores observados](experiments/experiment-v1.0.0/local-2026-10-07/ERROR-ANALYSIS.md) y [validación 4.4](docs/VALIDATION-4.4.md).

## Separación del sistema operativo

Las etiquetas provienen de `apps/api/src/domain/ticket.ts`, no de una taxonomía nueva. Los 200 ejemplos V1 son archivos del módulo ML: no se insertan en PostgreSQL, no tienen códigos INC y no generan auditoría, estadísticas, SSE ni marcadores de Maps. Los 20 tickets DEMO operativos siguen siendo un conjunto distinto.

Estructura actual:

```text
ml/
  docs/                  diseño, guía, tarjetas y reportes
  datasets/v1.0.0/       4.2: JSONL sintético, familias, manifiesto y tarjeta
  colab/                 4.3: preparación Python y dependencias fijadas
  scripts/              validador de dataset de solo lectura
  test/                 pruebas del validador con copias temporales
  notebooks/            4.3/4.4/4.5: notebooks reproducibles para Colab
  experimentation/      4.4: comparación, evaluación y análisis sin DB
  experiments/          4.4: protocolo, particiones y resultados reales
  modeling/             4.5: construcción, entorno aislado y carga aprobada
  models/category-v1.0.0/  pipeline skops, metadatos, tarjeta y comprobaciones
  service/              4.6: inferencia independiente
  integration/          4.7: evidencia reproducible de política externa
```

No se incluyen dependencias Python en npm ni se alteran las imágenes actuales. El entorno Colab y el servicio tienen archivos de requisitos y venv separados. El servicio usa FastAPI/Uvicorn con Python 3.12; `compose.ml.yaml` construye únicamente su imagen. El destino de despliegue público se analiza y aprueba en 4.9.

Verificar V1 con `npm run ml:data:check` y `npm run ml:data:test`, sin Docker ni credenciales. La Dataset Card declara la revisión asistida por IA y la ausencia de validación humana independiente. Los hashes normalizan solo CRLF a LF para compatibilidad Windows/Linux.

Preparación 4.3: `ml:colab:check` comprueba el notebook limpio; `ml:colab:test` ejecuta pruebas Python; `ml:colab:export` produce el ZIP privado sin token. No modifica Dataset V1 ni crea particiones.

Evaluación 4.4: `ml:experiment:build` genera el notebook limpio; `ml:experiment:check` comprueba fuentes/particiones; `ml:experiment:test` requiere Python del entorno científico 4.3 (no un Python global sin dependencias). CI lo ejecuta en el venv. Las particiones 4.4 están separadas del manifiesto inmutable V1. Selección solo con desarrollo; test explícito, decisión/hashes congelados y bloqueo de reapertura; esa subetapa no exporta modelos.

Resultado local: LinearSVC C=1, Macro F1 medio CV 0.8690; prueba sintética final 40/40 aciertos. Se conservan 21 errores OOF, sin validación institucional. Scores SVM son márgenes, no confianza probabilística ni umbral operativo validado.

En 4.7 se integra mediante un puerto de aplicación de NestJS y un adaptador HTTP. El navegador llama a Next.js/NestJS y el token ML permanece en Nest. Se reutilizan los controles de acceso/tenant actuales. El servicio no recibe sede, prioridad, identidad ni datos operativos y no necesita PostgreSQL o Redis. `ml:integration:setup` genera el overlay local; `ml:integration:up` inicia el conjunto existente; `ml:integration:check` comprueba predicción, abstención, decisión humana y persistencia auditada. `ml:policy:check` reproduce la regla empírica de margen ≥−0.06 desde desarrollo OOF, sin reentrenar ni reabrir la prueba final.

El [roadmap general](../docs/ROADMAP.md) desplaza SLA y Node-RED a Etapa 5 y la evolución Enterprise a Etapa 6. No se implementan en esta etapa.

En 4.8 el tablero consulta páginas de 25 tickets y distingue Trabajo activo de Historial. Los filtros y resúmenes se calculan dentro del alcance autorizado en PostgreSQL; el mapa utiliza agregados, no la primera página como total. El detalle se consulta por UUID. SSE invalida página, resumen y detalle; caché y mutaciones se separan por principal. `ml:robustness:check` verifica decisión manual, persistencia, auditoría, filtros, resolución, reapertura y cierre con asistencia disponible, detenida o desactivada. Los fixtures de más de 100 tickets pertenecen únicamente al entorno de integración desechable; no al dataset ML ni a la base operativa. No se requieren migraciones, seeds ni reentrenamiento para activar esta entrega.

Modelo 4.5: `npm run ml:model:setup` prepara Python 3.12 en `ml/outputs/model-environment/.venv`; `ml:model:check` verifica la publicación aprobada y ejecuta una predicción local; `ml:model:test` verifica carga, integridad, límites e independencia del holdout. `ml:model:rebuild` crea una reconstrucción separada en outputs, sin reemplazar ni aprobar automáticamente Model V1. `ml:model:notebook:check` mantiene limpio/sincronizado el notebook. No requiere Docker, PostgreSQL, Redis ni credenciales.

El modelo V1 mantiene los 160 registros de desarrollo, 40 reservados fuera del ajuste. Conserva 18 pins científicos más tres de persistencia. SHA esperado procede de `modeling/approved-release.json` revisado en Git; un recibo adjunto a un archivo recibido no es una fuente de confianza. Reproducción numérica no garantiza bytes idénticos.

Servicio 4.6: `npm run ml:service:setup` genera/conserva el token local ignorado por Git. `ml:service:config`, `ml:service:up` y `ml:service:check` validan y ejecutan el contenedor en localhost:8001. Python en Windows es opcional: `ml:service:python:setup`, `ml:service:test`, `ml:service:smoke` y `ml:service:start` preparan/prueban un entorno independiente. La API protege `/v1/predict` y `/v1/model` mediante `X-ML-Token`; salud pública local, cuerpo acotado, errores sin textos, logs sin secretos y timeout real del proceso. No accede a PostgreSQL/Redis. El margen SVM conserva su significado; no se agrega una probabilidad ni un umbral inventados.
