# Avance incremental

| Subetapa | Entrega | Estado |
| --- | --- | --- |
| 1.1 | Estructura, Compose, SQL técnico, Git y CI | Archivos entregados; ejecución Docker y publicación remota pendientes |
| 1.2 | Esquema multi-tenant, roles y restricciones | Pendiente |
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
- [ ] PostgreSQL y Redis healthy con `npm run infra:up`.
- [ ] `npm run infra:check` correcto en el equipo de desarrollo.
- [ ] Repositorio personal remoto creado y primer commit publicado.
- [ ] Workflow Infrastructure CI en verde en GitHub.

No avanzar a 1.2 hasta completar estas verificaciones. Cada turno entregará los archivos de la subetapa vigente, SQL aplicable, comandos Git, instrucciones cloud y un estado explícito de validación.
