import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=p=>readFileSync(resolve(root,p),'utf8').replace(/\r\n/g,'\n');
const source=s=>s.trimEnd().split('\n').map(line=>line+'\n');
const md=(id,s)=>({id,cell_type:'markdown',metadata:{},source:source(s)});
const code=(id,s)=>({id,cell_type:'code',metadata:{},source:source(s),outputs:[],execution_count:null});
const base=JSON.parse(read('ml/notebooks/stage-4.3-dataset-v1.ipynb'));
const lock=JSON.parse(read('ml/modeling/source-lock.json'));
const embeddedFiles=[...Object.keys(lock.files),...['runtime.py','bootstrap.py','release.py','source-lock.json','requirements.txt'].map(n=>'ml/modeling/'+n)];
const embedded=Object.fromEntries(embeddedFiles.map(name=>[name,read(name)]));
const hashes=Object.fromEntries(embeddedFiles.map(name=>[name,createHash('sha256').update(embedded[name]).digest('hex')]));
const cells=[md('intro-model',`# Subetapa 4.5 — modelo V1 y persistencia controlada

**SYNTHETIC / DEMO / ACADEMIC DATASET. Sin validación institucional.**

Reconstituye el candidato elegido en 4.4 con los mismos 160 registros de desarrollo. Los 40 reservados permanecen fuera del ajuste: no se comparan candidatos ni se reabre su evaluación. Consulta las métricas guardadas como evidencia previa.

Python 3.12, CPU, entorno aislado. Genera pipeline completo en skops; verifica paridad de predicciones y márgenes antes/después de cargar. La reconstrucción no reemplaza automáticamente la publicación aprobada de GitHub. [Guía 4.5](https://github.com/C-David28/essalud-ticket-system/blob/main/ml/docs/COLAB-4.5.md).`)];
for(const id of ['helpers-info','helpers','configuration-info','configuration','load-info','load']) {
 const c=structuredClone(base.cells.find(c=>c.id===id));
 if(id==='configuration') c.source=source(c.source.join('').replace('/content/essalud-ml-stage-4.3','/content/essalud-ml-stage-4.5'));
 cells.push(c);
}
cells.push(md('validate-info','## Verificar Dataset V1\n\nCinco archivos y hashes congelados; 200 ejemplos, 50 por categoría. No se escriben tickets operativos.'));
cells.push(code('validate','records, dataset_report = verify_dataset(payloads)\nprint(json.dumps({k:v for k,v in dataset_report.items() if k not in {"training_started", "splits_created"}}, ensure_ascii=False, indent=2))'));
cells.push(md('sources-info',`## Receta y evidencia de 4.4

Se incluyen fuentes, protocolo, particiones y reportes verificados por hashes del commit ${lock.experiment_commit}. Son los resultados locales ya registrados; no atribuir estos valores a una nueva evaluación en Colab. Las 18 dependencias científicas se conservan y se añaden tres para persistencia.`));
cells.push(code('model-sources',`EMBEDDED_FILES = ${JSON.stringify(embedded)}
EMBEDDED_HASHES = ${JSON.stringify(hashes)}
input_directory = WORKSPACE / "inputs"
for name, content in EMBEDDED_FILES.items():
    require(canonical_hash(content.encode()) == EMBEDDED_HASHES[name], "MODEL_NOTEBOOK_SOURCE_MISMATCH")
    destination = input_directory / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(content, encoding="utf-8")
for name, payload in payloads.items():
    destination = input_directory / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)
modeling_directory = input_directory / "ml/modeling"
import importlib.util
spec = importlib.util.spec_from_file_location("model_bootstrap", modeling_directory / "bootstrap.py")
model_bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model_bootstrap)`));
cells.push(md('environment-model-info','## Entorno aislado\n\nPython 3.12, 21 versiones fijadas, pip check. Los paquetes globales de Colab no se alteran.'));
cells.push(code('environment-model',`model_python = model_bootstrap.prepare(WORKSPACE, EMBEDDED_FILES["ml/modeling/requirements.txt"], install=INSTALL_DEPENDENCIES)
print("MODEL_ENVIRONMENT_READY", model_python)`));
cells.push(md('build-model-info','## Construir y comprobar el artefacto\n\nAjuste de LinearSVC C=1 sobre 160 ejemplos de desarrollo, roundtrip sobre esos mismos textos. No se calculan nuevas métricas ni se usa el holdout. El margen puede ser negativo y no es probabilidad. Para repetir desde cero, elimina el entorno de ejecución de Colab y empieza en una sesión nueva.'));
cells.push(code('build-model',`model_directory = WORKSPACE / "rebuilt-model-v1"
subprocess.run([str(model_python), "-B", str(modeling_directory / "release.py"), "--phase", "build", "--root", str(input_directory), "--output", str(model_directory)], check=True)
model_metadata = json.loads((model_directory / "metadata.json").read_text())
verification = json.loads((model_directory / "verification.json").read_text())
require(verification["status"] == "MODEL_ROUNDTRIP_VERIFIED", "MODEL_NOT_VERIFIED")
print(json.dumps({"status": "MODEL_V1_REPRODUCED", "model_version": model_metadata["model_version"], "training_records": model_metadata["training"]["records"], "artifact": model_metadata["artifact"], "verification": verification}, ensure_ascii=False, indent=2))`));
cells.push(md('download-model-info','## Descargar evidencia opcional\n\nActiva DOWNLOAD_MODEL y ejecuta solo esta celda. El ZIP contiene un artefacto reconstruido y su recibo diagnóstico; no es una aprobación para cargar archivos arbitrarios ni reemplaza automáticamente Model V1.'));
cells.push(code('download-model',`DOWNLOAD_MODEL = False
if DOWNLOAD_MODEL:
    import zipfile
    archive_path = WORKSPACE / "stage-4.5-rebuilt-model-v1.zip"
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in ["model.skops", "metadata.json", "verification.json", "build-receipt.json"]:
            archive.write(model_directory / name, name)
    from google.colab import files
    files.download(str(archive_path))
else:
    print("Descarga desactivada; artefacto verificado y conservado en", model_directory)`));
const notebook={cells,metadata:{kernelspec:{display_name:'Python 3',language:'python',name:'python3'},language_info:{name:'python'},project:{stage:'4.5',model_version:'ticket-category-model-v1.0.0',final_test_reopened:false,embedded_hashes:hashes}},nbformat:4,nbformat_minor:5};
writeFileSync(resolve(root,'ml/notebooks/stage-4.5-model-v1.ipynb'),JSON.stringify(notebook,null,2)+'\n');
console.log('OK: notebook 4.5 generado; receta/evidencia fija, 160 fit, sin nueva evaluación final.');
