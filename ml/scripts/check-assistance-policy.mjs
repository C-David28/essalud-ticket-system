import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
try {
  const local=resolve(root,'ml/outputs/service-environment/.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const python=process.env.ML_POLICY_PYTHON??(existsSync(local)?local:'python');
  const result=spawnSync(python,['-B','ml/integration/analyze_policy.py','--repo',root,'--output-dir','ml/outputs/policy-check'],
    {cwd:root,encoding:'utf8'});
  assert.equal(result.status,0,'No se pudo reproducir la política; requiere Python con biblioteca estándar.');
  for(const file of ['policy-analysis.json','abstention-policy.json']){
    const expected=JSON.parse(readFileSync(resolve(root,'ml/integration',file),'utf8'));
    const observed=JSON.parse(readFileSync(resolve(root,'ml/outputs/policy-check',file),'utf8'));
    assert.deepEqual(observed,expected,'La evidencia de la política cambió.');
  }
  const policy=JSON.parse(readFileSync(resolve(root,'ml/integration/abstention-policy.json'),'utf8'));
  const source=readFileSync(resolve(root,'apps/api/src/domain/category-classification.ts'),'utf8').replace(/\s+/g,'');
  assert.ok(source.includes(`ASSISTANCE_MIN_MARGIN=${policy.rule.minimum_raw_margin}`));
  assert.ok(source.includes(`ASSISTANCE_POLICY_VERSION='${policy.policy_version}'`));
  assert.ok(source.includes(`ASSISTANCE_MODEL_VERSION='${policy.model_version}'`));
  assert.equal(policy.human_confirmation_required,true);
  assert.equal(policy.evidence.independent_generalization_validation,false);
  console.log('ML_ASSISTANCE_POLICY_OK: umbral -0.06; OOF desarrollo 97 ofrecidas, 93 correctas, 63 abstenciones; sin prueba final ni reentrenamiento.');
} catch {
  console.error('Fallo política de asistencia: revisar Python, fuentes OOF y coherencia con el backend.');process.exitCode=1;
}
