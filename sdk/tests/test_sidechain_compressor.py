"""Read-only Sidechain Compressor integrity checks: AST and data only; never import its source."""
import ast
import hashlib
import json
from pathlib import Path
import unittest

APP = Path(__file__).resolve().parents[2]
RECORD = json.loads((APP / 'sdk/imports/sidechain-compressor-b0d49bf.json').read_text())
FOLDER = APP / RECORD['root']
IMAGE = '131142e1839bf1a62b48929dee396cc23b1f2f27f33595a9e6f39bf57f7be22e'
# 0.1.1's evidence/software.json and evidence/common-builder.json stay as that release's history.
IMAGE_0_1_1 = '4fd5fcb49ed17cd4e707d407a6e42a64ec30b50aefaad3b1eeb1bb804493aef0'


def proofs(name):
    return json.loads((APP / 'src/engine/assets' / name).read_text())['proofs']


class SidechainCompressor(unittest.TestCase):
    def test_pins_and_authored_file_identities(self):
        # The author's own Modwerk copy of the module (modwerk-modules/sidechain-compressor), byte for byte.
        self.assertEqual(RECORD['revision'], 'b0d49bf32d3fcc2e3ce7e9cec67f4fbb2619e511')
        self.assertEqual(RECORD['authorPin']['revision'], RECORD['revision'])
        paths = [entry['path'] for entry in RECORD['files']]
        self.assertEqual(len(paths), len(set(paths)))
        self.assertEqual(set(paths), {'manifest.py', 'patch_sc_dsp3.asm', 'patch_sidechain.s', 'ui_switch.s', 'sc_tables.py',
            'sc_keyfilt.py', 'upstream/README.md', 'upstream/LICENSE', 'LICENSE'})
        for entry in RECORD['files']:
            data = (FOLDER / entry['path']).read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), entry['vendoredSha256'], entry['path'])
            self.assertRegex(entry['sourceGitBlob'], r'^[a-f0-9]{40}$')
            self.assertEqual(entry['revision'], RECORD['authorPin']['revision'])
            if 'transforms' not in entry:
                self.assertEqual(entry['sourceSha256'], entry['vendoredSha256'])
                self.assertEqual(entry['sourceGitBlob'], hashlib.sha1(
                    b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest())
                self.assertEqual(entry['sourceBytes'], len(data))
        self.assertIn('Zac', (FOLDER / 'LICENSE').read_text())
        self.assertIn('MIT', (FOLDER / 'LICENSE').read_text())

    def test_only_lazy_local_guards_hooks_replacement_and_declared_ranges(self):
        tree = ast.parse((FOLDER / 'manifest.py').read_text())
        calls = [n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name)]
        hooks = [n for n in calls if n.func.id == 'DspHook']
        self.assertEqual(len(hooks), 4)
        self.assertEqual([ast.literal_eval(n.args[0]) for n in hooks],
                         [{'A': 0x4a7, 'B': 0x29c}, {'A': 0x1ab1, 'B': 0x1871}, {'A': 0x50e, 'B': 0x303}, {'A': 0x1aa4, 'B': 0x1864}])
        actual = []
        for hook in hooks:
            guard = hook.args[1]
            self.assertIsInstance(guard, ast.Call)
            self.assertEqual(guard.func.id, 'stock_dsp_words')
            payload, address, words, digest = [ast.literal_eval(arg) for arg in guard.args]
            self.assertEqual(address, ast.literal_eval(hook.args[0])['A'])
            actual.append((payload, address, words, digest))
        self.assertEqual(actual, [(g['payload'], g['address'], g['words'], g['sha256']) for g in RECORD['stockGuards'] if 'payload' in g])
        # Both ColdFire units: sc_cf (formatters, sc_norm) and sc_ui (the KEY switch and KWID's clip).
        linked = [n for n in calls if n.func.id == 'Linked']
        self.assertEqual([ast.literal_eval(n.args[0]) for n in linked], ['sc_cf', 'sc_ui'])
        # sc_norm's two jsr detours, each over a guarded six-byte stock instruction.
        detours = [n for n in calls if n.func.id == 'Detour']
        self.assertEqual(len(detours), 2)
        cpu = []
        for detour in detours:
            guard = detour.args[1]
            self.assertEqual(guard.func.id, 'stock_guard')
            address, length, digest = [ast.literal_eval(arg) for arg in guard.args]
            self.assertEqual(address, ast.literal_eval(detour.args[0]))
            self.assertEqual({k.arg: ast.literal_eval(k.value) for k in detour.keywords}.get('kind'), 'jsr')
            self.assertEqual([ast.literal_eval(arg) for arg in detour.args[2:4]], ['sc_cf', 'sc_norm'])
            cpu.append((hex(address), length, digest))
        self.assertEqual(cpu, [(g['address'], g['bytes'], g['sha256']) for g in RECORD['stockGuards'] if 'payload' not in g])
        # It is stock COMPRESSOR: the module replaces its row and keeps its dispatch.
        menu = next(n for n in calls if n.func.id == 'MenuEntry')
        keywords = {k.arg: ast.literal_eval(k.value) for k in menu.keywords if k.arg in ('replaces', 'stock_dsp', 'fx2_id')}
        self.assertEqual((keywords['replaces'], keywords['stock_dsp'], keywords['fx2_id']), ('COMPRESSOR', True, 0x18))
        ranges = [n for n in calls if n.func.id == 'DspRange']
        self.assertEqual([(ast.literal_eval(n.args[1]), ast.literal_eval(n.args[2])) for n in ranges],
                         [(0x7f0, 0x210), (0x3dfe, 0x202)])

    def test_evidence_is_bound_to_the_module_and_to_the_committed_proofs(self):
        document = json.loads((FOLDER / 'octamod.module.json').read_text())
        capture = json.loads((FOLDER / 'media/capture.json').read_text())
        q = document['tests']['qualification']
        self.assertEqual(document['version'], RECORD['moduleVersion'])
        self.assertEqual(document['source']['revision'], RECORD['revision'])
        self.assertEqual(document['source']['path'], 'modwerk-modules/sidechain-compressor')
        for version in (capture['moduleVersion'], q['moduleVersion']):
            self.assertEqual(version, document['version'])
        # One image identity everywhere: the shared builder's native image of the module alone, the one flashed.
        for sha in (capture['imageSha256'], q['imageSha256'], q['hardware']['imageSha256']):
            self.assertEqual(sha, IMAGE)
        self.assertEqual(q['hardware']['sourceRevision'], RECORD['revision'])
        self.assertEqual(capture['source']['manifestSha256'], hashlib.sha256((FOLDER / 'manifest.py').read_bytes()).hexdigest())
        self.assertEqual(len(document['media']), 3)
        for entry in document['media']:
            self.assertEqual(entry['captureType'], 'emulator')
            self.assertEqual(entry['otUi']['moduleVersion'], document['version'])
            self.assertEqual(entry['otUi']['imageSha256'], IMAGE)
            name = Path(entry['path']).name
            self.assertEqual(hashlib.sha256((FOLDER / entry['path']).read_bytes()).hexdigest(), capture['screenshots'][name])
            self.assertEqual(capture['composedImage']['screenshots'][name], capture['screenshots'][name])
        # The committed fingerprints pin the flashed image and the documented counts.
        composition, visible = proofs('sidechain-composition-proofs.json'), proofs('sidechain-visible-proofs.json')
        alone = next(p for p in composition if p['moduleIds'] == ['sidechain-compressor'] and p['keepStockFx2'])
        self.assertEqual(alone['sha256'], IMAGE)
        self.assertEqual((len(composition), sum("error" not in p for p in composition)), (512, 169))
        self.assertEqual((len(visible), sum('error' not in p for p in visible)), (1024, 618))
        self.assertTrue(all('error' in p for p in proofs('sidechain-analog-bd-proofs.json')))
        # 0.1.1's records are kept unchanged as history.
        software = json.loads((FOLDER / 'evidence/software.json').read_text())
        builder = json.loads((FOLDER / 'evidence/common-builder.json').read_text())
        self.assertEqual((software['moduleVersion'], builder['moduleVersion']), ('0.1.1-experimental', '0.1.1-experimental'))
        self.assertEqual((software['imageSha256'], builder['images']['sharedBuilderNative']['sha256']), (IMAGE_0_1_1, IMAGE_0_1_1))

    def test_nothing_of_the_abandoned_standalone_release_remains(self):
        for path in ['release-layout.json', 'tools/compile_package.py', 'tools/verify_native.py', 'reports']:
            self.assertFalse((FOLDER / path).exists(), path)
        document = json.loads((FOLDER / 'octamod.module.json').read_text())
        text = json.dumps(document['compatibility']) + (FOLDER / 'README.md').read_text()
        for phrase in ('Frozen WIP', 'select no companion', 'refuses all fourteen', 'No Core Logger is appended'):
            self.assertNotIn(phrase, text)
        self.assertEqual(document['compatibility']['conflicts'], ['midi-scenes', 'analog-bassdrum'])
        for path in ['sdk/octabam/modules/sidechain-compressor/README.md']:
            self.assertTrue((APP / path).exists())

    def test_release_has_reported_hardware_and_a_clean_folder(self):
        self.assertEqual(RECORD['root'], 'sdk/octabam/modules/sidechain-compressor')
        for path in ['sdk/catalog.json', 'src/catalog/module-documents.json']:
            entries = json.loads((APP / path).read_text())['modules']
            self.assertIn('sidechain-compressor', {entry['id'] for entry in entries})
        for path in ['sdk/module-qualification-baseline.json', 'sdk/module-release-waivers.json']:
            entries = json.loads((APP / path).read_text())['modules']
            self.assertNotIn('sidechain-compressor', {entry['id'] for entry in entries})
        document = json.loads((FOLDER / 'octamod.module.json').read_text())
        self.assertNotIn('build', document)
        q = document['tests']['qualification']
        self.assertEqual((q['hardware']['kind'], q['hardware']['model']), ('functional', 'MKI'))
        self.assertEqual(document['tests']['hardwareStatus'], 'reported')
        self.assertEqual(q['memory']['totalBytes'], 26288)
        self.assertEqual([c['processor'] for c in q['cycles']], ['dsp', 'coldfire'])
        self.assertTrue(all(c['maxConfiguration'] < c['budget'] for c in q['cycles']))
        for path in FOLDER.rglob('*'):
            self.assertFalse(path.is_symlink(), str(path))
            self.assertNotIn(path.name, ['.git', 'out', 'downloads', 'vendor'])
            if '__pycache__' in path.parts:
                continue
            if path.is_file():
                self.assertIn(path.suffix, ['', '.md', '.json', '.py', '.cpp', '.s', '.asm', '.svg', '.png'])
                if path.suffix == '.png':
                    self.assertTrue(path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'))
                else:
                    path.read_text(encoding='utf-8')


if __name__ == '__main__':
    unittest.main()
