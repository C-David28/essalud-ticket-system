import { postgres, run } from './lib/postgres.mjs';
import { buildMigrationSql } from './lib/migrations.mjs';
run(() => {
  postgres(buildMigrationSql());
  console.log('OK: migraciones verificadas por checksum.');
});
