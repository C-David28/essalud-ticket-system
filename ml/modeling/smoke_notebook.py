"""Execute the eight clean 4.5 cells using a new, isolated workspace."""
import argparse
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--no-install", action="store_true")
    parser.add_argument("--github", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    notebook = json.loads((root / "ml/notebooks/stage-4.5-model-v1.ipynb").read_text())
    namespace = {"__name__": "__notebook_smoke__"}
    count = 0
    for cell in notebook["cells"]:
        if cell["cell_type"] != "code":
            continue
        exec(compile("".join(cell["source"]), f"notebook:{cell['id']}", "exec"), namespace)
        count += 1
        if cell["id"] == "configuration":
            namespace.update(WORKSPACE=args.workspace.resolve(), INSTALL_DEPENDENCIES=not args.no_install,
                             SOURCE_MODE="github_public" if args.github else "local_snapshot", LOCAL_REPOSITORY=root)
    assert namespace["verification"]["records"] == 160
    assert namespace["verification"]["final_test_reopened"] is False
    print(f"OK: {count} notebook 4.5 cells executed; only development fit; no final-test evaluation.")


if __name__ == "__main__":
    main()
