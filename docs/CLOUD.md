# Preparación cloud — ejecución en la subetapa 1.6

Hay un backend NestJS compilable con Dockerfile y, desde 1.5, un frontend Next.js con build de producción validado. No se ha desplegado una URL pública ni verificado HTTPS; esa ejecución corresponde a 1.6.

## Artefactos disponibles en 1.4 y 1.5

Frontend: workspace apps/web, build `npm run web:build` desde la raíz. Next.js sirve las vistas y el adaptador de salud; no se usa export estático. En 1.6 se configurará API_BASE_URL como variable solo de servidor con la URL accesible del backend y se verificarán dominio y HTTPS. No hay despliegue en esta entrega.

Desde la raíz: `docker build -f apps/api/Dockerfile -t essalud-api:0.4.0 .`. Contexto de build: raíz del monorepositorio. Para comprobarlo localmente con las bases existentes: `npm run api:setup`, `npm run api:up`, `npm run api:check`.

La imagen arranca con `node apps/api/dist/main.js`. Inyectar DATABASE_URL del rol restringido, REDIS_URL autenticada, NODE_ENV=production, HOST=0.0.0.0 y PORT asignado por el proveedor. Configurar CORS_ORIGINS con el origen exacto del frontend y SWAGGER_ENABLED=false. No copiar archivos .env a la imagen. El proveedor debe sondear GET /api/v1/health/ready en el puerto asignado; 200 permite tráfico y 503 indica una dependencia no disponible o un rol inseguro. El HEALTHCHECK Docker está configurado para el puerto local 3001.

El overlay Compose adapta los hosts a postgres y redis mediante container.js. Cloud usa main.js directamente con las URLs privadas del proveedor, sin esa adaptación. La aplicación no migra automáticamente al iniciar ni usa bootstrap_admin. La habilitación del transporte remoto de migraciones y el despliegue HTTPS se completan en 1.6.

## Transporte del esquema de 1.2

Los scripts db:* de esta entrega llaman a Docker Compose local; no conectan automáticamente a Railway. Antes del despliegue, se adaptará el transporte de migraciones a la conexión privada y al mecanismo de secretos del proveedor. La creación inicial de roles requiere privilegios administrativos y se revisará con las capacidades del proveedor. Después se usarán credenciales separadas de migración y runtime.

Se conservarán las claves compuestas, políticas RLS y checksums. En 1.4 se implementó el mapeo Prisma de las tablas existentes sin recrearlas. Nunca se trasladará bootstrap_admin como credencial de la API. Primero se ensayarán migración, respaldo y restauración sobre datos ficticios en staging, y luego se repetirá la verificación de aislamiento antes de aceptar el despliegue.

## Destino previsto

La migración 0002 añade el rol interno NOLOGIN essalud_audit_writer. En cloud deben conservarse sus permisos mínimos y mantenerse separados los secretos de runtime y migración. Las pruebas de staging incluirán las 22 verificaciones multi-tenant y las 34 de auditoría, además de una restauración completa que preserve historial. La retención externa protegida frente a administradores es un control adicional pendiente; los triggers por sí solos no la garantizan. [AUDIT.md](AUDIT.md) describe el procedimiento de restauración y sus límites.

| Componente | Destino previsto | Configuración que se completará en 1.6 |
| --- | --- | --- |
| Next.js | Vercel | Repositorio GitHub y raíz `apps/web` |
| NestJS y WebSockets | Servicio persistente Railway | Dockerfile de la API y healthcheck |
| PostgreSQL y Redis | Servicios privados Railway | Volúmenes, credenciales y conectividad privada |
| Node-RED | Servicio adicional en 4.2 | Autenticación del editor, secretos y volumen |

Vercel y Railway se eligen para el piloto académico. La incorporación de datos institucionales requiere que EsSalud confirme el alojamiento y acceso adecuados al piloto. El primer despliegue usará datos ficticios.

## Pasos de despliegue para 1.6

1. Publicar el repositorio y comprobar CI. Tener listos las migraciones 1.2, los controles de auditoría 1.3 y los builds de las aplicaciones.
2. Crear un proyecto Railway y añadir PostgreSQL y Redis con persistencia. Configurar respaldos y comprobar una restauración. Conectar la API al repositorio y a apps/api/Dockerfile con contexto raíz entregado en 1.4; usar red privada para acceder a las bases.
3. Configurar secretos en el proveedor, nunca en Git: conexión de API con un rol restringido, conexión independiente para migraciones, Redis autenticado y claves de autenticación. Ejecutar migraciones como paso de despliegue y evitar la sincronización automática del esquema.
4. Exponer la API mediante HTTPS y comprobar su endpoint de salud. Configurar CORS con el origen exacto del frontend y validar conexiones WebSocket cuando se implementen en 2.3.
5. Importar el mismo repositorio en Vercel, seleccionar Next.js y la raíz `apps/web`. Configurar la URL pública de la API; únicamente las variables destinadas al navegador llevarán el prefijo `NEXT_PUBLIC_`.
6. Desplegar y comprobar el portal contra la API. Usar primero el dominio HTTPS del proveedor. Para un dominio propio, añadirlo en el proveedor, aplicar los registros DNS que este indique y verificar emisión del certificado y redirección HTTPS.
7. Comprobar migraciones, aislamiento tenant, auditoría, reinicio con persistencia y recuperación de datos. Registrar URL, commit desplegado y resultados antes de cerrar 1.6.

El Compose actual publica servicios solo en loopback y está destinado a desarrollo. No es una configuración de producción. Docker Compose no se sube como aplicación a Vercel; frontend, API y datos se despliegan como componentes separados.

Fuentes oficiales: [monorepositorios en Vercel](https://vercel.com/docs/monorepos), [NestJS en Railway](https://docs.railway.com/guides/nest), [bases de datos en Railway](https://docs.railway.com/databases) y [dominios en Vercel](https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting).
