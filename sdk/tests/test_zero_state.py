"""Exact private DSP loader zero-state seams, real ColdFire object placement and the linked BSS proof."""
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[2]
ELEK = ROOT / 'sdk/machines/octatrack/elekloader'
sys.path.append(str(ELEK))
import zero_state

spec = importlib.util.spec_from_file_location('zero_state_core_fixture', ELEK / 'build_core.py')
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)


def raw(name):
    return (core.DYNLOAD / name).read_text()


def generated(name, text):
    """The DSP/width seams build_core applies before zero_state (the resident board seams leave these lines alone)."""
    for old, new in core.DSP_EDITS.get(name, ()) + core.WIDTH_EDITS.get(name, ()):
        if text.count(old) != 1:
            raise AssertionError(old)
        text = text.replace(old, new)
    return text


class ZeroStateSeams(unittest.TestCase):
    def test_restores_exactly_and_keeps_nonzero_initializers(self):
        kept = {'manager.c': ('static int base_index=-1;', 'static uint32_t auto_serial=0x80000000u;',
                              'volatile uint32_t dl_residency_enabled=1;', 'volatile uint32_t dl_bypass_unbound=1;',
                              'volatile uint32_t dl_reinit=0,dl_parked=0,dl_reinit_enabled=1;'),
                'transfer.c': ('dl_pool_base[2]={MODWERK_DSP_TABLE0,MODWERK_DSP_TABLE1}',),
                'selection.c': ('static uint8_t paste[6322];',)}
        self.assertEqual(set(zero_state.UNITS), set(kept))
        for name, (_, seams) in zero_state.UNITS.items():
            with self.subTest(name=name):
                text = generated(name, raw(name))
                changed = zero_state.unit(name, text, raw(name))
                restored = changed
                for old, new, _ in seams:
                    self.assertNotIn(old, changed)
                    restored = restored.replace(new, old)
                self.assertEqual(restored, text)
                for declaration in kept[name]:
                    self.assertIn(declaration, changed)

    def test_refuses_reference_drift_nonzero_duplicate_missing_and_reapplication(self):
        for name, (_, seams) in zero_state.UNITS.items():
            text = generated(name, raw(name))
            first, last = seams[0][0], seams[-1][0]
            changes = (text.replace(first, first.replace('0', '1', 1)), text.replace(last, ''),
                       text + '\n' + last + '\n', zero_state.unit(name, text, raw(name)))
            for changed in changes:
                with self.subTest(name=name, changed=changed[-55:]), self.assertRaisesRegex(ValueError, 'review the private BSS port'):
                    zero_state.unit(name, changed, raw(name))
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'review the private BSS port'):
                zero_state.unit(name, text, raw(name) + '\n')

    @unittest.skipUnless(all(shutil.which(tool) for tool in ('m68k-elf-gcc', 'm68k-elf-nm', 'm68k-elf-objcopy')),
                         'ColdFire tools unavailable')
    def test_actual_o2_text_identical_and_only_listed_zero_objects_move_to_bss(self):
        flags = ['-mcpu=54455', '-O2', '-std=c99', '-ffreestanding', '-fno-builtin', '-nostdlib',
                 '-fno-pic', '-fno-pie', '-fomit-frame-pointer', '-fno-common',
                 '-fno-zero-initialized-in-bss', '-fno-tree-loop-distribute-patterns',
                 '-fno-merge-constants', '-fno-asynchronous-unwind-tables', '-fno-unwind-tables',
                 '-Wall', '-Wextra', '-Werror', '-DMODWERK_FX_IDS=128u',
                 '-DMODWERK_DSP_ALLOWANCE0=3120', '-DMODWERK_DSP_ALLOWANCE1=3565',
                 '-DMODWERK_DSP_TABLE0=4096', '-DMODWERK_DSP_TABLE1=4096',
                 '-DMODWERK_DSP_WORDS0=2000', '-DMODWERK_DSP_WORDS1=2000']
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            for name in core.DYNLOAD_SOURCES:
                if name.endswith('.h'):
                    (work / name).write_text(generated(name, raw(name)))
            shutil.copyfile(ELEK / 'fxids.h', work / 'fxids.h')
            for unit in zero_state.UNITS:
                outputs = {}
                baseline = generated(unit, raw(unit))
                for kind, text in (('baseline', baseline), ('bss', zero_state.unit(unit, baseline, raw(unit)))):
                    c = work / (kind + '-' + unit)
                    c.write_text(text)
                    obj = work / (c.name + '.o')
                    compiled = subprocess.run(['m68k-elf-gcc', *flags, '-I' + str(work), '-c', str(c), '-o', str(obj)],
                                              capture_output=True, text=True)
                    self.assertEqual(compiled.returncode, 0, compiled.stderr)
                    dumped = work / (c.name + '.text')
                    extracted = subprocess.run(['m68k-elf-objcopy', '--dump-section', '.text=' + str(dumped), str(obj)],
                                               capture_output=True, text=True)
                    self.assertEqual(extracted.returncode, 0, extracted.stderr)
                    outputs[kind] = (dumped.read_bytes(), {fields[3]: (int(fields[1], 16), fields[2]) for line in
                                     subprocess.check_output(['m68k-elf-nm', '-S', str(obj)], text=True).splitlines()
                                     if len(fields := line.split()) == 4})
                with self.subTest(unit=unit):
                    self.assertEqual(outputs['baseline'][0], outputs['bss'][0])
                    before, after = outputs['baseline'][1], outputs['bss'][1]
                    self.assertEqual(set(before), set(after))
                    for name, (size, kind) in before.items():
                        moved = name in zero_state.MOVED[unit]
                        self.assertEqual(after[name], (size, kind.translate(str.maketrans('dD', 'bB'))) if moved else (size, kind), name)
                        if moved:
                            self.assertIn(kind, 'dD', name)


