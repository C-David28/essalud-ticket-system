"""Run the actual 4.4 notebook cells locally/CI; test stays locked by default."""
import argparse
import json
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--no-install", action="store_true")
    parser.add_argument("--github", action="store_true")
    parser.add_argument("--final", action="store_true", help="Explicit final evaluation of the frozen candidate; never used by CI")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    notebook = json.loads((root / "ml/notebooks/stage-4.4-training-v1.ipynb").read_text(encoding="utf-8"))
    namespace = {"__name__": "__training_notebook_smoke__"}
    count = 0
    for cell in notebook["cells"]:
        if cell["cell_type"] != "code":
            continue
        code = "".join(cell["source"])
        if cell["id"] == "final-test" and args.final:
            code = code.replace("RUN_FINAL_TEST = False", "RUN_FINAL_TEST = True", 1)
        exec(compile(code, f"notebook:{cell['id']}", "exec"), namespace)
        count += 1
        if cell["id"] == "configuration":
            namespace.update(WORKSPACE=args.workspace.resolve(), INSTALL_DEPENDENCIES=not args.no_install,
                             SOURCE_MODE="github_public" if args.github else "local_snapshot", LOCAL_REPOSITORY=root)
    output = args.workspace / "results"
    assert (output / "selection.json").exists()
    if args.final:
        assert (output / "final-metrics.json").exists()
    else:
        assert not (output / "final-test-started.json").exists(), "CI/smoke default must not open final test"
    print(f"OK: {count} notebook code cells executed; final_requested={args.final}; no model exported.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"TRAINING_NOTEBOOK_FAILED: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
