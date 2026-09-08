# Avance incremental

| Subetapa | Entrega | Estado |
| --- | --- | --- |
| 1.1 | Estructura, Compose, SQL técnico, Git y CI | Infraestructura local aprobada por el usuario; remoto y CI pendientes |
| 1.2 | Esquema multi-tenant, roles y restricciones | Implementado y probado en PostgreSQL embebido; pendiente de verificar en Docker del usuario |
| 1.3 | Audit logs transaccionales append-only | Pendiente |
| 1.4 | Backend NestJS, Prisma, Clean Architecture, Swagger | Pendiente |
| 1.5 | Portal Next.js y tablero técnico | Pendiente |
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
- [ ] Repositorio personal remoto creado y primer commit publicado.
- [ ] Workflow Infrastructure CI en verde en GitHub.

El usuario solicitó continuar con 1.2 tras validar la infraestructura local. La publicación remota y CI permanecen visibles como pendientes.

## Criterios de cierre de 1.2

- [x] Migración, scripts y guía completa entregados.
- [x] Pruebas de SQL y aislamiento aprobadas en PostgreSQL 17.5 embebido.
- [ ] Parche aplicado y sintaxis verificada en el repositorio del usuario.
- [ ] Respaldo local creado y catálogo legible.
- [ ] Primera migración APPLIED y segunda SKIP.
- [ ] Historial con una fila 0001_multi_tenant y su checksum.
- [ ] Las 22 verificaciones de db:check aprobadas en Docker.
- [ ] Commit publicado y CI en verde.

No avanzar a 1.3 hasta revisar estas verificaciones con el usuario. Cada entrega incluye código completo, SQL aplicable, comandos Git, guía cloud y límites explícitos de validación.
