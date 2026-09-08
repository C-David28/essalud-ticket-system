# Evidencia — subetapa 1.5

Validación del 2026-09-08 sobre la base d1281d4. El usuario confirmó previamente toda la checklist de 1.4. Esta entrega implementa exclusivamente el frontend de maquetación.

## Comprobaciones ejecutadas

- `npm install --ignore-scripts`: dependencias del frontend instaladas y lockfile actualizado. Ninguna versión de dependencia existente del backend cambió.
- `npm run check`: 15 scripts con sintaxis válida.
- `npm run web:check`: TypeScript sin errores.
- `npm run web:build`: build de producción Next.js correcto; portal y tablero pre-renderizados, adaptador de salud dinámico.
- `npm run web:test`: **13 pruebas aprobadas**. Validación y búsqueda, independencia de datos de ejemplo, filtros, formulario inválido/válido, cancelación, categoría inicial, detalle con Escape y restauración del foco, cambio de columna y contrato del indicador de API.
- `npm run web:smoke`: Next.js de producción real comprobado por HTTP. Portal y tablero 200, redirección inicial, ruta inexistente 404, rechazo de POST al adaptador y disponibilidad 200 → 503 → 200 con una API simulada. Los servidores de prueba se cierran al terminar.
- `npm run api:build` y `npm run api:test`: backend compila y mantiene sus **11 pruebas aprobadas** con el nuevo lockfile.
- Instalación npm ci y prune restringida al workspace API comprobada en una carpeta aislada: no instala Next.js. Es el único ajuste operativo del Dockerfile previo.
- Vista local del portal compilada y comprobada con HTTP 200 antes de ofrecer la previsualización.

Se corrigieron un cierre JSX durante la compilación y la devolución del foco al mover una tarjeta de columna. Las pruebas posteriores pasaron.

## Límites

No se ejecutó una inspección visual automatizada en navegador. La apariencia móvil y de escritorio queda en la pequeña checklist manual. El smoke test verifica Next.js real con una respuesta de backend controlada; no equivale a una nueva prueba de PostgreSQL/Redis en Docker. Las migraciones y el código backend no cambian y sus comprobaciones institucionales anteriores fueron confirmadas por el usuario.

El workflow queda ampliado, pero esta entrega no publica commits ni ejecuta GitHub Actions remotamente. No hay despliegue público ni avance a 1.6. Los datos, solicitantes y asignaciones de esta maqueta son ficticios; las modificaciones se pierden al recargar.
