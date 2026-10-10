# Avance incremental

| Subetapa | Entrega | Estado |
| --- | --- | --- |
| 1.1 | Estructura, Compose, SQL técnico, Git y CI | Infraestructura local aprobada por el usuario; remoto y CI pendientes |
| 1.2 | Esquema multi-tenant, roles y restricciones | Aprobado en Docker; commit local 17eab1e; CI pendiente de confirmar |
| 1.3 | Audit logs transaccionales append-only | Aprobado por el usuario en Docker; commit local 8cbfc1e; CI pendiente de confirmar |
| 1.4 | Backend NestJS, Prisma, Clean Architecture, Swagger | Toda la checklist confirmada por el usuario |
| 1.5 | Portal Next.js y tablero técnico | Toda la checklist confirmada por el usuario |
| 1.6 | Cloud, dominio público y HTTPS verificado | Validado por el usuario; servicios cloud pausados |
| 2.1 | CRUD de tickets INC-año-secuencia | Validado por el usuario en Docker local |
| 2.2 | Máquina de estados | Validada por el usuario en Docker local |
| 2.3 | Tiempo real y autorización de suscripciones | Validada por el usuario en Docker local |
| 2.4 | Asignación manual y por carga | Validada por el usuario; Etapa 2 completada |
| 3.1 | Portal institucional y experiencias de acceso | Validada por el usuario |
| 3.2 | Estructura organizacional configurable | Validada por el usuario |
| 3.3 | Control de acceso, roles, sedes y entornos | Validada por el usuario |
| 3.4 | Google Maps opcional para sedes e incidencias | Implementada; pendiente checklist Docker y Maps del usuario |
| 4.1 | Diseño formal ML y guía de etiquetado | Diseño documentado y verificado; commit base a600cdd; ver validación 4.1 |
| 4.2 | Dataset sintético V1 separado de tickets | 200 registros, 40 familias, 37 grupos; controles offline y 28 pruebas aprobados; ver validación 4.2 |
| 4.3 | GitHub, Google Colab y entorno reproducible | Publicación/CI verificados; Colab confirmado por usuario; cierre documentado |
| 4.4 | Entrenamiento, comparación y evaluación | Ejecutada localmente: LinearSVC C=1, métricas y análisis reales; Colab/Actions confirmados por el usuario |
| 4.5 | Modelo V1, versionamiento y Model Card | Artefacto generado, carga/persistencia verificadas, Model Card; ver validación 4.5 |
| 4.6 | Servicio independiente de inferencia | Pendiente |
| 4.7 | Clasificación asistida en NestJS y Next.js | Pendiente |
| 4.8 | Fallback, historial paginado y regresión | Pendiente |
| 4.9 | Alternativa de despliegue completo, previa aprobación | Pendiente |
| 5.1 | Motor configurable de SLA y prioridades | Pendiente |
| 5.2 | Panel operativo de técnicos y supervisores | Pendiente |
| 5.3 | Node-RED, alertas y escalamiento | Pendiente |
| 5.4 | Primer entregable funcional consolidado | Pendiente |
| 6.1 | Omnicanalidad con correo y WhatsApp | Pendiente |
| 6.2 | Asistencia avanzada con IA | Pendiente |
| 6.3 | CMDB tecnológico y biomédico | Pendiente |
| 6.4 | Preparación del piloto institucional y analítica | Pendiente |

## Etapa 4 — Machine Learning

Roadmap actualizado el 2026-10-02 por solicitud del usuario. La antigua Etapa 4 pasa a Etapa 5 y la antigua Etapa 5 pasa a Etapa 6. Los estados y criterios anteriores se conservan como registro histórico; no prueban la salud cloud actual.

La entrega 4.1 comprende solamente [diseño formal, guía, esquema y plantillas](../ml/README.md). No se genera dataset ni se entrena. [Validación y evidencias](../ml/docs/VALIDATION-4.1.md). Cada subetapa requiere autorización antes de iniciar la siguiente; 4.9 requiere además aprobar una alternativa antes de migrar.

La entrega 4.2 publica [Dataset V1 y Dataset Card](../ml/datasets/v1.0.0/DATASET-CARD.md), separados de PostgreSQL operativo. [Validación y evidencias 4.2](../ml/docs/VALIDATION-4.2.md). No incluye particiones, Colab, entrenamiento ni modelos.

## Criterios de cierre de 1.1

- [x] Archivos de estructura y configuración entregados.
- [x] PostgreSQL y Redis healthy con `npm run infra:up`.
- [x] `npm run infra:check` correcto en el equipo de desarrollo, según salida del usuario.
- [x] Remoto origin configurado; publicación e historial remoto por confirmar.
- [ ] Workflow Infrastructure CI en verde en GitHub.

El usuario solicitó continuar con 1.2 tras validar la infraestructura local. La publicación remota y CI permanecen visibles como pendientes.

## Criterios de cierre de 1.2

- [x] Migración, scripts y guía completa entregados.
- [x] Pruebas de SQL y aislamiento aprobadas en PostgreSQL 17.5 embebido.
- [x] Parche aplicado y sintaxis verificada en el repositorio del usuario.
- [x] Respaldo local creado y catálogo legible.
- [x] Primera migración APPLIED y segunda SKIP.
- [x] Historial con una fila 0001_multi_tenant y su checksum.
- [x] Las 22 verificaciones de db:check aprobadas en Docker.
- [ ] Commit publicado y CI en verde.

Las verificaciones funcionales de 1.2 fueron confirmadas por el usuario. Se entrega 1.3 con la publicación GitHub aún como pendiente visible.

## Criterios de cierre de 1.3

- [x] Migración 0002, pruebas, scripts y guía entregados.
- [x] Checksum 0001 idéntico al aplicado por el usuario.
- [x] 22 verificaciones multi-tenant y 34 de auditoría en PostgreSQL 17.5 embebido.
- [x] Parche 1.3 aplicado y scripts validados por el usuario.
- [x] Nuevo respaldo creado antes de migrar.
- [x] 0001 SKIP y 0002 APPLIED; repetición con ambas SKIP.
- [x] Historial con dos migraciones y checksum 0001 conservado.
- [x] Ambas suites aprobadas en el Docker del usuario.
- [ ] Commit 1.3 publicado y CI en verde.

La validación local de 1.3 fue confirmada por el usuario; se implementa 1.4. No avanzar a 1.5 hasta completar [la checklist 1.4](SUBETAPA-1.4.md). Cada entrega incluye código completo, SQL, comandos Git, guía cloud y límites de validación.
