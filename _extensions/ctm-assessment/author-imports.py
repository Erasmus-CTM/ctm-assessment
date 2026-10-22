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
    """Conservatively AST-scan fragments and reachable local Python sources.

    Aliases are collected across all fragments and local modules, so a setup
    fragment cannot hide a literal dynamic import in a later cell. This is
    dependency inspection, not control-flow evaluation or authored execution.
    """
    if full_lock.get("v") == 1 and full_lock.get("python") != subset.get("info", {}).get("python"):
        raise ImportCheckError("Private import index and published subset use different Python releases; reinstall local assets")
    packages = full_lock.get("packages", {})
    by_import = {}
    by_name = {_normalise(name): name for name in packages}
    shipped = {_normalise(name) for name in subset.get("packages", {})}
    trusted = set(local_modules) | {"js", "pyodide", "_pyodide", "pyodide_js", "ctm_checkers"}
    stdlib = set(full_lock.get("stdlib_modules", []))
    directories = list(dict.fromkeys(Path(directory).resolve() for directory in local_dirs))
    for name, entry in packages.items():
        for module in entry.get("imports", []):
            by_import.setdefault(module.split(".", 1)[0], set()).add(name)
    missing, unknown, found, dynamic_unknown = {}, {}, set(), set()
    queue = [(fragment, "", None) for fragment in sources]
    records, visited_files, inspected_calls = [], set(), set()
    importlib_aliases, dynamic_functions = {"importlib"}, {"__import__"}

    def require_package(name, origin):
        normalised = _normalise(name)
        if normalised not in by_name:
            raise ImportCheckError(f"{origin}: Pyodide distribution has no package {name}")
        if normalised not in shipped:
            missing.setdefault(by_name[normalised], set()).add(origin)

    def enqueue_file(path, module):
        path = path.resolve()
        if path in visited_files:
            return
        visited_files.add(path)
        try:
            source = path.read_text(encoding="utf-8-sig")
        except (OSError, UnicodeError) as error:
            raise ImportCheckError(f"Cannot inspect local Python module {path}: {error}") from None
        package = module if path.name == "__init__.py" else module.rpartition(".")[0]
        queue.append(({"source": source, "origin": f"local module {path}"}, package, path))

    def inspect_local(module):
        """Resolve actual .py/package files; namespace directories have no code."""
        parts = module.split(".")
        for directory in directories:
            root = directory / parts[0]
            if not root.is_dir() and not root.with_suffix(".py").is_file():
                continue
            # Importing pkg.sub executes every reachable package __init__ first.
            for length in range(1, len(parts) + 1):
                stem = directory.joinpath(*parts[:length])
                initialiser = stem / "__init__.py"
                if initialiser.is_file():
                    enqueue_file(initialiser, ".".join(parts[:length]))
            target = directory.joinpath(*parts)
            if target.with_suffix(".py").is_file():
                enqueue_file(target.with_suffix(".py"), module)
            return True
        return False

    def require_module(module, origin):
        if not module:
            return
        root = module.split(".", 1)[0]
        found.add(root)
        if inspect_local(module) or root in trusted:
            return
        candidates = by_import.get(root)
        # The release package map wins over stdlib facts for unvendored modules.
        if candidates:
            if not any(_normalise(name) in shipped for name in candidates):
                for name in candidates:
                    missing.setdefault(name, set()).add(origin)
        elif root not in stdlib:
            unknown.setdefault(root, set()).add(origin)

    def is_dynamic(function):
        return (isinstance(function, ast.Name) and function.id in dynamic_functions) or (
            isinstance(function, ast.Attribute) and isinstance(function.value, ast.Name)
            and function.value.id in importlib_aliases and function.attr == "import_module")

    while True:
        while queue:
            fragment, package, path = queue.pop(0)
            origin = fragment.get("origin", f"author fragment {len(records) + 1}")
            for name in fragment.get("packages", []):
                require_package(name, origin)
            try:
                tree = ast.parse(fragment.get("source", ""), filename=origin)
            except SyntaxError as error:
                raise ImportCheckError(f"{origin}: cannot inspect author Python ({error.msg}, line {error.lineno})") from None
            nodes = list(ast.walk(tree))
            records.append((origin, nodes))
            for node in nodes:
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        require_module(alias.name, origin)
                        if alias.name == "importlib":
                            importlib_aliases.add(alias.asname or alias.name)
                elif isinstance(node, ast.ImportFrom):
                    module = node.module or ""
                    if node.level:
                        if not package:
                            continue
                        parent = package.split(".")
                        if node.level > len(parent):
                            raise ImportCheckError(f"{origin}: relative import escapes the local package")
                        module = ".".join(parent[:len(parent) - node.level + 1] + ([module] if module else []))
                    require_module(module, origin)
                    if module:
                        for alias in node.names:
                            if alias.name != "*":
                                inspect_local(module + "." + alias.name)
                    if node.level == 0 and node.module == "importlib":
                        dynamic_functions.update(alias.asname or alias.name for alias in node.names if alias.name == "import_module")
        # Assignment aliases can be chained or declared in a different fragment.
        changed = True
        while changed:
            before = (len(importlib_aliases), len(dynamic_functions))
            for _, nodes in records:
                for node in nodes:
                    if isinstance(node, ast.Assign):
                        targets, value = node.targets, node.value
                    elif isinstance(node, ast.AnnAssign):
                        targets, value = [node.target], node.value
                    else:
                        continue
                    names = {target.id for target in targets if isinstance(target, ast.Name)}
                    if isinstance(value, ast.Name) and value.id in importlib_aliases:
                        importlib_aliases.update(names)
                    if value is not None and is_dynamic(value):
                        dynamic_functions.update(names)
            changed = before != (len(importlib_aliases), len(dynamic_functions))
        for origin, nodes in records:
            for node in nodes:
                if not isinstance(node, ast.Call):
                    continue
                if is_dynamic(node.func) and id(node) not in inspected_calls:
                    inspected_calls.add(id(node))
                    argument = node.args[0] if node.args else next(
                        (keyword.value for keyword in node.keywords if keyword.arg == "name"), None)
                    if isinstance(argument, ast.Constant) and isinstance(argument.value, str):
                        module = argument.value
                        if module.startswith("."):
                            # Relative dynamic resolution needs a literal package too.
                            package_arg = (node.args[1] if len(node.args) > 1 else next(
                                (keyword.value for keyword in node.keywords if keyword.arg == "package"), None))
                            if not isinstance(package_arg, ast.Constant) or not isinstance(package_arg.value, str):
                                dynamic_unknown.add(f"{origin}:{node.lineno}")
                                continue
                            level = len(module) - len(module.lstrip("."))
                            parent = package_arg.value.split(".")
                            if level > len(parent):
                                raise ImportCheckError(f"{origin}: relative dynamic import escapes its package")
                            module = ".".join(parent[:len(parent) - level + 1] + ([module[level:]] if module[level:] else []))
                        if not module or not all(part.isidentifier() for part in module.split(".")):
                            raise ImportCheckError(f"{origin}: invalid literal dynamic module name")
                        require_module(module, origin)
                    else:
                        dynamic_unknown.add(f"{origin}:{node.lineno}")
                if isinstance(node.func, ast.Name) and node.func.id == "graph_from_response":
                    require_package("networkx", origin)
        if not queue:
            break
    if missing:
        details = "; ".join(name + " (" + ", ".join(sorted(origins)) + ")" for name, origins in sorted(missing.items()))
        command = ",".join(sorted(missing))
        raise ImportCheckError(f"Author Python needs packages absent from the local bundle: {details}. "
                               f"Install with --assets local --python-packages {command}")
    if strict and dynamic_unknown:
        raise ImportCheckError("Use literal dynamic import names so offline dependencies can be checked: " + ", ".join(sorted(dynamic_unknown)))
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
        fragments = json.loads(sys.stdin.buffer.read().decode("utf-8")) if args.stdin else json.loads(args.sources.read_text(encoding="utf-8"))
        result = check_sources(fragments,
                               json.loads(args.index.read_text(encoding="utf-8")),
                               json.loads(args.subset.read_text(encoding="utf-8")),
                               local_modules=args.local_module, local_dirs=args.local_dir)
    except (ImportCheckError, OSError, UnicodeError, json.JSONDecodeError) as error:
        sys.stderr.buffer.write((str(error) + "\n").encode("utf-8"))
        return 1
    sys.stdout.buffer.write((json.dumps(result, ensure_ascii=False) + "\n").encode("utf-8"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
