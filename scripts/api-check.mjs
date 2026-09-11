import assert from 'node:assert/strict';
const base=process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
try {
  for (const path of ['/api/v1','/api/v1/health/live','/api/v1/health/ready']) {
    const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(5000)});
    assert.equal(response.status,200,`HTTP inesperado en ${path}`);
    assert.ok(response.headers.get('x-request-id'));
    const body=await response.json();
    if (path.endsWith('/ready')) assert.deepEqual(body,{status:'ok',checks:{postgres:'up',redis:'up'}});
    if (path.endsWith('/live')) assert.deepEqual(body,{status:'ok'});
    if (path==='/api/v1') assert.equal(body.stage,'2.3');
    console.log('PASS: '+path);
  }
  console.log('OK: API accesible y dependencias disponibles con rol PostgreSQL restringido.');
} catch {
  console.error('Fallo api:check. Comprueba que la API este iniciada y revisa /api/v1/health/ready.');
  process.exitCode=1;
}
