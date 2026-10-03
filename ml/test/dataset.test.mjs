import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDataset, textSimilarity } from '../scripts/validate-dataset.mjs';

const release = fileURLToPath(new URL('../datasets/v1.0.0/', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g,'\n'),'utf8').digest('hex');
function fixture(t, mutate = () => {}, refreshHashes = true) {
  const parent = resolve(tmpdir()), directory = mkdtempSync(join(parent, 'essalud-ml-test-'));
  t.after(() => {
    assert.equal(dirname(resolve(directory)), parent);
    assert(basename(directory).startsWith('essalud-ml-test-'));
    rmSync(directory, {recursive:true,force:true});
  });
  for (const file of ['incidents.jsonl','families.json','manifest.json']) copyFileSync(join(release,file),join(directory,file));
  const records = readFileSync(join(directory,'incidents.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
  const catalog = JSON.parse(readFileSync(join(directory,'families.json'),'utf8'));
  const manifest = JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
  mutate(records, catalog, manifest);
  writeFileSync(join(directory,'incidents.jsonl'), records.map(row=>JSON.stringify(row)).join('\n')+'\n');
  writeFileSync(join(directory,'families.json'),JSON.stringify(catalog,null,2)+'\n');
  if (refreshHashes) for (const file of ['incidents.jsonl','families.json']) manifest.files[file] = hash(readFileSync(join(directory,file)));
  writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest));
  return directory;
}

