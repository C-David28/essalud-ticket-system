# Diseño formal — experimento de clasificación de incidencias

Identificador: `ticket-category-exp-design-v1`. Fecha: 2026-10-02. Estado: diseño, sin ejecución ni métricas. Alcance: subetapa 4.1.

## 1. Estado heredado y compatibilidad

Se revisaron el monorepo npm, contratos de tickets, DTO, repositorio Prisma, control de acceso, catálogo DEMO, cliente web, Compose, Dockerfiles, CI y documentación cloud. El sistema usa TypeScript, NestJS, Next.js, PostgreSQL con RLS y auditoría transaccional, Redis para eventos y Maps opcional. Las migraciones SQL existentes son la autoridad del esquema; Prisma las mapea.

No se encontró un impedimento estructural para ML opcional. Esta entrega no modifica API, interfaz, esquema, seeds, variables, dependencias ni despliegues. Vercel y Railway están documentados como proveedores actuales; su salud pública no se verificó en esta subetapa. El fallo previo de PostgreSQL cloud requiere comprobar readiness antes de cualquier integración productiva. El cliente web consulta la primera página de hasta 100 tickets: su corrección está reservada a 4.8.

## 2. Problema e hipótesis

Clasificación supervisada multiclase de texto en español, con una sola etiqueta por incidencia. Supervisada significa aprender de ejemplos con categoría revisada. Hipótesis: un clasificador textual puede superar un predictor trivial al clasificar familias sintéticas no vistas durante entrenamiento, dentro del alcance académico.

No buscamos diagnosticar la causa física del fallo, predecir prioridad, atender pacientes, asignar técnicos, calcular SLA ni sustituir decisiones humanas. Tampoco afirmaremos capacidad institucional basándonos únicamente en textos sintéticos.

## 3. Entradas y salidas

Entradas: `titulo` y `descripcion`, escritas antes de crear el ticket. Límites de compatibilidad de la API actual: título de 5 a 200 caracteres; descripción de 10 a 5000, después de quitar espacios exteriores. La interfaz puede imponer límites más pequeños. El preprocesamiento final se fijará y versionará en 4.3/4.4; entrenamiento e inferencia deben aplicar exactamente el mismo.

No son características del modelo: sede, área, tenant, usuario, código INC, categoría seleccionada, prioridad, estado, asignación, fechas, solución, historial ni metadatos del dataset. Evitamos aprender atajos o utilizar información que no existe al solicitar la sugerencia.

Salida conceptual: una de `SOPORTE`, `REDES`, `INFRAESTRUCTURA`, `BIOMEDICO`; identificación del modelo y, solo si el estimador lo permite y se evalúa adecuadamente, una probabilidad estimada. Un margen de decisión no equivale a una probabilidad. La respuesta podrá indicar que no existe una sugerencia utilizable por baja confianza o indisponibilidad, sin añadir una quinta clase al dominio.

El usuario acepta, ignora o cambia la sugerencia. ML nunca crea el ticket ni cambia automáticamente su categoría. El contrato HTTP concreto se definirá en 4.6/4.7.

## 4. Fuente de verdad y etiquetado

Las cuatro etiquetas exactas se toman de `apps/api/src/domain/ticket.ts`, constante `CATEGORIES`, y coinciden con `CreateTicketDto`. La [guía de etiquetado](LABELING-GUIDE.md) establece el significado académico y fronteras operativas. El código existente fija los nombres, pero no una definición institucional oficial; el ingeniero debe revisar esa interpretación antes de generar Dataset V1.

No se adivinan causas ausentes del texto. Casos con información insuficiente se marcan pendientes y no entran al corpus aprobado. Casos con varias averías independientes se separan o excluyen. Casos fronterizos con evidencia suficiente sí entran, con razón de etiquetado explícita.

## 5. Familias y diversidad prevista

