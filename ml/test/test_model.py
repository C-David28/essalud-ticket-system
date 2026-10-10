"""Release regression and fail-closed loading; no operational DB or final-test scoring."""
from io import BytesIO
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml/modeling"))
import release
import runtime
import bootstrap


class ModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = ROOT / "ml/models/category-v1.0.0"
        cls.approval = release.read(ROOT / "ml/modeling/approved-release.json")
        cls.model = runtime.load_release(cls.folder)
        cls.temp = ROOT / "ml/outputs/test-model"
        cls.temp.mkdir(parents=True, exist_ok=True)

    def test_approved_pipeline_full_vocabulary_and_class_mapping(self):
        self.assertEqual(self.model.estimator.classes_.tolist(), sorted(runtime.LABELS))
        features = self.model.estimator.named_steps["features"]
        for _, vectorizer in features.transformer_list:
            self.assertTrue(vectorizer.vocabulary_)
            self.assertEqual(len(vectorizer.vocabulary_), len(vectorizer.idf_))
        self.assertEqual(self.model.info["training"]["records"], 160)
        self.assertFalse(self.model.info["training"]["final_test_used_for_fit"])

    def test_release_metadata_metric_traceability_not_new_evaluation(self):
        final = release.read(ROOT / release.RESULTS / "final-metrics.json")
        self.assertEqual(self.model.info["evaluation"]["final_test_metrics"], final["metrics"])
        self.assertFalse(self.model.info["evaluation"]["new_evaluation_in_stage_4_5"])
        self.assertFalse(self.model.info["institutionally_validated"])

    def test_hash_rejects_changed_bytes_before_deserialization(self):
        for name in sorted(runtime.FILES):
            with self.subTest(name=name), tempfile.TemporaryDirectory(dir=self.temp) as tmp:
                target = Path(tmp)
                for file in runtime.FILES:
                    shutil.copyfile(self.folder / file, target / file)
                with (target / name).open("ab") as file:
                    file.write(b"altered")
                with patch.object(runtime, "deserialize") as decode:
                    with self.assertRaisesRegex(ValueError, "MODEL_CHECKSUM_MISMATCH"):
                        runtime.load_release(target)
                    decode.assert_not_called()

    def test_missing_or_oversized_artifact_rejected(self):
        with tempfile.TemporaryDirectory(dir=self.temp) as tmp:
            with self.assertRaisesRegex(ValueError, "MODEL_FILE_INVALID"):
                runtime.load_release(tmp)
        with self.assertRaisesRegex(ValueError, "MODEL_SIZE_INVALID"):
            runtime.inspect_archive(b"a" * (runtime.MAX_MODEL_BYTES + 1))

    def test_dependency_mismatch_rejected_before_skops(self):
        with patch.object(runtime.metadata, "version", return_value="0.0.0"):
            with self.assertRaisesRegex(ValueError, "MODEL_DEPENDENCY_VERSION_MISMATCH"):
                runtime.deserialize((self.folder / "model.skops").read_bytes())

    def test_incompatible_python_rejected(self):
        with patch.object(runtime.sys, "version_info", (3, 13, 0)):
            with self.assertRaisesRegex(ValueError, "MODEL_REQUIRES_PYTHON_3_12"):
                runtime.verify_runtime()

    def test_unreviewed_types_never_automatically_trusted(self):
        import skops.io as sio
        with patch.object(sio, "get_untrusted_types", return_value=["attacker.Execute"]), patch.object(sio, "loads") as decode:
            with self.assertRaisesRegex(ValueError, "MODEL_UNREVIEWED_TYPES"):
                runtime.deserialize((self.folder / "model.skops").read_bytes())
            decode.assert_not_called()

    def test_invalid_archives_rejected(self):
        with self.assertRaisesRegex(ValueError, "MODEL_ARCHIVE_INVALID"):
            runtime.inspect_archive(b"not a zip")
        for name in ["../escape.npy", "nested/../../escape.npy", "C:/escape.npy", "bad\\escape.npy", "bad\x00name.npy"]:
            with self.subTest(name=name):
                buffer = BytesIO()
                with zipfile.ZipFile(buffer, "w") as archive:
                    archive.writestr("schema.json", "{}")
                    archive.writestr(name.replace("\\", "/"), "payload")
                # A NUL is truncated at ZIP construction: build a malformed raw member to exercise original path checks.
                payload = buffer.getvalue()
                if "\\" in name:
                    payload = payload.replace(name.replace("\\", "/").encode(), name.encode())
                if "\x00" in name:
                    payload = payload.replace(b"bad", b"b\x00d")
                with self.assertRaises(ValueError):
                    runtime.inspect_archive(payload)

    def test_validated_text_limits_and_margin_semantics(self):
        result = self.model.predict("Impresora no responde", "La impresora local no imprime desde el equipo de prueba.")
        self.assertIn(result["categoria_sugerida"], runtime.LABELS)
        self.assertEqual(result["score_type"], "raw_decision_margin_not_probability")
        self.assertIsNone(result["probability"])
        self.assertIsNone(result["operational_threshold"])
        for title, description in [(None, "text"), (" ", "long enough description"), ("Valid title", "short"),
                                   ("x" * 201, "long enough description"), ("Valid title", "x" * 5001)]:
            with self.subTest(title_type=type(title).__name__), self.assertRaises(ValueError):
                self.model.predict(title, description)

    def test_model_recipe_uses_only_locked_development_ids(self):
        exp, records, _, protocol, splits, _, selection, _, _, _ = release.locked_inputs(ROOT)
        poisoned = [{**row, "titulo": "ONLYTESTLEAK", "descripcion": "ONLYTESTLEAK"} if
                    row["record_id"] in set(splits["final_test_ids"]) else row for row in records]
        rows = release.training_rows(poisoned, splits)
        self.assertEqual([r["record_id"] for r in rows], splits["development_ids"])
        self.assertNotIn("ONLYTESTLEAK", " ".join(exp.text_input(row) for row in rows))
        self.assertEqual(self.model.info["algorithm"], selection["decision"]["candidate_spec"])
        self.assertEqual(self.model.info["vectorizer"], protocol["vectorizer"])

    def test_roundtrip_evidence_and_locked_test_unchanged(self):
        proof = release.read(self.folder / "verification.json")
        self.assertEqual(proof["records"], 160)
        self.assertTrue(proof["predictions_identical"])
        self.assertLessEqual(proof["max_absolute_margin_delta"], 1e-12)
        self.assertFalse(proof["final_test_reopened"])
        release.locked_inputs(ROOT)  # also checks the final-test opening marker checksum

    def test_build_cannot_overwrite_release(self):
        with self.assertRaisesRegex(ValueError, "MODEL_OUTPUT_ALREADY_EXISTS"):
            release.build(ROOT, self.folder)

    def test_requirements_preserve_inherited_pins_and_require_all_21(self):
        exp, *_ = release.locked_inputs(ROOT)
        full = bootstrap.pins((ROOT / "ml/modeling/requirements.txt").read_text())
        inherited = exp.prep.parse_requirements((ROOT / "ml/colab/requirements.txt").read_text())
        self.assertEqual({k: full[k] for k in inherited}, inherited)
        with self.assertRaisesRegex(ValueError, "INCOMPLETE_MODEL_DEPENDENCY_PINS"):
            bootstrap.pins("numpy==2.2.6")


if __name__ == "__main__":
    unittest.main()
