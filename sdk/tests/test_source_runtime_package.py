"""FRACT source confinement, base-following builds and package admission metadata."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('tested_source_runtime', ROOT / 'scripts/source-runtime-package.py')
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)
MODULE = ROOT / 'sdk/drafts/fract-machine'


class SourceRecipe(unittest.TestCase):
    def test_declaration_names_both_machine_tables_and_all_native_units(self):
        doc, _, units, _, _, declared, pack = runtime.declaration(ROOT, MODULE / 'runtime-build.json')
        events = {e['event'] for e in pack.entries(declared)}
        self.assertTrue({'ot_machines', 'ot_machine_starts', 'module_tick', 'module_draw'} <= events)
        self.assertEqual(sum(p.suffix == '.c' for p, _ in units), 10)
        self.assertEqual(sum(p.suffix == '.s' for p, _ in units), 1)
        imports, _, provenance, _ = runtime.base_binding(ROOT, doc['base'])
        self.assertEqual(set(imports), {'mw_stock_pool_open'})
        self.assertEqual(set(doc['base']), {'runOrigin', 'imports'})
        binding = json.loads((ROOT / 'sdk/machines/octatrack/base-binding.json').read_text())
        self.assertEqual(provenance['identity'], binding['identity'])

    def test_sources_cannot_escape_or_borrow_another_module(self):
        for value in ('../machine.c', '/tmp/machine.c', '@/sdk/octatrack/modules/poly8/pool.c',
                      '@/sdk/octabam/modules/poly8/pool.c'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                runtime.source_path(ROOT, MODULE, value)
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / 'link').symlink_to(MODULE / 'machine.c')
            with self.assertRaises(ValueError):
                runtime.path_in(folder, 'link')

    def test_identity_pins_and_nonexported_import_refuse(self):
        base = json.loads((MODULE / 'runtime-build.json').read_text())['base']
        with self.assertRaisesRegex(ValueError, 'Invalid base binding fields'):
            runtime.base_binding(ROOT, dict(base, identity='0' * 64))
        with self.assertRaisesRegex(ValueError, 'published export'):
            runtime.base_binding(ROOT, dict(base, imports=['not_a_published_export']))

    def test_header_symlinks_refuse_before_the_compiler_runs(self):
        doc = json.loads((MODULE / 'runtime-build.json').read_text())
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = root / 'sdk/drafts/demo'
            folder.mkdir(parents=True)
            (folder / 'entry.c').write_text('int entry(void) { return 0; }\n')
            (root / 'private.h').write_text('not a source header\n')
            (folder / 'leak.h').symlink_to(root / 'private.h')
            doc.update(id='demo', sources=[{'path': 'entry.c'}], includes=['.'])
            recipe = folder / 'runtime-build.json'
            recipe.write_text(json.dumps(doc))
            with self.assertRaisesRegex(ValueError, 'symlinked source path'):
                runtime.declaration(root, recipe)

    def test_bounded_capture_relocates_protected_coincidence(self):
        image = bytes(range(1, 17))
        stock = image + bytes(32) + image
        # First copy is in a site owned by the base; identical later bytes are usable.
        item = {'offset': 0, 'address': 0x40000400, 'length': len(image),
                'sha256': runtime.hashlib.sha256(image).hexdigest(), 'purpose': 'authored coincidence'}
        made = runtime.bounded_capture({'copies': [item]}, image, stock, 0x40000400,
                                       {'sites': [{'addr': '40000400', 'len': 16}]}, {'events': []})
        self.assertEqual(made['copies'][0]['address'], 0x40000430)
        self.assertEqual(made['copies'][0]['sha256'], item['sha256'])

    def test_release_row_matches_named_receipt_and_scoped_hardware_report(self):
        row = json.loads((MODULE / 'release/package-entry.json').read_text())
        proof = json.loads((MODULE / 'release/candidate-proof.json').read_text())
        manifest = json.loads((MODULE / 'octamod.module.json').read_text())
        self.assertIs(row['base'], True)
        self.assertEqual(row['requiredBase'], proof['baseIdentity'])
        self.assertEqual(row['sha256'], proof['sha256'])
        self.assertEqual(row['bytes'], proof['bytes'])
        self.assertEqual(row['version'], proof['version'])
        self.assertEqual(row['version'], manifest['version'])
        self.assertEqual(proof['hardware'], 'FUNCTIONAL_OWNER_REPORT_AND_USB_READBACK')
        self.assertEqual(manifest['tests']['hardwareStatus'], 'reported')
        report = (MODULE / 'release' / proof['hardwareReport']).read_text()
        self.assertIn(proof['sha256'], report)
        self.assertIn(proof['baseIdentity'], report)
        self.assertIn(manifest['source']['revision'], report)
        self.assertIn('not complete release qualification', report)

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'ColdFire compiler unavailable')
    def test_machine_build_follows_committed_base_without_firmware(self):
        row = json.loads((MODULE / 'release/package-entry.json').read_text())
        with tempfile.TemporaryDirectory() as tmp:
            data, proof = runtime.build(ROOT, MODULE / 'runtime-build.json', Path(tmp) / 'candidate.mwrm')
        recipe = json.loads((MODULE / 'release/reconstruction.json').read_text())
        self.assertEqual(proof['reviewedImageSha256'], recipe['imageSha256'])
        # A draft receipt describes one build. A later base refresh may relink
        # the import word without manually refreshing an unlisted receipt.
        if row['requiredBase'] == proof['baseIdentity']:
            self.assertEqual(proof['sha256'], row['sha256'])
            self.assertEqual(len(data), row['bytes'])
        self.assertEqual(data[28:32].hex(), row['module'])
        self.assertEqual(proof['stockVerification'], 'NOT_RUN')
        self.assertEqual(proof['stockCopies'], 9)
        binding = json.loads((ROOT / 'sdk/machines/octatrack/base-binding.json').read_text())
        self.assertEqual(proof['baseIdentity'], binding['identity'])
        self.assertEqual(proof['baseImports'], [{'offset': 14660, 'name': 'mw_stock_pool_open', 'addend': 0}])
        self.assertNotIn(bytes.fromhex(proof['baseIdentity']), data)


@unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'ColdFire compiler unavailable')
class FollowingBase(unittest.TestCase):
    def test_full_machine_relinks_without_recipe_recapture(self):
        # Copy only committed build inputs; no firmware, device or global file
        # mutations. The engine and its reviewed reconstruction stay identical.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for relative in ('sdk/runtime', 'sdk/firmware_codec', 'sdk/machines/octatrack', 'sdk/drafts/fract-machine'):
                shutil.copytree(ROOT / relative, root / relative,
                                ignore=shutil.ignore_patterns('__pycache__'))
            for relative in ('scripts/source-runtime-package.py', 'src/engine/assets/octatrack-base.elemod'):
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / relative, target)
            recipe = root / 'sdk/drafts/fract-machine/runtime-build.json'
            before, first = runtime.build(root, recipe, root / 'before.mwrm')
            metadata = root / 'sdk/machines/octatrack/base-binding.json'
            binding = json.loads(metadata.read_text())
            binding['identity'] = 'a' * 64
            metadata.write_text(json.dumps(binding))
            base_file = root / 'src/engine/assets/octatrack-base.elemod'
            base = json.loads(base_file.read_text())
            base['symbols']['mw_stock_pool_open'][1] += 4
            base_file.write_text(json.dumps(base))
            after, second = runtime.build(root, recipe, root / 'after.mwrm')
            self.assertNotEqual(before, after)
            self.assertNotEqual(first['basePackageSha256'], second['basePackageSha256'])
            self.assertEqual(second['baseIdentity'], 'a' * 64)
            self.assertEqual(first['reviewedImageSha256'], second['reviewedImageSha256'])
            self.assertEqual(first['baseImports'], second['baseImports'])
            self.assertNotIn(bytes.fromhex(first['baseIdentity']), after)
            self.assertNotIn(bytes.fromhex(second['baseIdentity']), after)
            # Exercise the real base-refresh command on prospective promoted
            # rows, entirely inside this fixture. No existing public package is
            # supplied: without base:true the base-only skip would fail.
            promoted = root / 'sdk/octatrack/modules/fract-machine'
            shutil.copytree(root / 'sdk/drafts/fract-machine', promoted)
            for name in ('octatrack-module-packages.py', 'runtime_private_paths.py'):
                shutil.copyfile(ROOT / 'scripts' / name, root / 'scripts' / name)
            row = json.loads((promoted / 'release/package-entry.json').read_text())
            manifest = root / 'src/engine/assets/octatrack-module-packages.json'
            manifest.write_text(json.dumps({'packages': [row]}))
            (root / 'src/engine/assets/dsp-packages.json').write_text('{"packages": []}')
            (root / 'sdk/catalog.json').write_text(json.dumps({
                'modules': [{'id': row['id'], 'version': row['version']}]}))
            command = [sys.executable, '-B', str(root / 'scripts/octatrack-module-packages.py'), '--base-only']
            subprocess.run(command, cwd=root, check=True, capture_output=True)
            refreshed = json.loads(manifest.read_text())['packages'][0]
            self.assertEqual(refreshed['requiredBase'], second['baseIdentity'])
            self.assertEqual(refreshed['sha256'], second['sha256'])
            self.assertEqual((root / 'public' / refreshed['path']).read_bytes(), after)
            subprocess.run([*command, '--check'], cwd=root, check=True, capture_output=True)
            del base['symbols']['mw_stock_pool_open']
            base_file.write_text(json.dumps(base))
            with self.assertRaisesRegex(ValueError, 'inside its runtime'):
                runtime.build(root, recipe, root / 'missing.mwrm')


if __name__ == '__main__':
    unittest.main()
