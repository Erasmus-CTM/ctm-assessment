"""The V5 comparison verifies real backend data, not a permissive shape mask."""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
HELPER=ROOT/'tools/compare-rendered/verify-stack-plans.py'


class StackComparisonProof(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.extension=Path(os.environ.get('CTM_CHECKERS_EXTENSION','/nonexistent'))
        cls.source=Path(os.environ.get('CTM_CHECKERS_SOURCE','/nonexistent'))
        if not (cls.extension/'native-authoring/ctm_variants/stack_component.py').is_file() or not shutil.which('quarto'):
            raise unittest.SkipTest('requires the installed V5 native authoring distribution and Quarto')
        if not (cls.source/'examples/stack/polynomial-expansion.xml').is_file():
            raise unittest.SkipTest('requires the pinned checker example XML')

    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory(prefix='ctm-stack-proof-')
        self.addCleanup(self.temporary.cleanup)
        self.project=Path(self.temporary.name)
        shutil.copytree(self.extension,self.project/'_extensions/ctm-checkers')
        shutil.copy2(self.source/'examples/stack/polynomial-expansion.xml',self.project/'question.xml')
        (self.project/'page.qmd').write_text('```{.stack-question}\n#| label: proof-card\n#| file: question.xml\n#| question: Expand a product (form-sensitive)\n```\n')
        (self.project/'_site').mkdir()
        self.page=self.project/'_site/page.html';self.page.write_text('')
        code='''import json,sys
from pathlib import Path
root=Path(sys.argv[1]);extension=root/'_extensions/ctm-checkers'
d=json.loads((extension/'checkers.json').read_text())
sys.path[:0]=[str(extension/d['wheel']),str(extension/d['parts']['stack']['wheel']),str(extension/'native-authoring')]
from ctm_checkers.stack.importer import import_xml
from ctm_checkers.stack.variants import seed_record,card_data
q=import_xml(root/'question.xml')[0]
print(json.dumps(card_data(q,[seed_record(q,1)],[],identifier='proof-card',review=True)))
'''
        built=subprocess.run([sys.executable,'-c',code,str(self.project)],text=True,capture_output=True,timeout=30,check=True)
        self.card=json.loads(built.stdout)

    def verify(self,card):
        # JavaScript's JSON.stringify writes 1.0 as 1. The proof must recover
        # canonical XML schema types before checking the native content hash.
        def wire(value):
            if isinstance(value,float) and value.is_integer():return int(value)
            if isinstance(value,list):return [wire(v) for v in value]
            if isinstance(value,dict):return {k:wire(v) for k,v in value.items()}
            return value
        request=self.project/'request.json'
        request.write_text(json.dumps(dict(page=str(self.page),mode='variants',cards=[wire(card)])))
        return subprocess.run([sys.executable,str(HELPER),str(request)],text=True,capture_output=True,timeout=30)

    def test_real_xml_plan_hash_and_source_binding(self):
        result=self.verify(self.card)
        self.assertEqual(result.returncode,0,result.stderr)
        receipt=json.loads(result.stdout)
        self.assertTrue(receipt['verified'])
        self.assertEqual(receipt['bindings'][0]['id'],'proof-card')
        self.assertEqual(len(receipt['bindings'][0]['source']),16)

    def test_forged_plan_hash_or_grading_rule_is_rejected(self):
        for mutation in ('plan','hash','grading'):
            with self.subTest(mutation=mutation):
                card=copy.deepcopy(self.card)
                if mutation=='plan':card['variants'][0]['plan']['env']['a']='999'
                elif mutation=='hash':card['variants'][0]['hash']='0'*16
                else:card['backend']['question']['prts'][0]['value']=2
                self.assertNotEqual(self.verify(card).returncode,0)

    def test_changed_xml_cannot_be_explained_by_an_old_render(self):
        xml=self.project/'question.xml';xml.write_text(xml.read_text().replace('Expand and collect like terms:', 'Updated teaching prose:'))
        self.assertNotEqual(self.verify(self.card).returncode,0)
