"""Static draft integrity only; never import or execute CC Map source."""
import ast
import hashlib
import json
from pathlib import Path
import unittest

APP = Path(__file__).resolve().parents[2]
RECORD = json.loads((APP / 'sdk/imports/cc-map-8d0ad6f.json').read_text(encoding='utf-8'))
DRAFT = APP / RECORD['root']


class CcMapDraft(unittest.TestCase):
    def test_import_matches_pinned_source_and_only_the_recorded_transformation(self):
        paths = [item['path'] for item in RECORD['files']]
        self.assertEqual(set(paths), {'manifest.py', 'cc_map.s', 'OCTABAM.md', 'LICENSE'})
        self.assertEqual(len(paths), len(set(paths)))
        for item in RECORD['files']:
            path = DRAFT / item['path']
            self.assertFalse(path.is_symlink())
            data = path.read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), item['vendoredSha256'], item['path'])
            if item['path'] == 'manifest.py':
                transform = RECORD['transforms'][0]
                self.assertEqual(transform['path'], item['path'])
                self.assertEqual(data.decode().count(transform['replacement']), 1)
                data = data.decode().replace(transform['replacement'], transform['original'], 1).encode()
            self.assertEqual(len(data), item['sourceBytes'], item['path'])
            self.assertEqual(hashlib.sha256(data).hexdigest(), item['sourceSha256'], item['path'])
            blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
            self.assertEqual(blob, item['sourceGitBlob'], item['path'])
        tree = ast.parse((DRAFT / 'manifest.py').read_text(encoding='utf-8'))
        declarations = [node for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'Module']
        self.assertEqual(len(declarations), 1)
        keywords = {keyword.arg: keyword.value for keyword in declarations[0].keywords}
        self.assertEqual(ast.literal_eval(keywords['name']), 'cc-map')
        self.assertEqual(ast.literal_eval(keywords['key']), 'CC MAP')
        self.assertEqual(ast.literal_eval(keywords['author']), 'sambanks')

    def test_vector_expectation_is_a_lazy_guard_and_reference_is_authored_code(self):
        tree = ast.parse((DRAFT / 'manifest.py').read_text(encoding='utf-8'))
        calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'stock_guard']
        self.assertEqual(len(calls), 1)
        self.assertEqual([ast.literal_eval(argument) for argument in calls[0].args], [0x400d64a0, 4, RECORD['stockGuards'][0]['sha256']])
        emit = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'emit')
        pokes = next(node for node in emit.body if isinstance(node, ast.Assign) and node.targets[0].id == 'pokes')
        self.assertEqual(ast.dump(pokes.value.elts[0].elts[1]), ast.dump(calls[0]))
        assignments = {target.id: node.value for node in tree.body if isinstance(node, ast.Assign) for target in node.targets if isinstance(target, ast.Name)}
        code = bytes.fromhex(ast.literal_eval(assignments['CODE'].args[0]))
        tables = [ast.literal_eval(assignments[name].args[0]) for name in ['VERB_COUNTS', 'DLY_COUNTS']]
        doc = json.loads((DRAFT / 'octamod.module.json').read_text(encoding='utf-8'))
        self.assertEqual(len(code) + sum(map(len, tables)), doc['resources']['storage']['value'])
        self.assertIsNone(doc['resources']['processing']['value'])
        self.assertEqual(doc['resources']['processing']['method'], 'unmeasured')

    def test_draft_stays_outside_discovery_catalog_baseline_and_binary_inputs(self):
        self.assertEqual(RECORD['root'], 'sdk/octabam/modules/cc-map')
        self.assertTrue((APP / 'sdk/octabam/modules/cc-map').exists())
        for rel in ['sdk/approvals/module-qualification-baseline.json']:
            self.assertNotIn('cc-map', {item['id'] for item in json.loads((APP / rel).read_text(encoding='utf-8'))['modules']})
        doc = json.loads((DRAFT / 'octamod.module.json').read_text(encoding='utf-8'))
        self.assertEqual(doc['version'], RECORD['moduleVersion'])
        self.assertEqual(doc['source']['revision'], RECORD['revision'])
        self.assertNotIn('build', doc)
        self.assertEqual(doc['tests']['hardwareStatus'], 'untested')
        self.assertNotIn('qualification', doc['tests'])
        self.assertEqual(len(doc['access']['screenshots']), 6)
        self.assertEqual(set(doc['access']['screenshots']), {item['path'] for item in doc['media']})
        self.assertNotIn('noUiReason', doc['access'])
        capture = json.loads((DRAFT / 'media/capture.json').read_text(encoding='utf-8'))
        self.assertEqual(capture['releaseBinding']['moduleVersion'], doc['version'])
        self.assertEqual(capture['moduleVersion'], '0.1.1-experimental')
        for item in capture['screenshots']:
            self.assertEqual(hashlib.sha256((DRAFT / item['path']).read_bytes()).hexdigest(), item['sha256'])
        for item in doc['media']:
            self.assertEqual(item['captureType'], 'emulator')
            self.assertEqual(item['otUi']['moduleVersion'], doc['version'])
            self.assertEqual(item['otUi']['imageSha256'], capture['imageSha256'])
        for filename, digest in capture['sourceFiles'].items():
            self.assertEqual(hashlib.sha256((DRAFT / filename).read_bytes()).hexdigest(), digest)
        self.assertEqual({path.name for path in DRAFT.iterdir()}, set(item['path'] for item in RECORD['files']) | {'README.md', 'TESTING.md', 'octamod.module.json', 'thumbnail.svg', 'media', 'evidence'})
        for path in DRAFT.rglob('*'):
            self.assertFalse(path.is_symlink())
            self.assertTrue(path.is_file() or path.is_dir())
            self.assertNotIn(path.suffix.lower(), ['.bin', '.syx', '.o', '.elf', '.exe', '.dll', '.so', '.dylib', '.zip', '.wav'])
        self.assertNotIn('.incbin', (DRAFT / 'cc_map.s').read_text(encoding='utf-8'))
        upstream = json.loads((APP / 'sdk/UPSTREAM.json').read_text(encoding='utf-8'))
        self.assertIn('cc-map', upstream['scope'])
        self.assertEqual(sum(entry['record'] == 'imports/cc-map-8d0ad6f.json' for entry in upstream['imports']), 1)


if __name__ == '__main__':
    unittest.main()
