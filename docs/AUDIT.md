# Auditoría transaccional — subetapa 1.3

## Alcance y garantía

La migración 0002 incorpora audit.audit_logs y los triggers iniciales. Las migraciones posteriores amplían la cobertura a tickets, técnicos y roles institucionales. Cada fila afectada produce un evento dentro de la transacción de negocio. Si el trigger falla, la modificación falla; si la transacción se revierte, también se revierten sus eventos.

El runtime essalud_app no tiene INSERT, UPDATE, DELETE ni TRUNCATE sobre audit_logs. Solo un rol interno NOLOGIN, essalud_audit_writer, puede insertar mediante una función de trigger SECURITY DEFINER. No se concede membresía de este rol al runtime. La función tiene search_path fijo, referencias calificadas y ejecución directa revocada al runtime.

Además de los privilegios, un trigger BEFORE rechaza UPDATE, DELETE y TRUNCATE del historial incluso cuando esas sentencias se ejecutan ordinariamente como administrador. Los triggers están ENABLE ALWAYS. Se rechaza también TRUNCATE de las tablas auditadas para impedir la eliminación masiva sin eventos de fila.

**Límite de inmutabilidad:** un superusuario o propietario capaz de alterar el esquema puede desactivar o eliminar estas protecciones, fabricar eventos o destruir tablas. No se garantiza resistencia frente a administradores de base ni del almacenamiento. Esa garantía requiere una copia externa con retención protegida, credenciales separadas y controles de operación, prevista para el despliegue institucional. No se presenta un checksum de fila como prueba criptográfica de autoría.

La auditoría comienza al aplicar 0002. No reconstruye acciones anteriores ni inventa eventos para datos ya existentes. Tampoco registra SELECT, intentos fallidos, cambios DDL ni autenticaciones; estos corresponden a controles adicionales de aplicación y operación.

## Campos del evento

| Campo | Contenido |
| --- | --- |
| audit_id | UUID del evento, generado por PostgreSQL |
| red_asistencial_id | Tenant de la entidad |
| centro_asistencial_id / area_id | Jerarquía cuando corresponda |
| user_id | UUID de usuario aportado por contexto confiable; NULL solo en operación técnica de superusuario |
| actor_kind | USER o DATABASE |
| db_session_user | Login de la conexión PostgreSQL |
| db_effective_role | Rol SQL del llamador antes de entrar al trigger privilegiado |
| action | INSERT, UPDATE o DELETE |
| entity | Nombre calificado de una de las seis tablas de negocio auditadas |
| entity_id | Objeto JSON con la clave institucional completa |
| old_values | Valores anteriores; NULL para INSERT |
| new_values | Valores nuevos; NULL para DELETE |
| timestamp | Fecha del evento, timestamptz generado con clock_timestamp |
| request_id | UUID de correlación del caso de uso |
| transaction_id | Identificador PostgreSQL de la transacción |

Los eventos no tienen FK hacia entidades o usuarios: deben permanecer aunque desaparezca la entidad o la cuenta. user_id todavía no valida pertenencia a un usuario institucional porque la autenticación está prevista en 3.3. Los campos db_session_user y db_effective_role conservan la procedencia técnica.

Los campos copiados se limitan a los identificadores institucionales y campos de negocio aprobados por cada migración. Una columna añadida posteriormente no se copia automáticamente. Incorporar otra entidad exige una nueva migración que revise campos sensibles, amplíe la lista de entidades admitidas y cree sus triggers.

## Contexto de aplicación

Cada caso de uso modificador debe establecer tenant, usuario y solicitud en la MISMA transacción y conexión que sus escrituras:

```sql
BEGIN;
SELECT set_config('app.red_asistencial_id', $1, true);
SELECT set_config('app.user_id', $2, true);
SELECT set_config('app.request_id', $3, true);
-- INSERT / UPDATE / DELETE parametrizados del caso de uso.
COMMIT;
```

Los tres valores son UUID serializados. El backend obtendrá la red y el usuario de identidad y pertenencia verificadas; generará el request_id. Son parámetros, no concatenación SQL. El true limita su duración a la transacción y evita arrastrar contexto al reutilizar conexiones.

Sin usuario o solicitud, una mutación del runtime se rechaza con SQLSTATE 42501. Un UUID inválido falla con 22P02. El bootstrap como superusuario puede operar sin contexto de usuario; el evento se identifica como DATABASE y conserva login y rol, sin inventar una persona responsable.

Estos parámetros personalizados no autentican por sí mismos. Una persona con las credenciales SQL del runtime podría fijar un UUID arbitrario: esas credenciales deben quedar en el backend, y el backend debe controlar los valores. La atribución institucional se completará con autenticación y RBAC en 3.3. Tampoco se deben entregar funciones SQL arbitrarias al cliente.

## Lectura y estabilidad

La política SELECT de audit_logs filtra por red y deniega filas cuando falta contexto. El alcance por sede y qué roles institucionales pueden consultar auditoría se implementarán en 3.3; hoy solo existe la frontera entre tenants.

Las claves institucionales se consideran estables. 0002 rechaza cambiar la identidad primaria de una fila, incluso dentro de una red, para mantener una referencia histórica inequívoca. Los cambios ordinarios de nombre, tipo y estado continúan permitidos y auditados.

Los índices soportan consultas por red y fecha, entidad y solicitud. No hay un contador global ni una cadena de hashes que serialice todas las operaciones. Cada evento conserva su propia identidad y transaction_id permite agrupar operaciones de una transacción.

## Respaldo, restauración y cloud

db:backup incluye las tablas y eventos existentes mediante pg_dump custom. No respalda los roles globales del cluster. Preparar los roles NOLOGIN y propietarios por separado al ensayar una restauración.

Restaurar en una base vacía y aislada respetando las secciones pre-data, data y post-data del archivo. Las funciones y tablas se crean antes de los datos, y los triggers se restauran después. No importar un dump de datos de negocio sobre las tablas con triggers ya activos: produciría eventos adicionales y podría duplicar el historial. No usar una restauración destructiva sobre el piloto para comprobar un respaldo.

Antes de 1.6 se verificará una restauración completa y la retención de auditoría en staging. El runner actual necesita Docker Compose local y bootstrap administrativo; no se entrega una conexión cloud a producción.

## Verificación reproducible

```sh
npm run check
npm run db:migrate
npm run db:migrate
npm run db:check
npm run db:audit:check
```

db:check mantiene 22 pruebas de aislamiento. db:audit:check ejecuta 34 comprobaciones de auditoría. Las dos suites crean datos sintéticos y los revierten. La suite de auditoría modifica temporalmente privilegios y una columna de prueba dentro de una transacción que se revierte; ejecutarla en desarrollo/CI, no sobre un servicio atendiendo tráfico.

Fuentes: [transacciones y triggers de PostgreSQL 17](https://www.postgresql.org/docs/17/trigger-definition.html), [seguridad de funciones SECURITY DEFINER](https://www.postgresql.org/docs/17/sql-createfunction.html) y [políticas RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
