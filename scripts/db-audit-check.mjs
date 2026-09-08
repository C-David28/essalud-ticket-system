import { readFileSync } from 'node:fs';
import { postgres, run } from './lib/postgres.mjs';
run(() => {
  const output = postgres(readFileSync(new URL('../infra/postgres/verify-audit.sql', import.meta.url), 'utf8'));
  if (!output.includes('OK: auditoria verificada; datos ficticios revertidos.')) {
    throw new Error('La verificacion de auditoria no finalizo correctamente.');
  }
});
