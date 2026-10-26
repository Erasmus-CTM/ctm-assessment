import gzip
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import ctm_assets as a
from p13_assets import SOURCES, bind_application, verify_deployment


class Deployment(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.site = Path(self.temp.name)
        bundle = self.site / '_ctm-assets'
        bundle.mkdir()
        (bundle / 'manifest.json').write_bytes(a.json_bytes({'v':1, 'versions':{}, 'files':{}}))
        self.lock = {'v':1, 'versions':{}, 'files':a.inventory(bundle), 'application':[]}
        for repository, paths in SOURCES.items():
            for source in paths:
                name = Path(source).name
                data = ('/* ' + name + ' */').encode()
                file = self.site / 'site_libs' / name
                file.parent.mkdir(exist_ok=True)
                file.write_bytes(data)
                self.lock['application'].append({'deployed_name':name, 'sha256':a.digest(data)})

    def test_all_actual_copies_are_required_and_verified(self):
        verify_deployment(self.site, self.lock)
        worker = self.site / 'site_libs/pyodide-worker-core.js'
        worker.write_text('different executable code')
        with self.assertRaisesRegex(a.AssetError, 'differs from the locked source'):
            verify_deployment(self.site, self.lock)

    def test_gzip_cannot_replace_verified_javascript(self):
        worker = self.site / 'site_libs/pyodide-worker-core.js'
        compressed = worker.with_name(worker.name + '.gz')
        compressed.write_bytes(gzip.compress(worker.read_bytes()))
        verify_deployment(self.site, self.lock)
        compressed.write_bytes(gzip.compress(b'different executable code'))
        with self.assertRaisesRegex(a.AssetError, 'Compressed deployed worker differs'):
            verify_deployment(self.site, self.lock)

    def test_locked_duplicate_does_not_hide_missing_deployment(self):
        (self.site / 'site_libs/pyodide-worker-core.js').unlink()
        with self.assertRaisesRegex(a.AssetError, 'Missing deployed worker'):
            verify_deployment(self.site, self.lock)


class ApplicationProvenance(unittest.TestCase):
    def test_stale_composition_cannot_be_rebound_to_new_runtime_or_asset_table(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            library = root / '_extensions/ctm-libs'
            (library / 'runtime').mkdir(parents=True)
            table = library / 'assets.json'
            runtime = library / 'runtime/pyodide-runtime.js'
            table.write_text('{"v":1,"assets":{}}')
            runtime.write_text("var indexURL = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';")
            current = a.version_sources(library)
            lock = {'provenance': {k:current[k] for k in ('runtime_sha256','table_sha256')}}
            roots = {'ctm-libs':root, 'pyodide-interaktiv':root}
            refs = {name:'a'*40 for name in roots}
            for target in (runtime, table):
                with self.subTest(source=target.name):
                    before = target.read_bytes()
                    target.write_bytes(before + b'\n')
                    with self.assertRaisesRegex(a.AssetError, 'Compose the vendor lock against the current canonical runtime'):
                        bind_application(lock, roots, refs, root/'cache')
                    target.write_bytes(before)
            with self.assertRaisesRegex(a.AssetError, 'Compose the vendor lock against the current canonical runtime'):
                bind_application({}, roots, refs, root/'cache')


if __name__ == '__main__':
    unittest.main()
