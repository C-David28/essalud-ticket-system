# Evidencia de validación — subetapa 3.2

Fecha: 2026-09-14.

## Cobertura

- Aplicación acumulativa de las migraciones 0001–0006 y RLS forzado en roles.
- Trece controles SQL sobre privilegios, auditoría, aislamiento y contexto tenant.
- Validación estricta del JSON y seed repetible sin duplicar sedes, áreas ni roles.
- Repositorio Prisma por tenant y controlador HTTP que deriva la identidad desde configuración confiable.
- Proxy Next.js sin clave en el cliente y vista institucional con estados de carga y error.
- Regresión de las experiencias pública y técnica de 3.1 y de los flujos de tickets de la Etapa 2.

## Resultados en este entorno

- `npm.cmd run check`: correcto.
- `npm.cmd run api:validate`, `api:build` y `api:test`: correctos.
- `npm.cmd run web:check`, `web:test` y `web:build`: correctos.
- Migraciones 0001–0006 aplicadas sobre PostgreSQL 17 embebido: correcto.
- `verify-organization.sql` y dos ejecuciones del seed sobre PostgreSQL 17 embebido: correctos.

Docker no está disponible en el entorno de edición. La ejecución contra PostgreSQL, Redis y los contenedores reales debe completarse con `db:organization:check`, `api:test:integration` y `demo:check` según [la guía](SUBETAPA-3.2.md).

## Límite de esta entrega

Los roles son un catálogo institucional y todavía no se asignan a usuarios ni autorizan operaciones. La autenticación, las membresías y el alcance efectivo por sede se implementarán en 3.3. El catálogo demo puede reemplazarse por configuración aprobada sin cambiar el modelo relacional ni los casos de uso.
