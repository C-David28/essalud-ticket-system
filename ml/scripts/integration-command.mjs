import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { IntegrationCheckFailure, runIntegrationCheck } from './integration-check.mjs';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

export function setupIntegration(root = projectRoot) {
  const serviceFile = resolve(root, 'ml/outputs/service.env');
  if (!existsSync(serviceFile)) throw new Error('Ejecuta npm run ml:service:setup primero.');
  const service = readFileSync(serviceFile, 'utf8');
  const tokens = [...service.matchAll(/^ML_SERVICE_TOKEN=([a-f0-9]{64})\r?$/gm)];
  if (tokens.length !== 1 || [...service.matchAll(/^ML_SERVICE_TOKEN=/gm)].length !== 1)
    throw new Error('ML_SERVICE_TOKEN local inválido; conserva y revisa service.env.');
  mkdirSync(resolve(root, 'ml/outputs'), { recursive: true });
  writeFileSync(resolve(root, 'ml/outputs/integration.env'),
    'ML_ASSIST_ENABLED=true\nML_SERVICE_URL=http://ml:8001\nML_SERVICE_TOKEN=' + tokens[0][1] + '\nML_SERVICE_TIMEOUT_MS=4000\n',
    { mode: 0o600 });
}

export async function main(args = process.argv.slice(2), { root = projectRoot, env = process.env,
  check = runIntegrationCheck, log = console.log, errorLog = console.error } = {}) {
  const [command, ...flags] = args;
  try {
    if (command === 'setup' && flags.length === 0) {
      setupIntegration(root);
      log('OK: integración ML local configurada; token conservado y cuatro variables exclusivas de Nest.');
      return 0;
    }
    if (command !== 'check' || flags.some(flag => !['--unavailable', '--disabled'].includes(flag)) ||
      new Set(flags).size !== flags.length || flags.length > 1) throw new Error('Comando de integración desconocido.');
    const unavailable = flags.includes('--unavailable'), disabled = flags.includes('--disabled');
    const receipt = await check({ root, env, unavailable, disabled });
    mkdirSync(resolve(root, 'ml/outputs'), { recursive: true });
    const filename = unavailable ? 'integration-unavailable-check.json' : disabled ? 'integration-disabled-check.json' : 'integration-check.json';
    writeFileSync(resolve(root, 'ml/outputs', filename), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    log('ML_INTEGRATION_CHECK_OK: ' + (unavailable ? 'ML no disponible; creación manual verificada.' :
      disabled ? 'asistencia desactivada; creación manual verificada.' : 'Next→Nest→ML, abstención y decisión manual verificadas.') +
      ' PostgreSQL y auditoría verificados; ticket temporal eliminado.');
    return 0;
  } catch (error) {
    if (error instanceof IntegrationCheckFailure) {
      const diagnostic = error.diagnostic;
      const http = diagnostic.status === undefined ? (diagnostic.code === 'TRANSPORT_FAILURE' ? 'HTTP sin respuesta' : '') : 'HTTP ' + diagnostic.status;
      const expected = diagnostic.expectedStatus === undefined ? '' : ' (esperado ' + diagnostic.expectedStatus + ')';
      errorLog('Fallo ML integration check en fase "' + error.phase + '". Diagnóstico: ' +
        http + expected +
        (http || expected ? '; ' : '') + diagnostic.code + '. Revisa el estado local; no se mostraron claves ni texto de tickets.');
      if (error.cleanupPending) errorLog('La limpieza del ticket temporal no se confirmó. Revisar únicamente el ticket ' + error.temporaryTicketId + '.');
    } else errorLog(command === 'setup' ? 'No se completó ML integration setup. Verifica service.env; no se modificó su token.' :
      'No se completó ML integration check. Usa check, check --unavailable o check --disabled y revisa el estado local.');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
