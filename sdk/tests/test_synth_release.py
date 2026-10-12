"""Read-only pinned-source and artifact hygiene checks; never evaluate module code."""
import ast
import hashlib
import json
from pathlib import Path
import unittest

APP = Path(__file__).resolve().parents[2]
ORIGINAL = json.loads((APP/'sdk/imports/synth-949f3be.json').read_text())
PUBLISHED = json.loads((APP/'sdk/imports/synth-fixes-273-264.json').read_text())
PREVIOUS = json.loads((APP/'sdk/imports/synth-ca13ed8.json').read_text())
RECORD = json.loads((APP/'sdk/imports/synth-48b89e7.json').read_text())
FOLDER = APP/RECORD['folder']
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


class SynthRelease(unittest.TestCase):
    def test_source_identities_and_complete_notices(self):
        self.assertEqual(RECORD['originalImport'], 'synth-949f3be.json')
        self.assertEqual(RECORD['previousUpdate'], 'synth-ca13ed8.json')
        self.assertEqual(PREVIOUS['previousUpdate'], 'synth-fixes-273-264.json')
        self.assertEqual(PREVIOUS['version'], '0.1.4-experimental')
        self.assertEqual(PUBLISHED['version'], '0.1.2-experimental')
        self.assertRegex(RECORD['authorPin']['revision'], r'^[a-f0-9]{40}$')
        files = {item['path']: item for item in RECORD['files']}
        on_disk = sorted(str(p.relative_to(FOLDER)) for p in FOLDER.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name != '.DS_Store')
        self.assertEqual(sorted(files), on_disk)
        for path, item in files.items():
            self.assertEqual(sha(FOLDER/path), item['sha256'], path)
            if 'sourceSha256' in item:
                self.assertRegex(item['sourceSha256'], r'^[a-f0-9]{64}$')
                if not item.get('changes'):
                    self.assertEqual(item['sourceSha256'], item['sha256'], path)
        for path in ['upstream/synth/poly.s', 'upstream/synth/page.s', 'upstream/synth/machine.s', 'upstream/synth/engine_abi.inc', 'upstream/synth/README.md', 'upstream/LICENSE',
                     'upstream/quantizer/quantizer.s', 'upstream/quantizer/core.s', 'upstream/quantizer/keys.s', 'upstream/quantizer/scale.s', 'upstream/quantizer/README.md']:
            self.assertEqual(files[path]['revision'], RECORD['authorPin']['revision'])
            self.assertEqual(files[path]['sourceSha256'], files[path]['sha256'], path + ' must be the author file byte for byte')
        for path in RECORD['removed']:
            self.assertFalse((FOLDER/path).exists(), path)
        license_text = (FOLDER/'LICENSE').read_text()
        for name in ['upstream/LICENSE', 'OCTABAM-LICENSE']:
            self.assertIn((FOLDER/name).read_text().strip(), license_text)
        self.assertIn('Copyright (c) 2026 Modwerk contributors', license_text)

    def test_stock_expectations_are_lazy_and_no_precompiled_page_is_carried(self):
        tree = ast.parse((FOLDER/'upstream/synth/manifest.py').read_text())
        assignments = {target.id: node.value for node in tree.body if isinstance(node, ast.Assign)
                       for target in node.targets if isinstance(target, ast.Name)}
        self.assertNotIn('PINNED_PAGE', assignments)
        for name, value in assignments.items():
            if name.endswith('_STOCK'):
                self.assertIsInstance(value, ast.Call, name)
                self.assertEqual(value.func.id, 'stock_guard', name)
        quantizer = (FOLDER/'upstream/quantizer/manifest.py').read_text()
        self.assertNotRegex(quantizer, r'(Detour\(0x[0-9a-fA-F]+,\s*H\(|expect=H\()')
        top = (FOLDER/'manifest.py').read_text()
        self.assertNotIn('fromhex("', top)
        guards = json.loads((FOLDER/'stock-guards.json').read_text())['guards']
        self.assertGreater(len(guards), 60)
        self.assertTrue(any(item['address'] == 0x4000d514 and item['length'] == 8 for item in guards))
        for guard in guards:
            self.assertEqual(set(guard), {'path', 'address', 'length', 'sha256'})
            self.assertRegex(guard['sha256'], r'^[a-f0-9]{64}$')

    def test_measured_release_keeps_hardware_attribution_separate(self):
        doc = json.loads((FOLDER/'octamod.module.json').read_text())
        self.assertEqual(doc['version'], RECORD['version'])
        self.assertNotIn('build', doc)
        self.assertNotIn('releaseWaiver', doc['tests'])
        q = doc['tests']['qualification']
        self.assertEqual(q['moduleVersion'], doc['version'])
        self.assertEqual(q['hardware']['imageSha256'], q['imageSha256'])
        self.assertEqual(q['hardware']['sourceRevision'], doc['tests']['evidenceRevision'])
        for name in ['sdk/catalog.json', 'src/catalog/module-documents.json']:
            self.assertIn('synth', {item['id'] for item in json.loads((APP/name).read_text())['modules']})
        approval = json.loads((APP/'sdk/synth-build-approval.json').read_text())
        self.assertEqual(approval['version'], '0.1.2-experimental')
        self.assertEqual((FOLDER/'evidence/release-0.1.2/build-approval.json').read_text(), (APP/'sdk/synth-build-approval.json').read_text())
        self.assertTrue((FOLDER/'evidence/release-0.1.1/owner-hardware.md').exists())
        capture = json.loads((FOLDER/'media/capture.json').read_text())
        image = capture['imageSha256']
        self.assertEqual(image, q['imageSha256'])
        self.assertEqual(capture['moduleVersion'], doc['version'])
        self.assertEqual(capture['sourceSha256'], q['sourceSha256'])
        for media in [media for media in doc['media'] if 'otUi' in media]:
            self.assertEqual(media['otUi']['imageSha256'], image)
            self.assertEqual(sha(FOLDER/media['path']), capture['screenshots'][Path(media['path']).name])
        composition = json.loads((APP/'sdk/native-comparisons/synth.json').read_text())
        self.assertEqual(composition['moduleVersion'], doc['version'])
        self.assertEqual(composition['moduleSourceSha256'], q['sourceSha256'])
        self.assertEqual(composition['summary']['mismatches'], 0)
        for path in FOLDER.rglob('*'):
            self.assertFalse(path.is_symlink())
            self.assertNotIn(path.name, ['out','vendor','downloads','__pycache__'])
            self.assertNotIn(path.suffix.lower(), ['.bin','.syx','.o','.elf','.wav','.zip','.exe','.dll','.so','.dylib'])


if __name__ == '__main__':
    unittest.main()
