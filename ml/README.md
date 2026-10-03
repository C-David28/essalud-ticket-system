# Machine Learning — clasificación asistida de incidencias

Estado: diseño 4.1 y **Dataset sintético V1 de la subetapa 4.2** disponibles. No hay entrenamiento, modelo ni endpoint ML.

El modelo futuro recibirá únicamente título y descripción en español para sugerir una categoría existente. La persona decide la categoría final. Crear y gestionar tickets seguirá siendo posible sin ML.

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

## Separación del sistema operativo

Las etiquetas provienen de `apps/api/src/domain/ticket.ts`, no de una taxonomía nueva. Los 200 ejemplos V1 son archivos del módulo ML: no se insertan en PostgreSQL, no tienen códigos INC y no generan auditoría, estadísticas, SSE ni marcadores de Maps. Los 20 tickets DEMO operativos siguen siendo un conjunto distinto.

Estructura actual y futura; notebooks, experimentos, modelos y servicio todavía no existen:

```text
ml/
  docs/                  diseño, guía, tarjetas y reportes
  datasets/v1.0.0/       4.2: JSONL sintético, familias, manifiesto y tarjeta
  scripts/              validador de dataset de solo lectura
  test/                 pruebas del validador con copias temporales
  notebooks/            4.3: notebook reproducible para Colab
  experiments/          4.4: parámetros, métricas, errores y figuras
  models/               4.5: manifiesto y referencias a artefactos
  service/              4.6: inferencia independiente
```

No se incluyen dependencias Python en npm ni se alteran las imágenes actuales. Sus versiones se fijarán en 4.3. La tecnología concreta del servicio se decide en 4.6; el destino de despliegue se analiza y aprueba en 4.9.

Verificar V1 con `npm run ml:data:check` y `npm run ml:data:test`, sin Docker ni credenciales. La Dataset Card declara la revisión asistida por IA y la ausencia de validación humana independiente. Los hashes normalizan solo CRLF a LF para compatibilidad Windows/Linux.

En 4.7 se integrará mediante un puerto de aplicación de NestJS y un adaptador HTTP. El navegador llamará a Next.js/NestJS, nunca directamente al modelo. El servicio ML no necesitará acceso a PostgreSQL ni Redis. Los controles actuales de acceso, tenant y rate limiting deberán conservarse.

El [roadmap general](../docs/ROADMAP.md) desplaza SLA y Node-RED a Etapa 5 y la evolución Enterprise a Etapa 6. No se implementan en esta etapa.
