import { verifyCloud } from './lib/cloud-health.mjs';
try {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('La validacion TLS debe permanecer activa.');
  const evidence = await verifyCloud(process.env.CLOUD_WEB_URL, process.env.CLOUD_API_URL);
  console.log(JSON.stringify(evidence, null, 2));
  console.log('OK: 12 verificaciones publicas HTTPS. Conservar esta salida junto al commit desplegado.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
