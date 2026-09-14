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
| 3.1 | Portal institucional y experiencias de acceso | Implementada; pendiente checklist local del usuario |
| 3.2 | Estructura organizacional configurable | Pendiente |
| 3.3 | Control de acceso, roles, sedes y entornos | Pendiente; base tenant desde 1.2 |
| 3.4 | Google Maps opcional para sedes e incidencias | Pendiente |
| 4.1 | Motor configurable de SLA y prioridades | Pendiente |
| 4.2 | Panel operativo de técnicos y supervisores | Pendiente |
| 4.3 | Node-RED, alertas y escalamiento | Pendiente |
| 4.4 | Primer entregable funcional consolidado | Pendiente |
| 5.1 | Omnicanalidad con correo y WhatsApp | Pendiente |
| 5.2 | Asistencia con IA | Pendiente |
| 5.3 | CMDB tecnológico y biomédico | Pendiente |
| 5.4 | Preparación del piloto institucional y analítica | Pendiente |

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
