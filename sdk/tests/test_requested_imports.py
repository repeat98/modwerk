"""Import integrity and source hygiene only. Never evaluate an imported manifest."""
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import unittest

APP = Path(__file__).resolve().parents[2]
SDK = APP / 'sdk/octabam'
def imported_path(rel):
    return APP / 'sdk/archive/midi-scenes-8.2' / rel if rel.startswith('modules/midi-scenes/') else SDK / rel
REPORT = json.loads((APP / 'sdk/imports/octabam-363861e.json').read_text())


class RequestedImports(unittest.TestCase):
    def test_sources_match_the_recorded_import_without_gitlinks_or_binaries(self):
        # Node and publication share one import policy; local guides are editable.
        subprocess.run(['node', 'scripts/sdk-imports.mjs'], cwd=APP, check=True)
        for item in REPORT['files']:
            self.assertRegex(item['revision'], r'^[a-f0-9]{40}$')
        roots = [SDK / 'modules' / id for id in REPORT['modules']] + [SDK / 'platform/usb-midi']
        for root in roots:
            for path in root.rglob('*'):
                self.assertFalse(path.is_symlink())
                self.assertNotIn(path.name, ['.git', 'out', 'downloads', 'vendor', '__pycache__'])
                self.assertNotIn(path.suffix.lower(), ['.bin', '.syx', '.o', '.elf', '.exe', '.dll', '.so', '.dylib', '.zip', '.wav'])

    def test_usb_layouts_match_the_separate_upstream_pin(self):
        report = json.loads((APP / 'sdk/imports/usb-audio-outbox-7b2984c8.json').read_text())
        self.assertEqual(report['revision'], '7b2984c859732ae6c797ae49c7d61d250b1b6519')
        self.assertEqual(report['license'], 'MIT')
        folder = SDK / 'modules/usb-audio-out-tracks-main-cue/layouts'
        self.assertEqual(set(report['sources']), {p.name for p in folder.iterdir() if p.is_file()})
        for name, digest in report['sources'].items():
            self.assertEqual(hashlib.sha256((folder / name).read_bytes()).hexdigest(), digest, name)
        self.assertIn('SET_CUR', (folder / 'usbaudio.s').read_text())

    def test_stock_expectations_are_lazy_fingerprints_not_copied_spans(self):
        declared = []
        for rel in sorted({guard['path'] for guard in REPORT['stockGuards']}):
            tree = ast.parse(imported_path(rel).read_text())
            for node in ast.walk(tree):
                if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name):
                    continue
                if node.func.id == 'stock_guard':
                    address, length, digest = [ast.literal_eval(arg) for arg in node.args]
                    self.assertRegex(digest, r'^[a-f0-9]{64}$')
                    declared.append({'path': rel, 'address': address, 'bytes': length, 'sha256': digest})
                if node.func.id in ('Detour', 'Poke'):
                    expect = next((kw.value for kw in node.keywords if kw.arg == 'expect'), node.args[1] if len(node.args) > 1 else None)
                    self.assertIsInstance(expect, ast.Call)
                    self.assertEqual(expect.func.id, 'stock_guard', rel)
        canonical = lambda rows: sorted((row['path'], row['address'], row['bytes'], row['sha256']) for row in rows)
        self.assertEqual(canonical(declared), canonical(REPORT['stockGuards']))

    def test_catalog_and_author_dependencies_remain_exact(self):
        catalog = json.loads((APP / 'sdk/catalog.json').read_text())
        pins = {item['id']: item['version'] for item in catalog['modules']}
        for id in REPORT['modules']:
            doc = json.loads((SDK / 'modules' / id / 'octamod.module.json').read_text())
            self.assertEqual(pins[id], doc['version'])
            self.assertEqual(doc['source']['revision'], '4f9a89453fdcdd39a3cd57f010ffa489cac721cd' if id == 'midi-scenes' else '6f9e5bc9db0ae9fa99fa2f2a0f4de1fdb8e9a136' if id == 'usb-audio-out-tracks-main-cue' else REPORT['revision'])
            self.assertTrue((SDK / 'modules' / id / 'LICENSE').is_file())
            if id == 'midi-scenes':
                self.assertEqual(doc['version'], '0.2.5-experimental')
                self.assertNotIn('build', doc)
            else:
                self.assertNotIn('build', doc)
                # USB Audio 0.2 retains the classic lifecycle and MIDI clock sources beside selectable layouts.
                self.assertEqual(doc['version'], '0.2.0-experimental' if id == 'usb-audio-out-tracks-main-cue' else '0.1.6-experimental' if id == 'analog-bassdrum' else '0.1.3-experimental' if id == 'quantizer' else '0.1.2-experimental')
        for id, pin in REPORT['authorPins'].items():
            sources = [item for item in REPORT['files'] if item['path'].startswith('modules/' + id + '/upstream/')]
            self.assertTrue(sources)
            doc = pin.get('documentation')
            doc_path = doc['path'] if doc else None
            assembly = [item for item in sources if item['path'] != doc_path]
            self.assertTrue(assembly)
            self.assertEqual({item['revision'] for item in assembly}, {pin['revision']})
            self.assertEqual({item['repository'] for item in sources}, {pin['repository']})
            if doc:
                matches = [item for item in sources if item['path'] == doc['path']]
                self.assertEqual(len(matches), 1)
                self.assertEqual(matches[0]['revision'], doc['revision'])
                self.assertEqual(matches[0].get('assemblyPinRevision'), pin['revision'])
                self.assertEqual(matches[0]['sourcePath'], 'README.md')
                self.assertEqual(matches[0]['sourceSha256'], matches[0]['vendoredSha256'])
        self.assertEqual(REPORT['dependencies']['usb-audio-out-tracks-main-cue'], ['platform/usb-midi'])
        self.assertTrue((SDK / 'platform/usb-midi/descriptors.py').is_file())
        self.assertIn('platform/usb-midi/', (SDK / 'platform/usb-midi/manifest.py').read_text())
        midi_manifest = ast.parse(imported_path('modules/midi-scenes/manifest.py').read_text())
        units = [node for node in ast.walk(midi_manifest) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'Linked']
        self.assertEqual(len(units), 12)
        for unit in units:
            filename = ast.literal_eval(unit.args[1].right)
            self.assertTrue(imported_path('modules/midi-scenes/upstream/gas/' + filename).is_file())
        for filename in ['quantizer.s', 'core.s', 'keys.s', 'scale.s', 'manifest.py']:
            self.assertTrue((SDK / 'modules/quantizer/upstream/quantizer' / filename).is_file())


if __name__ == '__main__':
    unittest.main()
