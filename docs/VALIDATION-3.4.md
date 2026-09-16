# Evidencia de validación — subetapa 3.4

Fecha: 2026-09-15.

## Cobertura

- Migraciones acumulativas 0001–0008 repetibles y validación de coordenadas completas, rangos y orígenes.
- Doce controles SQL sobre esquema, RLS, auditoría, aislamiento y ausencia de contexto tenant.
- Mapeo Prisma de decimales a coordenadas numéricas dentro del catálogo autorizado.
- Ruta `/mapa` autenticada y composición de catálogo y tickets ya filtrados por rol y sede.
- Carga bajo demanda de Maps JavaScript API y Advanced Markers.
- Funcionamiento sin clave y recuperación mediante lista geográfica si el proveedor no carga.

## Resultados en el entorno de edición

- `check`, `api:validate`, `api:build`, `api:test` y `web:check`: correctos.
- API: 26 pruebas unitarias aprobadas.
- Frontend: 26 pruebas aprobadas, incluida la vista sin Google Maps.
- Migraciones 0001–0008 aplicadas dos veces y 12 controles geográficos aprobados en PostgreSQL embebido.

Docker y una cuenta Google Cloud no están disponibles en el entorno de edición. La comprobación final con PostgreSQL 17, Redis, contenedores y una clave restringida debe seguir [la guía](SUBETAPA-3.4.md).

## Límites

Las coordenadas incluidas son referenciales y ficticias; deben revisarse antes de una implementación institucional. Esta entrega no realiza geocodificación, seguimiento GPS ni ubicación de usuarios. Las incidencias heredan la sede elegida al crearse y se separan visualmente con un desplazamiento determinista para demostración. Google Maps no participa en el CRUD, el aislamiento ni la operación de tickets.
