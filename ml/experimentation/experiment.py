"""Stage 4.4: frozen grouped evaluation. No database, HTTP service or model export.

Only title and description enter estimators. Final test is a separate explicit phase.
"""
from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
import argparse
import csv
import json
import os
from pathlib import Path
import sys
import time

# Colab writes preparation.py beside this file; the repository reuses the 4.3 helper.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "colab"))
import preparation as prep

VERSION = "ticket-category-experiment-v1.0.0"
LABELS = prep.CATEGORIES


def digest(value):
    return sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def text_input(row):
    # Never pass category, rationale, site, ID, family or group to the vectorizers.
    return row["titulo"].strip() + "\n" + row["descripcion"].strip()


def group_holdout(records, seed=42):
    """Exact 10/class selection using labels/groups only, before any fit or text scoring."""
    counts = {}
    for row in records:
        counts.setdefault(row["leakage_group_id"], Counter())[row["categoria"]] += 1
    ordered = sorted(counts, key=lambda group: sha256(f"{seed}|{group}".encode()).hexdigest())
    states = {(0, 0, 0, 0): ()}
    target = (10, 10, 10, 10)
    for group in ordered:
        vector = tuple(counts[group][label] for label in LABELS)
        for current, chosen in list(states.items()):
            new = tuple(a + b for a, b in zip(current, vector))
            if all(a <= b for a, b in zip(new, target)):
                states.setdefault(new, chosen + (group,))
    prep.require(target in states, "NO_BALANCED_GROUP_HOLDOUT")
    return set(states[target])


def validate_protocol(protocol):
    prep.require(protocol["experiment_version"] == VERSION and protocol["dataset_sha256"] == prep.EXPECTED_HASHES[prep.DATASET_ROOT + "incidents.jsonl"], "PROTOCOL_DATASET_MISMATCH")
    prep.require(protocol["dataset_commit"] == prep.DATASET_COMMIT and protocol["input_columns"] == ["titulo", "descripcion"], "PROTOCOL_INPUT_MISMATCH")
    prep.require(protocol["persist_model"] is False and protocol["institutional_validation"] is False, "PROTOCOL_SCOPE_MISMATCH")
    prep.require(protocol["validation"]["folds"] == 4 and protocol["validation"]["group_column"] == "leakage_group_id", "PROTOCOL_GROUP_MISMATCH")


def freeze_splits(records, protocol):
    import numpy as np
    from sklearn.model_selection import StratifiedGroupKFold
    validate_protocol(protocol)
    held_groups = group_holdout(records, protocol["seed"])
    development = [r for r in records if r["leakage_group_id"] not in held_groups]
    test = [r for r in records if r["leakage_group_id"] in held_groups]
    y = np.array([r["categoria"] for r in development])
    groups = np.array([r["leakage_group_id"] for r in development])
    cv = StratifiedGroupKFold(n_splits=4, shuffle=True, random_state=protocol["seed"])
    folds = [{"fold": number + 1,
              "training_ids": [development[i]["record_id"] for i in train],
              "validation_ids": [development[i]["record_id"] for i in valid]}
             for number, (train, valid) in enumerate(cv.split(np.zeros(len(y)), y, groups))]
    result = {"schema_version": 1, "experiment_version": VERSION, "dataset_sha256": protocol["dataset_sha256"],
              "protocol_sha256_canonical_json": digest(protocol), "seed": protocol["seed"],
              "method": protocol["holdout"]["method"],
              "development_ids": [r["record_id"] for r in development],
              "final_test_ids": [r["record_id"] for r in test], "folds": folds}
    validate_splits(records, protocol, result)
    return result


