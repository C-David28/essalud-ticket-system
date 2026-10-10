"""Stage 4.5: rebuild the accepted 4.4 candidate; never select or evaluate again."""
import argparse
from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import platform
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bootstrap
import runtime

EXPERIMENT = "ml/experiments/experiment-v1.0.0"
RESULTS = EXPERIMENT + "/local-2026-10-07"


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")


def locked_inputs(root):
    """The lock is reviewed repository code, not a manifest received with an artifact."""
    root = Path(root)
    lock = read(Path(__file__).with_name("source-lock.json"))
    for name, expected in lock["files"].items():
        runtime.require(runtime.text_hash((root / name).read_bytes()) == expected, "MODEL_SOURCE_HASH_MISMATCH")
    spec = importlib.util.spec_from_file_location("stage44_model_source", root / "ml/experimentation/experiment.py")
    exp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(exp)
    records, dataset = exp.prep.verify_dataset(exp.prep.load_local_snapshot(root))
    protocol, splits = read(root / EXPERIMENT / "protocol.json"), read(root / EXPERIMENT / "splits.json")
    summary = exp.validate_splits(records, protocol, splits)
    selection, comparison = read(root / RESULTS / "selection.json"), read(root / RESULTS / "comparison.json")
    final = read(root / RESULTS / "final-metrics.json")
    decision = selection["decision"]
    runtime.require(final["status"] == "EXPERIMENTAL_CANDIDATE_ACCEPTED" and
                    final["experimental_promotion_allowed"] is True and decision["cv_acceptance_passed"] is True and
                    final["candidate_id"] == decision["candidate_id"] == "linear-svc-c1" and
                    selection["final_test_used_for_selection"] is False, "MODEL_CANDIDATE_NOT_APPROVED")
    runtime.require(final["selection_sha256_canonical_json"] == selection["selection_sha256_canonical_json"] and
                    exp.digest(comparison) == selection["comparison_sha256_canonical_json"], "MODEL_SELECTION_MISMATCH")
    return exp, records, dataset, protocol, splits, summary, selection, comparison, final, lock


def training_rows(records, splits):
    # The reserved test is excluded before extracting text, labels or fitting vocabulary.
    by_id = {r["record_id"]: r for r in records if r["record_id"] in set(splits["development_ids"])}
    runtime.require(len(by_id) == 160 and not set(by_id) & set(splits["final_test_ids"]), "MODEL_TRAINING_SPLIT_INVALID")
    return [by_id[i] for i in splits["development_ids"]]


