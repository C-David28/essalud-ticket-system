# Avance incremental

| Subetapa | Entrega | Estado |
| --- | --- | --- |
| 1.1 | Estructura, Compose, SQL técnico, Git y CI | Infraestructura local aprobada por el usuario; remoto y CI pendientes |
| 1.2 | Esquema multi-tenant, roles y restricciones | Aprobado en Docker; commit local 17eab1e; CI pendiente de confirmar |
| 1.3 | Audit logs transaccionales append-only | Aprobado por el usuario en Docker; commit local 8cbfc1e; CI pendiente de confirmar |
| 1.4 | Backend NestJS, Prisma, Clean Architecture, Swagger | Toda la checklist confirmada por el usuario |
| 1.5 | Portal Next.js y tablero técnico | Implementado; build, tipos, 13 pruebas y smoke HTTP aprobados |
| 1.6 | Cloud, dominio público y HTTPS verificado | Pendiente |
| 2.1 | CRUD de tickets INC-año-secuencia | Pendiente |
| 2.2 | Máquina de estados | Pendiente |
| 2.3 | Tiempo real y autorización de suscripciones | Pendiente |
| 2.4 | Asignación manual y por carga | Pendiente |
| 3.1 | JWT y RBAC | Pendiente |
| 3.2 | Catálogo institucional validado | Pendiente |
| 3.3 | Aislamiento estricto por sede y rol | Pendiente; base tenant desde 1.2 |
| 3.4 | PWA, cola offline y conflictos | Pendiente |
| 4.1 | Motor de SLA | Pendiente |
| 4.2 | Node-RED y webhooks | Pendiente |
| 4.3 | Escalamiento programado | Pendiente |
| 4.4 | Semaforización técnica | Pendiente |
| 5.1 | Correo y WhatsApp | Pendiente |
| 5.2 | Categorización y sugerencias IA | Pendiente |
| 5.3 | CMDB | Pendiente |
| 5.4 | Analítica GCTIC | Pendiente |

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
