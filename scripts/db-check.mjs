import { readFileSync } from 'node:fs';
import { postgres, run } from './lib/postgres.mjs';
run(() => {
  const output = postgres(readFileSync(new URL('../infra/postgres/verify-multi-tenant.sql', import.meta.url), 'utf8'));
  if (!output.includes('OK: 22 verificaciones multi-tenant; datos ficticios revertidos.')) {
    throw new Error('La verificacion SQL no devolvio la confirmacion esperada.');
  }
});
