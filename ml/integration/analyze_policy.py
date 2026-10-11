"""Reproduce a draft stage-4.7 abstention policy from existing development OOF.

Python standard library only. Does not import sklearn, load a model, train,
open dataset records, open final-test artifacts, or write into the source repo.
"""
import argparse
import csv
from decimal import Decimal
from hashlib import sha256
from io import StringIO
import json
from pathlib import Path


CANDIDATE_ID = "linear-svc-c1"
MODEL_VERSION = "ticket-category-model-v1.0.0"
POLICY_VERSION = "category-assistance-policy-v1.0.0"
SCORE_TYPE = "raw_decision_margin_not_probability"
LABELS = ("SOPORTE", "REDES", "INFRAESTRUCTURA", "BIOMEDICO")
EXPERIMENT = "ml/experiments/experiment-v1.0.0/"
SOURCES = {
    EXPERIMENT + "local-2026-10-07/development-oof.csv":
        "da6d1c115a532c51e6cfa2681ebc03d92ba2c8704707945ab073e2f665e074e4",
    EXPERIMENT + "local-2026-10-07/selection.json":
        "a0b4970ab4941103c87a3ffe052f698f0f14c062c031d63016c77bc99505bea2",
    EXPERIMENT + "splits.json":
        "041d520e633e213dd51566bad01c103d13cc7e7f2463d0553b2581bb0c8fca81",
    EXPERIMENT + "protocol.json":
        "57cba9fda793ffdd0ea796349209c911586c99ed5862f20756ed03b86f5de56f",
    "ml/models/category-v1.0.0/MODEL-CARD.md":
        "0cd8e4a5c8c92eb0878de3dc93ab29ab7787f802c9cbfc154947514bf63101ee",
    "ml/modeling/runtime.py":
        "a850ec04ae3074fbd15855b6df75a9c0568009f1f3a66faf08b1c23e7b18983e",
}
CRITERIA = {
    "minimum_accuracy_among_accepted": 0.95,
    "minimum_overall_coverage": 0.5,
    "minimum_accepted_per_true_category": 10,
    "minimum_accepted_per_predicted_category": 10,
    "minimum_precision_per_predicted_category": 0.9,
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def normalized_hash(text):
    return sha256(text.replace("\r\n", "\n").encode("utf-8")).hexdigest()


def canonical_hash(value):
    return sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                             separators=(",", ":")).encode("utf-8")).hexdigest()


def read_sources(repo):
    texts = {}
    for relative, expected in SOURCES.items():
        source = repo / relative
        require(source.is_file() and not source.is_symlink(), "Invalid source: " + relative)
        text = source.read_bytes().decode("utf-8")
        require(normalized_hash(text) == expected, "Source checksum changed: " + relative)
        texts[relative] = text
    return texts


def load_development(texts):
    selection = json.loads(texts[EXPERIMENT + "local-2026-10-07/selection.json"])
    splits = json.loads(texts[EXPERIMENT + "splits.json"])
    protocol = json.loads(texts[EXPERIMENT + "protocol.json"])
    require(selection["decision"]["candidate_id"] == CANDIDATE_ID, "Unexpected selected candidate")
    require(selection["decision"]["candidate_spec"]["algorithm"] == "LinearSVC"
            and selection["decision"]["candidate_spec"]["C"] == 1.0, "Unexpected estimator")
    require(selection["final_test_used_for_selection"] is False, "Original selection used final test")
    require(selection["provenance"]["dataset"]["is_synthetic"] is True, "Expected synthetic evidence")
    require(canonical_hash({k: v for k, v in selection.items()
                            if k != "selection_sha256_canonical_json"})
            == selection["selection_sha256_canonical_json"], "Selection canonical hash mismatch")
    require(canonical_hash(splits) == selection["provenance"]["splits_sha256_canonical_json"],
            "Splits canonical hash mismatch")
    require(canonical_hash(protocol) == selection["provenance"]["protocol_sha256_canonical_json"],
            "Protocol canonical hash mismatch")
    require(splits["dataset_sha256"] == selection["provenance"]["dataset"]["dataset_sha256"],
            "Dataset provenance mismatch")
    development = set(splits["development_ids"])
    final_ids = set(splits["final_test_ids"])
    require(len(development) == 160 and len(final_ids) == 40
            and not development & final_ids, "Partition IDs invalid")
    validation_ids = []
    for fold in splits["folds"]:
        train, validation = set(fold["training_ids"]), set(fold["validation_ids"])
        require(not train & validation and train | validation == development,
                "Fold partition invalid")
        validation_ids.extend(fold["validation_ids"])
    require(len(validation_ids) == 160 and set(validation_ids) == development,
            "Each development ID must be validated exactly once")
    rows = []
    csv_text = texts[EXPERIMENT + "local-2026-10-07/development-oof.csv"]
    for row in csv.DictReader(StringIO(csv_text)):
        if row["candidate_id"] != CANDIDATE_ID:
            continue
        require(row["record_id"] in development and row["record_id"] not in final_ids,
                "OOF contains a nondevelopment ID")
        require(row["real"] in LABELS and row["predicted"] in LABELS, "Unknown category")
        require(row["score_kind"] == SCORE_TYPE, "OOF does not contain raw margins")
        score = Decimal(row["score"])
        require(score.is_finite(), "OOF score is nonfinite")
        require(row["correct"] in ("True", "False")
                and (row["correct"] == "True") == (row["real"] == row["predicted"]),
                "OOF correct flag disagrees with labels")
        rows.append({**row, "score": score})
    require(len(rows) == 160 and {r["record_id"] for r in rows} == development,
            "OOF development IDs are missing or duplicated")
    require(all(sum(r["real"] == label for r in rows) == 40 for label in LABELS),
            "Expected 40 true development cases per category")
    return rows, selection, splits


