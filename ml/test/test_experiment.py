"""Grouped protocol guards; real estimator tests use the isolated 4.3 environment."""
import ast
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("experiment", ROOT / "ml/experimentation/experiment.py")
exp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exp)
RELEASE = ROOT / "ml/experiments/experiment-v1.0.0"


class ExperimentTests(unittest.TestCase):
    def setUp(self):
        self.records, _ = exp.prep.verify_dataset(exp.prep.load_local_snapshot(ROOT))
        self.protocol = exp.read_json(RELEASE / "protocol.json")
        self.splits = exp.read_json(RELEASE / "splits.json")
        self.temporary_root = ROOT / "ml/outputs/test-experiment"
        self.temporary_root.mkdir(parents=True, exist_ok=True)

    def test_frozen_partition_sizes_classes_and_groups(self):
        summary = exp.validate_splits(self.records, self.protocol, self.splits)
        self.assertEqual(summary["development"]["records"], 160)
        self.assertEqual(summary["final_test"]["records"], 40)
        self.assertEqual(summary["final_test"]["distribution"], dict.fromkeys(exp.LABELS, 10))
        self.assertEqual(summary["development"]["groups"] + summary["final_test"]["groups"], 37)

    def test_holdout_selection_ignores_text_and_order(self):
        expected = exp.group_holdout(self.records)
        rows = [{**r, "titulo": "POISON", "descripcion": "UNRELATED"} for r in reversed(self.records)]
        self.assertEqual(exp.group_holdout(rows), expected)

    def test_cv_regeneration_is_identical(self):
        self.assertEqual(exp.freeze_splits(self.records, self.protocol), self.splits)

    def test_holdout_family_crossing_rejected(self):
        altered = json.loads(json.dumps(self.splits))
        a, b = altered["development_ids"][0], altered["final_test_ids"][0]
        altered["development_ids"][0], altered["final_test_ids"][0] = b, a
        with self.assertRaisesRegex(ValueError, "HOLDOUT_GROUP_LEAKAGE"):
            exp.validate_splits(self.records, self.protocol, altered)

    def test_cv_group_crossing_rejected(self):
        altered = json.loads(json.dumps(self.splits))
        fold = altered["folds"][0]
        fold["training_ids"][0], fold["validation_ids"][0] = fold["validation_ids"][0], fold["training_ids"][0]
        with self.assertRaisesRegex(ValueError, "CV_GROUP_LEAKAGE"):
            exp.validate_splits(self.records, self.protocol, altered)

    def test_changed_protocol_rejected(self):
        self.protocol["seed"] += 1
        with self.assertRaisesRegex(ValueError, "SPLIT_PROTOCOL_MISMATCH"):
            exp.validate_splits(self.records, self.protocol, self.splits)

    def test_only_text_fields_enter_model(self):
        self.assertEqual(exp.text_input({"titulo": " título ", "descripcion": " descripción ", "categoria": "LEAK", "label_rationale": "LEAK"}), "título\ndescripción")

    def test_all_gates_required(self):
        report = {label: {"recall": 0.60} for label in exp.LABELS}
        self.assertTrue(exp.meets_gates(0.70, report, 0.10, self.protocol))
        self.assertFalse(exp.meets_gates(0.69, report, 0.10, self.protocol))
        report["BIOMEDICO"]["recall"] = 0.59
        self.assertFalse(exp.meets_gates(0.90, report, 0.10, self.protocol))

    def test_word_vocabulary_never_fits_validation(self):
        estimator = exp.make_estimator(self.protocol["candidates"][1], self.protocol)
        estimator.fit(["red cable", "programa teclado", "voltaje rack", "sensor medico"], exp.LABELS)
        estimator.predict(["selloexclusivodeprueba"])
        vocabulary = estimator.named_steps["features"].transformer_list[0][1].vocabulary_
        self.assertNotIn("selloexclusivodeprueba", vocabulary)

    def test_svm_score_cannot_be_probability(self):
        estimator = exp.make_estimator(self.protocol["candidates"][3], self.protocol)
        texts = ["red cable", "programa teclado", "voltaje rack", "sensor medico"]
        estimator.fit(texts, exp.LABELS)
        _, kind = exp.score_outputs(estimator, texts, estimator.predict(texts), self.protocol["candidates"][3])
        self.assertEqual(kind, "raw_decision_margin_not_probability")

    def test_poisoned_holdout_never_used_in_comparison(self):
        from sklearn.dummy import DummyClassifier
        held = set(self.splits["final_test_ids"])
        rows = [{**r, "titulo": "POISONHOLDOUT"} if r["record_id"] in held else r for r in self.records]
        protocol = json.loads(json.dumps(self.protocol))
        protocol["candidates"] = [protocol["candidates"][0], protocol["candidates"][1]]
        seen = []
        class Spy:
            def __init__(self): self.base = DummyClassifier(strategy="most_frequent")
            def fit(self, x, y):
                seen.extend(x)
                self.base.fit(x, y)
                return self
            def predict(self, x):
                seen.extend(x)
                return self.base.predict(x)
        with tempfile.TemporaryDirectory(dir=self.temporary_root) as folder:
            with patch.object(exp, "make_estimator", side_effect=lambda *args: Spy()), patch.object(exp, "plot_comparison"), patch.object(exp, "score_outputs", side_effect=lambda est, x, pred, cfg: ([0.25]*len(x), "test_only")):
                exp.compare(rows, protocol, self.splits, folder, {"test_only": True})
        self.assertFalse(any("POISONHOLDOUT" in text for text in seen))

    def test_existing_final_lock_blocks_model_fit(self):
        with tempfile.TemporaryDirectory(dir=self.temporary_root) as folder:
            path = Path(folder)
            comparison = {"candidates": []}
            decision = {"candidate_id": "test_only"}
            selection = {"provenance": {}, "decision": decision, "comparison_sha256_canonical_json": exp.digest(comparison), "final_test_used_for_selection": False}
            selection["selection_sha256_canonical_json"] = exp.digest(selection)
            exp.write_json(path / "comparison.json", comparison)
            exp.write_json(path / "selection.json", selection)
            (path / "final-test-started.json").write_text("{}")
            with patch.object(exp, "choose_candidate", return_value=decision), patch.object(exp, "make_estimator") as model:
                with self.assertRaisesRegex(ValueError, "FINAL_TEST_ALREADY_OPENED"):
                    exp.evaluate_final(self.records, self.protocol, self.splits, path, {})
                model.assert_not_called()


if __name__ == "__main__":
    unittest.main()
