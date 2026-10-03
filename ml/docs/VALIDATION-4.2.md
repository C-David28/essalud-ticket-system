# Cierre y evidencias — subetapa 4.2

Fecha: 2026-10-02. Alcance: dataset sintético separado, controles y pruebas. Sin Colab, particiones, entrenamiento, modelo ni despliegue.

## Resultado

Dataset `tickets-category-dataset-v1.0.0`: 200 registros aprobados para consistencia académica, 50 por categoría, 40 familias y 37 grupos, cinco variantes por familia. Tres pares de familias se agrupan conservadoramente por contexto/síntoma común, incluyendo grupos entre categorías. Incluye 40 descripciones breves, 120 normales, 40 detalladas y 70 casos fronterizos. No hubo revisión humana independiente; la [Dataset Card](../datasets/v1.0.0/DATASET-CARD.md) lo declara.

## Comandos locales

Desde CMD:

```bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
npm.cmd run ml:data:check
npm.cmd run ml:data:test
npm.cmd run check
git status --short
```

El primero debe informar 200 registros, 40 familias y 37 grupos; cuatro categorías con 50 cada una; checksums correctos. El segundo debe terminar con 28 pruebas aprobadas y cero fallos. No requiere levantar Docker ni disponer de credenciales.

Para inspeccionar el reporte en JSON, sin escribir ni cambiar archivos:

```bat
node ml/scripts/validate-dataset.mjs --json
```

La validación compara 19 900 pares, detecta duplicados, campos incorrectos, etiquetas incompatibles, grupos, patrones sensibles y alteraciones de integridad. Cero candidatos de similitud por encima de los umbrales documentados. Las pruebas alteran únicamente copias temporales y verifican rechazos reales; no son pruebas de accuracy del modelo.

Verificaciones adicionales de cierre: `npm.cmd run check` aprobado (35 scripts existentes); enlaces locales Markdown del módulo revisados; `git diff --check` sin errores. La revisión de referencias en API, frontend, scripts operativos, configuración y SQL no encontró consumidores de `ml/datasets` ni `incidents.jsonl`. No se ejecutaron mutaciones de PostgreSQL/Redis ni cambios de frontend/backend.

No ejecutar `tickets:setup` ni migraciones para cargar estos ejemplos. Los 200 registros **no se importan** a PostgreSQL. Los comandos de datos operativos mantienen su significado y no fueron modificados. El cambio de `package.json` solo añade `ml:data:check` y `ml:data:test`; no agrega dependencias ni necesita cambiar el lockfile.

## Revisión manual útil

1. Abrir el JSONL y el catálogo de familias en el editor. Revisar ejemplos de las cuatro clases, abreviados y fronterizos; las columnas auxiliares no serán entradas del modelo.
2. Compartir con el ingeniero la guía y la advertencia de procedencia sintética de la tarjeta. Si propone corregir textos/etiquetas tras publicar V1, registrar una nueva versión.
3. Si la interfaz local está en ejecución, comprobar que su catálogo DEMO sigue sin estos registros ML. No es necesario iniciar servicios solo para una entrega de archivos offline.

No hay configuración manual de Google Colab, tokens ni servidores en esta entrega. GitHub solo necesita la publicación normal del commit cuando el usuario decida hacerlo; revisar `git status` y no incluir secretos ni el cambio previo ajeno de `.gitignore`.

## Evidencias

Guardar captura de: ruta del dataset separado y marcas sintéticas; tabla de distribución y límites de la Dataset Card; salida de `ml:data:check`; las 28 pruebas; catálogo de familias y grupos; manifiesto/hash; commit de 4.2. No presentar el análisis de calidad como métricas de entrenamiento.

## Continuidad

4.1 permanece como diseño histórico. V1 no se sobrescribe silenciosamente. La guía usada está enlazada por checksum. Próxima entrega recomendada: **4.3 — GitHub + Google Colab + entorno reproducible**, solo con autorización del usuario. No iniciada.
