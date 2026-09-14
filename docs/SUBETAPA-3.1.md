# Subetapa 3.1 — Portal institucional y experiencias de acceso

Esta entrega diseña y construye las dos entradas del sistema sin alterar el flujo operativo de la Etapa 2:

- /portal: experiencia pública del solicitante, sin inicio de sesión.
- /acceso: entrada del personal y explicación de perfiles autorizados.
- /tecnico: tablero operativo existente, identificado expresamente como vista local de demostración.

## Decisiones de arquitectura

La navegación, los textos y los componentes separan el área pública del espacio operativo. El navegador no decide permisos institucionales: el catálogo de perfiles es descriptivo y la autorización real deberá validarse en el backend en la Subetapa 3.3.

El portal público ya no consulta el catálogo de técnicos. La identidad fija, la clave local y el proxy de tickets siguen siendo mecanismos exclusivos de Docker Compose para demostrar lo construido en la Etapa 2. No deben publicarse como autenticación.

La futura consulta anónima deberá usar un comprobante no predecible además del código INC-año-secuencia. El código visible por sí solo no autorizará lectura de datos.

## Experiencias definidas

| Perfil | Entrada | Propósito |
| --- | --- | --- |
| Solicitante | Pública | Reportar y seguir únicamente su solicitud sin crear una cuenta |
| Técnico N1/N2 | Autenticada | Atender y documentar tickets dentro de su alcance |
| Supervisor de red | Autenticada | Coordinar carga, reasignaciones y trazabilidad autorizada |
| Administrador GCTIC | Autenticada | Configurar catálogos y accesos con alcance explícito |

## Verificación local

~~~bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
npm.cmd run check
npm.cmd run web:check
npm.cmd run web:test
npm.cmd run web:build
npm.cmd run cloud:test
npm.cmd run web:smoke
~~~

Para la demostración completa con Docker:

~~~bat
npm.cmd run demo:up
npm.cmd run demo:check
~~~

Abrir:

- http://127.0.0.1:3000/portal
- http://127.0.0.1:3000/acceso
- http://127.0.0.1:3000/tecnico

## Comprobaciones manuales importantes

1. En /portal, confirmar que la navegación solo ofrece soporte público y acceso del personal.
2. Reportar una incidencia ficticia y conservar el código INC-2026-XXXX.
3. En /acceso, comprobar que el ingreso institucional está deshabilitado y que la vista demo está claramente identificada.
4. Abrir la vista demo técnica y confirmar que tickets, asignación y cambios de estado siguen funcionando.
5. En vista móvil, revisar que cabecera, pasos y tarjetas de roles no generen desplazamiento horizontal.

## Git

~~~bat
git status --short
git diff --check
git add README.md package.json package-lock.json apps/web scripts docs/ROADMAP.md docs/SUBETAPA-3.1.md docs/VALIDATION-3.1.md
git commit -m "feat(web): separate public and staff ticket experiences"
~~~

No avanzar a 3.2 hasta completar las verificaciones de esta guía.
