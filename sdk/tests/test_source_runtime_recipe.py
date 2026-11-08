"""Firmware-free rejection and reconstruction checks for source build recipes."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('tested_generic_runtime_recipe', ROOT / 'scripts/source-runtime-package.py')
runtime = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(runtime)


class RecipeBoundaries(unittest.TestCase):
    def test_source_paths_refuse_traversal_absolute_other_module_and_symlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp).resolve()
            (folder / 'source.c').write_text('int entry(void) { return 0; }\n')
            (folder / 'alias.c').symlink_to(folder / 'source.c')
            # Assert the policy reason so a nonexistent fixture cannot hide a bypass.
            cases = (('../source.c', 'confined relative source path'),
                     ('/tmp/source.c', 'confined relative source path'),
                     ('@/sdk/octabam/modules/other/source.c', 'Shared paths must belong'),
                     ('alias.c', 'symlinked source path'))
            for value, reason in cases:
                with self.subTest(value=value), self.assertRaisesRegex(ValueError, reason):
                    runtime.source_path(ROOT, folder, value)

    def test_header_symlink_refuses_before_loading_sdk_or_running_compiler(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = root / 'sdk/drafts/demo'
            folder.mkdir(parents=True)
            (folder / 'entry.c').write_text('int entry(void) { return 0; }\n')
            (root / 'private.h').write_text('outside module\n')
            (folder / 'alias.h').symlink_to(root / 'private.h')
            doc = dict(schema=1, id='demo', title='DEMO', layout=1,
                       sources=[dict(path='entry.c')], includes=['.'], defines=[],
                       runtime='runtime.json', base={}, reconstruction='recipe.json', forbiddenPrefixes=[])
            recipe = folder / 'runtime-build.json'
            recipe.write_text(json.dumps(doc))
            with self.assertRaisesRegex(ValueError, 'symlinked source path'):
                runtime.declaration(root, recipe)

    def test_unpublished_or_moved_export_refuses_without_an_identity_pin(self):
        spec = dict(runOrigin=0x40a95600, imports=['not_a_published_export'])
        with self.assertRaisesRegex(ValueError, 'published export'):
            runtime.base_binding(ROOT, spec)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture_base(root)
            spec['imports'] = ['base_api']
            imports, _, proof, _ = runtime.base_binding(root, spec)
            self.assertEqual(imports['base_api'], 0x40a95620)
            package = root / 'src/engine/assets/octatrack-base.elemod'
            doc = json.loads(package.read_text())
            doc['exports'].remove('base_api')
            package.write_text(json.dumps(doc))
            with self.assertRaisesRegex(ValueError, 'published export'):
                runtime.base_binding(root, spec)
            doc['exports'].append('base_api')
            for value in (['abs', 32], ['.run', -1], ['.run', 512]):
                doc['symbols']['base_api'] = value
                package.write_text(json.dumps(doc))
                with self.subTest(value=value), self.assertRaisesRegex(ValueError, 'inside its runtime'):
                    runtime.base_binding(root, spec)
            fixture_base(root, '2' * 64, 96)
            imports, _, changed, _ = runtime.base_binding(root, spec)
            self.assertEqual(imports['base_api'], 0x40a95660)
            self.assertNotEqual(proof['identity'], changed['identity'])
            self.assertNotEqual(proof['packageSha256'], changed['packageSha256'])

    def test_protected_copy_uses_an_identical_unowned_span(self):
        image = bytes(range(1, 17))
        item = dict(offset=0, address=0x40000400, length=16,
                    sha256=hashlib.sha256(image).hexdigest(), purpose='authored coincidence')
        result = runtime.bounded_capture(dict(copies=[item]), image,
                                         image + bytes(32) + image, 0x40000400,
                                         dict(sites=[dict(addr='40000400', len=16)]), dict(events=[]))
        self.assertEqual(result['copies'][0]['address'], 0x40000430)
        self.assertEqual(result['copies'][0]['sha256'], item['sha256'])


def fixture_base(root, identity='1' * 64, offset=32):
    binding = root / 'sdk/machines/octatrack/base-binding.json'
    package = root / 'src/engine/assets/octatrack-base.elemod'
    binding.parent.mkdir(parents=True, exist_ok=True)
    package.parent.mkdir(parents=True, exist_ok=True)
    binding.write_text(json.dumps({'identity': identity}))
    package.write_text(json.dumps({'sections': {'.run': {'len': 512}},
                                   'exports': ['base_api', 'base_data'],
                                   'symbols': {'base_api': ['.run', offset],
                                               'base_data': ['.run', offset + 16]}, 'sites': []}))


@unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'ColdFire cross compiler required')
class FollowingBase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        for relative in runtime.SHARED:
            destination = self.root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, destination)
        # Keep the test out of the repository so catalogue/build readers cannot
        # observe a transient draft. Only authored SDK Python/header inputs.
        shutil.copytree(ROOT / 'sdk/firmware_codec', self.root / 'sdk/firmware_codec')
        fixture_base(self.root)
        self.folder = self.root / 'sdk/drafts/demo'
        self.folder.mkdir(parents=True)
        (self.folder / 'entry.c').write_text(
            'struct api { volatile unsigned value; };\n'
            'extern unsigned base_api(unsigned);\nextern unsigned base_data[];\n'
            'unsigned *base_ref = base_data + 3;\n'
            'void module_tick(struct api *a) { a->value = base_api(5) + base_ref[0]; }\n')
        (self.folder / 'runtime.json').write_text(json.dumps(
            {'schema': 1, 'subscribe': [{'event': 'module_tick', 'fn': 'module_tick'}]}))
        self.doc = dict(schema=1, id='demo', title='DEMO', layout=1,
                        sources=[{'path': 'entry.c'}], includes=['.'], defines=[],
                        runtime='runtime.json', base={'runOrigin': 0x40a95600,
                                                     'imports': ['base_api', 'base_data']},
                        reconstruction='reconstruction.json', forbiddenPrefixes=[])
        self.recipe = self.folder / 'runtime-build.json'
        self.recipe.write_text(json.dumps(self.doc))

    def capture_synthetic_recipe(self):
        work = self.root / 'compiled'
        work.mkdir()
        result = runtime.compile_image(self.root, self.recipe, 'm68k-elf-', work)
        _, _, _, image, _, _, _, _, inputs, _, binding = result
        self.records = dict(schema=1, imageSha256=hashlib.sha256(runtime.reviewed_image(image, binding)).hexdigest(),
                            sources=runtime.reviewed_inputs(self.root, self.folder, self.doc, inputs),
                            baseImports=binding['relocations'], copies=[], fills=[])
        self.save_records()
        return result

    def save_records(self):
        (self.folder / 'reconstruction.json').write_text(json.dumps(self.records))

    def test_rebuild_and_check_follow_changed_base_identity_hash_and_export_addresses(self):
        result = self.capture_synthetic_recipe()
        self.assertEqual({r['name'] for r in result[-1]['relocations']}, {'base_api', 'base_data'})
        self.assertIn(12, [r['addend'] for r in result[-1]['relocations']])
        first, before = runtime.build(self.root, self.recipe, self.root / 'first.mwrm')
        fixture_base(self.root, '2' * 64, 32)
        same, identity_only = runtime.build(self.root, self.recipe, self.root / 'identity-only.mwrm')
        self.assertEqual(first, same, 'A base identity/hash change alone must not change runtime code')
        self.assertEqual(identity_only['baseIdentity'], '2' * 64)
        fixture_base(self.root, '2' * 64, 96)
        second, after = runtime.build(self.root, self.recipe, self.root / 'second.mwrm')
        self.assertNotEqual(first, second)
        self.assertNotEqual(before['basePackageSha256'], after['basePackageSha256'])
        self.assertEqual(after['baseIdentity'], '2' * 64)
        self.assertEqual(before['reviewedImageSha256'], after['reviewedImageSha256'])
        self.assertNotEqual(before['authoredImageSha256'], after['authoredImageSha256'])
        for data in (first, second):
            self.assertNotIn(bytes.fromhex('1' * 64), data)
            self.assertNotIn(bytes.fromhex('2' * 64), data)
        snapshot = {p.relative_to(self.root): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        # Even without python -B, check mode must not leave SDK bytecode.
        checked = subprocess.run([sys.executable, str(self.root / 'scripts/source-runtime-package.py'),
                                  '--recipe', str(self.recipe), '--check'], capture_output=True, text=True)
        self.assertEqual(checked.returncode, 0, checked.stderr)
        self.assertEqual(json.loads(checked.stdout)['sha256'], after['sha256'])
        self.assertEqual(snapshot, {p.relative_to(self.root): p.read_bytes()
                                    for p in self.root.rglob('*') if p.is_file()})
        capture = self.root / 'forbidden-capture.json'
        refused = subprocess.run([sys.executable, '-B', str(self.root / 'scripts/source-runtime-package.py'),
                                  '--recipe', str(self.recipe), '--check', '--capture-stock-recipe', str(capture)],
                                 capture_output=True, text=True)
        self.assertEqual(refused.returncode, 2)
        self.assertIn('--check cannot capture', refused.stderr)
        self.assertFalse(capture.exists())

    def test_changed_authored_source_or_reviewed_import_map_still_refuses(self):
        self.capture_synthetic_recipe()
        self.records['baseImports'][0]['name'] = 'base_data'
        self.save_records()
        with self.assertRaisesRegex(ValueError, 'Reviewed base-import'):
            runtime.build(self.root, self.recipe, self.root / 'bad.mwrm')
        # Recapture only our synthetic review fixture, never production input.
        shutil.rmtree(self.root / 'compiled')
        self.capture_synthetic_recipe()
        source = self.folder / 'entry.c'
        source.write_text(source.read_text().replace('base_api(5)', 'base_api(9)'))
        with self.assertRaisesRegex(ValueError, 'exact source/image inputs'):
            runtime.build(self.root, self.recipe, self.root / 'bad.mwrm')

    def test_copy_cannot_cover_dynamic_import_and_relative_import_is_rejected(self):
        result = self.capture_synthetic_recipe()
        at = result[-1]['relocations'][0]['offset']
        self.records['copies'] = [dict(offset=at, length=4, address=0x40001000,
                                      sha256=hashlib.sha256(bytes(4)).hexdigest(), purpose='synthetic overlap')]
        self.save_records()
        with self.assertRaisesRegex(ValueError, 'overlaps a dynamic base-import'):
            runtime.build(self.root, self.recipe, self.root / 'bad.mwrm')
        self.doc['sources'] = [{'path': 'entry.s'}]
        self.recipe.write_text(json.dumps(self.doc))
        (self.folder / 'entry.s').write_text(
            '.text\n.global module_tick\n.type module_tick,@function\n'
            'module_tick:\n.long base_api - .\nrts\n.size module_tick,.-module_tick\n')
        work = self.root / 'relative'
        work.mkdir()
        # The existing two-origin linker rejects a PC-relative reference to
        # a fixed base address before import metadata is even inspected.
        with self.assertRaisesRegex(ValueError, 'reference the base cannot relocate'):
            runtime.compile_image(self.root, self.recipe, 'm68k-elf-', work)


if __name__ == '__main__':
    unittest.main()
