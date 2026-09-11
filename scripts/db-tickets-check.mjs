import { readFileSync } from 'node:fs';
import { postgres, run } from './lib/postgres.mjs';
run(()=>{postgres(readFileSync(new URL('../infra/postgres/verify-tickets.sql',import.meta.url),'utf8'));
  console.log('OK: verificaciones SQL de tickets; datos ficticios revertidos. La secuencia puede dejar huecos.');});

