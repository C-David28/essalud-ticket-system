"""Offline tests, standard library only; no credentials or package installs."""
import ast
import copy
import importlib.util
from io import BytesIO
import json
from pathlib import Path
import stat
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("colab_preparation", ROOT / "ml/colab/preparation.py")
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)


def archive(payloads, extra=None):
    stream = BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as output:
        for name, payload in payloads.items():
            output.writestr(name, payload)
        if extra:
            for name, payload in extra.items():
                output.writestr(name, payload)
    return stream.getvalue()


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.payloads = prep.load_local_snapshot(ROOT)

    def test_dataset_v1_matches_real_manifest(self):
        records, report = prep.verify_dataset(self.payloads)
        self.assertEqual(len(records), 200)
        self.assertEqual(report["distribution"], dict.fromkeys(prep.CATEGORIES, 50))
        self.assertEqual(report["families"], 40)
        self.assertEqual(report["leakage_groups"], 37)
        self.assertFalse(report["training_started"])
        self.assertFalse(report["splits_created"])

    def test_archive_round_trip_matches_snapshot(self):
        self.assertEqual(prep.load_archive(archive(self.payloads)), self.payloads)

    def test_actual_git_archive_is_accepted(self):
        result = prep.subprocess.run(["git", "archive", "--format=zip", prep.DATASET_COMMIT, "--", *prep.ALLOWED_FILES],
                                     cwd=ROOT, check=True, capture_output=True)
        self.assertEqual(prep.verify_dataset(prep.load_archive(result.stdout))[1]["records"], 200)

    def test_crlf_and_lf_identity(self):
        crlf = {name: value.decode("utf-8").replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8")
                for name, value in self.payloads.items()}
        self.assertEqual(prep.verify_dataset(crlf)[1], prep.verify_dataset(self.payloads)[1])

    def test_manifest_cannot_legitimize_tampered_corpus(self):
        payloads = self.payloads.copy()
        payloads[prep.DATASET_ROOT + "incidents.jsonl"] += b"\n"
        manifest = json.loads(payloads[prep.DATASET_ROOT + "manifest.json"])
        manifest["files"]["incidents.jsonl"] = prep.canonical_hash(payloads[prep.DATASET_ROOT + "incidents.jsonl"])
        payloads[prep.DATASET_ROOT + "manifest.json"] = json.dumps(manifest).encode()
        with self.assertRaisesRegex(ValueError, "IMMUTABLE_DATASET_HASH_MISMATCH"):
            prep.verify_dataset(payloads)

    def test_domain_and_manifest_are_also_pinned(self):
        for name in ["apps/api/src/domain/ticket.ts", prep.DATASET_ROOT + "manifest.json"]:
            with self.subTest(name=name):
                payloads = self.payloads.copy()
                payloads[name] += b"\n"
                with self.assertRaisesRegex(ValueError, "IMMUTABLE_DATASET_HASH_MISMATCH"):
                    prep.verify_dataset(payloads)

    def test_missing_file_rejected(self):
        payloads = self.payloads.copy()
        payloads.pop("ml/docs/LABELING-GUIDE.md")
        with self.assertRaisesRegex(ValueError, "INPUT_FILE_SET_MISMATCH"):
            prep.verify_dataset(payloads)

    def test_extra_input_rejected(self):
        with self.assertRaisesRegex(ValueError, "INPUT_FILE_SET_MISMATCH"):
            prep.verify_dataset({**self.payloads, ".env": b"TEST_ONLY"})

    def test_archive_missing_file_rejected(self):
        payloads = self.payloads.copy()
        payloads.pop("ml/docs/LABELING-GUIDE.md")
        with self.assertRaisesRegex(ValueError, "ARCHIVE_MISSING_FILE"):
            prep.load_archive(archive(payloads))

    def test_archive_traversal_absolute_backslash_rejected(self):
        for path in ["../unexpected.txt", "/unexpected.txt", "C:/unexpected.txt", "ml\\unexpected.txt"]:
            with self.subTest(path=path):
                payload = archive(self.payloads, {path.replace("\\", "/"): b"TEST_ONLY"})
                if "\\" in path:
                    payload = payload.replace(path.replace("\\", "/").encode(), path.encode())
                with self.assertRaisesRegex(ValueError, "UNSAFE_ARCHIVE_PATH"):
                    prep.load_archive(payload)

    def test_env_and_operational_files_rejected_in_zip(self):
        for path in [".env", "apps/api/.env.tickets", "backups/example.dump"]:
            with self.subTest(path=path):
                with self.assertRaisesRegex(ValueError, "UNEXPECTED_ARCHIVE_FILE"):
                    prep.load_archive(archive(self.payloads, {path: b"TEST_ONLY"}))

    def test_symlink_rejected(self):
        output = BytesIO()
        with zipfile.ZipFile(output, "w") as stream:
            entry = zipfile.ZipInfo(prep.ALLOWED_FILES[0])
            entry.create_system = 3
            entry.external_attr = (stat.S_IFLNK | 0o777) << 16
            stream.writestr(entry, "../unexpected.txt")
        with self.assertRaisesRegex(ValueError, "ARCHIVE_SYMLINK"):
            prep.load_archive(output.getvalue())

    def test_duplicate_zip_entry_rejected(self):
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            payload = archive(self.payloads, {prep.ALLOWED_FILES[0]: b"TEST_ONLY"})
        with self.assertRaisesRegex(ValueError, "UNSAFE_ARCHIVE_PATH"):
            prep.load_archive(payload)

    def test_expanded_file_size_bounded(self):
        payloads = self.payloads.copy()
        payloads[prep.ALLOWED_FILES[0]] = b"x" * (prep.MAX_FILE_BYTES + 1)
        with self.assertRaisesRegex(ValueError, "ARCHIVE_EXPANDED_TOO_LARGE"):
            prep.load_archive(archive(payloads))

    def test_bad_zip_rejected(self):
        with self.assertRaisesRegex(ValueError, "INVALID_OR_ENCRYPTED_ARCHIVE"):
            prep.load_archive(b"not a zip")

    def test_public_requests_pin_commit_and_have_no_auth(self):
        calls = []
        payloads = self.payloads
        class Opener:
            def open(self, request, timeout):
                calls.append(request)
                name = request.full_url.split("/contents/")[1].split("?")[0]
                return BytesIO(payloads[name])
        self.assertEqual(prep.load_github(opener=Opener()), payloads)
        self.assertEqual(len(calls), 5)
        for request in calls:
            self.assertIn("ref=" + prep.DATASET_COMMIT, request.full_url)
            self.assertIsNone(request.get_header("Authorization"))

    def test_private_token_only_in_header_not_url_or_error(self):
        sentinel = "TEST_ONLY_NOT_A_REAL_TOKEN"
        calls = []
        class Opener:
            def open(self, request, timeout):
                calls.append(request)
                raise HTTPError(request.full_url, 403, sentinel, {}, BytesIO(sentinel.encode()))
        with self.assertRaises(RuntimeError) as caught:
            prep.load_github(token=sentinel, opener=Opener())
        self.assertEqual(calls[0].get_header("Authorization"), "Bearer " + sentinel)
        self.assertNotIn(sentinel, calls[0].full_url)
        self.assertNotIn(sentinel, str(caught.exception))

    def test_auth_header_not_redirected(self):
        self.assertIsNone(prep.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://example.invalid"))

    def test_complete_dependency_pins(self):
        requirements = (ROOT / "ml/colab/requirements.txt").read_text()
        pins = prep.parse_requirements(requirements)
        self.assertEqual(len(pins), 18)
        self.assertEqual(pins["scikit-learn"], "1.6.1")
        with self.assertRaisesRegex(ValueError, "INVALID_DEPENDENCY_PIN"):
            prep.parse_requirements(requirements.replace("numpy==", "numpy>="))

    def test_unsupported_python_is_rejected_before_install(self):
        with patch.object(prep.sys, "version_info", (3, 14, 0)):
            with self.assertRaisesRegex(ValueError, "PYTHON_UNSUPPORTED"):
                prep.check_python()

    def test_notebook_clean_and_all_cells_compile(self):
        notebook = json.loads((ROOT / "ml/notebooks/stage-4.3-dataset-v1.ipynb").read_text(encoding="utf-8"))
        ids = [cell["id"] for cell in notebook["cells"]]
        self.assertEqual(len(ids), len(set(ids)))
        for cell in notebook["cells"]:
            if cell["cell_type"] == "code":
                self.assertIsNone(cell["execution_count"])
                self.assertEqual(cell["outputs"], [])
                tree = ast.parse("".join(cell["source"]))
                for node in ast.walk(tree):
                    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                        self.assertNotIn(node.func.attr, ["fit", "fit_transform", "predict", "predict_proba"])

    def test_readiness_has_no_model_or_operational_access(self):
        _, dataset = prep.verify_dataset(self.payloads)
        digest = prep.canonical_hash((ROOT / "ml/colab/preparation.py").read_bytes())
        result = prep.readiness_report(dataset, {"python": "TEST_ONLY"}, (ROOT / "ml/colab/requirements.txt").read_text(), "local_snapshot", digest)
        self.assertEqual(result["status"], "READY_FOR_STAGE_4_4")
        self.assertFalse(result["training_started"])
        self.assertFalse(result["model_selected"])
        self.assertFalse(result["operational_database_access"])


if __name__ == "__main__":
    unittest.main()
