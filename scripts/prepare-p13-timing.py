#!/usr/bin/env python3
"""Stage two measurement-only pages in an already installed local project."""
from pathlib import Path
import sys
import yaml

root = Path(__file__).resolve().parents[1]
project = Path(sys.argv[1])
config = project / '_quarto.yml'
data = yaml.safe_load(config.read_text())
render = data['project']['render']
if not isinstance(render, list):
    raise ValueError('P13 timing needs an explicit render list')
for name in ('timing-math', 'timing-python'):
    file = name + '.qmd'
    text = (root / 'integration/feedback/timing' / file).read_text()
    text = text.replace('filters: [math-exercise]', 'filters: [ctm-assessment]').replace('filters: [py-exercise]', 'filters: [ctm-assessment]')
    (project / file).write_text(text)
    if file not in render:
        render.append(file)
config.write_text(yaml.safe_dump(data, sort_keys=False))
