# EsSalud Ticket System

Proyecto académico y base para el piloto de soporte técnico e infraestructura de la Red Asistencial Pasco. No es un servicio oficial desplegado de EsSalud.

**Entrega actual: subetapa 1.2 — esquema multi-tenant.** La infraestructura local de 1.1 fue verificada por el usuario. La migración de 1.2 está preparada y probada en PostgreSQL embebido; falta ejecutarla y verificarla en su Docker. La publicación en GitHub sigue pendiente.

## Comenzar

- Si ya completaste 1.1: seguir [la guía paso a paso de 1.2](docs/SUBETAPA-1.2.md). Conservar el mismo repositorio, `.env` y volúmenes.
- Si es una instalación nueva: Git, Node.js 24 y Docker Compose v2 con contenedores Linux. Desde esta carpeta, ejecutar los comandos siguientes uno por uno. Si alguno falla, detenerse y revisar su salida.

```sh
npm run env:init
npm run check
npm run infra:config
npm run infra:up
npm run infra:check
npm run db:backup
npm run db:migrate
npm run db:migrate
npm run db:status
npm run db:check
```

En Windows se puede usar `npm.cmd` en lugar de `npm`. Los scripts usan módulos nativos de Node.js; no es necesario `npm install`. El generador conserva cualquier `.env` existente.

## Qué contiene esta entrega

- PostgreSQL 17 y Redis 7.4 con volúmenes persistentes y healthchecks.
- Migración transaccional con bloqueo y registro SHA-256; repetirla no duplica objetos.
- Tres tablas: redes asistenciales, centros asistenciales y áreas.
- UUID, códigos únicos por ámbito y claves foráneas compuestas.
- Roles de propietario, migración y runtime separados.
- RLS habilitado y forzado; lecturas y escrituras limitadas al contexto de red.
- Respaldo PostgreSQL en formato custom y 22 verificaciones SQL.
- Workflow CI que arranca infraestructura, verifica un respaldo, aplica dos veces y prueba aislamiento.

La creación de usuarios, autenticación JWT, roles institucionales y alcance por sede pertenecen a la etapa 3. No hay una API ni portal ejecutables todavía. Los audit logs se implementarán en 1.3 antes de permitir mutaciones desde la API de negocio.

## Arquitectura prevista

```mermaid
flowchart LR
  WEB[Next.js / PWA] --> API[Presentacion NestJS]
  API --> APP[Casos de uso]
  APP --> DOM[Dominio y puertos]
  PRISMA[Adaptador Prisma] --> DOM
  PRISMA --> PG[(PostgreSQL / RLS)]
  APP --> REDIS[(Redis)]
  NR[Node-RED] -. Webhooks autenticados .-> API
  NR -.-> INT[SMTP / WhatsApp / Zabbix / IA]
```

Next.js, NestJS y Prisma se incorporarán en 1.4 y 1.5; Node-RED, desde 4.2. El diagrama muestra la arquitectura objetivo. Las carpetas de `apps/` aún reservan esas capas.

```mermaid
erDiagram
  REDES_ASISTENCIALES ||--o{ CENTROS_ASISTENCIALES : contiene
  CENTROS_ASISTENCIALES ||--o{ AREAS : contiene
  REDES_ASISTENCIALES {
    uuid red_asistencial_id PK
    varchar codigo UK
    varchar nombre
  }
  CENTROS_ASISTENCIALES {
    uuid red_asistencial_id PK,FK
    uuid centro_asistencial_id PK
    varchar codigo
    varchar nombre
    varchar tipo
  }
  AREAS {
    uuid red_asistencial_id PK,FK
    uuid centro_asistencial_id PK,FK
    uuid area_id PK
    varchar codigo
    varchar nombre
  }
```

Cada tabla incluye `activo`, `created_at` y `updated_at`. Las claves compuestas de los hijos preservan su jerarquía institucional. La pertenencia debe conservarse también en futuras tablas de tickets. Los índices de PK y UNIQUE comienzan por la red en los hijos y sirven a las consultas por tenant.

## Estructura

```text
apps/api/src/{domain,application,infrastructure,presentation}/
apps/web/src/
packages/contracts/
infra/postgres/init/001-bootstrap.sql
infra/postgres/migrations/0001_multi_tenant.sql
infra/postgres/verify.sql
infra/postgres/verify-multi-tenant.sql
infra/node-red/
scripts/lib/
scripts/db-{backup,migrate,status,check}.mjs
docs/
.github/workflows/ci.yml
compose.yaml
```

## Operación local

| Servicio | Desde el host | Desde la red Docker |
| --- | --- | --- |
| PostgreSQL | `127.0.0.1:55432` | `postgres:5432` |
| Redis | `127.0.0.1:56379` | `redis:6379` |

Base: `essalud_tickets`; administrador local: `bootstrap_admin`; claves en `.env`. El administrador solo se usa para herramientas de desarrollo y bootstrap. No será la credencial de la API.

`npm run infra:down` detiene sin borrar volúmenes. `npm run infra:logs` muestra diagnósticos. No usar `down --volumes` para actualizar el esquema. El SQL de `init/` solo se ejecuta en volúmenes nuevos; las migraciones funcionan sobre el volumen existente.

Si hay conflicto de puertos, cambiarlos en `.env`. Modificar la contraseña de `.env` no cambia la almacenada en un volumen PostgreSQL existente: requiere una rotación coordinada. Las imágenes usan etiquetas de rama; los digests se fijarán al preparar producción.

## Documentación

- [Guía de ejecución 1.2 y resultados esperados](docs/SUBETAPA-1.2.md).
- [Modelo, contexto tenant y límites de seguridad](docs/MULTI-TENANCY.md).
- [Git y publicación personal en GitHub](docs/GITHUB.md).
- [Cloud: preparación para 1.6](docs/CLOUD.md).
- [Estado de la hoja de ruta](docs/ROADMAP.md).
- [Evidencia y límites de las pruebas](docs/VALIDATION.md).

Fuentes: [RLS en PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [imagen oficial PostgreSQL](https://hub.docker.com/_/postgres) y [healthchecks Docker](https://docs.docker.com/compose/how-tos/startup-order/).
