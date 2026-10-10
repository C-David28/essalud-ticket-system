"""Trusted local model loading only. No HTTP, database, pickle or joblib.load."""
from hashlib import sha256
from importlib import metadata
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
import sys
import zipfile

MODEL_VERSION = "ticket-category-model-v1.0.0"
LABELS = ["SOPORTE", "REDES", "INFRAESTRUCTURA", "BIOMEDICO"]
RUNTIME_PINS = {"numpy": "2.2.6", "scipy": "1.15.3", "scikit-learn": "1.6.1",
                "joblib": "1.5.1", "threadpoolctl": "3.6.0", "packaging": "25.0",
                "skops": "0.16.0", "prettytable": "3.18.0", "wcwidth": "0.9.2"}
# Reviewed after a real roundtrip; never trust types merely because a file requests them.
REVIEWED_EXTRA_TYPES = frozenset()
FILES = {"model.skops", "metadata.json", "verification.json"}
MAX_MODEL_BYTES = 8 * 1024 * 1024


def require(condition, code):
    if not condition:
        raise ValueError(code)


def text_hash(payload):
    return sha256(payload.decode("utf-8").replace("\r\n", "\n").encode("utf-8")).hexdigest()


def verify_runtime():
    require(sys.version_info[:2] == (3, 12), "MODEL_REQUIRES_PYTHON_3_12")
    try:
        installed = {name: metadata.version(name) for name in RUNTIME_PINS}
    except metadata.PackageNotFoundError:
        raise ValueError("MODEL_DEPENDENCY_MISSING: run ml:model:setup") from None
    require(installed == RUNTIME_PINS, "MODEL_DEPENDENCY_VERSION_MISMATCH")
    return installed


def inspect_archive(payload):
    require(0 < len(payload) <= MAX_MODEL_BYTES, "MODEL_SIZE_INVALID")
    try:
        with zipfile.ZipFile(BytesIO(payload)) as archive:
            entries = archive.infolist()
            require(0 < len(entries) <= 100, "MODEL_ARCHIVE_ENTRY_LIMIT")
            require(len({e.filename for e in entries}) == len(entries), "MODEL_ARCHIVE_DUPLICATE")
            require(all(not e.flag_bits & 1 and e.file_size <= 16 * 1024 * 1024 for e in entries)
                    and sum(e.file_size for e in entries) <= 16 * 1024 * 1024, "MODEL_ARCHIVE_EXPANSION_LIMIT")
            require(all(e.orig_filename == e.filename and not e.filename.startswith(("/", "\\")) and "\\" not in e.filename and
                        ":" not in e.filename and ".." not in PurePosixPath(e.filename).parts for e in entries), "MODEL_ARCHIVE_PATH_INVALID")
            require("schema.json" in {e.filename for e in entries}, "MODEL_ARCHIVE_SCHEMA_MISSING")
    except zipfile.BadZipFile:
        raise ValueError("MODEL_ARCHIVE_INVALID") from None


def deserialize(payload):
    verify_runtime()
    inspect_archive(payload)
    import skops.io as sio
    unexpected = set(sio.get_untrusted_types(data=payload)) - REVIEWED_EXTRA_TYPES
    require(not unexpected, "MODEL_UNREVIEWED_TYPES")
    estimator = sio.loads(payload, trusted=sorted(REVIEWED_EXTRA_TYPES))
    from sklearn.pipeline import Pipeline, FeatureUnion
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.svm import LinearSVC
    require(type(estimator) is Pipeline and list(estimator.named_steps) == ["features", "classifier"], "MODEL_PIPELINE_INVALID")
    features, classifier = estimator.named_steps["features"], estimator.named_steps["classifier"]
    require(type(features) is FeatureUnion and [name for name, _ in features.transformer_list] == ["word", "char"], "MODEL_FEATURES_INVALID")
    require(all(type(v) is TfidfVectorizer for _, v in features.transformer_list) and
            type(classifier) is LinearSVC and classifier.C == 1.0, "MODEL_ESTIMATOR_INVALID")
    require(classifier.classes_.tolist() == sorted(LABELS), "MODEL_CLASSES_INVALID")
    import numpy as np
    require(np.isfinite(classifier.coef_).all() and np.isfinite(classifier.intercept_).all(), "MODEL_WEIGHTS_INVALID")
    return estimator


def load_release(directory, approval=None):
    """approval must come from reviewed application code, NEVER from an uploaded bundle."""
    if approval is None:
        approval = json.loads(Path(__file__).with_name("approved-release.json").read_text(encoding="utf-8"))
    require(approval.get("model_version") == MODEL_VERSION and set(approval.get("files", {})) == FILES, "MODEL_APPROVAL_INVALID")
    root = Path(directory).resolve()
    payloads = {}
    for name in sorted(FILES):
        path = root / name
        limit = MAX_MODEL_BYTES if name == "model.skops" else 512 * 1024
        require(path.is_file() and not path.is_symlink() and path.stat().st_size <= limit, "MODEL_FILE_INVALID")
        payload = path.read_bytes()
        actual = sha256(payload).hexdigest() if name == "model.skops" else text_hash(payload)
        require(actual == approval["files"][name], "MODEL_CHECKSUM_MISMATCH")
        payloads[name] = payload
    info = json.loads(payloads["metadata.json"])
    require(info["model_version"] == MODEL_VERSION and info["runtime"]["packages"] == RUNTIME_PINS and
            info["runtime"]["python_minor"] == "3.12" and info["categories"] == LABELS, "MODEL_METADATA_INVALID")
    return CategoryModel(deserialize(payloads["model.skops"]), info)


class CategoryModel:
    def __init__(self, estimator, info):
        self.estimator, self.info = estimator, info

    def predict(self, titulo, descripcion):
        require(isinstance(titulo, str) and isinstance(descripcion, str), "MODEL_TEXT_TYPE_INVALID")
        # Bound before trimming to prevent unbounded whitespace; same domain limits after trim.
        require(len(titulo) <= 200 and len(descripcion) <= 5000 and
                5 <= len(titulo.strip()) and 10 <= len(descripcion.strip()), "MODEL_TEXT_LENGTH_INVALID")
        text = titulo.strip() + "\n" + descripcion.strip()
        category = self.estimator.predict([text])[0]
        scores = self.estimator.decision_function([text])[0]
        return {"categoria_sugerida": str(category), "score": float(max(scores)),
                "score_type": "raw_decision_margin_not_probability", "probability": None,
                "operational_threshold": None, "model_version": MODEL_VERSION}
