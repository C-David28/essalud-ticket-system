# Política experimental de abstención 4.7

Política `category-assistance-policy-v1.0.0` para asistencia humana con el modelo `ticket-category-model-v1.0.0`, candidato ya seleccionado `linear-svc-c1`. Reutiliza las predicciones OOF de desarrollo existentes; su análisis no entrena, no carga el binario del modelo ni abre los registros o artefactos dedicados de evaluación final. NestJS aplica esta regla cuando ML está habilitado; los artefactos de 4.5/4.6 permanecen intactos.

**Origen sintético académico. Sin validación institucional.** La Model Card existente se revisó como contexto; sus resultados finales no intervienen en esta selección.

## Regla propuesta

Ofrecer una sugerencia opcional cuando el máximo margen bruto de `LinearSVC` sea **mayor o igual que −0.06**. Si es inferior, abstenerse y conservar la clasificación manual. Una sugerencia ofrecida exige confirmación humana explícita: superar el umbral no asigna una categoría automáticamente.

Aplicar la regla únicamente a una respuesta compatible: versión del modelo esperada, categoría conocida, `score_type=raw_decision_margin_not_probability`, score numérico finito y `probability=null`. Una respuesta inválida, un fallo o una indisponibilidad del servicio mantiene el flujo manual. El margen no es probabilidad ni porcentaje de confianza. La política es externa; el artefacto V1 y su salida original `operational_threshold=null` se conservan.

## Evidencia y criterios

Se filtró únicamente `linear-svc-c1` en `development-oof.csv`: 160 registros, 40 por categoría, 139 aciertos y 21 errores antes de abstenerse. Se comprobó que sus IDs coinciden exactamente con desarrollo en `splits.json`, que cada ID tiene una sola predicción OOF y que ninguno pertenece a los IDs de prueba final. Los grupos/folds se heredan del experimento original; no se redefine la partición.

Los mínimos propuestos son accuracy entre aceptados ≥0.95, cobertura total ≥0.50, al menos 10 casos aceptados de cada categoría real, al menos 10 sugerencias aceptadas de cada categoría predicha y precision ≥0.90 en cada categoría predicha. El mínimo sobre categorías reales controla exclusión; el mínimo sobre categorías predichas evita calcular precision con solo uno o dos ejemplos.

**Los criterios y ambas cuadrículas se fijaron después del experimento original y sobre desarrollo.** No estaban predeclarados en 4.4. Las mediciones sirven para seleccionar una política de demostración; no son validación independiente ni estimación de generalización. No se relajaron los mínimos tras observar la inviabilidad inicial.

Primero se recorrieron márgenes 0.00–1.00, en pasos de 0.10. Ninguno cumple todos los mínimos. En 0.00, 79/83 sugerencias son correctas (0.951807), con cobertura 83/160 (0.518750); BIOMEDICO solo aporta 9 casos reales aceptados y 7 sugerencias predichas aceptadas. Desde 0.10 la cobertura cae por debajo de 0.50.

La ampliación explícita recorre −0.10–−0.01, en pasos de 0.01. Está justificada porque un máximo de márgenes multiclase puede ser negativo: 0 no es un límite inferior necesario del dominio del score ni garantiza ausencia de errores. La fuente OOF observada tiene scores entre −0.40174913196088174 y 0.6221655898834656. Los umbrales −0.06, −0.05 y −0.04 cumplen todos los criterios, incluidos ambos mínimos de 10. Se elige la mayor cobertura entre candidatos factibles; los empates prefieren el umbral mayor. El resultado es **−0.06**.

| Umbral | Aceptados | Correctos | Abstenciones | Cobertura | Accuracy aceptados | Cumple todos los mínimos |
| ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| −0.10 | 110 | 104 | 50 | 0.687500 | 0.945455 | No |
| −0.09 | 107 | 101 | 53 | 0.668750 | 0.943925 | No |
| −0.08 | 104 | 98 | 56 | 0.650000 | 0.942308 | No |
| −0.07 | 100 | 95 | 60 | 0.625000 | 0.950000 | No |
| **−0.06** | **97** | **93** | **63** | **0.606250** | **0.958763** | **Sí** |
| −0.05 | 95 | 91 | 65 | 0.593750 | 0.957895 | Sí |
| −0.04 | 93 | 89 | 67 | 0.581250 | 0.956989 | Sí |
| −0.03 | 89 | 85 | 71 | 0.556250 | 0.955056 | No |
| −0.02 | 86 | 82 | 74 | 0.537500 | 0.953488 | No |
| −0.01 | 85 | 81 | 75 | 0.531250 | 0.952941 | No |
| 0.00 | 83 | 79 | 77 | 0.518750 | 0.951807 | No |
| 0.10 | 62 | 60 | 98 | 0.387500 | 0.967742 | No |
| 0.20 | 40 | 39 | 120 | 0.250000 | 0.975000 | No |
| 0.30 | 25 | 24 | 135 | 0.156250 | 0.960000 | No |
| 0.40 | 12 | 12 | 148 | 0.075000 | 1.000000 | No |
| 0.50 | 8 | 8 | 152 | 0.050000 | 1.000000 | No |
| 0.60 | 1 | 1 | 159 | 0.006250 | 1.000000 | No |
| 0.70–1.00, paso 0.10 | 0 | 0 | 160 | 0.000000 | No definida | No |

