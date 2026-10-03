# Validación y evidencias — subetapa 4.3

Fecha: 2026-10-02. Alcance: notebook, GitHub/ZIP, entorno aislado y comprobaciones reproducibles. Sin particiones, entrenamiento, selección, métricas predictivas ni despliegue.

## Estado

Implementación local preparada. **Pendiente publicar/verificar CI remoto y ejecutar el notebook en la cuenta Google Colab del usuario.** Una prueba local no confirma esa máquina/sesión.

Dataset V1 del commit completo `9d3103991911b1b06b9faca6dce779013dae3036` se conserva sin cambios. No se modifican corpus, familias, manifiesto, tarjeta ni reporte 4.2. Cinco hashes de entrada y distribución se comprueban de manera independiente.

## Verificaciones locales

```bat
npm.cmd run ml:data:check
npm.cmd run ml:data:test
npm.cmd run ml:colab:check
npm.cmd run ml:colab:test
npm.cmd run ml:colab:export
npm.cmd run check
```

Las pruebas `ml:colab:test` usan Python/biblioteca estándar, sin instalar paquetes ni necesitar token. Si CMD no reconoce Python, no necesitas instalarlo para usar Colab: las comprobaciones Node funcionan localmente y el CI ejecuta las Python.

Ejecución integral local/CI con Python 3.11..3.13:

```bat
python -B ml/colab/smoke_notebook.py --workspace ml/outputs/stage-4.3-local
```

Ejecuta las siete celdas Python y solo instala en el workspace indicado. `--github` usa la descarga pública real; `--no-install` reutiliza un entorno ya instalado sin saltar comprobaciones.

Resultados observados:

- Dataset V1 validado: 200 registros, 50 por categoría, 40 familias y 37 grupos; 28 pruebas del validador aprobadas.
- 22 pruebas Python de loaders/seguridad/notebook aprobadas.
- Notebook limpio y sincronizado: siete celdas Python, sin outputs ni entrenamiento.
- Ejecución integral offline desde entorno limpio: Python 3.12.14, 18 versiones fijadas, pip 25.1.1, `pip check` sin errores, `READY_FOR_STAGE_4_4`.
- Exportación ZIP de cinco archivos del commit Dataset V1 verificada; no incluye `.env` ni datos operativos.
- Comprobación general aprobada: metadatos y sintaxis de 35 scripts. Enlaces documentales locales y `git diff --check` sin errores; YAML del workflow nuevo parseado y revisado.
- Repositorio GitHub con metadatos públicos; prueba de descarga real del commit Dataset V1 devuelve HTTP 404. Falta publicar/verificar su disponibilidad remota y repetir la ruta pública. No se inventa un resultado exitoso de GitHub/Colab.

Se corrigió la comprobación de nombres ZIP originales para rechazar barras invertidas también en Windows, donde la biblioteca puede normalizarlas. Los paquetes se instalan con pip aislado, índice PyPI explícito y ruedas binarias. El venv se crea sin depender de `ensurepip`; [pip gestiona ese otro intérprete](https://pip.pypa.io/en/stable/topics/python-option/).

El notebook incluye el helper y requisitos para funcionar al subir solo el `.ipynb`. Regenerar con `ml:colab:build` si cambian. El reporte identifica versión/hash del código, requisitos, commit/hash de datos y paquetes reales. No representa métricas ML.

## Compatibilidad y seguridad

- Público sin token; privado recomendado por ZIP de `git archive` y lista permitida.
- Token opcional fine-grained, un repo, Contents read, expiración breve, Colab Secrets; memoria/encabezado, sin redirecciones ni logs del valor.
- ZIP sin extracción: controles de rutas originales, symlinks, duplicados, archivos extra y tamaños comprimidos/expandidos.
- ML ignora venv, outputs, ZIP, pycache y checkpoints. `.gitignore` raíz previo se conserva fuera del commit.
- API, frontend, SQL, roles, datos operativos y despliegues permanecen sin cambios. Workflow de infraestructura intacto; `ML Preparation CI` independiente y de solo lectura.

## Cierre manual y evidencias

Seguir [COLAB-4.3.md](COLAB-4.3.md). Guardar commit/CI GitHub, notebook en Colab, versión/hash/distribución, paquetes reales, estado final, `stage-4.3-readiness.json` y repetición desde runtime nuevo. Enviar reporte/salida para verificar; no tokens.

La ejecución externa aún no está observada. Siguiente subetapa, después de validar 4.3 y recibir autorización: **4.4 — Entrenamiento, comparación y evaluación**. No iniciada.
