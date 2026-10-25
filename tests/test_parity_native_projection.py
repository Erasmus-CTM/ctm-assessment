"""Fresh native receipts preserve mathematical approval and reject forged projections."""
import copy
import importlib.util
import os
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('parity_native_projection', ROOT / 'integration/pyodide-parity/native-authored.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FreshProjection(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        extension = os.environ.get('CTM_CHECKERS_EXTENSION')
        if not extension:
            raise unittest.SkipTest('requires the installed native authoring package')
        native = Path(extension) / 'native-authoring'
        if not native.is_dir():
            raise RuntimeError('CTM_CHECKERS_EXTENSION has no native authoring distribution')
        sys.path.insert(0, str(native))
        from ctm_variants.model import candidate, snapshot
        cls.make_candidate = staticmethod(candidate)
        cls.make_snapshot = staticmethod(snapshot)

    def setUp(self):
        data = {'options': {'question': 'Original prose.'}, 'context': {'variables': {}}, 'teacher_inputs': {'a': '1'}}
        self.retained = self.make_candidate('seed=1', self.make_snapshot(['1'], {'a': '1'}, {'mode': 'numeric'}), data=data, tests={'passed': True})
        fresh = copy.deepcopy(data)
        fresh['options']['question'] = 'Current prose.'
        self.row = self.make_candidate('seed=1', self.make_snapshot(['1'], {'a': '1'}, {'mode': 'numeric'}, {'unused': 'Integer(2)'}), data=fresh, tests={'passed': True})
        self.identity = {'n': 1, 'id': self.row['id'], 'hash': self.row['hash']}
        self.row.update(options=fresh['options'], teacherInputs=fresh['teacher_inputs'], context=dict(fresh['context'], variant=self.identity))

    def test_current_prose_and_unused_helper_keep_the_approval_but_use_fresh_data(self):
        result = module.fresh_projection(self.row, self.retained, self.identity)
        self.assertEqual(result['resolvedData']['options']['question'], 'Current prose.')
        self.assertNotEqual(result['resolvedData'], self.retained['data'])
        self.assertEqual(result['hash'], self.retained['hash'])

    def test_forged_projection_and_identity_are_rejected(self):
        for key, replacement in [('options', {'question': 'Forged'}), ('teacherInputs', {'a': '2'}), ('context', {'variant': None})]:
            with self.subTest(key=key):
                row = copy.deepcopy(self.row); row[key] = replacement
                with self.assertRaisesRegex(ValueError, 'projections'):
                    module.fresh_projection(row, self.retained, self.identity)

    def test_missing_success_and_forged_hash_are_rejected(self):
        for key, replacement in [('tests', {'passed': False}), ('hash', '0' * 16)]:
            row = copy.deepcopy(self.row); row[key] = replacement
            with self.assertRaises(ValueError):
                module.fresh_projection(row, self.retained, self.identity)

    def test_changed_math_teacher_or_grading_cannot_keep_historical_approval(self):
        for snapshot in [self.make_snapshot(['2'], {'a': '1'}, {'mode': 'numeric'}),
                         self.make_snapshot(['1'], {'a': '2'}, {'mode': 'numeric'}),
                         self.make_snapshot(['1'], {'a': '1'}, {'mode': 'equivalent'})]:
            row = dict(self.row, **self.make_candidate('seed=1', snapshot, data=self.row['data'], tests={'passed': True}))
            with self.assertRaisesRegex(ValueError, 'approval content'):
                module.fresh_projection(row, self.retained, self.identity)
