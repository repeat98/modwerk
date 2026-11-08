"""Pinned draft integrity only; never import or execute the OctaKit sources."""
import hashlib
import json
from pathlib import Path
import re
import unittest

APP = Path(__file__).resolve().parents[2]
RECORD = json.loads((APP / 'sdk/imports/octakit-8d0ad6f.json').read_text())
DRAFT = APP / RECORD['root']


class OctakitDraft(unittest.TestCase):
    def test_import_matches_exact_upstream_identities(self):
        paths = [item['path'] for item in RECORD['files']]
        self.assertEqual(len(paths), len(set(paths)))
        for item in RECORD['files']:
            path = DRAFT / item['path']
            self.assertFalse(path.is_symlink(), item['path'])
            data = path.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            self.assertEqual(digest, item['sourceSha256'], item['path'])
            self.assertEqual(digest, item['vendoredSha256'], item['path'])
            self.assertRegex(item['revision'], r'^[a-f0-9]{40}$')
            pin = RECORD['authorPin']['revision'] if item['path'].startswith('upstream/') else RECORD['revision']
            self.assertEqual(item['revision'], pin)
            if 'sourceGitBlob' in item:
                git_blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
                self.assertEqual(git_blob, item['sourceGitBlob'], item['path'])
            if 'sourceBytes' in item:
                self.assertEqual(len(data), item['sourceBytes'], item['path'])

    def test_runtime_subset_is_complete_and_stock_recipes_are_byte_free(self):
        runtime = DRAFT / 'upstream/runtime'
        recipe = json.loads((runtime / 'firmware.json').read_text())
        self.assertEqual(recipe['id'], RECORD['authorPin']['version'])
        self.assertEqual(recipe['source']['version'], '1.40C')
        expected = set(recipe['source_hashes']) | {'firmware.json'}
        self.assertEqual({path.name for path in runtime.iterdir()}, expected)
        self.assertTrue(set(recipe['sources']).issubset(expected))
        for filename, digest in recipe['source_hashes'].items():
            self.assertEqual(hashlib.sha256((runtime / filename).read_bytes()).hexdigest(), digest, filename)

        # Recipe guards are stock identities, never copied stock expectations.
        for patch in recipe['patches']:
            self.assertEqual(set(patch), {'name', 'offset', 'length', 'sha256', 'writes'})
            self.assertRegex(patch['sha256'], r'^[a-f0-9]{64}$')
            for write in patch['writes']:
                self.assertEqual(set(write), {'offset', 'data'})
                self.assertRegex(write['data'], r'^(?:[a-f0-9]{2})+$')

        operations = recipe['append']['runtime']['stock_operations']
        for operation in operations:
            allowed = {'kind', 'policy', 'source_offset', 'source_length', 'target_offset', 'target_length'}
            if operation['kind'] == 'm68k-relocate':
                allowed.add('instruction_lengths')
            else:
                self.assertEqual(operation['kind'], 'stock-copy')
            self.assertEqual(set(operation), allowed)
            self.assertGreater(operation['source_length'], 0)
            self.assertGreaterEqual(operation['source_offset'], 0)
            self.assertLessEqual(operation['source_offset'] + operation['source_length'], recipe['source']['os']['size'])
        for filename in recipe['sources']:
            for incbin in re.findall(r'\.incbin\s+"([^"]+)"', (runtime / filename).read_text()):
                match = re.fullmatch(r'stock/([0-9]{4})\.bin', incbin)
                self.assertIsNotNone(match, incbin)
                self.assertLess(int(match.group(1)), len(operations))
                self.assertFalse((runtime / incbin).exists(), 'Stock must be recovered locally')

    def test_draft_stays_outside_native_discovery_and_publication(self):
        self.assertEqual(RECORD['root'], 'sdk/drafts/octakit')
        self.assertFalse((APP / 'sdk/octabam/modules/octakit').exists())
        for rel in ['sdk/catalog.json', 'src/catalog/module-documents.json', 'sdk/approvals/module-qualification-baseline.json']:
            entries = json.loads((APP / rel).read_text())['modules']
            self.assertNotIn('octakit', {entry['id'] for entry in entries})
        doc = json.loads((DRAFT / 'octamod.module.json').read_text())
        self.assertEqual(doc['version'], RECORD['moduleVersion'])
        self.assertEqual(doc['source']['revision'], RECORD['revision'])
        self.assertEqual(doc['author']['github'], 'emuyia')
        self.assertEqual(doc['build']['status'], 'pending')
        self.assertEqual(doc['tests']['hardwareStatus'], 'historical')
        self.assertNotIn('qualification', doc['tests'])
        self.assertEqual(len(doc['access']['screenshots']), 3)
        self.assertNotIn('noUiReason', doc['access'])
        self.assertEqual({entry['path'] for entry in doc['media']}, set(doc['access']['screenshots']))
        capture = json.loads((DRAFT / 'media/capture.json').read_text())
        self.assertEqual(capture['moduleVersion'], doc['version'])
        for entry in doc['media']:
            self.assertEqual(entry['captureType'], 'emulator')
            self.assertEqual(entry['otUi']['moduleVersion'], doc['version'])
            self.assertEqual(entry['otUi']['imageSha256'], capture['imageSha256'])
            self.assertEqual(hashlib.sha256((DRAFT / entry['path']).read_bytes()).hexdigest(), capture['screenshots'][Path(entry['path']).name])
        for path in DRAFT.rglob('*'):
            self.assertFalse(path.is_symlink())
            self.assertNotIn(path.name, ['.git', 'out', 'downloads', 'vendor', '__pycache__'])
            self.assertNotIn(path.suffix.lower(), ['.bin', '.syx', '.o', '.elf', '.exe', '.dll', '.so', '.dylib', '.zip', '.wav'])


if __name__ == '__main__':
    unittest.main()