def validate_splits(records, protocol, splits):
    validate_protocol(protocol)
    prep.require(splits["protocol_sha256_canonical_json"] == digest(protocol) and splits["dataset_sha256"] == protocol["dataset_sha256"], "SPLIT_PROTOCOL_MISMATCH")
    by_id = {r["record_id"]: r for r in records}
    all_ids = set(by_id)
    dev, test = set(splits["development_ids"]), set(splits["final_test_ids"])
    prep.require(len(dev) == len(splits["development_ids"]) == 160 and len(test) == len(splits["final_test_ids"]) == 40, "SPLIT_SIZE_MISMATCH")
    prep.require(not dev & test and dev | test == all_ids, "SPLIT_COVERAGE_MISMATCH")
    groups = lambda ids: {by_id[i]["leakage_group_id"] for i in ids}
    prep.require(not groups(dev) & groups(test), "HOLDOUT_GROUP_LEAKAGE")
    prep.require(Counter(by_id[i]["categoria"] for i in test) == dict.fromkeys(LABELS, 10), "HOLDOUT_CLASS_MISMATCH")
    validation_ids = []
    prep.require(len(splits["folds"]) == 4, "CV_FOLD_COUNT_MISMATCH")
    for fold in splits["folds"]:
        train, valid = set(fold["training_ids"]), set(fold["validation_ids"])
        prep.require(len(train) == len(fold["training_ids"]) and len(valid) == len(fold["validation_ids"]), "CV_DUPLICATE_IDS")
        prep.require(not train & valid and train | valid == dev, "CV_COVERAGE_MISMATCH")
        prep.require(not groups(train) & groups(valid), "CV_GROUP_LEAKAGE")
        prep.require({by_id[i]["categoria"] for i in train} == set(LABELS) and {by_id[i]["categoria"] for i in valid} == set(LABELS), "CV_CLASS_MISSING")
        validation_ids += fold["validation_ids"]
    prep.require(Counter(validation_ids) == Counter({i: 1 for i in dev}), "OOF_COVERAGE_MISMATCH")
    return {"development": {"records": len(dev), "groups": len(groups(dev)), "distribution": dict(Counter(by_id[i]["categoria"] for i in dev))},
            "final_test": {"records": len(test), "groups": len(groups(test)), "distribution": dict(Counter(by_id[i]["categoria"] for i in test))},
            "folds": [{"fold": f["fold"], "training": len(f["training_ids"]), "validation": len(f["validation_ids"]),
                       "validation_distribution": dict(Counter(by_id[i]["categoria"] for i in f["validation_ids"]))} for f in splits["folds"]]}


def make_estimator(spec, protocol):
    from sklearn.dummy import DummyClassifier
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.pipeline import FeatureUnion, Pipeline
    from sklearn.linear_model import LogisticRegression
    from sklearn.svm import LinearSVC
    if spec["algorithm"] == "DummyClassifier":
        return DummyClassifier(strategy=spec["strategy"], random_state=protocol["seed"])
    vector = protocol["vectorizer"]
    shared = {key: vector[key] for key in ["lowercase", "strip_accents", "sublinear_tf", "min_df"]}
    features = FeatureUnion([
        ("word", TfidfVectorizer(analyzer="word", ngram_range=tuple(vector["word_ngram_range"]), stop_words=None, **shared)),
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=tuple(vector["char_ngram_range"]), **shared))],
        transformer_weights={"word": vector["view_weights"][0], "char": vector["view_weights"][1]})
    if spec["algorithm"] == "LogisticRegression":
        classifier = LogisticRegression(C=spec["C"], solver=spec["solver"], max_iter=spec["max_iter"], random_state=protocol["seed"])
    else:
        prep.require(spec["algorithm"] == "LinearSVC", "UNSUPPORTED_CANDIDATE")
        classifier = LinearSVC(C=spec["C"], dual=spec["dual"], max_iter=spec["max_iter"], random_state=protocol["seed"])
    return Pipeline([("features", features), ("classifier", classifier)])


