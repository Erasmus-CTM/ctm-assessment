#!/usr/bin/env python3
"""Build STACK's pinned example site with an umbrella package (including pre-U6 controls)."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
# Reviewed rename stage: the control before STACK joined the package.
BEFORE_PACKAGE = 'd9344af8c9862c854116c9bd9087f5785ea02264'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--umbrella', type=Path, required=True)
    parser.add_argument('--dest', type=Path, required=True)
    parser.add_argument('--workspace', type=Path, required=True)
    args = parser.parse_args()
    umbrella, dest, workspace = args.umbrella.resolve(), args.dest.resolve(), args.workspace.resolve()
    spec = importlib.util.spec_from_file_location('builder', umbrella / 'scripts/setup-feedback-integration.py')
    builder = importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)
    config = json.loads((umbrella / 'integration/feedback/repos.json').read_text())
    packaged = 'ctm-stack' in config['repositories']
    pin = config['repositories'].get('ctm-stack', {}).get('commit', BEFORE_PACKAGE)
    subprocess.run([sys.executable, umbrella / 'scripts/build-course.py', '--repo',
        'https://github.com/Erasmus-CTM/ctm-stack.git', '--ref', pin, '--dest', dest,
        '--umbrella', umbrella, '--workspace', workspace, '--no-render'], check=True)
    if packaged:
        import yaml
        file = dest / '_quarto.yml'
        settings = yaml.safe_load(file.read_text()); settings['filters'] = ['ctm-assessment']
        file.write_text(yaml.safe_dump(settings, sort_keys=False))
    checker_pin = json.loads((workspace / 'resolved-repos.json').read_text())['repositories']['ctm-checkers']['commit']
    source = builder.snapshot('Erasmus-CTM/ctm-checkers', checker_pin, workspace / 'src')
    env = dict(os.environ, CTM_CHECKERS_SOURCE=str(source))
    # This is the teacher test site; publishing approval remains required.
    if (dest / '_extensions/ctm-stack/question-variants.py').is_file():
        env['CTM_VARIANTS'] = 'review'
    subprocess.run(['quarto','render'], cwd=dest, env=env, check=True)


if __name__ == '__main__':
    main()
