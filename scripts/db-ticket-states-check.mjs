import { readFileSync } from 'node:fs';
import { postgres, run } from './lib/postgres.mjs';
run(()=>{
  postgres(readFileSync(new URL('../infra/postgres/verify-ticket-states.sql',import.meta.url),'utf8'));
  console.log('OK: maquina de estados e historial verificados; datos ficticios revertidos.');
});