def metrics(y, predictions):
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
    report = classification_report(y, predictions, labels=LABELS, output_dict=True, zero_division=0)
    matrix = confusion_matrix(y, predictions, labels=LABELS)
    normalized = confusion_matrix(y, predictions, labels=LABELS, normalize="true")
    return {"accuracy": float(accuracy_score(y, predictions)), "macro_f1": float(f1_score(y, predictions, labels=LABELS, average="macro", zero_division=0)),
            "weighted_f1": float(f1_score(y, predictions, labels=LABELS, average="weighted", zero_division=0)),
            "classification_report": report, "labels": LABELS, "confusion_matrix": matrix.tolist(), "confusion_matrix_normalized": normalized.tolist()}


def meets_gates(macro, per_class, baseline_macro, protocol):
    gates = protocol["selection"]
    return macro >= gates["minimum_macro_f1"] and all(per_class[label]["recall"] >= gates["minimum_recall_per_category"] for label in LABELS) and macro - baseline_macro >= gates["minimum_macro_f1_gain_over_baseline"]


def choose_candidate(comparison, protocol):
    """This function receives development metrics only, never a final-test report."""
    rows = comparison["candidates"]
    baseline = next(r for r in rows if r["algorithm"] == "DummyClassifier")
    candidates = [r for r in rows if r["algorithm"] != "DummyClassifier"]
    qualified = [r for r in candidates if meets_gates(r["mean_macro_f1"], r["oof_metrics"]["classification_report"], baseline["mean_macro_f1"], protocol)]
    pool = qualified or candidates
    best = max(pool, key=lambda r: (r["mean_macro_f1"], r["id"]))
    nearby = [r for r in pool if best["mean_macro_f1"] - r["mean_macro_f1"] <= max(best["std_macro_f1"], r["std_macro_f1"])]
    ranks = {name: index for index, name in enumerate(protocol["selection"]["tie_preference"])}
    chosen = min(nearby, key=lambda r: (ranks[r["algorithm"]], r["spec"]["C"], -r["mean_macro_f1"]))
    return {"candidate_id": chosen["id"], "candidate_spec": chosen["spec"], "selection_source": "development_grouped_cv_only",
            "cv_acceptance_passed": bool(qualified), "best_mean_candidate_id": best["id"],
            "near_tie_candidates": [r["id"] for r in nearby], "chosen_mean_macro_f1": chosen["mean_macro_f1"],
            "chosen_std_macro_f1": chosen["std_macro_f1"], "baseline_mean_macro_f1": baseline["mean_macro_f1"],
            "reason": "Eligibility gates first; CV mean/variability and predeclared algorithm/lower-C preference" if qualified else "No candidate passed all gates; evaluate leading development candidate, never promote on final-test performance"}


def score_outputs(estimator, texts, predicted, spec):
    import numpy as np
    if spec["algorithm"] == "LogisticRegression":
        probabilities = estimator.predict_proba(texts)
        return np.max(probabilities, axis=1).tolist(), "uncalibrated_probability"
    if spec["algorithm"] == "LinearSVC":
        decision = estimator.decision_function(texts)
        return np.max(decision, axis=1).tolist(), "raw_decision_margin_not_probability"
    return [None] * len(predicted), "baseline_no_confidence"


