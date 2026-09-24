# Cierre de Etapa 3: validación y redespliegue

Esta entrega sigue usando el proyecto Railway **essalud-ticket-system** y el proyecto Vercel **essalud-ticket-system-web**. No cambies de proveedor ni crees otro proyecto. Los nombres de dominio exactos no están versionados: recupéralos desde **Railway → api → Networking** y **Vercel → Settings → Domains**.

## Datos geográficos y DEMO

Las direcciones viven en `config/organization.demo.json`. Los nombres y direcciones proceden del directorio público consultado para la demostración. Las coordenadas de Hospital II Pasco y Oxapampa se declaran `REFERENCE`; Villa Rica y Milpo/Yarusyacán se declaran `DEMO`. Antes de un piloto institucional deben reemplazarse o validarse por la entidad. El sistema funciona sin Google Maps.

Referencias consultadas: [directorio de redes y establecimientos de EsSalud](https://www.essalud.gob.pe/transparencia/DIRECTORIO_Redes_Provincias.pdf), [listado nacional de IPRESS](https://cdn.www.gob.pe/uploads/document/file/5298942/4756956-ipress-ambito-nacional2.pdf?v=1715200213), [referencia cartográfica de Hospital II Pasco](https://mapcarta.com/W777320865) y [referencia cartográfica de Hospital I Oxapampa](https://mapcarta.com/W853505757).

`config/tickets.demo.json` contiene exactamente 20 casos sintéticos. `tickets:setup` los inserta una sola vez por UUID, usa los triggers normales, genera códigos `INC-AAAA-XXXX`, historial y auditoría. Repetir el comando no duplica ni restaura cambios hechos durante la demostración.

## 1. Validación local

Con Docker Desktop iniciado, desde la raíz:

```bat
npm.cmd run check
npm.cmd run infra:up
npm.cmd run infra:check
npm.cmd run db:backup
npm.cmd run db:migrate
npm.cmd run db:migrate
npm.cmd run tickets:setup
npm.cmd run tickets:setup
npm.cmd run demo:data:check
npm.cmd run db:check
npm.cmd run db:audit:check
npm.cmd run db:organization:check
npm.cmd run db:access:check
npm.cmd run db:geography:check
npm.cmd run api:test
npm.cmd run api:test:integration
npm.cmd run web:test
npm.cmd run web:build
npm.cmd run demo:up
npm.cmd run demo:check
```

Abre `http://127.0.0.1:3000` y comprueba: crear ticket seleccionando sede/área; iniciar sesión como supervisor; abrir tablero; abrir mapa; seleccionar sede; usar “Ver tickets de esta sede”; abrir un ticket; usar “Ver sede en el mapa”. Conserva la salida de `demo:data:check`.

## 2. GitHub

Revisa primero `git status --short` y `git diff --check`. Como el árbol puede contener cambios anteriores, selecciona los archivos del cierre con `git add -p` y comprueba `git diff --cached`. Commit sugerido:

```bat
git commit -m "feat(stage-3): complete maps and demo dataset"
git push origin main
```

Espera que GitHub Actions termine en verde antes de desplegar.

## 3. Reactivar Railway y ejecutar operaciones

Reanuda primero **Postgres** y **Redis** y espera que estén sanos. Después abre **cloud-ops**. Conserva sus variables anteriores y añade:

- `DEMO_SEED_ENABLED=true`
- `TICKETS_LOCAL_RED_ID`, `TICKETS_LOCAL_USER_ID`, `TICKETS_LOCAL_CENTRO_ID`, `TICKETS_LOCAL_AREA_ID`
- `TICKETS_LOCAL_TECH_1_ID`, `TICKETS_LOCAL_TECH_2_ID`, `TICKETS_LOCAL_TECH_3_ID`
- `TICKETS_DEMO_TECH_USER_ID`, `TICKETS_DEMO_SUPERVISOR_USER_ID`, `TICKETS_DEMO_ADMIN_USER_ID`
- `TICKETS_DEMO_PASSWORD`

Usa UUID v4 estables. Puedes copiar los valores de `apps/api/.env.tickets` en tu gestor de secretos; no publiques ese archivo. Despliega manualmente **cloud-ops** desde el commit aprobado. Debe terminar con código 0, conservar los dos dumps y mostrar que ejecutó ocho suites SQL y sembró 20 tickets DEMO.

## 4. Railway API

Conserva `/infra/cloud/railway-api.json` y configura:

- `NODE_ENV=production`
- `APP_ENVIRONMENT=demo`
- `PUBLIC_DEMO_ENABLED=true`
- `TICKETS_LOCAL_ENABLED=true`
- `HOST=::`, `PORT=3001`, `SWAGGER_ENABLED=false`
- `DATABASE_URL` con el rol `essalud_api`, nunca con el administrador
- `REDIS_URL` privada autenticada
- `TICKETS_LOCAL_KEY` y `ACCESS_TOKEN_SECRET`: dos secretos hexadecimales distintos de 64 caracteres
- `TICKETS_LOCAL_RED_ID` y `TICKETS_LOCAL_USER_ID`: los mismos usados por cloud-ops
- `ACCESS_TOKEN_TTL_SECONDS=900`
- `CORS_ORIGINS`: origen HTTPS exacto de Vercel, sin barra final

Despliega **api** y verifica `https://DOMINIO_API/api/v1/health/ready`: debe responder 200, PostgreSQL y Redis `up`. `/docs` debe responder 404.

## 5. Google Maps y Vercel

En Google Cloud habilita solo **Maps JavaScript API** para la clave de navegador. Restringe la clave por HTTP referrer al dominio de producción de Vercel y al dominio propio si existe, siempre con `https://DOMINIO/*`. No habilites APIs adicionales para esta entrega.

En Vercel conserva Root Directory `apps/web` y `apps/web/vercel.json`. Variables de Production:

- `API_BASE_URL=https://DOMINIO_API`, sin `/api/v1` ni barra final
- `PUBLIC_DEMO_ENABLED=true`
- `TICKETS_LOCAL_KEY`: exactamente la clave de la API
- `GOOGLE_MAPS_BROWSER_KEY`: clave restringida por API y referrer
- `GOOGLE_MAPS_MAP_ID`: Map ID del proyecto; `DEMO_MAP_ID` sirve para la demostración si no creaste uno

No uses prefijo `NEXT_PUBLIC_` para claves internas. Despliega el mismo commit en **essalud-ticket-system-web**. Vercel y Railway administran HTTPS/SSL en sus dominios. Si ya existe un dominio propio, conserva sus registros actuales y verifica que Vercel muestre el certificado como válido.

## 6. Verificación pública

```bat
set "CLOUD_WEB_URL=https://DOMINIO_WEB_REAL"
set "CLOUD_API_URL=https://DOMINIO_API_REAL"
npm.cmd run cloud:check
```

Después repite manualmente el flujo completo en producción. Verifica también el mapa con la clave deshabilitada temporalmente en Preview: debe aparecer la lista funcional. No borres los tickets desde producción; si necesitas reiniciar la exposición, usa un entorno Railway separado.

## Evidencias para el informe

Guarda capturas con fecha y commit: GitHub Actions verde; `demo:data:check`; cloud-ops finalizado y archivo `verified-*.json`; health 200; portal con selector sede/área; tablero con los cinco estados; mapa completo; ventana de una sede con estadísticas; navegación al detalle; badge “DATO DEMO”; Google Cloud mostrando restricciones de la clave sin revelar su valor; dominios HTTPS con candado.
