# Modelo multi-tenant actualizado en 3.2

## Jerarquía e integridad

La red asistencial es el tenant. La PK de redes es `red_asistencial_id`. Centros usa PK `(red_asistencial_id, centro_asistencial_id)`. Áreas usa PK `(red_asistencial_id, centro_asistencial_id, area_id)`. El catálogo de roles usa PK `(red_asistencial_id, role_id)` y código único dentro de cada red.

La FK de áreas contiene red y centro: un UUID de centro de otra red no puede introducirse declarando una red distinta. Las futuras tablas de tickets deben referenciar la clave completa de área, no solo su UUID. Las FK usan RESTRICT para conservar hijos cuando se intenta borrar o cambiar la clave de un padre.

Los códigos son únicos dentro de su ámbito: red a nivel global, centro dentro de la red, área dentro del centro. Las PK y restricciones UNIQUE crean los índices necesarios para este catálogo. Los índices adicionales de tickets se decidirán con sus consultas en 2.1.

Los UUID se generan en PostgreSQL sin instalar extensiones. Se guardan timestamps con zona horaria; los triggers conservan created_at y actualizan updated_at. Estos timestamps no son audit logs ni guardan valores anteriores.

El campo activo permite marcar inactividad, pero el flujo de bajas y el control de sedes activas se implementarán con los casos de uso. No hay cascadas automáticas de bajas lógicas.

## Roles PostgreSQL

| Rol | Función | Acceso |
| --- | --- | --- |
| bootstrap_admin | Bootstrap y herramientas locales | Superusuario creado en 1.1; no es runtime |
| essalud_owner | Propiedad del esquema y objetos | NOLOGIN; puede administrar DDL |
| essalud_migrator | Grupo para futuras credenciales de migración | NOLOGIN; miembro de owner |
| essalud_app | Grupo del futuro runtime | NOLOGIN; sin superusuario, BYPASSRLS ni membresía administrativa |

La API futura usará un login separado con los privilegios de essalud_app; sus credenciales se crearán al conectar el backend. Esta entrega no genera contraseñas nuevas ni cambia las actuales.

El runtime puede leer su red y realizar SELECT, INSERT, UPDATE y DELETE de sus centros y áreas. Los roles institucionales son de solo lectura para el runtime y su configuración se carga mediante el proceso administrativo local. Crear o modificar redes está reservado a administración. El RBAC de solicitantes, técnicos y supervisores se añade en 3.3; el catálogo no concede permisos por sí mismo y es distinto de los roles PostgreSQL.

El historial `infra_meta.schema_migrations` permanece bajo el administrador de bootstrap. No está disponible al runtime. El script inicial requiere un cluster local dedicado; si alguno de los nombres de rol ya existe sin el historial esperado, falla para evitar reutilizar privilegios desconocidos.

## Contexto por transacción

La política usa `app.current_red_asistencial_id()`, que lee `app.red_asistencial_id`. Ausente o vacío devuelve NULL: no se ven filas ni se admiten inserciones. Un valor inválido produce error de conversión UUID.

El patrón para la API de 1.4/3.3 será una transacción y una única conexión:

```sql
BEGIN;
-- Valor obtenido de identidad y pertenencia verificadas por el servidor.
SELECT set_config('app.red_asistencial_id', $1, true);
-- Desde 1.3, las mutaciones del runtime necesitan también usuario y solicitud.
SELECT set_config('app.user_id', $2, true);
SELECT set_config('app.request_id', $3, true);
-- Consultas del caso de uso en esta MISMA transacción/conexión.
COMMIT;
```

El parámetro true hace el ajuste local a la transacción. No usar un SET de sesión persistente en el pool ni ejecutar la consulta fuera de esa transacción. El contrato de actor y las protecciones append-only de 1.3 se detallan en [AUDIT.md](AUDIT.md).

RLS es una defensa de aislamiento frente a omisiones de filtros. **El contexto no autentica a nadie**: quien tenga acceso SQL directo con el runtime puede cambiar un parámetro personalizado. Las credenciales deben permanecer en el backend y el servidor debe derivar y autorizar el tenant, sin aceptar libremente un tenant enviado por el cliente. No se declara aislamiento frente a alguien que controle esas credenciales o ejecute SQL arbitrario.

Los superusuarios y roles BYPASSRLS eluden las políticas. FORCE RLS somete al propietario durante el acceso ordinario, pero el propietario conserva capacidad DDL para modificarlas. Las pruebas cambian a essalud_app antes de comprobar el acceso; comprobarlo como bootstrap_admin daría una conclusión incorrecta.

Las FK y restricciones UNIQUE operan independientemente de RLS para garantizar integridad. La API futura debe traducir sus errores sin exponer detalles de otras redes. El acceso GCTIC entre redes deberá tener un flujo autorizado explícito en 3.3; no se habilita una bandera de bypass libre.

## Migraciones

Usar `npm run db:migrate`, no copiar migraciones a init/ ni ejecutarlas manualmente fuera del runner. El runner aplica en orden, toma un advisory lock transaccional, registra el checksum SHA-256 normalizando CRLF a LF y rechaza cambios en archivos ya aplicados. Cada archivo contiene SQL sin BEGIN/COMMIT propios. No hay rollback destructivo automatizado; corregir mediante una nueva migración y conservar respaldos.

El SQL de bootstrap no es todavía una migración Prisma. En 1.4 se documentará y probará el baseline de Prisma sobre este esquema antes de que ese ORM gestione migraciones; no ejecutar db push ni recrear tablas existentes.

## Fuentes

[Políticas RLS y excepciones en PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [SET y set_config](https://www.postgresql.org/docs/17/functions-admin.html), [claves foráneas](https://www.postgresql.org/docs/17/tutorial-fk.html) y [privilegios por defecto](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).