def build(root, output):
    root, output = Path(root).resolve(), Path(output).resolve()
    runtime.require(not output.exists(), "MODEL_OUTPUT_ALREADY_EXISTS: use a new directory; releases are immutable")
    runtime.verify_runtime()
    requirement_text = Path(__file__).with_name("requirements.txt").read_text(encoding="utf-8")
    environment = bootstrap.verify(sys.executable, requirement_text)
    exp, records, dataset, protocol, splits, summary, selection, comparison, final, lock = locked_inputs(root)
    inherited_pins = exp.prep.parse_requirements((root / "ml/colab/requirements.txt").read_text(encoding="utf-8"))
    runtime.require(all(environment.get(k) == v for k, v in inherited_pins.items()), "MODEL_CHANGED_EXPERIMENT_DEPENDENCY")
    development = training_rows(records, splits)
    estimator = exp.make_estimator(selection["decision"]["candidate_spec"], protocol)
    texts = [exp.text_input(r) for r in development]
    estimator.fit(texts, [r["categoria"] for r in development])
    import skops.io as sio
    import numpy as np
    payload = sio.dumps(estimator, compression=zipfile.ZIP_DEFLATED, compresslevel=9)
    restored = runtime.deserialize(payload)
    original_scores, loaded_scores = estimator.decision_function(texts), restored.decision_function(texts)
    predictions_identical = np.array_equal(estimator.predict(texts), restored.predict(texts))
    max_delta = float(np.max(np.abs(original_scores - loaded_scores)))
    runtime.require(predictions_identical and np.allclose(original_scores, loaded_scores, rtol=1e-12, atol=1e-12), "MODEL_ROUNDTRIP_MISMATCH")
    chosen = next(row for row in comparison["candidates"] if row["id"] == final["candidate_id"])
    created = datetime.now(timezone.utc).isoformat()
    info = {
        "schema_version": 1, "model_version": runtime.MODEL_VERSION, "created_at_utc": created,
        "status": "EXPERIMENTAL_ARTIFACT_READY", "institutionally_validated": False,
        "synthetic_academic_only": True, "categories": runtime.LABELS,
        "estimator_class_order": estimator.classes_.tolist(),
        "input": {"fields": ["titulo", "descripcion"], "text_join": protocol["text_join"], "language": "es",
                  "titulo_length": [5, 200], "descripcion_length": [10, 5000]},
        "output": {"score_type": "raw_decision_margin_not_probability", "probability": None,
                   "operational_threshold": None, "human_decision_required": True},
        "algorithm": selection["decision"]["candidate_spec"], "vectorizer": protocol["vectorizer"], "seed": protocol["seed"],
        "dataset": {k: v for k, v in dataset.items() if k not in {"training_started", "splits_created"}},
        "training": {"source": "stage_4_4_development_partition_only", "record_ids": splits["development_ids"],
                     "records": len(development), "distribution": dict(Counter(r["categoria"] for r in development)),
                     "groups": summary["development"]["groups"], "reserved_test_records": 40,
                     "final_test_used_for_fit": False, "training_ids_sha256_canonical_json": exp.digest(splits["development_ids"])},
        "evaluation": {"source": RESULTS, "experiment_version": exp.VERSION, "new_evaluation_in_stage_4_5": False,
                       "mean_cv_macro_f1": chosen["mean_macro_f1"], "std_cv_macro_f1": chosen["std_macro_f1"],
                       "development_oof_metrics": chosen["oof_metrics"], "final_test_metrics": final["metrics"],
                       "final_test_records": 40, "final_test_groups": 8,
                       "selection_sha256_canonical_json": selection["selection_sha256_canonical_json"]},
        "provenance": {"experiment_commit": lock["experiment_commit"], "experiment_inputs": lock["files"],
                       "modeling_sources_sha256_utf8_lf": {n: runtime.text_hash(Path(__file__).with_name(n).read_bytes())
                                                           for n in ["release.py", "runtime.py", "bootstrap.py", "source-lock.json", "requirements.txt"]}},
        "build_environment": {"python": platform.python_version(), "platform": platform.system(), "packages": environment},
        "runtime": {"python_minor": "3.12", "packages": runtime.RUNTIME_PINS},
        "artifact": {"file": "model.skops", "format": "skops", "sha256": sha256(payload).hexdigest(), "bytes": len(payload)}
    }
    verification = {"model_version": runtime.MODEL_VERSION, "check": "serialization_roundtrip_on_development_only",
                    "records": 160, "predictions_identical": bool(predictions_identical), "max_absolute_margin_delta": max_delta,
                    "margin_tolerance": {"rtol": 1e-12, "atol": 1e-12}, "unreviewed_types": [],
                    "final_test_reopened": False, "new_metrics_calculated": False,
                    "operational_database_access": False, "status": "MODEL_ROUNDTRIP_VERIFIED"}
    output.mkdir(parents=True)
    (output / "model.skops").write_bytes(payload)
    write(output / "metadata.json", info)
    write(output / "verification.json", verification)
    approval = {"schema_version": 1, "model_version": runtime.MODEL_VERSION,
                "files": {n: sha256(payload).hexdigest() if n == "model.skops" else runtime.text_hash((output / n).read_bytes())
                          for n in sorted(runtime.FILES)}}
    # Receipt is diagnostic; it is NEVER automatically trusted by the runtime loader.
    write(output / "build-receipt.json", approval)
    model = runtime.load_release(output, approval=approval)
    probe = model.predict("Impresora no responde", "La impresora local no imprime desde el equipo de prueba.")
    print(json.dumps({"status": "MODEL_V1_BUILT", "model_version": runtime.MODEL_VERSION,
                      "training_records": 160, "reserved_test_records": 40, "bytes": len(payload),
                      "sha256": approval["files"]["model.skops"], "verification": verification, "smoke_prediction": probe}, ensure_ascii=False, indent=2))
    return approval


def check(directory):
    model = runtime.load_release(directory)
    proof = read(Path(directory) / "verification.json")
    runtime.require(proof["status"] == "MODEL_ROUNDTRIP_VERIFIED" and proof["predictions_identical"] is True, "MODEL_VERIFICATION_INVALID")
    probe = model.predict("Equipo no inicia", "El equipo de demostración no termina de iniciar el sistema operativo.")
    print(json.dumps({"status": "MODEL_V1_VERIFIED", "model_version": model.info["model_version"],
                      "training_records": model.info["training"]["records"], "probe": probe}, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["build", "check"], required=True)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--output", type=Path)
    parser.add_argument("--release", type=Path)
    args = parser.parse_args()
    if args.phase == "build":
        runtime.require(args.output is not None, "MODEL_OUTPUT_REQUIRED")
        build(args.root, args.output)
    else:
        check(args.release or args.root / "ml/models/category-v1.0.0")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"MODEL_FAILED: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