class LinkedProof(unittest.TestCase):
    """Synthetic link facts: layout, symbols and boot text stand in for an actual final link."""
    BSS = [0x40ae0000, 0x40ae0000 + 0x8000]

    def link(self, **changes):
        sections = [SimpleNamespace(idx=1, name='.run'), SimpleNamespace(idx=2, name='.bss')]
        symbol = lambda name, value, size, bind=0, shndx=2, typ=1: SimpleNamespace(
            name=name, value=value, size=size, bind=bind, type=typ, shndx=shndx)
        symbols = [symbol('manager.c', 0, 0, typ=4), symbol('allocator', 0x10, 3164), symbol('buffers', 0xc80, 246),
                   symbol('transfer.c', 0, 0, typ=4), symbol('jobs', 0x2200, 60), symbol('pending', 0x2240, 4),
                   symbol('selection.c', 0, 0, typ=4), symbol('pending', 0x2244, 4),
                   symbol('dl_tx', 0x2300, 256, bind=1)]
        symbols = changes.pop('symbols', lambda s: s)(symbols)
        layout = dict(bss=list(self.BSS), sections={'core .bss': self.BSS[0]})
        mapping = dict(__bss_start=self.BSS[0], __bss_words=0x2000, modwerk_retained_start=self.BSS[0] + 0x4000,
                       modwerk_retained_end=self.BSS[0] + 0x6000, dl_tx=self.BSS[0] + 0x2300)
        mapping.update(changes.pop('mapping', {}))
        moved = changes.pop('moved', {'manager.c': ('allocator', 'buffers'), 'transfer.c': ('jobs', 'pending', 'dl_tx'),
                                      'selection.c': ('pending',)})
        bootstrap = changes.pop('bootstrap', '        ' + core.BOOT_CLEAR_START + '\n| MODWERK-SEAM: retained-skip\n')
        switches = changes.pop('switches', {'MW_RETAINED_SKIP': '1'})
        return core.check_zero_state(SimpleNamespace(sections=sections, symbols=symbols), moved, layout, mapping, bootstrap,
                                     switches)

    def test_accepts_objects_inside_the_clear_and_outside_the_skip(self):
        proof = self.link()
        self.assertEqual(proof['objects']['manager.c:allocator'], dict(address='0x40ae0010', uncachedAddress='0x48ae0010', bytes=3164))
        self.assertEqual(proof['objects']['selection.c:pending']['address'], '0x40ae2244')
        self.assertEqual(proof['bytes'], 3164 + 246 + 60 + 4 + 256 + 4)
        self.assertFalse(proof['hardware'])

    def test_refuses_every_unproven_placement(self):
        def move(name, **fields):
            def edit(symbols):
                for y in symbols:
                    if y.name == name and y.type == 1:
                        y.__dict__.update(fields)
                return symbols
            return edit
        for label, changes in (
                ('still in .data', dict(symbols=move('allocator', shndx=1))),
                ('overlaps retained start', dict(symbols=move('buffers', value=0x3ff0, size=32))),
                ('inside retained', dict(symbols=move('jobs', value=0x5000))),
                ('past the clear', dict(symbols=move('dl_tx', value=0x7f80), mapping=dict(dl_tx=self.BSS[0] + 0x7f80))),
                ('global address disagrees with the map', dict(mapping=dict(dl_tx=self.BSS[0] + 0x2400))),
                ('missing', dict(moved={'manager.c': ('owed_id',)})),
                ('ambiguous local and global', dict(symbols=lambda s: s + [SimpleNamespace(
                    name='allocator', value=0x2400, size=4, bind=1, type=1, shndx=2)])),
                ('retained skip resized', dict(mapping=dict(modwerk_retained_end=self.BSS[0] + 0x5000))),
                ('retained skip unaligned to the clear', dict(mapping=dict(modwerk_retained_start=self.BSS[0] + 0x4002,
                                                                           modwerk_retained_end=self.BSS[0] + 0x6002))),
                ('retained skip past the clear', dict(mapping=dict(modwerk_retained_start=self.BSS[0] + 0x7000,
                                                                   modwerk_retained_end=self.BSS[0] + 0x9000))),
                ('clear length disagrees', dict(mapping=dict(__bss_words=0x1fff))),
                ('boot clear without the skip', dict(bootstrap='        ' + core.BOOT_CLEAR_START + '\n')),
                ('retained skip switched off', dict(switches={})),
                ('boot clear through the cached address',
                 dict(bootstrap='        movea.l #__bss_start, %a0\n| MODWERK-SEAM: retained-skip\n'))):
            with self.subTest(label), self.assertRaises(ValueError):
                self.link(**changes)


if __name__ == '__main__':
    unittest.main()
