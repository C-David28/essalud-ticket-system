# Evidencia de validación — subetapa 3.1

Fecha: 2026-09-14.

## Cobertura automatizada

- Clasificación de rutas públicas y operativas.
- Solicitante público separado de los tres perfiles autenticados.
- Pantalla de acceso sin autenticación simulada.
- Catálogo de técnicos desactivado en la experiencia pública.
- Formulario público, tablero, asignación y tiempo real conservados.
- Render de producción para /portal, /acceso y /tecnico.

## Límite de esta entrega

La subetapa define la experiencia y las fronteras de confianza. La autenticación institucional, emisión de sesión, RBAC aplicado en backend y aislamiento por sede pertenecen a 3.3. Hasta entonces, /tecnico es únicamente una demostración local con identidad ficticia.

## Resultados automatizados

- npm.cmd run check: correcto.
- npm.cmd run web:check: TypeScript correcto.
- npm.cmd run web:test: 19 de 19 pruebas aprobadas.
- npm.cmd run web:build: compilación de producción correcta; las tres rutas se prerenderizan.
- npm.cmd run cloud:test: 6 de 6 pruebas aprobadas.
- npm.cmd run web:smoke: /portal, /acceso y /tecnico responden 200; salud, proxy y SSE correctos con backend simulado.
