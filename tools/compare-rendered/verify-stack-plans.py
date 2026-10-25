#!/usr/bin/env python3
"""Verify rendered seed transitions against the installed native backend."""
import json
import hashlib
from pathlib import Path
import sys
import os

if os.getenv("CTM_STACK_COMPARE_DEBUG"):
    import faulthandler
    faulthandler.dump_traceback_later(10)


def main():
    value=json.loads(Path(sys.argv[1]).read_text()) if len(sys.argv)>1 else json.load(sys.stdin)
    page=Path(value['page']).resolve()
    installation=None
    for parent in page.parents:
        root=parent/'_extensions'
        choices=[root/'ctm-checkers',*sorted(root.glob('*/ctm-checkers'))]
        installation=next((p for p in choices if (p/'checkers.json').is_file()),None)
        if installation is not None:break
    if installation is None:raise ValueError('comparison requires the installed checker distribution')
    descriptor=json.loads((installation/'checkers.json').read_text())
    wheels=[installation/descriptor['wheel'],installation/descriptor['parts']['stack']['wheel']]
    for wheel,expected in zip(wheels,(descriptor['sha256'],descriptor['parts']['stack']['sha256'])):
        if not wheel.resolve().is_relative_to(installation.resolve()) or hashlib.sha256(wheel.read_bytes()).hexdigest()!=expected:
            raise ValueError('comparison checker wheel differs from its descriptor')
    sys.path[:0]=[str(p) for p in wheels]+[str(installation/'native-authoring')]
    from ctm_checkers.stack.engine import instantiate
    bindings=[]
    for payload in value['cards']:
        question=payload['backend']['question']
        for row in payload['variants']:
            plan=instantiate(question,row['plan']['seed'])
            if plan!=row['plan']:raise ValueError('frozen plan differs from the real backend')
        if value['mode']=='variants':
            from ctm_checkers.stack.variants import seed_record,card_data
            from ctm_variants import history
            from ctm_variants.stack_component import current_source
            from ctm_checkers.stack.importer import import_xml
            relative=page.relative_to(parent/'_site').with_suffix('.qmd')
            source=current_source(dict(projectRoot=str(parent),file=str(relative),label=payload['id']))
            options=source['options']
            xml=(parent/relative.parent/options['file']).resolve()
            checker=(parent/relative.parent/options['python-checkers']).resolve() if options.get('python-checkers') else None
            xml.relative_to(parent)
            if checker is not None:checker.relative_to(parent)
            canonical=next(q for q in import_xml(xml,python_checkers=str(checker) if checker else None)
                if q['name']==options['question'])
            if canonical!=question:raise ValueError('rendered question differs from its current source XML/checker')
            bindings.append({'id':payload['id'],'source':hashlib.sha1(source['source'].encode()).hexdigest()[:16],
                'save':options.get('save','answers') not in ('false','none')})
            # XML re-import also restores the schema's numeric types after the
            # JavaScript JSON bridge (1.0 and 1 have the same wire number).
            records=[seed_record(canonical,row['plan']['seed']) for row in payload['variants']]
            manifest,_=history.load(parent/'_variants'/ (payload['id']+'.yml'),payload['id'])
            expected=card_data(canonical,records,manifest['decisions'],identifier=payload['id'],review=payload['review'])
            if expected['variants']!=payload['variants']:raise ValueError('variant identity/display differs from tested backend/history')
    print(json.dumps({'verified':True,'bindings':bindings}))


if __name__=='__main__':main()