def write_csv(path, rows, fieldnames=None):
    if not rows and not fieldnames:
        return
    with Path(path).open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames or list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def compare(records, protocol, splits, output, provenance):
    import numpy as np
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    prep.require(not (output / "selection.json").exists(), "COMPARISON_EXISTS: use existing report; do not overwrite a frozen decision")
    # Exclude test rows before preprocessing, fitting, scoring or selection.
    selected_ids = set(splits["development_ids"])
    development = {r["record_id"]: r for r in records if r["record_id"] in selected_ids}
    rows, oof_rows = [], []
    for spec in protocol["candidates"]:
        folds, predictions, scores, fit_times, infer_times = [], {}, {}, [], []
        score_kind = None
        for fold in splits["folds"]:
            train = [development[i] for i in fold["training_ids"]]
            valid = [development[i] for i in fold["validation_ids"]]
            estimator = make_estimator(spec, protocol)
            start = time.perf_counter()
            estimator.fit([text_input(r) for r in train], [r["categoria"] for r in train])
            fit_times.append(time.perf_counter() - start)
            texts = [text_input(r) for r in valid]
            start = time.perf_counter()
            pred = estimator.predict(texts).tolist()
            infer_times.append((time.perf_counter() - start) / len(valid))
            values, score_kind = score_outputs(estimator, texts, pred, spec)
            predictions.update(zip(fold["validation_ids"], pred))
            scores.update(zip(fold["validation_ids"], values))
            folds.append({"fold": fold["fold"], **metrics([r["categoria"] for r in valid], pred)})
        ordered = splits["development_ids"]
        y = [development[i]["categoria"] for i in ordered]
        pred = [predictions[i] for i in ordered]
        row = {"id": spec["id"], "algorithm": spec["algorithm"], "spec": spec, "folds": folds,
               "mean_macro_f1": float(np.mean([f["macro_f1"] for f in folds])),
               "std_macro_f1": float(np.std([f["macro_f1"] for f in folds])), "oof_metrics": metrics(y, pred),
               "mean_fit_seconds": float(np.mean(fit_times)), "mean_inference_seconds_per_record": float(np.mean(infer_times)),
               "score_kind": score_kind}
        if spec["algorithm"] == "LogisticRegression":
            curve = []
            for threshold in protocol["confidence_analysis"]["thresholds"]:
                kept = [i for i in ordered if scores[i] >= threshold]
                curve.append({"threshold": threshold, "accepted": len(kept), "coverage": len(kept) / len(ordered),
                              "accepted_accuracy": sum(predictions[i] == development[i]["categoria"] for i in kept) / len(kept) if kept else None,
                              "abstentions_per_category": dict(Counter(development[i]["categoria"] for i in ordered if i not in set(kept)))})
            row["uncalibrated_probability_coverage_analysis"] = curve
        rows.append(row)
        oof_rows += [{"candidate_id": spec["id"], "record_id": i, "real": development[i]["categoria"], "predicted": predictions[i],
                      "correct": development[i]["categoria"] == predictions[i], "score": scores[i], "score_kind": score_kind} for i in ordered]
    comparison = {"experiment_version": VERSION, "phase": "development_only", "training_executed": True, "splits_created": True, "provenance": provenance, "candidates": rows}
    decision = choose_candidate(comparison, protocol)
    selection = {"experiment_version": VERSION, "provenance": provenance, "decision": decision,
                 "comparison_sha256_canonical_json": digest(comparison), "final_test_used_for_selection": False}
    selection["selection_sha256_canonical_json"] = digest(selection)
    write_json(output / "comparison.json", comparison)
    write_csv(output / "development-oof.csv", oof_rows)
    write_csv(output / "comparison.csv", [{"candidate": r["id"], "cv_macro_f1_mean": r["mean_macro_f1"], "cv_macro_f1_std": r["std_macro_f1"],
              "oof_accuracy": r["oof_metrics"]["accuracy"], "oof_macro_f1": r["oof_metrics"]["macro_f1"], "oof_weighted_f1": r["oof_metrics"]["weighted_f1"],
              "mean_fit_seconds": r["mean_fit_seconds"], "mean_inference_seconds_per_record": r["mean_inference_seconds_per_record"]} for r in rows])
    plot_comparison(rows, output)
    write_json(output / "selection.json", selection)
    print(json.dumps(decision, indent=2, ensure_ascii=False))
    return selection