Objetivo inicial: aproximadamente 200 registros aprobados, 50 por categoría. Diseñar unas 10 familias por categoría y 5 variantes por familia; estos números son objetivos, no registros ya generados.

| Categoría | Familias posibles, sujetas a revisión en 4.2 |
| --- | --- |
| SOPORTE | inicio de sesión local, aplicación de oficina, sistema operativo, lentitud de estación, disco local, periféricos, impresora local, digitalización, instalación de aplicación, archivo local |
| REDES | Wi-Fi, puerto LAN, switch, cableado de datos, DNS, DHCP, VLAN, enlace entre sedes DEMO, salida a Internet, conectividad de impresora compartida |
| INFRAESTRUCTURA | UPS, alimentación eléctrica, tomacorriente, refrigeración de sala técnica, ventilación de rack, gabinete, puesta a tierra, regleta, respaldo eléctrico, soporte físico de equipos |
| BIOMEDICO | monitor de signos, bomba de infusión, electrocardiógrafo, desfibrilador, pulsioxímetro, equipo de aspiración, esterilizador, equipo de laboratorio, sensor biomédico, software dedicado del equipo médico |

Una familia representa un problema conceptual; no se crea otra familia solo cambiando sede, nombres o palabras. Debe haber redacción cotidiana y técnica, textos breves y detallados, abreviaturas y algunos errores razonables. Ningún texto incluirá personas, pacientes, identificadores reales ni instrucciones clínicas.

## 6. Prevención de fuga de información

Fuga significa que información de evaluación termina ayudando al entrenamiento y exagera el resultado.

1. Revisar etiquetas, duplicados y familias antes de entrenar. Asignar `leakage_group_id` común a todas las variantes de un mismo escenario o plantilla, incluso si atraviesan categorías.
2. Reservar alrededor del 20% por grupos como prueba final: objetivo 40 ejemplos, cerca de 10 por clase. Mantener clases representadas; si los grupos impiden cifras exactas, registrar la distribución real y justificarla.
3. Congelar IDs de particiones y hashes antes de comparar modelos. No consultar errores ni métricas de prueba final para elegir algoritmo, parámetros, vocabulario o umbral.
4. Usar los aproximadamente 160 restantes para entrenamiento y validación cruzada con objetivo de 4 particiones. La separación por grupos es obligatoria; la estratificación busca conservar representación de clases. Comprobar que cada partición tenga todas las clases. Si la cantidad de grupos independientes no permite 4 particiones válidas, reducir el número de particiones y documentarlo antes de entrenar. Nunca dividir una familia, cambiar etiquetas ni redefinir grupos solo para satisfacer el balance. Si ni siquiera es posible una validación por grupos con clases representadas, detener el experimento y revisar el diseño del dataset antes de congelarlo.
5. Ajustar vocabulario TF-IDF, normalización aprendida, selección de características, calibración y modelo exclusivamente dentro de cada partición de entrenamiento, mediante un pipeline.
6. No dividir variantes de la misma familia entre entrenamiento y prueba. Detectar similitud léxica entre grupos como ayuda a revisión, sin tratarla como prueba de independencia semántica. Una familia exclusiva de prueba puede compartir vocabulario natural del dominio.
7. El test final no participa en el ajuste del modelo que se evaluará. Una revisión posterior del dataset exige nueva versión y nueva evaluación declarada; no repetir cambios hasta conseguir un número favorable.

Los tickets operativos DEMO no serán datos de entrenamiento ni una prueba independiente. Una demostración con textos nuevos tampoco sustituye el test congelado. Con tan pocos grupos, las métricas serán sensibles a la partición: reportar tamaños, grupos y variabilidad.

## 7. Candidatos y selección posterior

No hay modelo seleccionado en 4.1. En 4.4 se comparará un baseline trivial (`DummyClassifier`, mayoría o estratificado con semilla) con dos candidatos ligeros: TF-IDF + regresión logística y TF-IDF + SVM lineal. El segundo produce márgenes; no presentarlos como porcentajes de confianza. Si se calibra, hacerlo solo con datos de desarrollo y grupos separados. No se requiere GPU ni LLM para este experimento.

