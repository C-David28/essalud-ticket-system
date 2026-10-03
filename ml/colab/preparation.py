"""Stage 4.3 only: immutable inputs, safe loading, dataset and environment checks.

Standard library only. No model fitting, predictions, split creation or database access.
This source is embedded into the notebook by build-colab-notebook.mjs.
"""
from collections import Counter
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, HTTPRedirectHandler
import zipfile

REPOSITORY = "C-David28/essalud-ticket-system"
DATASET_COMMIT = "9d3103991911b1b06b9faca6dce779013dae3036"
DATASET_VERSION = "tickets-category-dataset-v1.0.0"
PREPARATION_VERSION = "stage-4.3-preparation-v1"
INSTALLER_VERSION = "25.1.1"
DATASET_ROOT = "ml/datasets/v1.0.0/"
SOURCE = "SYNTHETIC / DEMO / ACADEMIC DATASET"
CATEGORIES = ["SOPORTE", "REDES", "INFRAESTRUCTURA", "BIOMEDICO"]
EXPECTED_HASHES = {
    DATASET_ROOT + "incidents.jsonl": "2f571a40f063c4cce267352582f0bf78d2008d09ddc617ab54c7f8dd5ca21a69",
    DATASET_ROOT + "families.json": "0f27342915a770acd019a31b7685c8a2eea8c2de7616a38ca2ac8c1f079078b7",
    "ml/docs/LABELING-GUIDE.md": "7cb0ee07c57a6fb4a857bbde3ba8fc6f6b1e41d911d81682c62b98f316899cc9",
    DATASET_ROOT + "manifest.json": "aa698ab7e4480e2a0f51085b5a5138b2267eb12a021eb08c590d58a7d11fdb61",
    "apps/api/src/domain/ticket.ts": "8cfa93c9f1e9a8a7106c46118671d38c63cfce2041e514210430d0bf7560ce3a",
}
ALLOWED_FILES = (
    DATASET_ROOT + "incidents.jsonl",
    DATASET_ROOT + "families.json",
    DATASET_ROOT + "manifest.json",
    "ml/docs/LABELING-GUIDE.md",
    "apps/api/src/domain/ticket.ts",
)
MAX_FILE_BYTES = 1_000_000
MAX_ARCHIVE_BYTES = 3_000_000


def require(condition, code):
    if not condition:
        raise ValueError(code)


def canonical_hash(payload):
    return sha256(payload.decode("utf-8").replace("\r\n", "\n").encode("utf-8")).hexdigest()


def parse_json(payload, code):
    try:
        return json.loads(payload.decode("utf-8"))
    except (ValueError, UnicodeError):
        raise ValueError(code) from None


