import { readFileSync } from 'node:fs';
import { postgres, run } from './lib/postgres.mjs';
run(()=>{
  postgres(readFileSync(new URL('../infra/postgres/verify-ticket-assignment.sql',import.meta.url),'utf8'));
  console.log('OK: asignacion manual, automatica, capacidad e historial verificados; datos ficticios revertidos.');
});
