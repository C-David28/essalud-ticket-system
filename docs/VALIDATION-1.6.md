# Verificación de preparación 1.6 — 2026-09-09

## Aprobado en esta sesión

- npm ci con lockfile: 475 paquetes; ninguna versión de dependencia anterior modificada.
- npm run check: sintaxis de 22 scripts.
- API: build y 11 pruebas unitarias/HTTP.
- Web: build Next.js de producción, TypeScript, 13 pruebas y smoke HTTP real del frontend (API simulada, ciclo 200 → 503 → 200).
- cloud:test: 6 pruebas, incluyendo rechazo de destinos erróneos, fallos TLS, dependencias caídas, Swagger público y credenciales inválidas antes de escribir SQL.
- prepareCloudSchema: dos ejecuciones sobre PostgreSQL WASM/PGlite, 112 verificaciones (22 + 34 por ejecución), migraciones y rol repetibles. Checksum 0001 conservado.

## Pendiente; no equivale a aprobado

- cloud:test:integration se intentó y no pudo ejecutar Docker en esta sesión. Falta probar la imagen Linux, clientes psql/pg_dump/pg_restore, permisos del volumen y restauración nativa. El comando queda integrado en CI y disponible en el equipo del usuario.
- No se crearon cuentas ni servicios. No se ejecutaron operaciones administrativas en Railway.
- Falta publicación GitHub/CI, despliegue real de ambos componentes, respaldo periódico, reinicio conservando volúmenes y cloud:check contra URLs públicas reales.
- PGlite no sustituye autenticación SCRAM, red privada del proveedor ni restauración nativa. El smoke web no acredita una API cloud.

El repositorio de Pictures se conserva; se entrega una copia fuente y un parche compatible para aplicar. Los resultados de 1.1–1.5 confirmados por el usuario siguen vigentes. No se cierra 1.6 ni se avanza a 2.1.