En −0.07, la precision de SOPORTE es 23/26 (0.884615), por lo que falla aunque la accuracy agrupada alcance 0.95. En −0.03/−0.02/−0.01, las sugerencias predichas BIOMEDICO son 9/9/8, por lo que no cumplen el mínimo de 10.

## Resultados por categoría para −0.06

Las primeras cuatro columnas agrupan por etiqueta real, con soporte 40 cada una. La precision agrupa por etiqueta predicha: su denominador es «Sugerencias predichas aceptadas». Estas dos agrupaciones no deben confundirse.

| Categoría | Casos reales aceptados | Correctos | Casos reales en abstención | Cobertura real | Sugerencias predichas aceptadas | Precision aceptada |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SOPORTE | 25 | 23 | 15 | 0.625 | 25 | 23/25 = 0.9200 |
| REDES | 30 | 30 | 10 | 0.750 | 32 | 30/32 = 0.9375 |
| INFRAESTRUCTURA | 30 | 30 | 10 | 0.750 | 30 | 30/30 = 1.0000 |
| BIOMEDICO | 12 | 10 | 28 | 0.300 | 10 | 10/10 = 1.0000 |
| Total | 97 | 93 | 63 | 0.60625 | 97 | 93/97 = 0.958763 |

La abstención retira 17 de los 21 errores OOF y también 46 de los 139 aciertos. Quedan cuatro errores entre sugerencias ofrecidas, por lo que la confirmación humana sigue siendo necesaria.

Los criterios se aplican al conjunto OOF agrupado, no se exigen en cada fold. La heterogeneidad sigue presente:

| Fold | Registros | Aceptados | Correctos | Cobertura | Accuracy aceptados |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 40 | 25 | 25 | 0.625000 | 1.000000 |
| 2 | 35 | 22 | 20 | 0.628571 | 0.909091 |
| 3 | 40 | 29 | 29 | 0.725000 | 1.000000 |
| 4 | 45 | 21 | 19 | 0.466667 | 0.904762 |

Dos folds no llegan a accuracy 0.95 entre aceptados y uno no llega a cobertura 0.50. Por ello, los mínimos agrupados no son garantías por fold, categoría real o reporte individual.

## Límites de interpretación

El modelo ya fue seleccionado con desarrollo y ahora se selecciona el umbral sobre los mismos OOF. Hay optimismo por selección; el nuevo umbral no tiene evaluación independiente. Los scores OOF provienen de cuatro modelos de fold, mientras el artefacto publicado fue ajustado con todo desarrollo: su escala de márgenes puede variar. La medición 93/97 no se transfiere automáticamente al servicio ni a tickets reales.

La precision biomédica 10/10 tiene un denominador débil y no demuestra certeza. Solo se conservan 12 de 40 casos reales biomédicos, con dos errores; 28 se derivan al flujo manual. El tamaño pequeño, el balance artificial, las familias sintéticas y la fuente académica limitan toda extrapolación. No presentar estos cocientes como «confianza del modelo» ni como aprobación institucional. La fuente solo guarda el margen máximo; no permite estudiar la distancia entre las dos mejores clases sin generar nuevos scores.

## Reproducción e integridad

Ejecutar con Python, sin instalar dependencias:

```powershell
npm.cmd run ml:policy:check
```

`ml/integration/analyze_policy.py` solo usa la biblioteca estándar de Python. Exige los SHA-256 esperados de las fuentes tras normalizar UTF-8/CRLF a LF, valida los hashes JSON canónicos de selección/protocolo/splits y produce las 21 mediciones completas y la política en el directorio ignorado `ml/outputs/policy-check`. El comando compara esa reproducción con los JSON versionados en `ml/integration` y verifica que el backend conserve el mismo umbral, política y versión de modelo. El hash del dataset se hereda del manifiesto, sin abrir el corpus; tampoco se calcula ni cambia el hash del binario del modelo. La Model Card se lee para comprobar su hash y como contexto; sus resultados finales no se utilizan en la selección.

SHA-256 de `development-oof.csv`, UTF-8 con CRLF normalizado a LF:

```text
da6d1c115a532c51e6cfa2681ebc03d92ba2c8704707945ab073e2f665e074e4
```

El JSON incluye hashes de todas las fuentes revisadas, del script y de la evidencia canónica. Estas huellas permiten reproducir e identificar esta selección; no prueban validez institucional. Se mantiene esta evidencia de política separada de entrenamiento, persistencia y evaluación originales.