Se fija semilla, versiones y presupuesto pequeño de parámetros antes de ejecutar. Selección mediante Macro F1 de validación cruzada; ante diferencias menores que la variabilidad observada, preferir simplicidad, tiempo de inferencia y salida de score interpretable. El algoritmo definitivo depende de resultados reales.

## 8. Evaluación y criterios prospectivos

Métrica principal: Macro F1, promedio de F1 por categoría con el mismo peso para cada clase. Reportar también accuracy, precision/recall/F1 y soporte por clase, F1 ponderado, matriz de confusión en conteos y normalizada por fila. Mostrar media y dispersión de validación, distribución de grupos y resultados finales por separado. Con unos 10 casos de prueba por categoría, un único error cambia mucho su recall.

Objetivos iniciales para una integración experimental: Macro F1 de validación >= 0.70, recall de cada clase >= 0.60 y mejora absoluta de Macro F1 >= 0.10 respecto del baseline bajo las mismas particiones. Son criterios de aceptación académica propuestos, no métricas obtenidas ni garantía institucional. Confirmarlos antes de 4.4. Si ningún candidato los alcanza, documentar el fallo y revisar el experimento; no promover un modelo ocultando el resultado.

Evaluar una sola vez el candidato elegido en la prueba final y contrastarlo con los mismos objetivos. Un resultado final insuficiente impide declararlo apto; no reutilizar el test como validación. La política de baja confianza se seleccionará con validación, mostrando cobertura (porción de textos con sugerencia), exactitud de las sugerencias aceptadas y abstenciones por clase. No fijar arbitrariamente una confianza de 80% ni prometer una calibración fiable con 200 ejemplos.

Análisis de errores obligatorio: texto sintético, etiqueta real, predicción, score si válido y explicación probable. Distinguir errores del modelo de etiquetas discutibles. Mostrar aciertos y fallos, especialmente fronteras SOPORTE/REDES, REDES/INFRAESTRUCTURA y BIOMEDICO/otras. Versionar cualquier corrección; nunca modificar silenciosamente la prueba.

## 9. Limitaciones y alcance seguro

Dataset pequeño, balanceado artificialmente, sintético y sin validación institucional. La diversidad de autor/redacción puede ser limitada; separar grupos reduce, pero no elimina, el sesgo. No conocemos distribución real, tasas de ambigüedad ni calidad de futuros textos. No se demuestra diagnóstico, seguridad clínica, cobertura nacional ni calidad sobre incidentes reales.

Las etiquetas son rutas de atención, no niveles de peligro. Una avería médica o eléctrica puede requerir protocolos institucionales independientes de esta sugerencia. Nunca enviar información sensible al notebook. En futuras integraciones, limitar texto y logs, autenticar el servicio y aplicar timeout/fallback sin afectar transacciones operativas.

## 10. Reproducibilidad y próximas entregas

El [esquema](DATASET-SCHEMA.md) fija versiones y manifiestos. Las tarjetas y reportes están en `templates/`; no contienen resultados inventados. 4.2 produce únicamente el dataset separado y sus validaciones. 4.3 prepara Colab y dependencias; 4.4 ejecuta comparaciones; 4.5 versiona el modelo; 4.6 servicio; 4.7 integración; 4.8 robustez e historial; 4.9 analiza alternativas de despliegue antes de migrar.

Referencias metodológicas: [validación por grupos en scikit-learn](https://scikit-learn.org/stable/modules/cross_validation.html), [métricas y baseline](https://scikit-learn.org/stable/modules/model_evaluation.html), [persistencia y compatibilidad de modelos](https://scikit-learn.org/stable/model_persistence.html). Son referencias, no dependencias instaladas en esta entrega.