def plot_comparison(rows, output):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(9, 4.8))
    ax.bar([r["id"] for r in rows], [r["mean_macro_f1"] for r in rows], yerr=[r["std_macro_f1"] for r in rows], capsize=5)
    ax.axhline(0.70, color="red", linestyle="--", label="Objetivo académico Macro F1 = 0.70")
    ax.set_ylim(0, 1.05)
    ax.set_ylabel("Macro F1: media y desviación entre folds")
    ax.set_title("Desarrollo: CV de 4 folds por grupos (datos sintéticos)")
    ax.tick_params(axis="x", labelrotation=15)
    ax.legend(fontsize=8)
    fig.tight_layout()
    for suffix in ["png", "pdf"]:
        fig.savefig(Path(output) / f"comparison.{suffix}", dpi=180)
    plt.close(fig)


def error_rows(rows, predictions, scores, kind):
    result = []
    for row, prediction, score in zip(rows, predictions, scores):
        correct = row["categoria"] == prediction
        reason = "Acierto; comprobar evidencia textual con guía" if correct else "Posible confusión por vocabulario compartido o familia no vista; requiere revisión humana, no es una explicación causal"
        if not correct and row["is_boundary_case"]:
            reason = "Caso fronterizo: posiblemente no distingue el componente afectado; revisar manualmente según guía, sin cambiar etiqueta de prueba"
        result.append({"record_id": row["record_id"], "titulo": row["titulo"], "descripcion": row["descripcion"],
                       "real": row["categoria"], "predicted": prediction, "correct": correct, "score": score, "score_kind": kind,
                       "scenario_family_id": row["scenario_family_id"], "leakage_group_id": row["leakage_group_id"],
                       "is_boundary_case": row["is_boundary_case"], "possible_reason_to_review": reason})
    return result


def plot_matrix(report, output, normalized=False):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from sklearn.metrics import ConfusionMatrixDisplay
    import numpy as np
    key = "confusion_matrix_normalized" if normalized else "confusion_matrix"
    fig, ax = plt.subplots(figsize=(7.5, 6))
    ConfusionMatrixDisplay(np.array(report[key]), display_labels=LABELS).plot(ax=ax, cmap="Blues", values_format=".2f" if normalized else "d", colorbar=False)
    ax.set_title("Prueba final sintética: " + ("normalizada por fila" if normalized else "conteos"))
    ax.set_xlabel("Categoría predicha")
    ax.set_ylabel("Categoría real")
    ax.tick_params(axis="x", labelrotation=15)
    fig.tight_layout()
    for suffix in ["png", "pdf"]:
        fig.savefig(Path(output) / f"{key}.{suffix}", dpi=180)
    plt.close(fig)


