import { defineConfig } from 'prisma/config';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) loadEnvFile('.env');
// generate/validate no conectan; para introspeccion usar la URL local provisionada.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://unconfigured:unconfigured@127.0.0.1:1/unconfigured',
  },
});
