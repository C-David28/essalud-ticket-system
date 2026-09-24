import { mkdirSync, chmodSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { postgresEnvironment, postgresTools } from './lib/cloud-postgres.mjs';
import { prepareCloudSchema, verifyCloudSchema } from './lib/cloud-schema.mjs';
import {organizationSeedSql} from './lib/organization-config.mjs';
import {accessSeedSql} from './lib/access-config.mjs';
import {demoTicketSeedSql,loadDemoTickets} from './lib/ticket-demo-config.mjs';

let phase = 'configuracion';
try {
  if (process.argv[2] !== 'prepare') throw new Error('Uso: node scripts/cloud-db.mjs prepare');
  if (!/^[a-f0-9]{64}$/.test(process.env.CLOUD_RUNTIME_PASSWORD ?? '')) throw new Error('CLOUD_RUNTIME_PASSWORD debe tener 64 caracteres hexadecimales.');
  const env = postgresEnvironment(process.env);
  const db = postgresTools(env);
  phase = 'comprobar PostgreSQL y privilegios de operaciones';
  db.sql(`DO $$ BEGIN
    IF current_setting('server_version_num')::int / 10000 <> 17 THEN RAISE EXCEPTION 'Se requiere PostgreSQL 17'; END IF;
    IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = session_user) THEN RAISE EXCEPTION 'Bootstrap requiere administrador separado'; END IF;
  END $$;`);
  if (!process.env.CLOUD_BACKUP_DIR) throw new Error('Falta CLOUD_BACKUP_DIR, directorio persistente para respaldos.');
  const directory = resolve(process.env.CLOUD_BACKUP_DIR);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomBytes(6).toString('hex');
  const before = join(directory, 'before-' + id + '.dump');
  const after = join(directory, 'after-' + id + '.dump');
  phase = 'respaldo previo'; db.backup(before); chmodSync(before, 0o600);
  phase = 'migraciones, rol restringido y regresion SQL completa';
  await prepareCloudSchema(db.sql, process.env.CLOUD_RUNTIME_PASSWORD);
  console.log('OK: migraciones, rol repetible y ocho suites SQL de seguridad y negocio.');
  let demoTickets=0;
  if(process.env.DEMO_SEED_ENABLED==='true'){
    phase='sembrar catálogo, accesos y tickets DEMO';
    const required=['TICKETS_LOCAL_RED_ID','TICKETS_LOCAL_USER_ID','TICKETS_LOCAL_CENTRO_ID','TICKETS_LOCAL_AREA_ID',
      'TICKETS_LOCAL_TECH_1_ID','TICKETS_LOCAL_TECH_2_ID','TICKETS_LOCAL_TECH_3_ID','TICKETS_DEMO_PASSWORD',
      'TICKETS_DEMO_TECH_USER_ID','TICKETS_DEMO_SUPERVISOR_USER_ID','TICKETS_DEMO_ADMIN_USER_ID'];
    for(const key of required)if(!process.env[key])throw new Error('Falta '+key+' para el seed DEMO');
    const e=process.env,red=e.TICKETS_LOCAL_RED_ID,center=e.TICKETS_LOCAL_CENTRO_ID,area=e.TICKETS_LOCAL_AREA_ID;
    db.sql(`BEGIN;
      SELECT pg_advisory_xact_lock(73124,21);
      INSERT INTO app.redes_asistenciales(red_asistencial_id,codigo,nombre) VALUES ('${red}','CLOUD_DEMO','Red demo')
        ON CONFLICT(red_asistencial_id) DO NOTHING;
      INSERT INTO app.centros_asistenciales(red_asistencial_id,centro_asistencial_id,codigo,nombre,tipo)
        VALUES ('${red}','${center}','CLOUD_DEMO','Centro demo','CAP') ON CONFLICT(red_asistencial_id,centro_asistencial_id) DO NOTHING;
      INSERT INTO app.areas(red_asistencial_id,centro_asistencial_id,area_id,codigo,nombre)
        VALUES ('${red}','${center}','${area}','CLOUD_DEMO','Area demo') ON CONFLICT(red_asistencial_id,centro_asistencial_id,area_id) DO NOTHING;
      INSERT INTO app.tecnicos_soporte(red_asistencial_id,tecnico_id,nombre,nivel,capacidad_maxima) VALUES
        ('${red}','${e.TICKETS_LOCAL_TECH_1_ID}','Tecnico local 01','N1',4),
        ('${red}','${e.TICKETS_LOCAL_TECH_2_ID}','Tecnico local 02','N1',4),
        ('${red}','${e.TICKETS_LOCAL_TECH_3_ID}','Tecnico local 03','N2',6)
        ON CONFLICT(red_asistencial_id,nombre) DO UPDATE SET nivel=EXCLUDED.nivel,capacidad_maxima=EXCLUDED.capacidad_maxima,activo=true;
      ${organizationSeedSql(e)}
      ${accessSeedSql(e)}
      ${demoTicketSeedSql(e)}
      COMMIT;`);
    demoTickets=loadDemoTickets(e).length;
    console.log('OK: 20 tickets DEMO idempotentes sembrados en PostgreSQL.');
  }
  phase = 'respaldo posterior'; db.backup(after); chmodSync(after, 0o600);
  // Restaurar solamente en una base generada aqui. Nunca limpiar ni restaurar sobre el destino.
  const temporary = 'essalud_restore_' + randomBytes(12).toString('hex');
  let created = false;
  try {
    phase = 'crear base temporal de restauracion';
    db.sql('CREATE DATABASE "' + temporary + '" TEMPLATE template0;'); created = true;
    const restored = postgresTools({ ...env, PGDATABASE: temporary });
    phase = 'restaurar backup con propietarios, permisos e historial'; restored.restore(after);
    phase = 'verificar datos restaurados';
    await verifyCloudSchema(restored.sql);
    // pg_restore falla ante cualquier objeto/dato no restaurado. Confirmar ademas el ledger.
    const history = 'SELECT version,checksum FROM infra_meta.schema_migrations ORDER BY version;';
    if (restored.sql(history) !== db.sql(history)) throw new Error('Historial restaurado distinto.');
  } finally {
    if (created) {
      db.sql('DROP DATABASE "' + temporary + '";');
    }
  }
  const evidence = { checkedAt: new Date().toISOString(), commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    database: env.PGDATABASE, sqlSuites: 8, restoreSqlSuites: 8, demoTickets, backupBefore: before, backupAfter: after };
  writeFileSync(join(directory, 'verified-' + id + '.json'), JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  console.log('OK: respaldo restaurado en base temporal, ocho suites repetidas y base temporal eliminada.');
  console.log('OK: evidencia y dos respaldos conservados en CLOUD_BACKUP_DIR. Operaciones finalizadas.');
} catch (error) {
  console.error('ERROR cloud:db en fase: ' + phase + '. ' + error.message);
  process.exitCode = 1;
}
