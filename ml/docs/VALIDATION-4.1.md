# Cierre y evidencias — subetapa 4.1

Fecha: 2026-10-02. Alcance: documentación del experimento; sin dataset, modelo ni integración.

## Verificaciones esenciales

El cierre requiere verificar correspondencia de las cuatro etiquetas con `CATEGORIES`, enlaces locales de los documentos nuevos, ausencia de artefactos de entrenamiento, coherencia del roadmap y `git diff --check`. Ejecutar también `npm.cmd run check` para conservar la comprobación existente de metadatos/sintaxis.

No se requieren migraciones, seeds, Docker, Colab ni pruebas HTTP para una entrega que no modifica comportamiento ejecutable. Estas comprobaciones no certifican la salud cloud ni resultados ML.

Resultados ejecutados el 2026-10-02:

- `npm.cmd run check`: OK, metadatos y sintaxis de 35 scripts.
- `git diff --check`: OK, sin errores de espacios; Git advierte sobre normalización CRLF/LF, sin fallo.
- Comprobación de solo lectura con Node: cuatro categorías idénticas al dominio en guía, esquema y diseño; ocho documentos Markdown ML; diez enlaces locales válidos; subetapas 4.1..4.9, 5.1..5.4 y 6.1..6.4 presentes.
- Comprobación de alcance: no existen dataset ni modelo generados dentro de `ml`; los cambios propios son documentación. La modificación previa de `.gitignore` se conserva y debe excluirse del commit de 4.1.

La primera sesión no pudo crear el commit por permisos sobre `.git/index.lock`. Al retomar 4.1 se verificó que la entrega ya está registrada en `main` como `a600cdd` (`docs(ml): define stage 4.1 classification experiment`). La publicación remota y CI no se verificaron; esta entrega no requiere desplegar.

Revisión de cierre: se precisa que la separación de familias es obligatoria en todas las particiones; si no hay suficientes grupos independientes, se reduce el número de particiones o se detiene el experimento. No se dividen familias para conseguir balance. Esta precisión no genera datos ni inicia entrenamiento.

Estado técnico: subetapa 4.1 completa en su alcance documental. La revisión de significado de etiquetas y criterios con el ingeniero sigue siendo una recomendación antes de construir/congelar el dataset, no una aprobación institucional ya obtenida. La siguiente entrega recomendada es 4.2, únicamente con autorización del usuario. No se ha iniciado.

## Revisión manual importante

1. Leer la guía con el ingeniero: confirmar especialmente INFRAESTRUCTURA frente a REDES y BIOMEDICO frente a soporte general. Las etiquetas existentes no cambian; se acuerda su significado académico.
2. Revisar objetivos prospectivos de Macro F1, recall y mejora sobre baseline antes del entrenamiento. No son cifras obtenidas.
3. Confirmar que 4.2 construirá archivos sintéticos separados, sin tocar los 20 tickets DEMO ni PostgreSQL.

No hace falta configurar GitHub, Google Colab, un token ni un servidor en 4.1. El flujo Colab se prepara en 4.3. La guía y criterios podrán ajustarse documentadamente antes de congelar Dataset V1.

## Evidencias que guardar

| Subetapa | Evidencia sin secretos |
| --- | --- |
| 4.1 | CATEGORIES en el dominio, guía y diseño aprobados, checks y commit documental |
| 4.2 | Dataset Card, conteos reales, familias, validaciones y separación de tickets operativos |
| 4.3 | Notebook abierto en Colab, carga de versión/hash correcto, dependencias y ejecución desde entorno nuevo |
| 4.4 | Comparación real, métricas por clase, matrices, grupos de partición y análisis de errores |
| 4.5 | Model Card y manifiesto con versión/hash; nunca inventar porcentajes |
| 4.6 | Health y predicción aislada, pruebas, versión cargada |
| 4.7 | Texto -> sugerencia -> aceptación/cambio -> creación manual |
| 4.8 | ML desactivado/caído, baja confianza, ticket creado y paginación de trabajo/historial |
| 4.9 | Arquitectura aprobada, backup/restauración, HTTPS público, health y flujo completo |

Esta tabla planifica evidencias futuras; no declara esas subetapas ejecutadas. No guardar capturas de variables, tokens, contraseñas ni información sensible.
