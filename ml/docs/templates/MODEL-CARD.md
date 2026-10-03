# Model Card — plantilla, no modelo entrenado

Estado: pendiente de completar en 4.5. Algoritmo, métricas y confianza: NO DISPONIBLES.

## Identificación y reproducibilidad

Documentar nombre/versión, fecha, commit, experimento seleccionado, versión/hash del dataset y particiones, algoritmo, parámetros, preprocesamiento, semilla, dependencias exactas, artefacto y checksum.

## Función y contrato

Entradas: título y descripción en español. Salida: categoría sugerida existente, versión y score solo si su interpretación está validada. Documentar límites, política de abstención, semántica de la confianza y quién decide la categoría final.

## Evaluación real

Incluir accuracy, precision/recall/F1/soporte por clase, Macro F1, F1 ponderado, matriz de confusión, validación y prueba final diferenciadas, cobertura y análisis de errores. Enlazar reportes reproducibles. No copiar métricas prospectivas como resultados.

## Uso esperado y límites

Asistente académico entrenado con textos sintéticos. No validado institucionalmente. No diagnóstico, prioridad crítica, asignación obligatoria ni creación automática. Explicar sesgos, categorías fronterizas, tamaño del test y comportamiento fuera del dominio.

## Operación segura

Documentar formato y carga desde fuente confiable, compatibilidad de versiones, timeout, modelo ausente, servicio caído, configuración para desactivar ML y continuidad manual. No dar acceso directo a PostgreSQL/Redis sin necesidad demostrada. Registrar responsables, licencia y estrategia de reemplazo/rollback.
