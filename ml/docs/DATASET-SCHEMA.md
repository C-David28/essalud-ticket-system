# Esquema y versionamiento del dataset

Diseño V1; todavía no existe un dataset. Formato previsto: JSONL UTF-8, un objeto por línea, en `ml/datasets/v1.0.0/incidents.jsonl`. No contiene exportaciones de PostgreSQL ni seeds operativos.

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

Metadatos opcionales de revisión: estilo de redacción, banda de longitud y observación de frontera. No añadir sede real, pacientes, DNI, teléfonos, usuarios, contraseñas ni credenciales. No almacenar información operativa de tickets.

Un registro de familias documentará qué avería representa cada `scenario_family_id`, su criterio de etiqueta y sus relaciones. Normalmente familia y grupo coinciden. Si varias familias comparten variantes casi idénticas o plantilla semántica, compartirán `leakage_group_id`, incluso entre categorías.

## Validaciones requeridas en 4.2

Comprobar parseo, campos obligatorios, tipos, IDs únicos, versiones y literales; longitudes; categorías exactas del dominio; conteo total cercano a 200 y balance cercano a 50 por clase. El archivo final publicado debe contener únicamente ejemplos APPROVED; pendientes se conservan separados y no forman parte del conteo aprobado.

Detectar duplicados exactos normalizando espacios/caso para revisión, y similitud textual excesiva como señal a revisar, no como regla ciega de descarte. Comprobar diversidad y tamaño de familias, consistencia de grupos y ausencia de pistas artificiales. Revisar manualmente sensibilidad y casos fronterizos: un detector automático no garantiza ausencia de información privada.

Validar que los archivos ML no son consumidos por `tickets:setup`, seeds ni migraciones. No crear tablas de entrenamiento ni ejecutar INSERT sobre `app.tickets`.

## Archivos futuros de Dataset V1

- `incidents.jsonl`: corpus aprobado.
- `families.json`: registro de familias y agrupación.
- `manifest.json`: versión de esquema, versión de guía, versión del dataset, origen, fecha de publicación, conteos reales y SHA-256 de archivos.
- `splits.json`: IDs de desarrollo y prueba final, semilla, método y grupos; se congela antes de 4.4. Puede prepararse en 4.3 tras validar V1; cualquier añadido al paquete cambia su manifiesto/versionamiento.
- `DATASET-CARD.md`: tarjeta completada a partir de la plantilla, con cifras verificadas.

Git podrá versionar el pequeño dataset sintético, notebook limpio, manifiestos, configuración, tarjetas y reportes. El commit identifica exactamente el estado utilizado. Un hash asegura integridad, no legitimidad o privacidad por sí solo.

Convención: `tickets-category-dataset-v1.0.0`. PATCH para correcciones de documentación sin cambiar ejemplos; MINOR para cambios de registros/etiquetas manteniendo tarea y esquema compatible; MAJOR para taxonomía, tarea o esquema incompatible. Toda modificación de texto/etiqueta cambia al menos MINOR, hashes y resultados asociados. Nunca sobrescribir silenciosamente un corpus ya utilizado.

Modelo futuro: `ticket-category-model-v1.0.0`, asociado a versión/hash del dataset, particiones, guía, commit, algoritmo, parámetros, versiones de dependencias y métricas reales. Experimentos: `exp-YYYYMMDD-NNN`, cada uno con configuración y resultados. No versionar secretos, cachés ni salidas de notebook que los contengan.

Los binarios del modelo no se cargarán desde una fuente arbitraria. En 4.5 se decidirá formato y distribución, fijando compatibilidad de dependencias, procedencia y checksum; formatos basados en pickle/joblib pueden ejecutar código y requieren artefactos confiables. No instalar ni cargar modelos en esta subetapa.