def measure(rows, threshold):
    accepted = [r for r in rows if r["score"] >= threshold]
    correct = sum(r["real"] == r["predicted"] for r in accepted)
    categories = {}
    failures = []
    # Integer comparisons implement the proposed ratios without floating point tolerance.
    if not accepted or correct * 100 < len(accepted) * 95:
        failures.append("minimum_accuracy_among_accepted")
    if len(accepted) * 2 < len(rows):
        failures.append("minimum_overall_coverage")
    for label in LABELS:
        total = sum(r["real"] == label for r in rows)
        true_accepted = sum(r["real"] == label for r in accepted)
        predicted_accepted = sum(r["predicted"] == label for r in accepted)
        category_correct = sum(r["real"] == label and r["predicted"] == label for r in accepted)
        categories[label] = {
            "true_support": total,
            "accepted_true": true_accepted,
            "correct": category_correct,
            "abstained_true": total - true_accepted,
            "coverage_true": true_accepted / total,
            "accuracy_among_accepted_true": category_correct / true_accepted if true_accepted else None,
            "accepted_predicted": predicted_accepted,
            "precision_among_accepted_predicted": category_correct / predicted_accepted
                if predicted_accepted else None,
        }
        if true_accepted < 10:
            failures.append("minimum_accepted_per_true_category:" + label)
        if predicted_accepted < 10:
            failures.append("minimum_accepted_per_predicted_category:" + label)
        if not predicted_accepted or category_correct * 10 < predicted_accepted * 9:
            failures.append("minimum_precision_per_predicted_category:" + label)
    return {
        "threshold": float(threshold), "accepted": len(accepted), "correct": correct,
        "errors_accepted": len(accepted) - correct, "abstained": len(rows) - len(accepted),
        "coverage": len(accepted) / len(rows),
        "accuracy_among_accepted": correct / len(accepted) if accepted else None,
        "categories": categories, "passes_all_criteria": not failures, "failed_criteria": failures,
    }


def analyze(rows, selection, splits):
    original = [measure(rows, Decimal(i) / 10) for i in range(11)]
    extension = [measure(rows, Decimal(i) / 100) for i in range(-10, 0)]
    feasible = [m for m in original + extension if m["passes_all_criteria"]]
    require(feasible, "No proposed threshold qualifies; keep manual classification")
    chosen = max(feasible, key=lambda m: (m["accepted"], m["threshold"]))
    chosen_decimal = Decimal(str(chosen["threshold"]))
    fold_metrics = []
    for fold in splits["folds"]:
        ids = set(fold["validation_ids"])
        metrics = measure([r for r in rows if r["record_id"] in ids], chosen_decimal)
        # The gates are pooled development criteria, not per-fold or independent tests.
        fold_metrics.append({"fold": fold["fold"], "records": len(ids),
                             "accepted": metrics["accepted"], "correct": metrics["correct"],
                             "abstained": metrics["abstained"], "coverage": metrics["coverage"],
                             "accuracy_among_accepted": metrics["accuracy_among_accepted"]})
    return {
        "schema_version": 1, "policy_version": POLICY_VERSION,
        "status": "EXPERIMENTAL_SYNTHETIC_ASSISTANCE_ONLY",
        "evidence_source": "existing_grouped_development_out_of_fold_predictions",
        "candidate_id": CANDIDATE_ID, "model_version": MODEL_VERSION, "records": len(rows),
        "categories": list(LABELS), "score_type": SCORE_TYPE, "probability": None,
        "provenance": {
            "sources_sha256_utf8_lf": SOURCES,
            "script_sha256_utf8_lf": normalized_hash(Path(__file__).read_bytes().decode("utf-8")),
            "selection_sha256_canonical_json": selection["selection_sha256_canonical_json"],
            "splits_sha256_canonical_json": canonical_hash(splits),
            "dataset_sha256_inherited_not_recomputed": splits["dataset_sha256"],
            "development_ids_match_splits": True, "final_ids_disjoint_from_oof": True,
            "final_test_records_or_final_metrics_opened": False,
            "model_loaded_or_retrained": False,
        },
        "criteria": CRITERIA,
        "criteria_and_grids_declared_posthoc": True,
        "original_grid": {"start": 0, "stop": 1, "step": 0.1,
                          "feasible_thresholds": [], "measurements": original},
        "extension_grid": {"start": -0.1, "stop": -0.01, "step": 0.01,
                           "reason": "A multiclass maximum raw decision margin may be negative; zero is not a required score-domain lower bound.",
                           "feasible_thresholds": [m["threshold"] for m in extension if m["passes_all_criteria"]],
                           "measurements": extension},
        "selection_rule": "Maximum pooled OOF coverage among all criteria-passing grid candidates; ties prefer the higher threshold.",
        "selected": chosen,
        "fold_diagnostics_for_selected_threshold": fold_metrics,
        "independent_generalization_validation": False,
        "institutional_validation": False,
    }


