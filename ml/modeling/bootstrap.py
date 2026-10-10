"""Install stage 4.5 into its own venv; preserve all stage 4.3/4.4 pins."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys


def pins(text):
    result = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([a-zA-Z0-9-]+)==([0-9]+(?:\.[0-9]+)+(?:\.post[0-9]+)?)", line)
        if match is None or match[1] in result:
            raise ValueError("INVALID_MODEL_DEPENDENCY_PIN")
        result[match[1]] = match[2]
    if len(result) != 21:
        raise ValueError("INCOMPLETE_MODEL_DEPENDENCY_PINS")
    return result


def prepare(workspace, requirements, install=True):
    if sys.version_info[:2] != (3, 12):
        raise ValueError("USE_PYTHON_3_12: install Python 3.12 or configure ML_PYTHON")
    pins(requirements)
    workspace = Path(workspace).resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    python = workspace / ".venv" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
    if not python.exists():
        subprocess.run([sys.executable, "-m", "venv", "--without-pip", str(python.parents[1])], check=True, timeout=120)
    requirement_file = workspace / "requirements-stage-4.5.txt"
    requirement_file.write_text(requirements, encoding="utf-8")
    if install:
        subprocess.run([sys.executable, "-m", "pip", "--isolated", "--python", str(python), "install",
                        "--disable-pip-version-check", "--only-binary=:all:", "--index-url", "https://pypi.org/simple",
                        "pip==25.1.1", "-r", str(requirement_file)], check=True, timeout=600)
    verify(python, requirements)
    return python


def verify(python, requirements):
    expected = pins(requirements)
    code = "import json,importlib.metadata as m,sys;assert sys.version_info[:2]==(3,12), 'USE_PYTHON_3_12';assert m.version('pip')=='25.1.1', 'INSTALLER_VERSION_MISMATCH';print(json.dumps({n:m.version(n) for n in json.loads(sys.argv[1])}))"
    run = subprocess.run([str(python), "-c", code, json.dumps(list(expected))], check=True, capture_output=True, text=True, timeout=60)
    if json.loads(run.stdout) != expected:
        raise ValueError("MODEL_ENVIRONMENT_VERSION_MISMATCH")
    subprocess.run([str(python), "-m", "pip", "check"], check=True, timeout=60)
    return expected


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--requirements", type=Path, default=Path(__file__).with_name("requirements.txt"))
    parser.add_argument("--no-install", action="store_true")
    args = parser.parse_args()
    python = prepare(args.workspace, args.requirements.read_text(encoding="utf-8"), not args.no_install)
    print(f"MODEL_ENVIRONMENT_READY: {python}")
