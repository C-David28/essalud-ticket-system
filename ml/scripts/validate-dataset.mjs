import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const DATASET_VERSION = 'tickets-category-dataset-v1.0.0';
export const SOURCE = 'SYNTHETIC / DEMO / ACADEMIC DATASET';
const root = fileURLToPath(new URL('../../', import.meta.url));
const datasetDirectory = resolve(root, 'ml/datasets/v1.0.0');
const styles = ['cotidiano', 'tecnico', 'breve', 'detallado', 'abreviado'];
const fields = ['record_id', 'titulo', 'descripcion', 'categoria', 'scenario_family_id',
  'leakage_group_id', 'is_synthetic', 'source', 'dataset_version', 'label_status',
  'label_rationale', 'writing_style', 'length_band', 'is_boundary_case'];
const sensitive = [/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i, /\b\d{8,}\b/,
  /(?:https?|postgres(?:ql)?|redis):\/\//i,
  /\b(?:password|contrase[nñ]a|token|api[_ -]?key|dni|tel[eé]fono|historia cl[ií]nica)\s*[:=]\s*\S+/i,
  /\b(?:gh[pousr]_|github_pat_|sk-)[a-z0-9_]{8,}/i];
// Canonical LF hashing avoids Windows CRLF / Linux LF differences; no other text changes.
const hash = bytes => createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8').digest('hex');
const normalize = text => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();
const stopWords = new Set('a al ante con de del desde el en es esta este la las lo los no o para pero por que se si sin su un una y'.split(' '));
const tokens = text => new Set(normalize(text).split(' ').filter(word => word.length > 2 && !stopWords.has(word)));
const shingles = text => {
  const normalized = normalize(text), result = new Set();
  for (let index = 0; index <= normalized.length - 4; index++) result.add(normalized.slice(index, index + 4));
  return result;
};
const intersection = (a, b) => [...a].filter(item => b.has(item)).length;
export function textSimilarity(a, b) {
  const ta = tokens(a), tb = tokens(b), sa = shingles(a), sb = shingles(b);
  const common = intersection(ta, tb);
  return {token_jaccard: common / Math.max(1, ta.size + tb.size - common),
    character_dice: 2 * intersection(sa, sb) / Math.max(1, sa.size + sb.size)};
}

function json(bytes, name) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error(`INVALID_JSON: ${name}`); }
}
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const counts = (rows, key) => Object.fromEntries([...new Set(rows.map(row => row[key]))].sort()
  .map(value => [value, rows.filter(row => row[key] === value).length]));
function sameCounts(a, b) {
  return isObject(b) && same(Object.entries(a).sort(), Object.entries(b).sort());
}
function check(condition, code) { if (!condition) throw new Error(code); }

