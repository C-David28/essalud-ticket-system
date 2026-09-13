import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { postgres, run } from './lib/postgres.mjs';
const file=new URL('../apps/api/.env.tickets',import.meta.url);
run(()=>{
  let env;
  if(existsSync(file)) env=parseEnv(readFileSync(file,'utf8'));
  else {
    env={TICKETS_LOCAL_ENABLED:'true',TICKETS_LOCAL_KEY:randomBytes(32).toString('hex'),
      TICKETS_LOCAL_RED_ID:randomUUID(),TICKETS_LOCAL_USER_ID:randomUUID(),
      TICKETS_LOCAL_CENTRO_ID:randomUUID(),TICKETS_LOCAL_AREA_ID:randomUUID()};
    writeFileSync(file,Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n',{flag:'wx',mode:0o600});
  }
  for(const field of ['RED','USER','CENTRO','AREA']) {
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(env['TICKETS_LOCAL_'+field+'_ID']??'')) throw new Error('Identificador local invalido; conservar y revisar .env.tickets');
  }
  let updated=false;
  for(const number of ['1','2','3']) {
    const key='TICKETS_LOCAL_TECH_'+number+'_ID';
    if(!env[key]) {env[key]=randomUUID();updated=true;}
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(env[key]))
      throw new Error('Identificador de tecnico local invalido; revisar .env.tickets');
  }
  if(updated) writeFileSync(file,Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});
  if(env.TICKETS_LOCAL_ENABLED!=='true'||!/^[a-f0-9]{64}$/.test(env.TICKETS_LOCAL_KEY??'')) throw new Error('Configuracion local invalida');
  const red=env.TICKETS_LOCAL_RED_ID, centro=env.TICKETS_LOCAL_CENTRO_ID, area=env.TICKETS_LOCAL_AREA_ID;
  postgres(`BEGIN;
    SELECT pg_advisory_xact_lock(73124,21);
    SELECT 'app.tickets'::regclass;
    INSERT INTO app.redes_asistenciales(red_asistencial_id,codigo,nombre)
      VALUES ('${red}','LOCAL21','Red ficticia de pruebas 2.1') ON CONFLICT(red_asistencial_id) DO NOTHING;
    INSERT INTO app.centros_asistenciales(red_asistencial_id,centro_asistencial_id,codigo,nombre,tipo)
      VALUES ('${red}','${centro}','LOCAL21','Centro ficticio de pruebas','CAP') ON CONFLICT(red_asistencial_id,centro_asistencial_id) DO NOTHING;
    INSERT INTO app.areas(red_asistencial_id,centro_asistencial_id,area_id,codigo,nombre)
      VALUES ('${red}','${centro}','${area}','LOCAL21','Area ficticia de pruebas') ON CONFLICT(red_asistencial_id,centro_asistencial_id,area_id) DO NOTHING;
    INSERT INTO app.tecnicos_soporte(red_asistencial_id,tecnico_id,nombre,nivel,capacidad_maxima)
      VALUES ('${red}','${env.TICKETS_LOCAL_TECH_1_ID}','Tecnico local 01','N1',4),
        ('${red}','${env.TICKETS_LOCAL_TECH_2_ID}','Tecnico local 02','N1',4),
        ('${red}','${env.TICKETS_LOCAL_TECH_3_ID}','Tecnico local 03','N2',6)
      ON CONFLICT(red_asistencial_id,nombre) DO UPDATE
        SET nivel=EXCLUDED.nivel,capacidad_maxima=EXCLUDED.capacidad_maxima,activo=true;
    COMMIT;`);
  console.log('OK: catalogo ficticio local y apps/api/.env.tickets disponibles; claves conservadas.');
});