def make_policy(analysis):
    return {
        "schema_version": 1, "policy_version": POLICY_VERSION,
        "status": "EXPERIMENTAL_SYNTHETIC_ASSISTANCE_ONLY",
        "activated_by_this_artifact": False,
        "model_version": MODEL_VERSION, "candidate_id": CANDIDATE_ID,
        "score_type": SCORE_TYPE, "probability": None,
        "rule": {"minimum_raw_margin": analysis["selected"]["threshold"], "operator": ">=",
                 "on_pass": "offer_optional_suggestion_for_human_confirmation",
                 "on_fail": "abstain_and_keep_manual_classification",
                 "on_invalid_or_unavailable_response": "abstain_and_keep_manual_classification"},
        "required_response_checks": ["model_version_matches", "known_category",
                                     "score_type_matches", "finite_numeric_score", "probability_is_null"],
        "human_confirmation_required": True,
        "automatic_category_assignment": False,
        "evidence": {"analysis_sha256_canonical_json": canonical_hash(analysis),
                     "selected_development_metrics": analysis["selected"],
                     "criteria": CRITERIA, "criteria_and_grids_declared_posthoc": True,
                     "independent_generalization_validation": False,
                     "institutional_validation": False},
        "provenance": analysis["provenance"],
        "limitations": [
            "The model and threshold were selected using development; these are optimistic selection measurements, not independent validation.",
            "Only existing OOF predictions from 160 synthetic academic cases were reused; no final-test records or final-metrics artifacts were opened.",
            "OOF scores come from four fold models; score scale may differ for the already-published model fitted on all development cases.",
            "The criteria are pooled, not per-fold guarantees: accepted accuracy is 20/22 in fold 2 and 19/21 in fold 4; fold 4 coverage is 21/45.",
            "Ten accepted BIOMEDICO predictions are a small precision denominator; ten correct predictions do not establish real-world certainty.",
            "BIOMEDICO true-case coverage is 12/40 and 28/40 abstain; pooled accuracy must not hide this coverage difference.",
            "The maximum raw score is not a top-two score gap, a probability, or a percentage of confidence.",
            "Every offered suggestion requires an explicit human decision; missing, invalid, or unavailable ML preserves the manual workflow.",
        ],
    }


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path, help="Read-only source repository")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    repo, output = args.repo.resolve(), args.output_dir.resolve()
    require(output == repo / "ml" / "outputs" / "policy-check"
            or (output != repo and repo not in output.parents),
            "Output must be external or the ignored ml/outputs/policy-check directory")
    texts = read_sources(repo)
    rows, selection, splits = load_development(texts)
    analysis = analyze(rows, selection, splits)
    policy = make_policy(analysis)
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / "policy-analysis.json", analysis)
    write_json(output / "abstention-policy.json", policy)
    summary = analysis["selected"]
    print(json.dumps({"selected_threshold": summary["threshold"], "accepted": summary["accepted"],
                      "correct": summary["correct"], "abstained": summary["abstained"],
                      "coverage": summary["coverage"],
                      "accuracy_among_accepted": summary["accuracy_among_accepted"],
                      "analysis_sha256_canonical_json": canonical_hash(analysis)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