export function validateDataset(directory = datasetDirectory, options = {}) {
  const domainFile = options.domainFile ?? resolve(root, 'apps/api/src/domain/ticket.ts');
  const guideFile = options.guideFile ?? resolve(root, 'ml/docs/LABELING-GUIDE.md');
  const domain = readFileSync(domainFile, 'utf8');
  const categoryMatch = domain.match(/export const CATEGORIES\s*=\s*\[([^\]]+)\]/);
  check(categoryMatch, 'DOMAIN_CATEGORIES_NOT_FOUND');
  const categories = [...categoryMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
  check(categories.length === 4 && new Set(categories).size === 4, 'DOMAIN_CATEGORY_CONTRACT_CHANGED');
  const incidentBytes = readFileSync(resolve(directory, 'incidents.jsonl'));
  const familyBytes = readFileSync(resolve(directory, 'families.json'));
  const manifest = json(readFileSync(resolve(directory, 'manifest.json')), 'manifest.json');
  check(isObject(manifest) && manifest.schema_version === 1, 'INVALID_MANIFEST');
  check(manifest.hash_algorithm === 'SHA-256-UTF8-LF', 'INVALID_HASH_ALGORITHM');
  check(manifest.dataset_version === DATASET_VERSION && manifest.source === SOURCE, 'INVALID_RELEASE_IDENTITY');
  check(same(manifest.categories, categories), 'CATEGORY_DOMAIN_MISMATCH');
  const expectedHashes = {'incidents.jsonl': hash(incidentBytes), 'families.json': hash(familyBytes),
    '../../docs/LABELING-GUIDE.md': hash(readFileSync(guideFile))};
  check(isObject(manifest.files) && same(Object.keys(manifest.files).sort(), Object.keys(expectedHashes).sort()), 'INVALID_HASH_FILE_LIST');
  for (const [file, digest] of Object.entries(expectedHashes)) check(manifest.files[file] === digest, `CHECKSUM_MISMATCH: ${file}`);
  check(manifest.labeling_guide_version === 'v1', 'INVALID_GUIDE_VERSION');
  check(manifest.splits_status === 'NOT_CREATED_STAGE_4_3' && manifest.training_status === 'NOT_STARTED', 'STAGE_4_2_SCOPE_CHANGED');

  const catalog = json(familyBytes, 'families.json');
  check(isObject(catalog) && catalog.schema_version === 1 && Array.isArray(catalog.families), 'INVALID_FAMILY_CATALOG');
  const families = catalog.families, familyMap = new Map();
  check(families.length === 40 && manifest.family_count === 40, 'INVALID_FAMILY_COUNT');
  for (const family of families) {
    check(isObject(family) && /^[a-z]+-[a-z-]+$/.test(family.scenario_family_id ?? ''), 'INVALID_FAMILY_ID');
    check(!familyMap.has(family.scenario_family_id), 'DUPLICATE_FAMILY_ID');
    check(categories.includes(family.categoria), 'INVALID_FAMILY_CATEGORY');
    check(/^group-[a-z-]+$/.test(family.leakage_group_id ?? ''), 'INVALID_FAMILY_GROUP');
    check(typeof family.name === 'string' && family.name.trim().length >= 5 &&
      typeof family.label_rule === 'string' && family.label_rule.trim().length >= 20, 'MISSING_FAMILY_DEFINITION');
    check(!sensitive.some(pattern => pattern.test(`${family.name} ${family.label_rule}`)), 'POTENTIAL_SENSITIVE_FAMILY_CONTENT');
    familyMap.set(family.scenario_family_id, family);
  }
  for (const category of categories) check(families.filter(family => family.categoria === category).length === 10, 'INVALID_FAMILY_DISTRIBUTION');

  const text = incidentBytes.toString('utf8');
  try { new TextDecoder('utf-8', {fatal:true}).decode(incidentBytes); }
  catch { throw new Error('INVALID_JSONL_ENCODING'); }
  check(!text.startsWith('\uFEFF') && text.endsWith('\n'), 'INVALID_JSONL_ENCODING');
  const lines = text.trimEnd().split(/\r?\n/);
  check(lines.length === 200 && manifest.record_count === 200, 'INVALID_RECORD_COUNT');
  const records = lines.map((line, index) => json(Buffer.from(line), `line ${index + 1}`));
  const identities = new Set(), texts = new Set(), descriptions = new Set();
  for (const [index, record] of records.entries()) {
    const at = `line ${index + 1}`;
    check(isObject(record) && same(Object.keys(record).sort(), [...fields].sort()), `INVALID_FIELDS: ${at}`);
    check(typeof record.record_id === 'string' && /^ML-\d{4}$/.test(record.record_id), `INVALID_RECORD_ID: ${at}`);
    check(!identities.has(record.record_id), `DUPLICATE_RECORD_ID: ${at}`); identities.add(record.record_id);
    for (const [field, minimum, maximum] of [['titulo', 5, 200], ['descripcion', 10, 5000]]) {
      check(typeof record[field] === 'string' && record[field] === record[field].trim() &&
        record[field].length >= minimum && record[field].length <= maximum, `INVALID_TEXT_LENGTH: ${at}`);
    }
    check(categories.includes(record.categoria), `INVALID_CATEGORY: ${at}`);
    const family = familyMap.get(record.scenario_family_id);
    check(family && record.categoria === family.categoria, `FAMILY_CATEGORY_MISMATCH: ${at}`);
    check(record.leakage_group_id === family.leakage_group_id, `FAMILY_GROUP_MISMATCH: ${at}`);
    check(record.is_synthetic === true && record.source === SOURCE && record.dataset_version === DATASET_VERSION,
      `INVALID_SYNTHETIC_PROVENANCE: ${at}`);
    check(record.label_status === 'APPROVED' && typeof record.label_rationale === 'string' &&
      record.label_rationale.trim().length >= 20, `LABEL_NOT_APPROVED: ${at}`);
    check(styles.includes(record.writing_style), `INVALID_WRITING_STYLE: ${at}`);
    const band = record.descripcion.length <= 80 ? 'breve' : record.descripcion.length <= 240 ? 'normal' : 'detallado';
    check(record.length_band === band && typeof record.is_boundary_case === 'boolean', `INVALID_DIVERSITY_METADATA: ${at}`);
    const input = `${record.titulo} ${record.descripcion}`, normalized = normalize(input), description = normalize(record.descripcion);
    check(!texts.has(normalized) && !descriptions.has(description), `DUPLICATE_TEXT: ${at}`);
    texts.add(normalized); descriptions.add(description);
    check(!sensitive.some(pattern => pattern.test(`${input} ${record.label_rationale}`)), `POTENTIAL_SENSITIVE_CONTENT: ${at}`);
    check(!/^\s*(?:categoria\s*[:=-]|\[(?:SOPORTE|REDES|INFRAESTRUCTURA|BIOMEDICO)\]|(?:SOPORTE|REDES|INFRAESTRUCTURA|BIOMEDICO)\s*[:=-])/i.test(record.titulo),
      `ARTIFICIAL_LABEL_PREFIX: ${at}`);
  }
  const distribution = counts(records, 'categoria'), lengthBands = counts(records, 'length_band'), writingStyles = counts(records, 'writing_style');
  for (const category of categories) check(distribution[category] === 50, 'INVALID_CATEGORY_DISTRIBUTION');
  for (const family of families) check(records.filter(record => record.scenario_family_id === family.scenario_family_id).length === 5, 'INVALID_FAMILY_SIZE');
  const groupCount = new Set(records.map(record => record.leakage_group_id)).size;
  check(groupCount === manifest.leakage_group_count && manifest.records_per_family === 5, 'GROUP_COUNT_MISMATCH');
  check(sameCounts(distribution, manifest.distribution) && sameCounts(lengthBands, manifest.length_bands) &&
    sameCounts(writingStyles, manifest.writing_styles), 'MANIFEST_DISTRIBUTION_MISMATCH');
  check(records.filter(record => record.is_boundary_case).length === manifest.boundary_case_count, 'BOUNDARY_COUNT_MISMATCH');
  check((lengthBands.breve ?? 0) >= 20 && (lengthBands.detallado ?? 0) >= 20, 'INSUFFICIENT_LENGTH_DIVERSITY');

  const features = records.map(record => ({tokens:tokens(`${record.titulo} ${record.descripcion}`),
    shingles:shingles(`${record.titulo} ${record.descripcion}`)}));
  const candidates = [], excessive = [];
  let maximumCrossGroup = {token_jaccard:0, character_dice:0};
  for (let a = 0; a < records.length; a++) for (let b = a + 1; b < records.length; b++) {
    const fa = features[a], fb = features[b], shared = intersection(fa.tokens, fb.tokens);
    const token = shared / Math.max(1, fa.tokens.size + fb.tokens.size - shared);
    const dice = 2 * intersection(fa.shingles, fb.shingles) / Math.max(1, fa.shingles.size + fb.shingles.size);
    const sameGroup = records[a].leakage_group_id === records[b].leakage_group_id;
    if (!sameGroup) maximumCrossGroup = {token_jaccard:Math.max(maximumCrossGroup.token_jaccard, token),
      character_dice:Math.max(maximumCrossGroup.character_dice, dice)};
    if (token >= 0.5 || dice >= 0.8) candidates.push({a:records[a].record_id,b:records[b].record_id,
      same_group:sameGroup,token_jaccard:Number(token.toFixed(4)),character_dice:Number(dice.toFixed(4))});
    if (token >= 0.8 || dice >= 0.92) excessive.push([records[a].record_id, records[b].record_id]);
  }
  check(excessive.length === 0, `EXCESSIVE_TEXT_SIMILARITY: ${excessive.map(pair=>pair.join('/')).join(', ')}`);
  const lengths = records.map(record => record.descripcion.length);
  return {dataset_version:DATASET_VERSION,status:'PASS',records:records.length,distribution,families:families.length,
    leakage_groups:groupCount,length_bands:lengthBands,writing_styles:writingStyles,
    boundary_cases:manifest.boundary_case_count,description_length:{min:Math.min(...lengths),max:Math.max(...lengths)},
    duplicates:0,sensitive_pattern_matches:0,
    similarity:{method:'normalized token-set Jaccard and character 4-gram Dice',pairs_checked:records.length*(records.length-1)/2,
      review_thresholds:{token_jaccard:0.5,character_dice:0.8},rejection_thresholds:{token_jaccard:0.8,character_dice:0.92},
      candidates,maximum_cross_group:maximumCrossGroup,semantic_independence_guaranteed:false},
    files_sha256:expectedHashes,training_started:false,operational_database_access:false};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    check(process.argv.length <= 3 && (!process.argv[2] || process.argv[2] === '--json'), 'Uso: node ml/scripts/validate-dataset.mjs [--json]');
    const report = validateDataset();
    if (process.argv[2] === '--json') console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`OK: ${report.records} registros SYNTHETIC / DEMO / ACADEMIC DATASET; ${report.families} familias; ${report.leakage_groups} grupos.`);
      console.log(JSON.stringify(report.distribution));
      console.log(`Sin duplicados ni patrones sensibles detectados; ${report.similarity.pairs_checked} pares comparados; ${report.similarity.candidates.length} candidatos de similitud para revisión.`);
      console.log('Checksums correctos. Sin entrenamiento ni acceso a PostgreSQL/Redis. La revisión automática no sustituye revisión humana.');
    }
  } catch (error) {
    console.error(`Fallo ml:data:check: ${error.code ?? error.message}`);
    process.exitCode = 1;
  }
}
