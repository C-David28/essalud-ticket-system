# Reporte experimental — plantilla sin ejecución

ID, fecha, commit, entorno Colab/local, dependencias, semilla, hashes de dataset/particiones y versión de guía: PENDIENTES.

## Protocolo

Describir hipótesis, grupos, distribución real, datos de desarrollo, prueba reservada, validación cruzada, preprocesamiento y presupuesto de búsqueda. Confirmar que ningún grupo atraviesa particiones y que el vectorizador se ajusta solo en entrenamiento.

## Comparación

Registrar baseline y candidatos con parámetros, Macro F1 media/dispersión de validación, métricas por clase, tiempos y criterio de selección. No seleccionar usando prueba final.

## Prueba final

Registrar cuándo se abrió, candidato ya elegido, métricas reales, matriz en conteos y normalizada, soporte por clase y cumplimiento o incumplimiento de criterios. No llenar este bloque antes de ejecutar.

## Errores y decisión

Mostrar IDs/textos sintéticos, etiqueta real, predicción, score interpretable, aciertos, errores y posibles causas. Documentar abstenciones y cobertura cuando corresponda. Justificar promover o no promover el candidato; no ocultar fallos ni rehacer etiquetas del test sin nueva versión declarada.

## Evidencias y reproducción

Enlazar notebook limpio, configuración, resultados, figuras, manifiestos y pasos de reproducción. Guardar tiempos y salidas reales; nunca tokens, claves ni datos privados en las evidencias.
