# Dataset Card — Tickets Category Dataset V1

**SYNTHETIC / DEMO / ACADEMIC DATASET. No representa incidencias reales de EsSalud.**

Versión: `tickets-category-dataset-v1.0.0`. Esquema: 1. Publicación local: 2026-10-02. Guía: V1. Diseño base: commit `fff0e99`. El commit de la entrega identifica los archivos publicados; los hashes de contenido están en [manifest.json](manifest.json).

## Finalidad y procedencia

Experimento académico de clasificación asistida en español. Entradas previstas: solo `titulo` y `descripcion`; etiqueta esperada: `categoria`. El corpus no pretende diagnosticar fallas, tomar decisiones clínicas, asignar técnicos ni calcular prioridad o SLA.

Los textos se redactaron individualmente con asistencia de IA a partir de la [guía de etiquetado](../../docs/LABELING-GUIDE.md). No se exportaron tickets, historias clínicas, documentos privados ni registros institucionales. No se consultaron fuentes externas para generar casos supuestamente reales. Los sitios mencionados son explícitamente ficticios. No hay pacientes, contactos, contraseñas ni identificadores institucionales.

La revisión de redacción y consistencia de etiquetas fue realizada por el mismo asistente que redactó el corpus. **No hubo un segundo revisor humano independiente ni aprobación institucional.** `APPROVED` significa apto para el corpus académico según esa revisión de consistencia; no significa validado por EsSalud. El ingeniero puede revisar etiquetas antes de congelar el experimento. Una corrección posterior de texto/etiqueta requiere una nueva versión, no sobrescribir V1.

No se ha asignado una licencia abierta de redistribución. El responsable del proyecto debe decidirla antes de autorizar reutilización externa. No se incorporó un dataset de terceros.

## Contenido y distribución verificada

| Categoría exacta del dominio | Registros | Familias | Grupos de fuga |
| --- | ---: | ---: | ---: |
| SOPORTE | 50 | 10 | 10 |
| REDES | 50 | 10 | 10 |
| INFRAESTRUCTURA | 50 | 10 | 10 |
| BIOMEDICO | 50 | 10 | 9 |
| Total (grupos únicos) | 200 | 40 | 37 |

Cada familia tiene cinco variantes redactadas por separado. No se generó diversidad sustituyendo solamente sede o área en una plantilla. Hay 40 textos de estilo cotidiano, 40 técnico, 40 breve, 40 detallado y 40 abreviado; son metadatos de autoría, no características del modelo. Se incluyeron abreviaturas y algunas omisiones de tildes razonables, sin degradar artificialmente todo el corpus.

Bandas por longitud de descripción: 40 breves (hasta 80 caracteres), 120 normales (81..240), 40 detalladas (más de 240). Mínimo observado: 49 caracteres; máximo: 391. No representan todo el rango de hasta 5000 caracteres aceptado por la API. Hay 70 registros marcados como fronterizos: impresión local frente a LAN, aplicación frente a conexión, monitor de escritorio frente a biomédico, y alimentación del ambiente frente a componente interno médico, entre otros.

El [catálogo de familias](families.json) documenta síntomas y criterio de etiqueta. Cada familia pertenece íntegramente a un grupo de fuga indivisible. La revisión conservadora une tres pares: `sup-usb-printer` con `net-shared-printer` (contexto de impresión y prueba local); `inf-ups` con `bio-oximeter` (autonomía de alimentación externa frente a interna); `bio-monitor` con `bio-ecg` (detección de accesorios de adquisición médica). Dos grupos abarcan categorías distintas, por lo que los conteos por categoría no se suman para obtener grupos únicos. Las otras familias mantienen grupos independientes. Compartir términos generales como «equipo» no obliga a unir familias distintas. Esta agrupación no garantiza independencia semántica perfecta.

## Archivos y esquema

- [incidents.jsonl](incidents.jsonl): 200 objetos UTF-8, uno por línea, IDs `ML-0001`..`ML-0200`.
- [families.json](families.json): definición y grupo de las 40 familias.
- [manifest.json](manifest.json): distribución, procedencia, estado de revisión y SHA-256.
- [validation-report.json](validation-report.json): resultados reales reproducibles de la validación, sin métricas de un modelo.
- Esta tarjeta: metodología, límites y utilización.

