# SPDX-License-Identifier: GPL-3.0-or-later
"""Host reconstruction integration, using synthetic bytes and real SDK validators."""
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('host_reconstruction_test', ROOT / 'scripts/octatrack-reconstruction.py')
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)


class HostReconstructionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in (*host.SHARED, 'sdk/machines/octatrack/events.py', 'sdk/machines/octatrack/events.json'):
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, target)
        shutil.copytree(ROOT / 'sdk/firmware_codec', self.root / 'sdk/firmware_codec', ignore=shutil.ignore_patterns('__pycache__'))
        self.folder = self.root / 'sdk/octabam/modules/probe-module'
        self.folder.mkdir(parents=True)
        (self.folder / 'manifest.py').write_text('# Synthetic authored module declaration\n')
        (self.folder / 'unit.s').write_text('# Synthetic authored source provenance\n')
        self.entry = dict(id='probe-module', octabam=True, reconstruction=True, unitName='Probe')
        self.builder = host.load('host_reconstruction_test_builder', self.root / 'sdk/runtime/loader/build.py')
        self.parser = host.load('host_reconstruction_test_parser', self.root / 'sdk/runtime/loader/verify_static.py')
        self.image = bytes(range(64))
        self.literal = self.builder.package(self.image, 8, [0, 0xffffffff, 0xffffffff, 0xffffffff], [48],
                                            name='probe-module', title='Probe', hashed=True, abi=8)
        self.span = self.image[8:24]
        masked = self.image[:8] + bytes(16) + self.image[24:]
        expected = self.builder.package(masked, 8, [0, 0xffffffff, 0xffffffff, 0xffffffff], [48],
                                       name='probe-module', title='Probe', hashed=True, abi=8,
                                       copies=[(8, 0x40001000, 16, bytes.fromhex(host.HASH(self.span)))])
        self.expected = expected
        self.recipe = dict(schema=1, imageSha256=host.HASH(self.image), packageSha256=host.HASH(expected),
                           moduleSources=host.native_inputs(self.folder, ['manifest.py', 'unit.s']),
                           sharedSources={name: host.HASH((self.root / name).read_bytes()) for name in host.SHARED},
                           copies=[dict(offset=8, length=16, address=0x40001000, sha256=host.HASH(self.span),
                                        purpose='Synthetic independently authored code',
                                        authored=dict(source='unit.s', lines=[1, 1], symbol='probe', method='native-unit'))], fills=[])
        self.write(self.recipe)

    def write(self, recipe):
        path = self.root / host.RECIPES
        path.write_text(json.dumps(dict(schema=1, modules={'probe-module': recipe})))

    def test_real_sdk_roundtrip_and_exact_package_pin(self):
        data = host.reconstruct(self.root, self.entry, self.literal,
                                stock_at=lambda address, n: self.span if (address, n) == (0x40001000, 16) else b'')
        self.assertEqual(data, self.expected)
        image, _, _, copies, _ = self.parser.unpack_recipe(data)
        restored = bytearray(image)
        for at, address, n, digest in copies:
            self.assertEqual((address, n, digest.hex()), (0x40001000, 16, host.HASH(self.span)))
            self.assertEqual(restored[at:at+n], bytes(n))
            restored[at:at+n] = self.span
        self.assertEqual(bytes(restored), self.image)
        # CI builds without private firmware; install still checks each guard.
        self.assertEqual(host.reconstruct(self.root, self.entry, self.literal), data)

    def test_changed_build_inputs_image_or_final_metadata_fail(self):
        for field in ('imageSha256', 'packageSha256'):
            with self.subTest(field=field):
                changed = copy.deepcopy(self.recipe); changed[field] = '0' * 64; self.write(changed)
                with self.assertRaises(ValueError):
                    host.reconstruct(self.root, self.entry, self.literal)
        changed = copy.deepcopy(self.recipe)
        changed['sharedSources'][host.SHARED[0]] = '0' * 64; self.write(changed)
        with self.assertRaisesRegex(ValueError, 'source inputs changed'):
            host.reconstruct(self.root, self.entry, self.literal)
        self.write(self.recipe)
        (self.folder / 'unit.s').write_text('# Source changed, even when an image could remain identical\n')
        with self.assertRaisesRegex(ValueError, 'source inputs changed'):
            host.reconstruct(self.root, self.entry, self.literal)

    def test_test_and_diagnostic_edits_do_not_invalidate_build(self):
        for name in ('scanner_probe.c', 'test_engine.c', 'test_ui.c'):
            source = self.folder / name
            for text in ('/* New test or diagnostic */\n', '/* Edited test or diagnostic */\n'):
                source.write_text(text)
                self.assertEqual(host.reconstruct(self.root, self.entry, self.literal), self.expected)

    def test_sdk_update_refreshes_shared_pins_without_editing_module(self):
        module_before = {p.name: p.read_bytes() for p in self.folder.iterdir()}
        source = self.root / host.SHARED[0]
        source.write_bytes(source.read_bytes() + b'\n# SDK-only comment change\n')
        with self.assertRaisesRegex(ValueError, 'source inputs changed'):
            host.reconstruct(self.root, self.entry, self.literal)
        changed = copy.deepcopy(self.recipe)
        changed['sharedSources'][host.SHARED[0]] = host.HASH(source.read_bytes())
        self.write(changed)
        self.assertEqual(host.reconstruct(self.root, self.entry, self.literal), self.expected)
        self.assertEqual({p.name: p.read_bytes() for p in self.folder.iterdir()}, module_before)

    def test_unregistered_module_and_unsafe_input_paths_are_refused(self):
        path = self.root / host.RECIPES
        path.write_text(json.dumps(dict(schema=1, modules={})))
        with self.assertRaisesRegex(ValueError, 'No SDK reconstruction'):
            host.reconstruct(self.root, self.entry, self.literal)
        for name in ('../outside.c', '/outside.c', 'nested/../unit.s', 'nested//unit.s'):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'module-relative'):
                host.native_inputs(self.folder, ['manifest.py', 'unit.s', name])
        (self.folder / 'alias.s').symlink_to(self.folder / 'unit.s')
        with self.assertRaisesRegex(ValueError, 'symlinks'):
            host.native_inputs(self.folder, ['manifest.py', 'alias.s'])

    def test_stock_mismatch_protected_sources_and_owned_events_fail(self):
        with self.assertRaisesRegex(ValueError, 'original-stock spans differ'):
            host.reconstruct(self.root, self.entry, self.literal, stock_at=lambda a, n: bytes(n))
        changed = copy.deepcopy(self.recipe); changed['copies'][0]['address'] = 0x400dfec2; self.write(changed)
        with self.assertRaisesRegex(ValueError, 'patchable OS range'):
            host.reconstruct(self.root, self.entry, self.literal)
        registry = self.builder.site_events()
        event = next(e for e in registry['events'] if e['site'] is not None)
        changed['copies'][0]['address'] = event['site']; self.write(changed)
        with self.assertRaisesRegex(ValueError, 'base owns'):
            host.reconstruct(self.root, self.entry, self.literal)

    def test_alternate_build_modes_fills_and_foreign_provenance_are_refused(self):
        for key, value in (('standalone', True), ('base', True), ('sources', ['foreign.c']), ('slots', 'fx2')):
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'ordinary octabam'):
                host.reconstruct(self.root, {**self.entry, key: value}, self.literal)
        changed = copy.deepcopy(self.recipe); changed['fills'] = [dict(offset=0, length=1, value=1)]; self.write(changed)
        with self.assertRaisesRegex(ValueError, 'without fills'):
            host.reconstruct(self.root, self.entry, self.literal)
        changed = copy.deepcopy(self.recipe); changed['copies'][0]['authored']['source'] = '../foreign.s'; self.write(changed)
        with self.assertRaisesRegex(ValueError, 'this module'):
            host.reconstruct(self.root, self.entry, self.literal)


class CommittedReconstructionInputsTests(unittest.TestCase):
    def test_sdk_changes_cannot_leave_committed_recipe_pins_stale(self):
        document = json.loads((ROOT / host.RECIPES).read_text())
        for module in document['modules']:
            with self.subTest(module=module):
                recipe = host.reviewed(ROOT, module)
                self.assertEqual(recipe['sharedSources'],
                                 {name: host.HASH((ROOT / name).read_bytes()) for name in host.SHARED})
                # Pending recipes may describe a draft, without admitting it
                # through the production module_folder/package route.
                folder = ROOT / 'sdk/octabam/modules' / module
                if not folder.is_dir():
                    folder = ROOT / 'sdk/drafts' / module
                self.assertEqual(host.native_inputs(folder, recipe['moduleSources']), recipe['moduleSources'])


if __name__ == '__main__':
    unittest.main()
