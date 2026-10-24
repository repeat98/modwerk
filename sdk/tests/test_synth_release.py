"""Read-only pinned-source and artifact hygiene checks; never evaluate module code."""
import ast
import hashlib
import json
from pathlib import Path
import unittest

APP = Path(__file__).resolve().parents[2]
ORIGINAL = json.loads((APP/'sdk/imports/synth-949f3be.json').read_text())
RECORD = json.loads((APP/'sdk/imports/synth-fixes-0.1.3.json').read_text())
FOLDER = APP/RECORD['folder']
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


class SynthRelease(unittest.TestCase):
    def test_source_identities_and_complete_notices(self):
        files = ORIGINAL['files'] + ORIGINAL['localFiles']
        updates = {item['path']: item for item in RECORD['files']}
        self.assertEqual(RECORD['originalImport'], 'synth-949f3be.json')
        self.assertIn(RECORD['status'], ('released', 'proposed'))
        self.assertEqual(len(files), len({item['path'] for item in files}))
        for item in files:
            update = updates.get(item['path'])
            if update:
                self.assertEqual(update['previousSha256'], item['vendoredSha256'])
            self.assertEqual(sha(FOLDER/item['path']), update['draftSha256'] if update else item['vendoredSha256'], item['path'])
            if 'revision' in item:
                self.assertRegex(item['revision'], r'^[a-f0-9]{40}$')
                self.assertRegex(item['sourceSha256'], r'^[a-f0-9]{64}$')
                if not item.get('changes'):
                    self.assertEqual(item['sourceSha256'], item['vendoredSha256'])
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
        guards = json.loads((FOLDER/'stock-guards.json').read_text())['guards']
        self.assertGreater(len(guards), 30)
        self.assertTrue(any(item['address'] == 0x4000d514 and item['length'] == 8 for item in guards))
        for guard in guards:
            self.assertEqual(set(guard), {'path', 'address', 'length', 'sha256'})
            self.assertRegex(guard['sha256'], r'^[a-f0-9]{64}$')

    def test_experimental_release_does_not_claim_hardware_or_timing(self):
        doc = json.loads((FOLDER/'octamod.module.json').read_text())
        self.assertEqual(doc['version'], RECORD['version'])
        self.assertNotIn('build', doc)
        self.assertIn(doc['tests']['hardwareStatus'], ('untested', 'reported'))
        self.assertNotIn('qualification', doc['tests'])
        self.assertTrue((APP/'sdk/octabam/modules/synth').exists())
        for name in ['sdk/catalog.json','src/catalog/module-documents.json']:
            self.assertIn('synth', {item['id'] for item in json.loads((APP/name).read_text())['modules']})
        self.assertNotIn('synth', {item['id'] for item in json.loads((APP/'sdk/module-qualification-baseline.json').read_text())['modules']})
        approval = json.loads((APP/'sdk/synth-build-approval.json').read_text())
        self.assertEqual(approval['kind'], 'owner-approved-update')
        self.assertEqual(approval['version'], doc['version'])
        self.assertEqual(set(approval['waived']), {'current-build-hardware', 'chip-worst-case-cycles', 'complete-memory-bounds'})
        self.assertIsNone(doc['resources']['processing']['value'])
        report = json.loads((FOLDER/'evidence/regressions.json').read_text())
        self.assertEqual(report['moduleVersion'], doc['version'])
        for regression in report['releaseRegressions'].values():
            self.assertEqual(regression['status'], 'passed')
            self.assertEqual(regression['imageSha256'], report['patchedBrowser']['mainSha256'])
            self.assertRegex(regression['emulatorSha256'], r'^[a-f0-9]{64}$')
        for file, fingerprint in report['compiledCode'].items():
            self.assertEqual(sha(FOLDER/file), fingerprint)
        self.assertEqual(report['audio']['mono']['patched']['finalHalfSecondPeak'], 0)
        self.assertLessEqual(report['audio']['fourVoices']['patched']['finalHalfSecondPeak'], 2)
        capture = json.loads((FOLDER/'media/capture.json').read_text())
        image = capture['imageSha256']
        screenshots = [media for media in doc['media'] if 'otUi' in media]
        self.assertEqual(len(screenshots), 7)
        for media in screenshots:
            self.assertEqual(media['otUi']['imageSha256'], image)
            self.assertEqual(sha(FOLDER/media['path']), capture['screenshots'][Path(media['path']).name])
        self.assertEqual(image, report['patchedNativeMainSha256'])
        self.assertEqual(capture['moduleVersion'], doc['version'])
        self.assertEqual(capture['sourceSha256'], approval['sourceSha256'])
        composition = json.loads((APP/'sdk/native-comparisons/synth.json').read_text())
        self.assertEqual(composition['moduleVersion'], doc['version'])
        self.assertEqual(composition['moduleSourceSha256'], approval['sourceSha256'])
        self.assertEqual(composition['summary']['mismatches'], 0)
        for path in FOLDER.rglob('*'):
            self.assertFalse(path.is_symlink())
            self.assertNotIn(path.name, ['out','vendor','downloads','__pycache__'])
            self.assertNotIn(path.suffix.lower(), ['.bin','.syx','.o','.elf','.wav','.zip','.exe','.dll','.so','.dylib'])


if __name__ == '__main__':
    unittest.main()
