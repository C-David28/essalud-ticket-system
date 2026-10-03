import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const preparation = readFileSync(resolve(root, 'ml/colab/preparation.py'), 'utf8').replace(/\r\n/g, '\n');
const requirements = readFileSync(resolve(root, 'ml/colab/requirements.txt'), 'utf8').replace(/\r\n/g, '\n');
const preparationHash = createHash('sha256').update(preparation,'utf8').digest('hex');
const source = text => text.trimEnd().split('\n').map(line => line + '\n');
const markdown = (id, text) => ({cell_type:'markdown',id,metadata:{},source:source(text)});
const code = (id, text) => ({cell_type:'code',id,metadata:{},source:source(text),execution_count:null,outputs:[]});
const cells = [
  markdown('intro', `# Etapa 4.3 — Dataset V1 y entorno reproducible

Sistema de Tickets: clasificación asistida de incidencias. **SYNTHETIC / DEMO / ACADEMIC DATASET**, sin datos institucionales reales.

Este notebook prepara el experimento y termina en **READY_FOR_STAGE_4_4**. No entrena, selecciona modelos, calcula accuracy/F1 ni crea particiones. No conecta a PostgreSQL, Redis, Railway ni Vercel.

1. Usa un entorno nuevo de Colab, Python con acelerador **Ninguno/CPU**.
2. Ejecuta las celdas en orden o **Entorno de ejecución → Ejecutar todas**.
3. La carga por GitHub público no necesita token. Los datos se leen en el commit completo de Dataset V1, nunca en la rama main cambiante.
4. Los 200 registros ML permanecen separados de los 20 tickets DEMO operativos. No hubo revisión humana independiente del dataset.

Guía completa: [COLAB-4.3.md](https://github.com/C-David28/essalud-ticket-system/blob/main/ml/docs/COLAB-4.3.md). Guarda una copia en Drive si quieres conservar el notebook ejecutado; no guardes secretos ni sus valores en celdas o salidas.`),
  markdown('helpers-info', `## 1. Herramientas de preparación

Código reproducible incluido desde \`ml/colab/preparation.py\`. Solo usa la biblioteca estándar. Las descargas se limitan a cinco archivos permitidos; no se descarga ni ejecuta código desde el dataset. Los ZIP se leen en memoria, sin extraerlos.

No necesitas modificar esta celda.`.replaceAll('\`','`')),
  code('helpers', preparation),
  markdown('configuration-info', `## 2. Configuración

Para el repositorio público actual deja **github_public**. Alternativas:

- **upload**: carga el ZIP exportado con \`npm run ml:colab:export\`; recomendado si el repositorio es privado, sin token.
- **github_secret**: opcional; solo para lectura privada automática. Colab Secrets debe contener \`GITHUB_READ_TOKEN\` con acceso autorizado a este notebook. Nunca escribas el valor aquí.
- **local_snapshot**: reservado a pruebas locales/CI; no usar en Colab.

Las dependencias se instalan dentro de \`WORKSPACE/.venv\`. El Python del experimento queda en \`experiment_python\`: evita usar los paquetes globales de Colab para el experimento. No se necesita GPU ni reiniciar el kernel por cambios de NumPy global.`.replaceAll('\`','`')),
  code('configuration', `SOURCE_MODE = "github_public"
LOCAL_REPOSITORY = None  # Solo pruebas locales; no configurar en Colab.
WORKSPACE = Path("/content/essalud-ml-stage-4.3")
INSTALL_DEPENDENCIES = True
PREPARATION_SOURCE_SHA256 = ${JSON.stringify(preparationHash)}
REQUIREMENTS_TEXT = ${JSON.stringify(requirements)}
print("Dataset:", DATASET_VERSION)
print("Commit de datos:", DATASET_COMMIT)
print("Origen:", SOURCE_MODE)`),
  markdown('environment-info', `## 3. Preparar y comprobar dependencias

Python compatible: **3.11, 3.12 o 3.13**. Se fijan 18 dependencias de cálculo, tablas y gráficos para el experimento futuro; instalarlas no selecciona ningún algoritmo.

La primera ejecución puede tardar por las descargas de PyPI. Esta celda comprueba versiones reales, imports y \`pip check\`. Los paquetes preinstalados de Colab permanecen intactos. La versión exacta de Python se registra; Colab puede cambiar su imagen base.`.replaceAll('\`','`')),
  code('environment', `experiment_python = prepare_environment(WORKSPACE, REQUIREMENTS_TEXT, install=INSTALL_DEPENDENCIES)
environment_report = verify_environment(experiment_python, REQUIREMENTS_TEXT)
print(json.dumps(environment_report, ensure_ascii=False, indent=2))`),
  markdown('load-info', `## 4. Cargar los archivos versionados

**Público:** lectura sin autenticación de un commit inmutable. Si GitHub devuelve 404, comprueba que publicaste el commit de Dataset V1; no reemplaces su SHA por main.

**Privado:** abrir un notebook con tu sesión de GitHub no autentica automáticamente las descargas de la máquina de Colab. Usa el ZIP permitido o, solo si lo necesitas, un secreto de lectura.

No cargues un ZIP del directorio completo de tu proyecto, .env, backups ni datos de producción.`),
  code('load', `def load_private_from_secret():
    try:
        from google.colab import userdata
        secret = userdata.get("GITHUB_READ_TOKEN")
    except Exception:
        raise RuntimeError("Autoriza GITHUB_READ_TOKEN en Colab Secrets o usa upload sin token.") from None
    try:
        return load_github(token=secret)
    finally:
        secret = None

if SOURCE_MODE == "github_public":
    payloads = load_github()
elif SOURCE_MODE == "upload":
    from google.colab import files
    uploaded = files.upload()
    require(len(uploaded) == 1, "Sube solamente dataset-v1-colab.zip")
    try:
        payloads = load_archive(bytes(next(iter(uploaded.values()))))
    finally:
        uploaded.clear()
elif SOURCE_MODE == "github_secret":
    payloads = load_private_from_secret()
elif SOURCE_MODE == "local_snapshot":
    require(LOCAL_REPOSITORY is not None, "LOCAL_REPOSITORY_REQUIRED")
    payloads = load_local_snapshot(LOCAL_REPOSITORY)
else:
    raise ValueError("SOURCE_MODE_INVALID")
print("Archivos permitidos cargados:", len(payloads))`),
  markdown('validation-info', `## 5. Verificar exactamente Dataset V1

Se comprueban SHA-256 normalizados a LF, versión, 200 registros, cuatro categorías con 50 cada una, 40 familias y 37 grupos. Los hashes esperados están fijados en este notebook además del manifiesto: un manifiesto alterado no hace legítimo un corpus cambiado.

Las columnas auxiliares (ID, familia, grupo, etiqueta, justificación, estilo, procedencia) no son entradas del modelo. La separación por grupos se decidirá y congelará antes de entrenar; no hay test ni métricas predictivas en 4.3.`),
  code('validation', `records, dataset_report = verify_dataset(payloads)
MODEL_INPUT_COLUMNS = ("titulo", "descripcion")
print(json.dumps(dataset_report, ensure_ascii=False, indent=2))
print("Únicas entradas futuras:", MODEL_INPUT_COLUMNS)`),
  markdown('readiness-info', `## 6. Guardar evidencia de preparación

El reporte identifica dataset, commit, hash, requisitos y versiones instaladas. **READY_FOR_STAGE_4_4 significa entorno y dataset verificados, no un modelo entrenado.**

El reporte no contiene token, texto operativo ni métricas inventadas. La máquina de Colab es temporal: descarga el reporte y conserva una copia del notebook si necesitas evidencias.`),
  code('readiness', `report = readiness_report(dataset_report, environment_report, REQUIREMENTS_TEXT, SOURCE_MODE, PREPARATION_SOURCE_SHA256)
output_directory = WORKSPACE / "outputs"
output_directory.mkdir(parents=True, exist_ok=True)
report_path = output_directory / "stage-4.3-readiness.json"
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
print("READY_FOR_STAGE_4_4")
print("Reporte guardado:", report_path)`),
  markdown('download-info', `## 7. Descargar evidencia (opcional)

Después de revisar el resultado, cambia \`DOWNLOAD_REPORT\` a True y ejecuta solo la siguiente celda para descargar el JSON. Para repetir desde cero: desconecta y elimina el entorno de ejecución, vuelve a abrir este notebook y ejecuta todas las celdas. No cambies Dataset V1 para corregir un error de carga.

**Detente aquí.** La subetapa 4.4 requiere autorización; este notebook no entrena automáticamente.`.replaceAll('\`','`')),
  code('download', `DOWNLOAD_REPORT = False
if DOWNLOAD_REPORT:
    from google.colab import files
    files.download(str(report_path))`),
];
const notebook = {nbformat:4,nbformat_minor:5,metadata:{
  kernelspec:{display_name:'Python 3',language:'python',name:'python3'},
  language_info:{name:'python'},colab:{name:'stage-4.3-dataset-v1.ipynb',provenance:[]},
  project:{stage:'4.3',dataset_commit:'9d3103991911b1b06b9faca6dce779013dae3036',preparation_sha256:preparationHash,training_started:false},
},cells};
mkdirSync(resolve(root,'ml/notebooks'),{recursive:true});
writeFileSync(resolve(root,'ml/notebooks/stage-4.3-dataset-v1.ipynb'),JSON.stringify(notebook,null,2)+'\n','utf8');
console.log('OK: notebook 4.3 generado, sin outputs ni entrenamiento.');
