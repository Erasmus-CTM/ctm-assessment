#!/usr/bin/env python3
"""Inspect author Python imports against a private release index and subset lock.

This is the single packaged scanner used by the builder and render hook. It
parses Python syntax and never executes authored code. The full import index
stays outside published resources; the public subset lock lists shipped files.
"""
from __future__ import annotations

import argparse
import ast
import json
from pathlib import Path
import re


class ImportCheckError(ValueError):
    """Author code needs an unavailable package or cannot be inspected."""


def _normalise(name: str) -> str:
    if not isinstance(name, str) or not name.strip():
        raise ImportCheckError("Python package names must be nonempty strings")
    return re.sub(r"[-_.]+", "-", name).lower()


def check_sources(sources: list[dict], full_lock: dict, subset: dict, *, local_modules=(), local_dirs=(), strict=True) -> dict:
    """AST-scan author fragments against the release import map and shipped set.

    Known imports outside the subset stop the build/render. Unmapped names must
    resolve to release stdlib or actual local modules; diagnostic mode can
    report them separately before integration.
    Dynamic imports with a literal name are included; arbitrary execution is
    never used to discover imports.
    """
    packages = full_lock.get("packages", {})
    by_import = {}
    by_name = {_normalise(name): name for name in packages}
    shipped = {_normalise(name) for name in subset.get("packages", {})}
    local = set(local_modules) | {"js", "pyodide", "_pyodide", "pyodide_js", "ctm_checkers"}
    stdlib = set(full_lock.get("stdlib_modules", []))
    directories = [Path(directory).resolve() for directory in local_dirs]
    def is_local(module):
        return module in local or any((directory / (module + ".py")).is_file()
                                     or (directory / module).is_dir() for directory in directories)
    for name, entry in packages.items():
        for module in entry.get("imports", []):
            by_import.setdefault(module.split(".", 1)[0], set()).add(name)
    missing, unknown, found, dynamic_unknown = {}, {}, set(), []
    def require_package(name, origin):
        normalised = _normalise(name)
        if normalised not in by_name:
            raise ImportCheckError(f"{origin}: Pyodide distribution has no package {name}")
        if normalised not in shipped:
            missing.setdefault(by_name[normalised], set()).add(origin)
    for index, fragment in enumerate(sources):
        origin = fragment.get("origin", f"author fragment {index + 1}")
        for package in fragment.get("packages", []):
            require_package(package, origin)
        try:
            tree = ast.parse(fragment.get("source", ""), filename=origin)
        except SyntaxError as error:
            raise ImportCheckError(f"{origin}: cannot inspect author Python ({error.msg}, line {error.lineno})") from None
        modules = set()
        importlib_aliases, dynamic_functions = {"importlib"}, {"__import__"}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                importlib_aliases.update(alias.asname or alias.name for alias in node.names if alias.name == "importlib")
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module == "importlib":
                dynamic_functions.update(alias.asname or alias.name for alias in node.names if alias.name == "import_module")
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                modules.update(alias.name.split(".", 1)[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                modules.add(node.module.split(".", 1)[0])
            elif isinstance(node, ast.Call):
                function = node.func
                dynamic = (isinstance(function, ast.Name) and function.id in dynamic_functions) or (
                    isinstance(function, ast.Attribute) and isinstance(function.value, ast.Name)
                    and function.value.id in importlib_aliases and function.attr == "import_module")
                if dynamic:
                    if node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
                        module = node.args[0].value
                        if not module.startswith("."):
                            modules.add(module.split(".", 1)[0])
                    else:
                        dynamic_unknown.append(f"{origin}:{node.lineno}")
                if isinstance(function, ast.Name) and function.id == "graph_from_response":
                    require_package("networkx", origin)
        for module in modules:
            found.add(module)
            if is_local(module):
                continue
            candidates = by_import.get(module)
            if candidates:
                if not any(_normalise(name) in shipped for name in candidates):
                    for name in candidates:
                        missing.setdefault(name, set()).add(origin)
            elif module not in stdlib:
                unknown.setdefault(module, set()).add(origin)
    if missing:
        details = "; ".join(name + " (" + ", ".join(sorted(origins)) + ")" for name, origins in sorted(missing.items()))
        command = ",".join(sorted(missing))
        raise ImportCheckError(f"Author Python needs packages absent from the local bundle: {details}. "
                         f"Install with --assets local --python-packages {command}")
    if strict and dynamic_unknown:
        raise ImportCheckError("Use literal dynamic import names so offline dependencies can be checked: " + ", ".join(dynamic_unknown))
    if strict and unknown:
        details = "; ".join(name + " (" + ", ".join(sorted(origins)) + ")" for name, origins in sorted(unknown.items()))
        raise ImportCheckError("Author Python imports are neither release stdlib, shipped packages nor local modules: " + details)
    return {"imports": sorted(found), "unmapped": {name: sorted(origins) for name, origins in sorted(unknown.items())}}



def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--sources", type=Path, help="JSON array of actual authored fragments")
    inputs.add_argument("--stdin", action="store_true", help="Read actual authored fragments as JSON on stdin")
    parser.add_argument("--index", type=Path, required=True, help="Private release import index, never published")
    parser.add_argument("--subset", type=Path, required=True, help="Published subset pyodide-lock.json")
    parser.add_argument("--local-module", action="append", default=[])
    parser.add_argument("--local-dir", type=Path, action="append", default=[])
    args = parser.parse_args(argv)
    try:
        import sys
        fragments = json.load(sys.stdin) if args.stdin else json.loads(args.sources.read_text(encoding="utf-8"))
        result = check_sources(fragments,
                               json.loads(args.index.read_text(encoding="utf-8")),
                               json.loads(args.subset.read_text(encoding="utf-8")),
                               local_modules=args.local_module, local_dirs=args.local_dir)
    except (ImportCheckError, OSError, json.JSONDecodeError) as error:
        parser.exit(1, str(error) + "\n")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