def evaluate_final(records, protocol, splits, output, provenance):
    """Read frozen decision before touching final-test texts. Refitting uses dev only."""
    output = Path(output)
    selection = read_json(output / "selection.json")
    comparison = read_json(output / "comparison.json")
    claimed = selection.pop("selection_sha256_canonical_json")
    prep.require(digest(selection) == claimed, "SELECTION_CHANGED")
    selection["selection_sha256_canonical_json"] = claimed
    prep.require(selection["provenance"] == provenance and digest(comparison) == selection["comparison_sha256_canonical_json"], "EXPERIMENT_CHANGED_AFTER_SELECTION")
    prep.require(selection["decision"] == choose_candidate(comparison, protocol) and selection["final_test_used_for_selection"] is False, "INVALID_SELECTION")
    prep.require(not (output / "final-test-started.json").exists(), "FINAL_TEST_ALREADY_OPENED: read existing results; do not retune or overwrite")
    # Exclusive creation prevents two workers from opening the test in the same run.
    with (output / "final-test-started.json").open("x", encoding="utf-8") as file:
        json.dump({"opened_at_utc": datetime.now(timezone.utc).isoformat(), "selection_sha256": claimed}, file)
    by_id = {r["record_id"]: r for r in records}
    development = [by_id[i] for i in splits["development_ids"]]
    final = [by_id[i] for i in splits["final_test_ids"]]
    decision = selection["decision"]
    estimator = make_estimator(decision["candidate_spec"], protocol)
    estimator.fit([text_input(r) for r in development], [r["categoria"] for r in development])
    texts = [text_input(r) for r in final]
    predictions = estimator.predict(texts).tolist()
    scores, kind = score_outputs(estimator, texts, predictions, decision["candidate_spec"])
    y = [r["categoria"] for r in final]
    baseline_spec = protocol["candidates"][0]
    baseline = make_estimator(baseline_spec, protocol)
    baseline.fit([text_input(r) for r in development], [r["categoria"] for r in development])
    baseline_report = metrics(y, baseline.predict(texts).tolist())
    report = metrics(y, predictions)
    final_gate = meets_gates(report["macro_f1"], report["classification_report"], baseline_report["macro_f1"], protocol)
    accepted = decision["cv_acceptance_passed"] and final_gate
    result = {"experiment_version": VERSION, "phase": "final_test", "provenance": provenance,
              "training_executed": True, "splits_created": True,
              "selection_sha256_canonical_json": claimed, "candidate_id": decision["candidate_id"], "score_kind": kind,
              "metrics": report, "baseline_metrics": baseline_report, "cv_acceptance_passed": decision["cv_acceptance_passed"],
              "final_acceptance_passed": final_gate, "experimental_promotion_allowed": accepted,
              "institutionally_validated": False, "model_exported": False,
              "status": "EXPERIMENTAL_CANDIDATE_ACCEPTED" if accepted else "EXPERIMENT_COMPLETE_NOT_APPROVED_FOR_PROMOTION"}
    examples = error_rows(final, predictions, scores, kind)
    # Preserve measurements before rendering; only final-metrics marks full success.
    write_json(output / "final-evaluation.json", {"result": result, "examples": examples})
    write_csv(output / "final-examples.csv", examples)
    write_csv(output / "final-errors.csv", [e for e in examples if not e["correct"]], fieldnames=list(examples[0]))
    for key in ["confusion_matrix", "confusion_matrix_normalized"]:
        write_csv(output / f"{key}.csv", [{"real": label, **dict(zip(LABELS, values))} for label, values in zip(LABELS, report[key])])
    plot_matrix(report, output)
    plot_matrix(report, output, normalized=True)
    write_report(output, selection, comparison, result, examples)
    write_json(output / "final-metrics.json", result)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return result


