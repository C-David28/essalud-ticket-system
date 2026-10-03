"""Execute all plain-Python notebook cells locally; no Colab account or training.

Offline dataset is the default. --github verifies the public immutable SHA as well.
Dependencies are installed only inside --workspace/.venv unless --no-install.
"""
import argparse
import json
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--no-install", action="store_true")
    parser.add_argument("--github", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    notebook_path = root / "ml/notebooks/stage-4.3-dataset-v1.ipynb"
    notebook = json.loads(notebook_path.read_text(encoding="utf-8"))
    namespace = {"__name__": "__notebook_smoke__"}
    count = 0
    for cell in notebook["cells"]:
        if cell["cell_type"] != "code":
            continue
        code = "".join(cell["source"])
        exec(compile(code, f"notebook:{cell['id']}", "exec"), namespace)
        count += 1
        if cell["id"] == "configuration":
            namespace.update(WORKSPACE=args.workspace.resolve(), INSTALL_DEPENDENCIES=not args.no_install,
                             SOURCE_MODE="github_public" if args.github else "local_snapshot",
                             LOCAL_REPOSITORY=root)
    report = namespace["report"]
    assert report["status"] == "READY_FOR_STAGE_4_4"
    assert report["dataset"]["records"] == 200
    assert report["training_started"] is False and report["model_selected"] is False
    print(f"OK: {count} code cells executed; mode={report['source_mode']}; no training.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"SMOKE_FAILED: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
