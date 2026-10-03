# Machine Learning — clasificación asistida de incidencias

Estado: diseño documental de la **subetapa 4.1**. No hay dataset, entrenamiento, modelo, endpoint ML ni modificación del sistema operativo en esta entrega.

El modelo futuro recibirá únicamente título y descripción en español para sugerir una categoría existente. La persona decide la categoría final. Crear y gestionar tickets seguirá siendo posible sin ML.

## Documentación vigente

- [Diseño formal del experimento](docs/EXPERIMENT-4.1.md).
- [Guía de etiquetado](docs/LABELING-GUIDE.md).
- [Esquema y versionamiento del dataset](docs/DATASET-SCHEMA.md).
- [Plantilla Dataset Card](docs/templates/DATASET-CARD.md).
- [Plantilla Model Card](docs/templates/MODEL-CARD.md).
- [Plantilla de reporte experimental](docs/templates/EXPERIMENT-REPORT.md).
- [Validación y evidencias de 4.1](docs/VALIDATION-4.1.md).

## Separación del sistema operativo

Las etiquetas provienen de `apps/api/src/domain/ticket.ts`, no de una taxonomía nueva. Los aproximadamente 200 ejemplos futuros serán archivos del módulo ML: no se insertarán en PostgreSQL, no tendrán códigos INC y no generarán auditoría, estadísticas, SSE ni marcadores de Maps. Los 20 tickets DEMO operativos siguen siendo un conjunto distinto.

Estructura prevista; solamente `README.md` y `docs/` existen en 4.1:

```text
ml/
  docs/                  diseño, guía, tarjetas y reportes
  datasets/v1.0.0/       4.2: JSONL sintético, manifiesto, particiones
  notebooks/            4.3: notebook reproducible para Colab
  experiments/          4.4: parámetros, métricas, errores y figuras
  models/               4.5: manifiesto y referencias a artefactos
  service/              4.6: inferencia independiente
```

No se incluyen dependencias Python en npm ni se alteran las imágenes actuales. Sus versiones se fijarán en 4.3. La tecnología concreta del servicio se decide en 4.6; el destino de despliegue se analiza y aprueba en 4.9.

En 4.7 se integrará mediante un puerto de aplicación de NestJS y un adaptador HTTP. El navegador llamará a Next.js/NestJS, nunca directamente al modelo. El servicio ML no necesitará acceso a PostgreSQL ni Redis. Los controles actuales de acceso, tenant y rate limiting deberán conservarse.

El [roadmap general](../docs/ROADMAP.md) desplaza SLA y Node-RED a Etapa 5 y la evolución Enterprise a Etapa 6. No se implementan en esta etapa.
