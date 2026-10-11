from dataclasses import dataclass
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    token: str
    model_directory: Path = ROOT / "ml/models/category-v1.0.0"
    inference_timeout: float = 2.0
    startup_timeout: float = 60.0
    body_timeout: float = 5.0
    max_body_bytes: int = 32768
    docs_enabled: bool = False

    def __post_init__(self):
        if not isinstance(self.token, str) or re.fullmatch(r"[0-9a-f]{64}", self.token) is None:
            raise ValueError("ML_SERVICE_TOKEN_REQUIRED: run ml:service:setup")
        if not 0.05 <= self.inference_timeout <= 10 or not 1 <= self.startup_timeout <= 120:
            raise ValueError("ML_TIMEOUT_CONFIG_INVALID")

    @classmethod
    def from_environment(cls):
        docs = os.environ.get("ML_DOCS_ENABLED", "false")
        if docs not in {"true", "false"}:
            raise ValueError("ML_DOCS_CONFIG_INVALID")
        return cls(token=os.environ.get("ML_SERVICE_TOKEN", ""),
                   model_directory=Path(os.environ.get("ML_MODEL_DIRECTORY", str(ROOT / "ml/models/category-v1.0.0"))),
                   inference_timeout=float(os.environ.get("ML_INFERENCE_TIMEOUT_SECONDS", "2")),
                   startup_timeout=float(os.environ.get("ML_STARTUP_TIMEOUT_SECONDS", "60")), docs_enabled=docs == "true")
