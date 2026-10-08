"""Read-only postprocessing of measured OOF/final predictions; never fits a model."""
import argparse
from collections import Counter
from hashlib import sha256
from pathlib import Path
import csv
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "colab"))
import preparation as prep


def analyze(input_root, output, splits_path):
    records, _ = prep.verify_dataset(prep.load_local_snapshot(input_root))
    by_id = {r["record_id"]: r for r in records}
    output = Path(output)
    comparison = json.loads((output / "comparison.json").read_text(encoding="utf-8"))
    selection = json.loads((output / "selection.json").read_text(encoding="utf-8"))
    final = json.loads((output / "final-metrics.json").read_text(encoding="utf-8"))
    splits = json.loads(Path(splits_path).read_text(encoding="utf-8"))
    split_hash = sha256(json.dumps(splits, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    prep.require(split_hash == final["provenance"]["splits_sha256_canonical_json"], "ANALYSIS_SPLITS_MISMATCH")
    candidate = selection["decision"]["candidate_id"]
    prep.require(final["candidate_id"] == candidate, "ANALYSIS_SELECTION_MISMATCH")
    with (output / "development-oof.csv").open(encoding="utf-8", newline="") as file:
        measured = [r for r in csv.DictReader(file) if r["candidate_id"] == candidate]
    prep.require(len(measured) == 160 and len({r["record_id"] for r in measured}) == 160, "ANALYSIS_OOF_COVERAGE_MISMATCH")
    prep.require({r["record_id"] for r in measured} == set(splits["development_ids"]), "ANALYSIS_OOF_IDS_MISMATCH")
    rows = []
    for prediction in measured:
        record = by_id[prediction["record_id"]]
        prep.require(prediction["real"] == record["categoria"], "ANALYSIS_LABEL_MISMATCH")
        rows.append({**prediction, "correct": prediction["real"] == prediction["predicted"],
                     "titulo": record["titulo"], "descripcion": record["descripcion"],
                     "scenario_family_id": record["scenario_family_id"], "leakage_group_id": record["leakage_group_id"],
                     "is_boundary_case": record["is_boundary_case"], "expected_label_rationale_for_review": record["label_rationale"]})
    errors = [row for row in rows if not row["correct"]]
    for filename, values in [("development-examples.csv", rows), ("development-errors.csv", errors)]:
        with (output / filename).open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(values)
    family_counts = Counter(r["scenario_family_id"] for r in errors)
    class_counts = Counter(r["real"] for r in errors)
    selected = next(r for r in comparison["candidates"] if r["id"] == candidate)
    prep.require(abs((160 - len(errors)) / 160 - selected["oof_metrics"]["accuracy"]) < 1e-12, "ANALYSIS_MEASUREMENTS_MISMATCH")
    summary = {"candidate_id": candidate, "development_records": 160, "development_errors": len(errors),
               "errors_per_category": dict(class_counts), "errors_per_family": dict(family_counts),
               "oof_accuracy": selected["oof_metrics"]["accuracy"], "final_records": 40,
               "final_errors": int(round(40 * (1 - final["metrics"]["accuracy"]))),
               "postprocessing_only": True, "analysis_source_sha256_utf8_lf": prep.canonical_hash(Path(__file__).read_bytes())}
    (output / "error-analysis.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = ["# Análisis de errores — predicciones observadas", "", "Datos sintéticos; no información institucional real.", "",
             f"Candidato: `{candidate}`. Desarrollo OOF: {160-len(errors)}/160 aciertos, {len(errors)} fallos. Prueba final: {40-summary['final_errors']}/40 aciertos, {summary['final_errors']} fallos.", "",
             "OOF significa que cada predicción de desarrollo proviene de un modelo que no vio ese grupo durante su ajuste. No se utiliza el modelo ajustado con todo desarrollo para medir aciertos sobre esos mismos textos.", "",
             "## Distribución de fallos de desarrollo", "", "| Categoría real | Errores |", "| --- | ---: |"]
    lines += [f"| {label} | {class_counts[label]} |" for label in prep.CATEGORIES]
    lines += ["", "## Ejemplos de errores observados", ""]
    # Diverse families, not eight variants of the same concept.
    samples, seen = [], set()
    for row in errors:
        if row["scenario_family_id"] not in seen:
            samples.append(row)
            seen.add(row["scenario_family_id"])
        if len(samples) == 8:
            break
    for row in samples:
        lines += [f"### {row['record_id']}: {row['real']} → {row['predicted']}", "",
                  f"**{row['titulo']}**. {row['descripcion']}", "",
                  "Criterio de etiqueta esperado (solo para revisión, nunca input del clasificador): " + row["expected_label_rationale_for_review"], ""]
    lines += ["## Aciertos observados de desarrollo", ""]
    for label in prep.CATEGORIES:
        example = next((r for r in rows if r["correct"] and r["real"] == label), None)
        if example:
            lines += [f"- {example['record_id']} — {example['titulo']}: real={label}, predicción={example['predicted']}."]
    lines += ["", "## Interpretación para revisar", "",
              "Las confusiones pueden reflejar vocabulario compartido (monitor, señal, cable, software, energía) y familias ausentes en el entrenamiento de un fold. Un vectorizador TF-IDF no comprende de forma fiable negaciones ni cuál es el componente afectado. Son hipótesis de revisión de los textos, no diagnósticos ni explicaciones causales demostradas de los pesos del modelo.", "",
              "El resultado final perfecto no elimina los fallos OOF. Solo hay ocho grupos finales y un corpus sintético de una fuente asistida, sin revisión humana independiente. No añadir errores artificiales ni escoger otra prueba para bajar/subir métricas. Cualquier mejora posterior requiere una versión nueva y una evaluación declarada; no usar estos errores para retocar V1.", "",
              "Los scores SVM son márgenes, incluso pueden ser negativos. No convertirlos a porcentaje ni interpretarlos como certeza. La política de abstención/umbral operativo queda pendiente de validación con desarrollo antes de integración. Este postprocesamiento no entrena, cambia la decisión ni exporta modelos.", ""]
    (output / "ERROR-ANALYSIS.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--splits", type=Path, required=True)
    args = parser.parse_args()
    analyze(args.input_root, args.output, args.splits)