Cada registro contiene título, descripción, categoría, familia, grupo, origen sintético, versión, estado/razón de etiqueta y metadatos de diversidad. Ver [esquema detallado](../../docs/DATASET-SCHEMA.md). IDs, razones de etiqueta, familia, grupo, estilo y todas las demás columnas auxiliares **no se deben pasar al clasificador**.

Hashes calculados sobre UTF-8 con CRLF convertido a LF (`SHA-256-UTF8-LF`); ningún otro espacio o signo se normaliza para integridad. Esto conserva compatibilidad Windows/Linux y el `eol=lf` existente en Git. Los hashes cubren corpus, familias y guía de etiquetado. La tarjeta y el reporte están versionados por Git, fuera de la lista de hashes de contenido para evitar dependencias circulares.

## Validación ejecutada

`npm.cmd run ml:data:check`: 200 registros, balance 50 por clase, 40 familias y 37 grupos, cinco variantes por familia, metadatos y categorías compatibles, checksums correctos. Cero duplicados de texto o descripción normalizados. Cero coincidencias en los patrones automáticos de información sensible definidos; esto no es garantía absoluta de privacidad.

Similitud: se compararon 19 900 pares por Jaccard de conjuntos de palabras normalizadas (sin una lista pequeña de palabras funcionales) y Dice de 4-gramas de caracteres. Umbrales de revisión: Jaccard >= 0.50 o Dice >= 0.80; de rechazo por similitud excesiva: Jaccard >= 0.80 o Dice >= 0.92. No hubo candidatos por encima del umbral de revisión. Máximos entre grupos distintos: Jaccard 0.2222 y Dice 0.4727. No se modificaron umbrales para conseguir que el corpus pasara. Los algoritmos detectan repetición léxica, no prueban diversidad clínica o generalización.

`npm.cmd run ml:data:test`: 28 pruebas aprobadas, incluyendo casos alterados, categorías inválidas, variantes fuera de su grupo, datos de contacto en texto/metadatos, duplicados, JSON inválido, reporte reproducible y hashes Windows/Linux. Las pruebas usan copias temporales, no cambian este corpus ni acceden a bases de datos.

## Particiones y experimentos

No hay particiones, entrenamiento, métricas predictivas ni selección de modelo en 4.2. La próxima subetapa 4.3 preparará la carga reproducible de V1 en Colab. Las particiones se registrarán por separado, asociadas al hash del corpus, antes de entrenar en 4.4. Objetivo previsto: aproximadamente 160 ejemplos de desarrollo y 40 de prueba final, con familias separadas; la distribución real se verificará entonces.

El archivo está ordenado por categoría/familia para revisión: **no separar entrenamiento/prueba por posición de fila ni dividir aleatoriamente variantes sin grupos**. El test se protege durante selección de modelos. Los 20 tickets DEMO operativos no sirven como test independiente.

## Separación operativa y límites

Estos 200 registros existen solamente como archivos ML. No se insertaron en `app.tickets`, no reciben códigos INC, no generan auditoría/SSE ni aparecen en dashboard, Kanban o Maps. Los seeds, migraciones, frontend y API existentes no consumen estos archivos. `ml:data:check` es independiente de `demo:data:check`.

El corpus es pequeño, artificialmente balanceado y redactado por una sola fuente asistida. Puede favorecer vocabulario evidente y contiene evidencia técnica más clara que muchos reportes reales. No representa frecuencias institucionales ni todas las ambigüedades, especialidades, longitudes o estilos locales. Los casos de información insuficiente y averías independientes múltiples se excluyeron: futuros usuarios pueden escribirlos y ML deberá permitir abstención y selección manual.

No hay validación externa. No atribuir accuracy, F1 ni porcentajes de confianza a este dataset sin un experimento real. No usarlo para diagnóstico, seguridad clínica ni producción institucional obligatoria. Primera publicación: V1; cualquier cambio de registros o etiquetas deberá documentarse en otra versión.
