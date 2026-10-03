# Guía paso a paso — GitHub y Google Colab, subetapa 4.3

Esta entrega prepara Dataset V1 y un entorno reproducible. **No entrena ni selecciona un modelo.** No hace falta activar Railway, Vercel, Docker ni PostgreSQL.

## 1. Archivos y versiones

Notebook: [stage-4.3-dataset-v1.ipynb](../notebooks/stage-4.3-dataset-v1.ipynb). Los datos se leen del commit completo `9d3103991911b1b06b9faca6dce779013dae3036`, correspondiente a Dataset V1. Abrir el notebook desde `main` permite encontrar el código de 4.3; no cambia el commit inmutable del dataset.

Se cargan solo corpus JSONL, familias, manifiesto, guía y contrato de categorías. Se verifican cinco hashes independientes del manifiesto, normalizando únicamente CRLF a LF. No se descarga el monorepo entero ni se ejecuta código proveniente del corpus.

Entorno: Python 3.11..3.13; 18 dependencias fijadas en [requirements.txt](../colab/requirements.txt); pip 25.1.1 como instalador. El notebook utiliza `/content/essalud-ml-stage-4.3/.venv` y deja intactos los paquetes globales de Colab. `experiment_python` identifica el Python del experimento; las próximas subetapas deben usar ese entorno, no imports científicos arbitrarios del kernel global.

## 2. Publicar en GitHub

Repositorio observado: `C-David28/essalud-ticket-system`, rama `main`. Se confirmó lectura pública de metadatos durante esta revisión: no hace falta token para archivos públicos. La descarga del commit de datos devolvió HTTP 404 en la prueba, por lo que debe publicarse/verificarse antes de usar la ruta GitHub. No reemplazar el SHA por `main` para ocultar ese problema.

Desde CMD en Windows:

```bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
npm.cmd run ml:data:check
npm.cmd run ml:colab:check
git log -3 --oneline
git status --short
git push origin main
```

El commit de esta entrega se prepara localmente. La modificación previa ajena de `.gitignore` queda fuera de él: no usar `git add .`. Usa tu acceso Git existente, sin contraseñas en el remoto ni en esta conversación.

En GitHub:

