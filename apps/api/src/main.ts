import { createApplication } from './bootstrap';
import { readConfig } from './infrastructure/config';
async function main() {
  const config = readConfig(process.env);
  const app = await createApplication(config);
  app.enableShutdownHooks(['SIGINT','SIGTERM']);
  try { await app.listen(config.port,config.host); }
  catch (error) { await app.close(); throw error; }
}
main().catch(() => {
  // Nunca imprimir objetos de configuracion, URLs con claves ni stack de conectores.
  console.error('No se pudo iniciar la API. Verifica configuracion, dependencias y puerto.');
  process.exitCode=1;
});
