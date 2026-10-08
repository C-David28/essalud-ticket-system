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
const experiment=read('ml/experimentation/experiment.py');
const analysis=read('ml/experimentation/analyze_errors.py');
const protocol=read('ml/experiments/experiment-v1.0.0/protocol.json');
const splits=read('ml/experiments/experiment-v1.0.0/splits.json');
const cells=[md('intro-training',`# Subetapa 4.4 — entrenamiento y evaluación por grupos

**SYNTHETIC / DEMO / ACADEMIC DATASET**. Solo título y descripción; sin conexión a tickets operativos.

El notebook reutiliza la preparación 4.3. 160 registros de desarrollo; 40 de prueba final protegida. Baseline, regresión logística y SVM lineal; protocolo y particiones congelados antes de entrenar.

Ejecuta desde un entorno Colab nuevo con CPU. La prueba final está **desactivada inicialmente**: primero observa comparación/decisión, después activa solo la celda correspondiente. No cambies parámetros ni selecciones candidatos usando esa prueba. No exporta un modelo; 4.5 requiere autorización.

Guía: [COLAB-4.4.md](https://github.com/C-David28/essalud-ticket-system/blob/main/ml/docs/COLAB-4.4.md).`)];
// Reuse only preparation/loading cells; preserve stage 4.3 notebook unchanged.
for (const id of ['helpers-info','helpers','configuration-info','configuration','environment-info','environment','load-info','load','validation-info','validation']) {
  const cell=structuredClone(base.cells.find(c=>c.id===id));
  if(id==='configuration') cell.source=source(cell.source.join('').replace('/content/essalud-ml-stage-4.3','/content/essalud-ml-stage-4.4'));
  if(id==='validation-info') cell.source=source(`## 5. Verificar Dataset V1 antes del experimento

Se verifican cinco hashes, 200 registros, cuatro categorías con 50 cada una, 40 familias y 37 grupos. El manifiesto V1 conserva el estado de su publicación previa, sin entrenamiento. La actividad de esta ejecución se registra en los reportes 4.4, sin modificar aquella versión.

Las columnas auxiliares no entran al clasificador. Las particiones ya congeladas se comprobarán en la celda siguiente.`);
  if(id==='validation') cell.source=source(`records, dataset_report = verify_dataset(payloads)
MODEL_INPUT_COLUMNS = ("titulo", "descripcion")
print(json.dumps({key: value for key, value in dataset_report.items() if key not in {"training_started", "splits_created"}}, ensure_ascii=False, indent=2))
print("Únicas entradas del modelo:", MODEL_INPUT_COLUMNS)`);
  cells.push(cell);
}
cells.push(md('protocol-info',`## 6. Protocolo y particiones congelados

Seed 42; holdout exacto 10 por categoría por grupos/etiquetas, sin mirar resultados. CV de 4 folds agrupados; algunas validaciones tienen tamaños diferentes. TF-IDF de palabras 1–2 y caracteres 3–5, ajustado dentro de cada entrenamiento.

Baseline mayoría; LogisticRegression C=1/4 y LinearSVC C=1/4. Selección solo con Macro F1 medio CV, recall OOF de cada clase y mejora frente al baseline. Objetivos prospectivos: 0.70, 0.60 y 0.10. Diferencias dentro de la dispersión favorecen el algoritmo/preferencia C fijados. Si no pasan todos los criterios, se documenta y no se promueve.`));
cells.push(code('experiment-sources',`EXPERIMENT_SOURCE = ${JSON.stringify(experiment)}
PROTOCOL_TEXT = ${JSON.stringify(protocol)}
SPLITS_TEXT = ${JSON.stringify(splits)}
EXPERIMENT_SOURCE_SHA256 = ${JSON.stringify(createHash('sha256').update(experiment).digest('hex'))}
require(canonical_hash(EXPERIMENT_SOURCE.encode()) == EXPERIMENT_SOURCE_SHA256, "EXPERIMENT_SOURCE_MISMATCH")
source_directory = WORKSPACE / "sources"
input_directory = WORKSPACE / "inputs"
result_directory = WORKSPACE / "results"
source_directory.mkdir(parents=True, exist_ok=True)
for name, payload in payloads.items():
    destination = input_directory / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)
preparation_text = ${JSON.stringify(read('ml/colab/preparation.py'))}
(source_directory / "preparation.py").write_text(preparation_text, encoding="utf-8")
(source_directory / "experiment.py").write_text(EXPERIMENT_SOURCE, encoding="utf-8")
(source_directory / "analyze_errors.py").write_text(${JSON.stringify(analysis)}, encoding="utf-8")
protocol_path = source_directory / "protocol.json"
splits_path = source_directory / "splits.json"
protocol_path.write_text(PROTOCOL_TEXT, encoding="utf-8")
splits_path.write_text(SPLITS_TEXT, encoding="utf-8")
def run_phase(phase):
    subprocess.run([str(experiment_python), "-B", str(source_directory / "experiment.py"),
        "--phase", phase, "--input-root", str(input_directory), "--protocol", str(protocol_path),
        "--splits", str(splits_path), "--output", str(result_directory),
        "--requirements", str(WORKSPACE / "requirements-stage-4.3.txt"), "--source-mode", SOURCE_MODE], check=True)
def show_image(path):
    try:
        from IPython.display import display, Image
    except ImportError:
        print("Figura guardada:", path)
    else:
        display(Image(filename=str(path)))
run_phase("validate")`));
cells.push(md('comparison-info',`## 7. Entrenamiento y selección con desarrollo

Ejecuta cinco configuraciones en los mismos cuatro folds: 20 ajustes pequeños, sin GPU. Vocabulario/IDF se aprende dentro del pipeline. Guarda métricas por fold, OOF, tiempos y decisión con hashes.

La prueba final NO se abre aquí. Si ya existe selección, se muestra sin sobrescribir. Para reproducir desde cero usa un runtime nuevo y el mismo protocolo; no cambies la partición buscando un resultado favorable.`));
cells.push(code('comparison',`RUN_COMPARISON = True
if RUN_COMPARISON:
    if not (result_directory / "selection.json").exists():
        run_phase("compare")
    selection = json.loads((result_directory / "selection.json").read_text(encoding="utf-8"))
    comparison = json.loads((result_directory / "comparison.json").read_text(encoding="utf-8"))
    summary = [{"candidate": row["id"], "cv_macro_f1_mean": row["mean_macro_f1"], "cv_macro_f1_std": row["std_macro_f1"],
        "oof_accuracy": row["oof_metrics"]["accuracy"],
        "oof_recall": {label: row["oof_metrics"]["classification_report"][label]["recall"] for label in CATEGORIES}}
        for row in comparison["candidates"]]
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps(selection["decision"], ensure_ascii=False, indent=2))
    show_image(result_directory / "comparison.png")`));
