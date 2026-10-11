"""Build an isolated inference/test environment without touching previous stages."""
import argparse
import importlib.metadata
import json
from pathlib import Path
import re
import subprocess
import sys


def pins(path):
    result = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("-r "):
            included = pins(Path(path).parent / line[3:])
            if set(included) & set(result):
                raise ValueError("DUPLICATE_DEPENDENCY_PIN")
            result.update(included)
            continue
        match = re.fullmatch(r"([a-zA-Z0-9-]+)==([0-9]+(?:\.[0-9]+)+)", line)
        if not match or match[1] in result:
            raise ValueError("INVALID_SERVICE_DEPENDENCY_PIN")
        result[match[1]] = match[2]
    return result


def verify(python, requirements):
    expected = pins(requirements)
    code = "import json,importlib.metadata as m,sys;assert sys.version_info[:2]==(3,12);print(json.dumps({n:m.version(n) for n in json.loads(sys.argv[1])}))"
    run = subprocess.run([str(python), "-c", code, json.dumps(list(expected))], check=True, capture_output=True, text=True, timeout=60)
    if json.loads(run.stdout) != expected:
        raise ValueError("SERVICE_ENVIRONMENT_VERSION_MISMATCH")
    subprocess.run([str(python), "-m", "pip", "check"], check=True, timeout=60)
    return expected


def prepare(workspace, requirements, install=True):
    if sys.version_info[:2] != (3, 12):
        raise ValueError("USE_PYTHON_3_12")
    pins(requirements)
    workspace = Path(workspace).resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    python = workspace / ".venv" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    if not python.exists():
        subprocess.run([sys.executable, "-m", "venv", "--without-pip", str(python.parents[1])], check=True, timeout=120)
    if install:
        subprocess.run([sys.executable, "-m", "pip", "--isolated", "--python", str(python), "install",
                        "--disable-pip-version-check", "--only-binary=:all:", "--index-url", "https://pypi.org/simple",
                        "pip==25.1.1", "-r", str(requirements)], check=True, timeout=600)
    verify(python, requirements)
    return python


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--no-install", action="store_true")
    args = parser.parse_args()
    python = prepare(args.workspace, Path(__file__).with_name("requirements-test.txt"), not args.no_install)
    print(f"ML_SERVICE_PYTHON_READY: {python}")
