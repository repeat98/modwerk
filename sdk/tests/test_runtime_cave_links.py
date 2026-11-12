# SPDX-License-Identifier: GPL-3.0-or-later
"""Synthetic cave placement negatives; no firmware, public admission or USB."""
import importlib.util
from pathlib import Path
import shutil
import struct
import tempfile
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('runtime_cave_adapter_test', ROOT / 'sdk/machines/octatrack/module-adapters/cave_runtime.py')
cave = importlib.util.module_from_spec(spec); spec.loader.exec_module(cave)
spec = importlib.util.spec_from_file_location('runtime_cave_native_builder', ROOT / 'sdk/runtime/loader/build.py')
builder = importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)


class CavePortTests(unittest.TestCase):
    def test_relocations_cannot_escape_or_overlap_owned_memory(self):
        image = struct.pack('>IIII', 8, 12, 0, 0)
        cave.validate_relocations(image, [0, 4], 16)
        for offsets, end, spans in (([0, 0], 16, ()), ([4, 0], 16, ()), ([2, 4], 16, ()),
                                    ([-2], 16, ()), ([14], 16, ()), ([0], 8, ()), ([0], 16, ((2, 2),))):
            with self.subTest(offsets=offsets, end=end), self.assertRaises(ValueError):
                cave.validate_relocations(image, offsets, end, spans)
        # A wrapped negative label difference must not become a pool pointer.
        with self.assertRaisesRegex(ValueError, 'escapes'):
            cave.validate_relocations(struct.pack('>I', 0xfffffffc), [0], 16)
        with self.assertRaisesRegex(ValueError, 'wraps'):
            cave.placed(struct.pack('>I', 8), [0], 0xfffffffc)

    def test_relocation_mutation_and_short_references_are_refused(self):
        low = struct.pack('>HIHI', 0x4e71, 8, 0x4e75, 0x40001854)
        high = struct.pack('>HIHI', 0x4e71, 0x10008, 0x4e75, 0x40001854)
        self.assertEqual(builder.relocations(low, high, 16), [2])
        broken = bytearray(high); broken[-1] ^= 1
        with self.assertRaisesRegex(ValueError, 'cannot relocate'):
            builder.relocations(low, bytes(broken), 16)
        with self.assertRaisesRegex(ValueError, 'cannot relocate'):
            builder.relocations(bytes.fromhex('4e710008'), bytes.fromhex('4e71000a'), 16)

    def test_sources_pin_recursive_includes_and_refuse_binary_or_outside_inputs(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve(); (root / 'fix.inc').write_text('rts\n')
            source = root / 'main.s'; source.write_text('.include "fix.inc"\n')
            self.assertEqual(cave.source_files(root, 'main.s'), {source, root / 'fix.inc'})
            for text in ('.include "../missing.inc"\n', '.incbin "firmware.bin"\n'):
                source.write_text(text)
                with self.assertRaises(ValueError):
                    cave.source_files(root, 'main.s')

    def test_unported_resources_never_gain_admission_by_using_the_helper(self):
        for resource in ('requires', 'tables', 'keeps', 'overrides', 'linked', 'detours', 'dsp'):
            module = SimpleNamespace(name='cc-map', cf_patches=[object()], **{resource: [object()]})
            with self.subTest(resource=resource), self.assertRaisesRegex(ValueError, 'Unported'):
                cave.validate_manifest(module)
        with self.assertRaisesRegex(ValueError, 'Unported'):
            cave.validate_manifest(SimpleNamespace(name='not-ported', cf_patches=[]))

    def test_actual_native_links_match_inside_a_runtime_pool(self):
        if not shutil.which('m68k-elf-as'):
            self.skipTest('no native ColdFire assembler')
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp).resolve(); source = root / 'owned.s'
            source.write_text('.text\n.global entry\nentry:\njmp target:l\ntarget:\nrts\n.long entry\n')
            obj = root / 'owned.o'; cave.run(['m68k-elf-as', '-mcpu=5475', source, '-o', obj])
            low, _, bss = cave.link_objects(builder, [obj], 'm68k-elf-', 0, root / 'low')
            high, _, _ = cave.link_objects(builder, [obj], 'm68k-elf-', builder.SHIFT, root / 'high')
            offsets = builder.relocations(low, high, len(low) + bss)
            self.assertEqual(offsets, [2, 8])
            cave.validate_relocations(low, offsets, len(low) + bss)
            for origin in (0x48c1ef80, 0x48c21f80):
                fresh, _, _ = cave.link_objects(builder, [obj], 'm68k-elf-', origin, root / hex(origin))
                self.assertEqual(cave.placed(low, offsets, origin), fresh)
            with self.assertRaisesRegex(ValueError, 'reviewed'):
                cave.link_objects(builder, [obj], 'm68k-elf-', 0, root / 'bad', [('CC_NEXT', 'foreign_handler')])


if __name__ == '__main__':
    unittest.main()
