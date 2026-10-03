import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const commit = '9d3103991911b1b06b9faca6dce779013dae3036';
const files = ['ml/datasets/v1.0.0/incidents.jsonl','ml/datasets/v1.0.0/families.json',
  'ml/datasets/v1.0.0/manifest.json','ml/docs/LABELING-GUIDE.md','apps/api/src/domain/ticket.ts'];
const output = resolve(root,'ml/outputs/dataset-v1-colab.zip');
mkdirSync(resolve(root,'ml/outputs'),{recursive:true});
try {
  execFileSync('git',['archive','--format=zip',`--output=${output}`,commit,'--',...files],{cwd:root,stdio:'pipe'});
  console.log('OK: ml/outputs/dataset-v1-colab.zip contiene solo cinco archivos permitidos del commit Dataset V1.');
  console.log('Usar SOURCE_MODE = "upload" en Colab; no contiene .env ni requiere token.');
} catch {
  console.error('Fallo ml:colab:export: comprobar Git y el commit Dataset V1 local.');
  process.exitCode = 1;
}
