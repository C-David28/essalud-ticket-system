import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=p=>readFileSync(resolve(root,p),'utf8').replace(/\r\n/g,'\n');
const nb=JSON.parse(read('ml/notebooks/stage-4.5-model-v1.ipynb'));
assert.equal(nb.nbformat,4);
assert.equal(nb.metadata.project.stage,'4.5');
assert.equal(nb.metadata.project.final_test_reopened,false);
assert.equal(new Set(nb.cells.map(c=>c.id)).size,nb.cells.length);
const cells=nb.cells.filter(c=>c.cell_type==='code');
assert.equal(cells.length,8);
for(const c of cells){assert.equal(c.execution_count,null);assert.deepEqual(c.outputs,[]);}
const sourceCell=cells.find(c=>c.id==='model-sources').source.join('');
for(const [name,hash] of Object.entries(nb.metadata.project.embedded_hashes)) {
 const text=read(name);
 assert.equal(createHash('sha256').update(text).digest('hex'),hash);
 assert(sourceCell.includes(JSON.stringify(text)));
}
assert.equal(cells.find(c=>c.id==='helpers').source.join(''),read('ml/colab/preparation.py').trimEnd()+'\n');
assert(cells.find(c=>c.id==='download-model').source.join('').startsWith('DOWNLOAD_MODEL = False'));
assert(!JSON.stringify(nb).includes('ghp_'));
console.log('OK: notebook 4.5 limpio, fuentes/evidencia sincronizadas; descarga opcional.');