test('V1 real: balance, grupos, longitudes e integridad; no depende de servicios', () => {
  const report = validateDataset();
  assert.equal(report.records,200); assert.equal(report.families,40); assert.equal(report.leakage_groups,37);
  assert.deepEqual(report.distribution,{BIOMEDICO:50,INFRAESTRUCTURA:50,REDES:50,SOPORTE:50});
  assert.equal(report.duplicates,0); assert.equal(report.similarity.pairs_checked,19900);
  assert.equal(report.training_started,false); assert.equal(report.operational_database_access,false);
});
test('reporte publicado coincide con una validacion nueva',()=>{
  assert.deepEqual(validateDataset(),JSON.parse(readFileSync(join(release,'validation-report.json'),'utf8')));
});
test('alteracion del texto sin actualizar checksum se rechaza', t => {
  const directory = fixture(t, rows=>{ rows[0].titulo += ' cambiado'; },false);
  assert.throws(()=>validateDataset(directory),/CHECKSUM_MISMATCH/);
});
test('LF y CRLF producen la misma identidad en Windows y Linux', t => {
  const directory = fixture(t);
  for (const file of ['incidents.jsonl','families.json']) {
    writeFileSync(join(directory,file),readFileSync(join(directory,file),'utf8').replace(/\n/g,'\r\n'));
  }
  assert.equal(validateDataset(directory).status,'PASS');
});
test('JSONL malformado falla sin devolver el contenido del registro', t => {
  const directory = fixture(t);
  const bytes = readFileSync(join(directory,'incidents.jsonl'),'utf8').replace(/^./,'!');
  writeFileSync(join(directory,'incidents.jsonl'),bytes);
  const manifest = JSON.parse(readFileSync(join(directory,'manifest.json'),'utf8'));
  manifest.files['incidents.jsonl'] = hash(Buffer.from(bytes));
  writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest));
  assert.throws(()=>validateDataset(directory),/^Error: INVALID_JSON: line 1$/);
});
const cases = [
  ['campo faltante', rows=>{delete rows[0].descripcion;}, /INVALID_FIELDS/],
  ['campo operativo extra no permitido', rows=>{rows[0].solicitanteId='demo';}, /INVALID_FIELDS/],
  ['categoria fuera del dominio', rows=>{rows[0].categoria='OTRO';}, /INVALID_CATEGORY/],
  ['categoria incompatible con familia', rows=>{rows[0].categoria='REDES';}, /FAMILY_CATEGORY_MISMATCH/],
  ['grupo de una variante cambiado', rows=>{rows[0].leakage_group_id='group-otro';}, /FAMILY_GROUP_MISMATCH/],
  ['ID repetido', rows=>{rows[1].record_id=rows[0].record_id;}, /DUPLICATE_RECORD_ID/],
  ['descripcion duplicada con titulo distinto', rows=>{rows[1].descripcion=rows[0].descripcion;}, /DUPLICATE_TEXT/],
  ['menos registros', rows=>{rows.pop();}, /INVALID_RECORD_COUNT/],
  ['origen no sintetico', rows=>{rows[0].is_synthetic=false;}, /INVALID_SYNTHETIC_PROVENANCE/],
  ['etiqueta pendiente no entra al corpus', rows=>{rows[0].label_status='PENDING_REVIEW';}, /LABEL_NOT_APPROVED/],
  ['titulo fuera del contrato', rows=>{rows[0].titulo='abc';}, /INVALID_TEXT_LENGTH/],
  ['metadato de longitud falso', rows=>{rows[0].length_band='breve';}, /INVALID_DIVERSITY_METADATA/],
  ['contacto identificable no permitido', rows=>{rows[0].descripcion='Contacto: prueba@example.invalid para informar la avería del equipo.';rows[0].length_band='breve';}, /POTENTIAL_SENSITIVE_CONTENT/],
  ['contacto oculto en justificacion', rows=>{rows[0].label_rationale='Revisar con prueba@example.invalid para aprobar esta etiqueta.';}, /POTENTIAL_SENSITIVE_CONTENT/],
  ['etiqueta puesta como pista artificial', rows=>{rows[0].titulo='[SOPORTE] '+rows[0].titulo;}, /ARTIFICIAL_LABEL_PREFIX/],
  ['variante casi literal no es diversidad', rows=>{rows[1].titulo=rows[0].titulo+' aquí';rows[1].descripcion=rows[0].descripcion+' Otra vez.';rows[1].length_band='normal';}, /EXCESSIVE_TEXT_SIMILARITY/],
];
for (const [name, mutate, error] of cases) test(`rechaza ${name} aunque se actualice el checksum`,t=>{
  assert.throws(()=>validateDataset(fixture(t,mutate)),error);
});
test('manifiesto no puede falsear distribucion', t => {
  assert.throws(()=>validateDataset(fixture(t,(_r,_f,m)=>{m.distribution.SOPORTE=49;})),/MANIFEST_DISTRIBUTION_MISMATCH/);
});
test('catalogo no admite familias duplicadas', t => {
  assert.throws(()=>validateDataset(fixture(t,(_r,f)=>{f.families[1].scenario_family_id=f.families[0].scenario_family_id;})),/DUPLICATE_FAMILY_ID/);
});
test('cambio del dominio exige revisar la version del dataset', t => {
  const directory=fixture(t), domainFile=join(directory,'domain.ts');
  writeFileSync(domainFile,"export const CATEGORIES = ['SOPORTE','REDES','INFRAESTRUCTURA','BIOMEDICO','OTRO'] as const;");
  assert.throws(()=>validateDataset(directory,{domainFile}),/DOMAIN_CATEGORY_CONTRACT_CHANGED/);
});
test('integridad incluye la guia utilizada para etiquetar',t=>{
  const directory=fixture(t), guideFile=join(directory,'guide.md');
  writeFileSync(guideFile,'Guía modificada');
  assert.throws(()=>validateDataset(directory,{guideFile}),/CHECKSUM_MISMATCH/);
});
test('guia con LF o CRLF conserva checksum canonico',t=>{
  const directory=fixture(t), guideFile=join(directory,'guide.md');
  const guide=readFileSync(new URL('../docs/LABELING-GUIDE.md',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  writeFileSync(guideFile,guide);
  assert.equal(validateDataset(directory,{guideFile}).status,'PASS');
  writeFileSync(guideFile,guide.replace(/\n/g,'\r\n'));
  assert.equal(validateDataset(directory,{guideFile}).status,'PASS');
});
test('catalogo de familias tambien rechaza datos de contacto',t=>{
  assert.throws(()=>validateDataset(fixture(t,(_r,f)=>{f.families[0].label_rule='Consultar a prueba@example.invalid para definir la familia.';})),/POTENTIAL_SENSITIVE_FAMILY_CONTENT/);
});
test('similitud reconoce variantes casi identicas sin usar etiquetas',()=>{
  const scores=textSimilarity('El teclado USB no responde en la computadora.','El teclado USB no responde en esta computadora.');
  assert(scores.token_jaccard>0.8); assert(scores.character_dice>0.8);
});