cells.push(md('final-test-info',`## 8. Abrir prueba final una vez, después de congelar la decisión

Inicialmente **RUN_FINAL_TEST=False**. Revisa la selección de la celda anterior. Si quieres completar esta ejecución autorizada 4.4, cambia a **True** y ejecuta solo esta celda.

Se ajusta el candidato elegido con los 160 de desarrollo y se evalúa en los 40 reservados, con baseline de referencia. No se prueban otros candidatos en test ni se modifican parámetros. Un registro exclusivo evita reabrir/sobrescribir la prueba en el mismo directorio. Si falla luego de abrirse, conserva el error y consulta antes de reintentar.

Métricas reales, matrices de conteos/normalizada, aciertos y errores quedan en resultados. SVM entrega márgenes, NO porcentajes de confianza. Probabilidades logísticas, si corresponde, no están calibradas.`));
cells.push(code('final-test',`RUN_FINAL_TEST = False
if RUN_FINAL_TEST:
    if not (result_directory / "final-metrics.json").exists():
        run_phase("final")
    final_report = json.loads((result_directory / "final-metrics.json").read_text(encoding="utf-8"))
    subprocess.run([str(experiment_python), "-B", str(source_directory / "analyze_errors.py"),
        "--input-root", str(input_directory), "--output", str(result_directory), "--splits", str(splits_path)], check=True)
    print(json.dumps(final_report, ensure_ascii=False, indent=2))
    show_image(result_directory / "confusion_matrix.png")
    show_image(result_directory / "confusion_matrix_normalized.png")
    try:
        from IPython.display import display, Markdown
    except ImportError:
        print("Reporte guardado:", result_directory / "REPORT.md")
    else:
        display(Markdown((result_directory / "REPORT.md").read_text(encoding="utf-8")))
        display(Markdown((result_directory / "ERROR-ANALYSIS.md").read_text(encoding="utf-8")))
else:
    print("FINAL_TEST_LOCKED: revisar decisión; activar RUN_FINAL_TEST solo en esta celda para completar la evaluación.")`));
cells.push(md('download-training-info',`## 9. Descargar y detenerse

Cambia **DOWNLOAD_RESULTS=True** después de la evaluación. Guarda el ZIP, matrices, comparación, métricas, CSV de aciertos/errores y reporte para el informe. La salida incluye trazabilidad de código/dataset/entorno; no incluye modelo ni secretos. El notebook del repositorio se guarda limpio, sin outputs.

Repite desde un runtime nuevo para comprobar reproducibilidad: mismas métricas/decisión/hash; los tiempos pueden variar. No adaptar el experimento tras observar el test. **Detente aquí: no iniciar 4.5.**`));
cells.push(code('download-training',`DOWNLOAD_RESULTS = False
if DOWNLOAD_RESULTS:
    require((result_directory / "final-metrics.json").exists(), "Completa primero la prueba final sin cambiar el protocolo")
    archive_path = WORKSPACE / "stage-4.4-results.zip"
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(result_directory.iterdir()):
            if path.is_file() and path.suffix in {".json", ".csv", ".md", ".png", ".pdf"}:
                archive.write(path, path.name)
        for name in ["protocol.json", "splits.json"]:
            archive.write(source_directory / name, name)
    from google.colab import files
    files.download(str(archive_path))`));
const notebook={...base,cells,metadata:{...base.metadata,
  colab:{name:'stage-4.4-training-v1.ipynb',provenance:[]},
  project:{stage:'4.4',experiment_version:'ticket-category-experiment-v1.0.0',dataset_commit:base.metadata.project.dataset_commit,
    experiment_sha256:createHash('sha256').update(experiment).digest('hex'),final_test_default:false}}};
writeFileSync(resolve(root,'ml/notebooks/stage-4.4-training-v1.ipynb'),JSON.stringify(notebook,null,2)+'\n','utf8');
console.log('OK: notebook 4.4 limpio; reutiliza 4.3 y protege prueba final.');
