# Esquema y versionamiento del dataset

Esquema V1 implementado en 4.2. Formato: JSONL UTF-8, un objeto por línea, en `ml/datasets/v1.0.0/incidents.jsonl`. No contiene exportaciones de PostgreSQL ni seeds operativos. Ver [Dataset Card](../datasets/v1.0.0/DATASET-CARD.md).

## Campos por registro

| Campo | Tipo/regla | Uso |
| --- | --- | --- |
| record_id | Cadena única e inmutable; convención ML-0001 | Trazabilidad independiente de INC |
| titulo | Texto, 5..200 caracteres tras trim | Entrada del modelo |
| descripcion | Texto, 10..5000 caracteres tras trim | Entrada del modelo |
| categoria | SOPORTE / REDES / INFRAESTRUCTURA / BIOMEDICO | Etiqueta esperada; jamás entrada |
| scenario_family_id | Identificador de familia del registro de escenarios | Control semántico |
| leakage_group_id | Identificador común para variantes/plantillas relacionadas | Unidad indivisible de partición |
| is_synthetic | Booleano, siempre true | Procedencia |
| source | Literal SYNTHETIC / DEMO / ACADEMIC DATASET | Procedencia |
| dataset_version | Literal tickets-category-dataset-v1.0.0 | Versión del corpus |
| label_status | APPROVED o PENDING_REVIEW | Solo APPROVED entra al corpus final |
| label_rationale | Justificación breve, sin datos sensibles | Revisión, nunca característica |

V1 incluye además `writing_style` (cotidiano/tecnico/breve/detallado/abreviado), `length_band` (breve hasta 80, normal 81..240, detallado más de 240 caracteres de descripción) e `is_boundary_case` booleano. Son metadatos de revisión, nunca entradas del modelo. No añadir sede real, pacientes, DNI, teléfonos, usuarios, contraseñas ni credenciales. No almacenar información operativa de tickets. `APPROVED` indica revisión de consistencia académica declarada en la tarjeta, no aprobación institucional.

Un registro de familias documentará qué avería representa cada `scenario_family_id`, su criterio de etiqueta y sus relaciones. Normalmente familia y grupo coinciden. Si varias familias comparten variantes casi idénticas o plantilla semántica, compartirán `leakage_group_id`, incluso entre categorías.

## Validaciones requeridas en 4.2

Comprobar parseo, campos obligatorios, tipos, IDs únicos, versiones y literales; longitudes; categorías exactas del dominio; conteo total cercano a 200 y balance cercano a 50 por clase. El archivo final publicado debe contener únicamente ejemplos APPROVED; pendientes se conservan separados y no forman parte del conteo aprobado.

Detectar duplicados exactos normalizando espacios/caso para revisión, y similitud textual excesiva como señal a revisar, no como regla ciega de descarte. Comprobar diversidad y tamaño de familias, consistencia de grupos y ausencia de pistas artificiales. Revisar manualmente sensibilidad y casos fronterizos: un detector automático no garantiza ausencia de información privada.

Validar que los archivos ML no son consumidos por `tickets:setup`, seeds ni migraciones. No crear tablas de entrenamiento ni ejecutar INSERT sobre `app.tickets`.

## Archivos de Dataset V1

- `incidents.jsonl`: corpus aprobado.
- `families.json`: registro de familias y agrupación.
- `manifest.json`: versión de esquema, versión de guía, versión del dataset, origen, fecha de publicación, conteos reales y hashes `SHA-256-UTF8-LF` (solo normalización de CRLF a LF).
- `validation-report.json`: resultados reales de los controles offline, sin entrenamiento.
- `DATASET-CARD.md`: tarjeta completada a partir de la plantilla, con cifras verificadas.

Las particiones todavía no existen. En 4.3 se podrán preparar IDs de desarrollo y prueba final, semilla, método y grupos, en un manifiesto separado asociado a la versión/hash del corpus. Así el diseño de particiones no obliga a sobrescribir Dataset V1. Cualquier añadido o cambio dentro de una publicación congelada requiere versionamiento explícito; no editar silenciosamente su manifiesto.

Git podrá versionar el pequeño dataset sintético, notebook limpio, manifiestos, configuración, tarjetas y reportes. El commit identifica exactamente el estado utilizado. Un hash asegura integridad, no legitimidad o privacidad por sí solo.

Convención: `tickets-category-dataset-v1.0.0`. PATCH para correcciones de documentación sin cambiar ejemplos; MINOR para cambios de registros/etiquetas manteniendo tarea y esquema compatible; MAJOR para taxonomía, tarea o esquema incompatible. Toda modificación de texto/etiqueta cambia al menos MINOR, hashes y resultados asociados. Nunca sobrescribir silenciosamente un corpus ya utilizado.

Modelo futuro: `ticket-category-model-v1.0.0`, asociado a versión/hash del dataset, particiones, guía, commit, algoritmo, parámetros, versiones de dependencias y métricas reales. Experimentos: `exp-YYYYMMDD-NNN`, cada uno con configuración y resultados. No versionar secretos, cachés ni salidas de notebook que los contengan.

Los binarios del modelo no se cargarán desde una fuente arbitraria. En 4.5 se decidirá formato y distribución, fijando compatibilidad de dependencias, procedencia y checksum; formatos basados en pickle/joblib pueden ejecutar código y requieren artefactos confiables. No instalar ni cargar modelos en esta subetapa.