1. Abre [el repositorio](https://github.com/C-David28/essalud-ticket-system).
2. Comprueba que `ml/notebooks/stage-4.3-dataset-v1.ipynb` aparece en `main` y que existe el commit `9d31039` de Dataset V1.
3. Abre **Actions → ML Preparation CI** de ese push. Debe aprobar dataset, pruebas y ejecución del notebook en Linux. El workflow de infraestructura existente conserva su configuración.
4. Si falla, copia paso y error sin claves. Una ejecución local o en Actions no sustituye la comprobación en tu cuenta Colab.

Si `git push` informa rechazo o falta de acceso, no fuerces el push ni crees tokens dentro del código. Comparte el error sin credenciales para resolverlo.

## 3. Abrir y ejecutar en Colab

1. Inicia sesión con tu cuenta Google.
2. Abre [el notebook en Colab](https://colab.research.google.com/github/C-David28/essalud-ticket-system/blob/main/ml/notebooks/stage-4.3-dataset-v1.ipynb), después de publicar.
3. Si no encuentra el archivo, confirma el push y la ruta. También puedes entrar en [Colab](https://colab.research.google.com), elegir **Archivo → Abrir cuaderno → GitHub** y pegar la URL. O subir el `.ipynb` local desde **Subir cuaderno**.
4. Elige **Archivo → Guardar una copia en Drive** para conservar tu ejecución. No hace falta montar Drive en la máquina del notebook.
5. En **Entorno de ejecución → Cambiar tipo de entorno de ejecución**, selecciona Python y acelerador **Ninguno/CPU**. No se utiliza GPU.
6. En **Configuración**, conserva `SOURCE_MODE = "github_public"` e `INSTALL_DEPENDENCIES = True`. No escribas claves ni cambies el SHA por `main`.
7. Pulsa **Conectar** si aparece y después **Entorno de ejecución → Ejecutar todas**. Si pide confirmar la ejecución, revisa que sea tu notebook del repositorio.
8. Espera las descargas de PyPI. Se instala solo en el venv; las celdas muestran versiones reales y comprueban `pip check`.

Los nombres de menús pueden variar según idioma/interfaz: busca abrir, copiar a Drive, cambiar runtime y ejecutar todas. Si Python no está entre 3.11 y 3.13, el notebook se detiene antes de instalar; envía la versión para ajustar el entorno de manera controlada, sin cambiar los pins a ciegas.

## 4. Resultado esperado y verificación

Al final deben aparecer el estado `DATASET_V1_VERIFIED` en el JSON y la línea `READY_FOR_STAGE_4_4`. Comprueba:

- Versión `tickets-category-dataset-v1.0.0` y commit `9d3103991911b1b06b9faca6dce779013dae3036`.
- Hash del corpus `2f571a40f063c4cce267352582f0bf78d2008d09ddc617ab54c7f8dd5ca21a69`.
- 200 registros; SOPORTE, REDES, INFRAESTRUCTURA, BIOMEDICO con 50 cada una.
- 40 familias y 37 grupos; `source_mode` igual a `github_public` en esta ruta.
- `training_started`, `model_selected` y `operational_database_access`: false.
- NumPy 2.2.6, SciPy 1.15.3, pandas 2.2.3, scikit-learn 1.6.1 y matplotlib 3.10.3; reporte con las 18 dependencias y pip 25.1.1.

`READY_FOR_STAGE_4_4` significa preparación verificada. No significa modelo entrenado; todavía no existen accuracy, matriz de confusión ni predicciones.

## 5. Guardar evidencia y repetir desde cero

1. En la última celda cambia `DOWNLOAD_REPORT = False` a `True` y ejecuta solo esa celda. Descarga `stage-4.3-readiness.json`.
2. Conserva la copia del notebook en Drive. Si descargas el notebook ejecutado como evidencia, guárdalo fuera del repositorio; el notebook versionado queda limpio, sin outputs.
3. Guarda capturas: commit, **ML Preparation CI**, versión/hash del dataset, distribución, versiones del entorno y estado final.
4. Para repetir, usa **Entorno de ejecución → Desconectar y eliminar entorno de ejecución**; conecta una máquina nueva y ejecuta todas las celdas con la misma configuración. No elimines el proyecto ni Dataset V1.
5. Comprueba que hash, distribución y dependencias coinciden otra vez. Python y plataforma se registran tal como existan: Colab puede actualizar su imagen base.

Las máquinas Colab son temporales; compartir un notebook no comparte sus archivos ni paquetes instalados. Por eso se incluye toda la preparación. No usarlo como servidor del sistema. Ver [FAQ oficial](https://research.google.com/colaboratory/faq.html).

## 6. Repositorio privado: ruta recomendada sin token

No necesitas hacer público el repo ni crear un token permanente. Si Colab no abre el notebook privado con tu sesión, sube el `.ipynb` local mediante **Archivo → Abrir cuaderno → Subir cuaderno**.

En CMD:

```bat
cd /d "C:\Users\Stev\Pictures\SISTEMA DE TICKET\essalud-ticket-system"
npm.cmd run ml:colab:export
```

Se crea `ml\outputs\dataset-v1-colab.zip`, exportado por Git desde el commit de Dataset V1 con solo cinco archivos permitidos. Excluye `.env`, credenciales, backups y archivos no versionados; no es un ZIP del directorio de trabajo y está ignorado por Git.

En Colab:

1. Abre/sube el notebook.
2. Cambia `SOURCE_MODE = "upload"`.
3. Ejecuta todas. En la celda de carga, pulsa **Elegir archivos** y selecciona solamente `dataset-v1-colab.zip`.
4. Atiende ese diálogo y espera hashes/estado final.

El ZIP se lee en memoria, sin extraerlo. Se rechazan archivos extra, rutas peligrosas, enlaces simbólicos, entradas duplicadas y tamaños excesivos. No subir `.env` ni un ZIP manual del proyecto entero.

Abrir un notebook privado con autorización de GitHub **no autentica automáticamente las descargas de Python de la máquina de Colab**. Esta ruta evita el token.

## 7. Token opcional para descarga privada automática

Tu repo actual es público y no necesita este apartado. Si cambia a privado y prefieres descargar automáticamente, la alternativa ZIP sigue siendo más sencilla.

1. GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Selecciona tu cuenta, expiración corta y **Only select repositories → essalud-ticket-system**.
3. Permiso de repositorio **Contents: Read-only**; Metadata puede ser lectura obligatoria. Sin escritura ni otros repositorios. Una organización puede pedir aprobación adicional.
4. Copia el token directamente a Colab, sin enviarlo al chat ni pegarlo en celdas.
5. En Colab abre **Secrets/Secretos** (icono de llave), crea `GITHUB_READ_TOKEN`, pega allí el valor y habilita acceso del notebook.
6. Cambia solo `SOURCE_MODE = "github_secret"`. `userdata.get` obtiene el secreto y se usa en un encabezado HTTPS, sin imprimir ni guardar el valor.
7. Ejecuta las celdas. Si no puedes autorizar el secreto, usa `upload`.
8. Al terminar de necesitarlo, desactiva acceso del notebook y revoca o deja expirar el token.

No se siguen redirecciones con autorización ni se muestran cuerpos de error. Nunca usar tokens en URL, remoto Git, shell o celdas guardadas.

Fuentes: [Contents API y permisos mínimos](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#get-repository-content), [tokens fine-grained](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens), [Colab userdata](https://github.com/googlecolab/colabtools/blob/main/google/colab/userdata.py).

## 8. Si aparece un error

| Salida | Acción |
| --- | --- |
| GitHub HTTP 404 | Confirmar commit publicado, acceso y ruta; ZIP si es privado |
| GitHub HTTP 403 | Revisar límites/permisos, sin imprimir secreto; ZIP evita la descarga |
| IMMUTABLE_DATASET_HASH_MISMATCH | Comprobar el ZIP/commit correcto; no cambiar hashes para pasar |
| PYTHON_UNSUPPORTED | Enviar versión; no cambiar pins ni paquetes globales a ciegas |
| Descarga PyPI/import/dependencias | Copiar celda y mensaje sin claves; resolver antes del cierre |
| UNEXPECTED_ARCHIVE_FILE | Regenerar ZIP con `ml:colab:export`, no proyecto entero |

Para cerrar 4.3 envía el JSON descargado o la salida final y confirma que repetiste desde un runtime nuevo. No compartas tokens. **Se espera tu resultado Colab antes de declarar validada esa parte externa.** No continuar automáticamente a 4.4.