class NoRedirect(HTTPRedirectHandler):
    # Never forward a private Authorization header to an unexpected host.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def load_github(token=None, opener=None):
    """Read only the allowlisted files at a fixed SHA; token stays in memory/header."""
    request_opener = opener or build_opener(NoRedirect())
    payloads = {}
    for name in ALLOWED_FILES:
        url = f"https://api.github.com/repos/{REPOSITORY}/contents/{name}?ref={DATASET_COMMIT}"
        headers = {"Accept": "application/vnd.github.raw+json",
                   "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "essalud-ml-stage-4.3"}
        if token:
            headers["Authorization"] = "Bearer " + token
        try:
            with request_opener.open(Request(url, headers=headers), timeout=30) as response:
                payload = response.read(MAX_FILE_BYTES + 1)
        except HTTPError as error:
            raise RuntimeError(f"GITHUB_READ_FAILED_HTTP_{error.code}: verify commit, access or use ZIP upload") from None
        except (URLError, OSError):
            raise RuntimeError("GITHUB_READ_FAILED: network unavailable; use verified ZIP upload") from None
        require(len(payload) <= MAX_FILE_BYTES, "GITHUB_FILE_TOO_LARGE")
        payloads[name] = payload
    return payloads


def load_archive(payload):
    """Read an allowlisted git archive in memory. Never extract it to the filesystem."""
    require(isinstance(payload, bytes) and len(payload) <= MAX_ARCHIVE_BYTES, "ARCHIVE_TOO_LARGE")
    result, seen, total = {}, set(), 0
    try:
        with zipfile.ZipFile(BytesIO(payload)) as archive:
            require(len(archive.infolist()) <= 25, "ARCHIVE_TOO_MANY_ENTRIES")
            for entry in archive.infolist():
                name = entry.filename
                original = entry.orig_filename
                parts = PurePosixPath(name).parts
                require(original == name and name and "\\" not in original and not name.startswith("/") and
                        ":" not in name and ".." not in parts and name not in seen, "UNSAFE_ARCHIVE_PATH")
                seen.add(name)
                require(not stat.S_ISLNK(entry.external_attr >> 16), "ARCHIVE_SYMLINK")
                if entry.is_dir():
                    require(any(item.startswith(name) for item in ALLOWED_FILES), "UNEXPECTED_ARCHIVE_DIRECTORY")
                    continue
                require(name in ALLOWED_FILES, "UNEXPECTED_ARCHIVE_FILE")
                total += entry.file_size
                require(entry.file_size <= MAX_FILE_BYTES and total <= MAX_ARCHIVE_BYTES, "ARCHIVE_EXPANDED_TOO_LARGE")
                result[name] = archive.read(entry)
    except (zipfile.BadZipFile, RuntimeError):
        raise ValueError("INVALID_OR_ENCRYPTED_ARCHIVE") from None
    require(set(result) == set(ALLOWED_FILES), "ARCHIVE_MISSING_FILE")
    return result


def load_local_snapshot(repository_root):
    """Offline smoke tests only; same allowlist and hashes as GitHub/ZIP."""
    root = Path(repository_root)
    return {name: (root / name).read_bytes() for name in ALLOWED_FILES}


def verify_dataset(payloads):
    require(set(payloads) == set(ALLOWED_FILES), "INPUT_FILE_SET_MISMATCH")
    require(all(isinstance(value, bytes) and len(value) <= MAX_FILE_BYTES for value in payloads.values()), "INVALID_PAYLOAD")
    for name, digest in EXPECTED_HASHES.items():
        require(canonical_hash(payloads[name]) == digest, "IMMUTABLE_DATASET_HASH_MISMATCH")
    manifest = parse_json(payloads[DATASET_ROOT + "manifest.json"], "INVALID_MANIFEST_JSON")
    require(isinstance(manifest, dict), "INVALID_MANIFEST")
    require(manifest.get("dataset_version") == DATASET_VERSION and manifest.get("schema_version") == 1 and
            manifest.get("source") == SOURCE and manifest.get("hash_algorithm") == "SHA-256-UTF8-LF", "RELEASE_MISMATCH")
    require(manifest.get("categories") == CATEGORIES and manifest.get("distribution") == dict.fromkeys(CATEGORIES, 50), "CATEGORY_MANIFEST_MISMATCH")
    require(manifest.get("record_count") == 200 and manifest.get("family_count") == 40 and
            manifest.get("leakage_group_count") == 37 and manifest.get("records_per_family") == 5, "COUNT_MANIFEST_MISMATCH")
    expected_manifest_hashes = {"incidents.jsonl": EXPECTED_HASHES[DATASET_ROOT + "incidents.jsonl"],
                               "families.json": EXPECTED_HASHES[DATASET_ROOT + "families.json"],
                               "../../docs/LABELING-GUIDE.md": EXPECTED_HASHES["ml/docs/LABELING-GUIDE.md"]}
    require(manifest.get("files") == expected_manifest_hashes and manifest.get("training_status") == "NOT_STARTED" and
            manifest.get("splits_status") == "NOT_CREATED_STAGE_4_3", "FROZEN_MANIFEST_MISMATCH")
    match = re.search(r"export const CATEGORIES\s*=\s*\[([^\]]+)\]", payloads["apps/api/src/domain/ticket.ts"].decode("utf-8"))
    require(match is not None and re.findall(r"['\"]([^'\"]+)['\"]", match.group(1)) == CATEGORIES, "DOMAIN_CATEGORY_MISMATCH")
    catalog = parse_json(payloads[DATASET_ROOT + "families.json"], "INVALID_FAMILIES_JSON")
    require(isinstance(catalog, dict) and catalog.get("schema_version") == 1 and
            isinstance(catalog.get("families"), list), "INVALID_FAMILY_CATALOG")
    families = {row["scenario_family_id"]: row for row in catalog["families"]}
    require(len(families) == len(catalog["families"]) == 40, "INVALID_FAMILY_COUNT")
    lines = payloads[DATASET_ROOT + "incidents.jsonl"].decode("utf-8").splitlines()
    records = [parse_json(line.encode("utf-8"), "INVALID_RECORD_JSON") for line in lines]
    require(len(records) == 200, "INVALID_RECORD_COUNT")
    fields = {"record_id", "titulo", "descripcion", "categoria", "scenario_family_id", "leakage_group_id",
              "is_synthetic", "source", "dataset_version", "label_status", "label_rationale",
              "writing_style", "length_band", "is_boundary_case"}
    ids, inputs = set(), set()
    for row in records:
        require(isinstance(row, dict) and set(row) == fields, "INVALID_RECORD_FIELDS")
        require(isinstance(row["record_id"], str) and re.fullmatch(r"ML-\d{4}", row["record_id"]) and
                row["record_id"] not in ids, "INVALID_RECORD_ID")
        ids.add(row["record_id"])
        require(row["is_synthetic"] is True and row["source"] == SOURCE and row["dataset_version"] == DATASET_VERSION and
                row["label_status"] == "APPROVED", "INVALID_RECORD_PROVENANCE")
        require(row["categoria"] in CATEGORIES, "INVALID_CATEGORY")
        family = families.get(row["scenario_family_id"])
        require(family is not None and row["categoria"] == family["categoria"] and
                row["leakage_group_id"] == family["leakage_group_id"], "FAMILY_GROUP_MISMATCH")
        require(isinstance(row["titulo"], str) and 5 <= len(row["titulo"]) <= 200 and
                isinstance(row["descripcion"], str) and 10 <= len(row["descripcion"]) <= 5000, "INVALID_TEXT")
        text = (row["titulo"].strip(), row["descripcion"].strip())
        require(text not in inputs, "DUPLICATE_TEXT")
        inputs.add(text)
    distribution = dict(Counter(row["categoria"] for row in records))
    require(distribution == dict.fromkeys(CATEGORIES, 50), "UNBALANCED_DATASET")
    require(all(count == 5 for count in Counter(row["scenario_family_id"] for row in records).values()), "INVALID_FAMILY_SIZE")
    groups = len({row["leakage_group_id"] for row in records})
    require(groups == 37, "INVALID_GROUP_COUNT")
    report = {"dataset_version": DATASET_VERSION, "dataset_commit": DATASET_COMMIT,
              "dataset_sha256": EXPECTED_HASHES[DATASET_ROOT + "incidents.jsonl"],
              "records": len(records), "distribution": distribution, "families": len(families),
              "leakage_groups": groups, "is_synthetic": True, "training_started": False,
              "splits_created": False, "status": "DATASET_V1_VERIFIED"}
    return records, report


def parse_requirements(text):
    pins = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([a-zA-Z0-9-]+)==([0-9]+(?:\.[0-9]+)+(?:\.post[0-9]+)?)", line)
        require(match is not None and match.group(1) not in pins, "INVALID_DEPENDENCY_PIN")
        pins[match.group(1)] = match.group(2)
    require(len(pins) == 18, "INCOMPLETE_DEPENDENCY_PINS")
    return pins


def check_python():
    require((3, 11) <= sys.version_info[:2] < (3, 14), "PYTHON_UNSUPPORTED: use Python 3.11, 3.12 or 3.13")


def prepare_environment(workspace, requirements_text, install=True):
    """Use a project-local venv so Colab's system packages remain untouched."""
    check_python()
    parse_requirements(requirements_text)
    workspace = Path(workspace).resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    environment = workspace / ".venv"
    python = environment / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    if not python.exists():
        # Colab images may lack ensurepip; host pip manages this empty venv directly.
        subprocess.run([sys.executable, "-m", "venv", "--without-pip", str(environment)], check=True, timeout=120)
    requirements_file = workspace / "requirements-stage-4.3.txt"
    requirements_file.write_text(requirements_text, encoding="utf-8")
    if install:
        subprocess.run([sys.executable, "-m", "pip", "--isolated", "--python", str(python), "install", "--disable-pip-version-check",
                        "--only-binary=:all:", "--index-url", "https://pypi.org/simple",
                        f"pip=={INSTALLER_VERSION}", "-r", str(requirements_file)], check=True, timeout=600)
    return python


def verify_environment(python, requirements_text):
    pins = parse_requirements(requirements_text)
    code = """import importlib.metadata as m, json, sys
import numpy, scipy, pandas, sklearn, matplotlib
print(json.dumps({'python':sys.version.split()[0], 'pip_tool_version':m.version('pip'), 'packages':{name:m.version(name) for name in json.loads(sys.argv[1])}}))
"""
    result = subprocess.run([str(python), "-c", code, json.dumps(list(pins))],
                            check=True, capture_output=True, text=True, timeout=120)
    report = json.loads(result.stdout)
    require(report["packages"] == pins, "INSTALLED_DEPENDENCY_VERSION_MISMATCH")
    require(report["pip_tool_version"] == INSTALLER_VERSION, "INSTALLER_VERSION_MISMATCH")
    require((3, 11) <= tuple(map(int, report["python"].split(".")[:2])) < (3, 14), "ENVIRONMENT_PYTHON_UNSUPPORTED")
    subprocess.run([str(python), "-m", "pip", "check"], check=True, timeout=60)
    return report


def readiness_report(dataset_report, environment_report, requirements_text, source_mode, preparation_sha256):
    require(re.fullmatch(r"[0-9a-f]{64}", preparation_sha256) is not None, "INVALID_PREPARATION_HASH")
    return {"stage": "4.3", "status": "READY_FOR_STAGE_4_4", "source_mode": source_mode,
            "repository": REPOSITORY, "dataset": dataset_report, "environment": environment_report,
            "preparation_version": PREPARATION_VERSION, "preparation_source_sha256_utf8_lf": preparation_sha256,
            "requirements_sha256_utf8_lf": canonical_hash(requirements_text.encode("utf-8")),
            "training_started": False, "model_selected": False, "operational_database_access": False}