def write_report(output, selection, comparison, final, examples):
    decision = selection["decision"]
    lines = ["# Experimento 4.4 — resultados reales", "", "SYNTHETIC / DEMO / ACADEMIC DATASET. Sin validación institucional.", "",
             f"Candidato elegido solo con CV: `{decision['candidate_id']}`. Estado: **{final['status']}**.", "",
             "160 registros de desarrollo; 40 de prueba final, 10 por categoría. Grupos indivisibles; cuatro folds congelados. Solo título y descripción entran al clasificador.", "",
             "## Comparación de desarrollo", "", "| Candidato | Macro F1 media | Desviación | Accuracy OOF |", "| --- | ---: | ---: | ---: |"]
    lines += [f"| {r['id']} | {r['mean_macro_f1']:.4f} | {r['std_macro_f1']:.4f} | {r['oof_metrics']['accuracy']:.4f} |" for r in comparison["candidates"]]
    m = final["metrics"]
    lines += ["", f"Selección: {decision['reason']}. Candidatos cercanos: {', '.join(decision['near_tie_candidates'])}.", "", "## Prueba final", "",
              f"Accuracy: {m['accuracy']:.4f}; Macro F1: {m['macro_f1']:.4f}; F1 ponderado: {m['weighted_f1']:.4f}.", "",
              "| Categoría | Precision | Recall | F1 | Soporte |", "| --- | ---: | ---: | ---: | ---: |"]
    lines += [f"| {label} | {m['classification_report'][label]['precision']:.4f} | {m['classification_report'][label]['recall']:.4f} | {m['classification_report'][label]['f1-score']:.4f} | {int(m['classification_report'][label]['support'])} |" for label in LABELS]
    lines += ["", f"Criterios CV: {final['cv_acceptance_passed']}; criterios prueba: {final['final_acceptance_passed']}; promoción experimental: {final['experimental_promotion_allowed']}.", "",
              "![Comparación CV](comparison.png)", "", "![Matriz de confusión](confusion_matrix.png)", "", "![Matriz normalizada](confusion_matrix_normalized.png)", "",
              "## Aciertos y errores", "", "El CSV final-examples incluye los 40 textos, etiquetas, predicciones y scores; final-errors contiene los fallos. Las razones automáticas son hipótesis para revisar, no explicaciones causales.", ""]
    samples = [e for e in examples if not e["correct"]][:4] + [e for e in examples if e["correct"]][:4]
    for example in samples:
        lines += [f"- {example['record_id']}: {example['real']} → {example['predicted']}; acierto={example['correct']}. {example['possible_reason_to_review']}"]
    lines += ["", "## Limitaciones", "", "Corpus sintético pequeño con una sola fuente asistida y sin revisión humana independiente. Los 200 registros no son 200 escenarios independientes. Con 10 casos por clase, un error cambia recall en 0.10. La desviación entre folds no es un intervalo de confianza. Probabilidades logísticas sin calibrar; márgenes SVM no son probabilidades. No se fijó un umbral operativo; la curva de cobertura solo usa OOF de desarrollo. No modificar datos, grupos o parámetros tras observar la prueba. Un fallo de criterios debe documentarse antes de considerar 4.5.", "",
              "No se exporta modelo ni se crean servicios; 4.5 requiere autorización. GitHub/Colab deben registrar por separado dónde se ejecutó el experimento.", ""]
    Path(output, "REPORT.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["freeze", "validate", "compare", "final"], required=True)
    parser.add_argument("--input-root", type=Path, required=True)
    parser.add_argument("--protocol", type=Path, required=True)
    parser.add_argument("--splits", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--requirements", type=Path, required=True)
    parser.add_argument("--source-mode", default="local_snapshot")
    args = parser.parse_args()
    cache = args.output.resolve() / ".matplotlib-cache"
    cache.mkdir(parents=True, exist_ok=True)
    os.environ["MPLCONFIGDIR"] = str(cache)
    records, dataset = prep.verify_dataset(prep.load_local_snapshot(args.input_root))
    protocol = read_json(args.protocol)
    if args.phase == "freeze":
        prep.require(not args.splits.exists(), "SPLITS_ALREADY_FROZEN")
        args.splits.parent.mkdir(parents=True, exist_ok=True)
        write_json(args.splits, freeze_splits(records, protocol))
        print("FROZEN_SPLITS_CREATED_BEFORE_TRAINING")
        return
    splits = read_json(args.splits)
    summary = validate_splits(records, protocol, splits)
    if args.phase == "validate":
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return
    requirements = args.requirements.read_text(encoding="utf-8")
    env = prep.verify_environment(sys.executable, requirements)
    # Release-level 4.3 flags describe that immutable release, not this training run.
    dataset_provenance = {key: value for key, value in dataset.items() if key not in {"training_started", "splits_created"}}
    provenance = {"dataset": dataset_provenance, "protocol_sha256_canonical_json": digest(protocol), "splits_sha256_canonical_json": digest(splits),
                  "experiment_source_sha256_utf8_lf": prep.canonical_hash(Path(__file__).read_bytes()),
                  "preparation_source_sha256_utf8_lf": prep.canonical_hash(Path(prep.__file__).read_bytes()),
                  "requirements_sha256_utf8_lf": prep.canonical_hash(requirements.encode()), "environment": env, "source_mode": args.source_mode,
                  "partition_summary": summary}
    if args.phase == "compare":
        compare(records, protocol, splits, args.output, provenance)
    else:
        evaluate_final(records, protocol, splits, args.output, provenance)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"EXPERIMENT_FAILED: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
