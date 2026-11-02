"""Real authored DSP compile/resource and controller lifetime regressions."""
import importlib.util
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import sys

ROOT = Path(__file__).resolve().parents[2]
ADAPTER = ROOT / 'sdk/machines/octatrack/module-adapters'
ELEK = ROOT / 'sdk/machines/octatrack/elekloader'
RUNTIME = ADAPTER / 'resident-runtime'
sys.path.append(str(ADAPTER))
import resident_source


def read(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


resident = read('resident_stock_dsp_fixture', ADAPTER / 'resident_dsp.py')


class ResidentStockDsp(unittest.TestCase):
    def test_source_and_contiguous_buffer_ownership(self):
        resident.verify_sources(ROOT / 'sdk/octabam')
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / next(iter(resident.SOURCES))
            path.parent.mkdir(parents=True)
            path.write_text('changed source')
            with self.assertRaisesRegex(ValueError, 'review the port'):
                resident.verify_sources(tmp)
        for tag, block in [('A', 0x30000), ('B', 0x38000)]:
            self.assertTrue(resident.buffer_fits(tag, 2, block, 16384, 0))
            self.assertTrue(resident.buffer_fits(tag, 2, block, 0x3dfe, resident.SIDECHAIN))
            self.assertTrue(resident.buffer_fits(tag, 2, block, 0x3da2, resident.SIDECHAIN))  # stock DARK's actual high water
            self.assertFalse(resident.buffer_fits(tag, 2, block, 0x3dff, resident.SIDECHAIN))
            self.assertFalse(resident.buffer_fits(tag, 2, block, 16384, resident.SIDECHAIN))
            self.assertTrue(resident.buffer_fits(tag, 2, 0x4000, 16384, resident.SIDECHAIN))
            self.assertTrue(resident.buffer_fits(tag, 1, 0x1000, 3072, resident.SIDECHAIN))
        self.assertFalse(resident.buffer_fits('B', 2, 0x38000, 1, resident.MATRIX))
        self.assertFalse(resident.buffer_fits('A', 2, 0x30001, 4, 0))

    def test_reviewed_resident_changes_fail_closed(self):
        # The Sidechain key phase change (resident_dsp.REVIEWED): exact old text once, the exact reviewed result.
        name, asm = 'sidechain-compressor', 'modules/sidechain-compressor/patch_sc_dsp3.asm'
        text = (ROOT / 'sdk/octabam' / asm).read_text()
        pinned, changes, result, markers = resident.REVIEWED[name]
        self.assertEqual(pinned, resident.SOURCES[asm])
        for tag, values in markers.items():
            changed = resident.reviewed_source(name, text, tag)
            self.assertFalse(any(marker in changed for marker in values))
            self.assertTrue(all(value in changed for value in values.values()))
            self.assertIn('kph2:', changed)
        self.assertEqual(resident.reviewed_source('output-matrix', 'unchanged', 'A'), 'unchanged')
        with self.assertRaisesRegex(ValueError, 'review the resident change again'):
            resident.reviewed_source(name, text + '\n', 'A')
        saved = resident.REVIEWED
        try:
            resident.REVIEWED = {name: (pinned, changes + (('        rts\n', '        rts\n'),), result, markers)}
            with self.assertRaisesRegex(ValueError, 'exactly once'):
                resident.reviewed_source(name, text, 'A')
            resident.REVIEWED = {name: (pinned, changes, hashlib.sha256(b'other').hexdigest(), markers)}
            with self.assertRaisesRegex(ValueError, 'differs from the reviewed text'):
                resident.reviewed_source(name, text, 'B')
        finally:
            resident.REVIEWED = saved

    @unittest.skipUnless(shutil.which('cc'), 'Host C compiler unavailable')
    def test_real_c_lease_ack_timeout_version_and_ui_root_fences(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / 'hooks'
            subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic',
                            '-I' + str(RUNTIME), str(RUNTIME / 'stock_hooks.c'), str(RUNTIME / 'test_stock_hooks.c'),
                            '-o', str(out)], check=True, capture_output=True)
            subprocess.run([str(out)], check=True, capture_output=True)

    @unittest.skipUnless(os.environ.get('ELEKLOADER_DSP_ASM') or shutil.which('dsp_asm'), 'explicit native DSP assembler unavailable')
    def test_real_author_sources_and_fixed_receiver_at_two_origins(self):
        packages = read('resident_dsp_packages_fixture', ELEK / 'dsp_packages.py')
        loader = resident_source.load_loader()
        ob = packages.Octabam(str(ROOT / 'sdk/octabam'))
        with tempfile.TemporaryDirectory() as work:
            for tag in ('A', 'B'):
                # Analog BD's engine is its package's, always on demand; the rest stay in the block, as they were.
                packaged = resident.PACKAGED & resident.ALLOWED[tag]
                first = resident.assemble_resident(ob, tag, 0x1000, work, packages.assemble, packaged)
                other = resident.assemble_resident(ob, tag, 0x1400, work, packages.assemble, packaged)
                self.assertEqual(len(first['words']), len(other['words']))
                for old, new in zip(first['words'], other['words']):
                    self.assertIn((new - old) & 0xffffff, (0, 0x400, (-0x400) & 0xffffff))
                for row, moved in zip(first['descriptors'], other['descriptors']):
                    self.assertEqual(moved['operand'] - row['operand'], 0x400)
                    self.assertEqual(moved['onValue'], row['onValue'])
                    self.assertEqual(first['words'][row['operand'] - first['origin']], row['offValue'])
                # Complete dormant replays: SCdet displaces TWO one-word moves, SCinit one two-word move.
                for row, label in zip(first['guards'][:4], ('hsc_tap_off', 'hsc_det_off', 'hsc_commit_off', 'hsc_init_off')):
                    at = first['labels'][label] - first['origin']
                    self.assertEqual(hashlib.sha256(b''.join(w.to_bytes(3, 'big') for w in first['words'][at:at + 2])).hexdigest(), row['expectedSha256'])
                prefix_at = first['labels']['hsc_det_off'] - first['origin']
                prefix = first['words'][prefix_at:prefix_at + 2]
                init_at = first['labels']['hsc_init_off'] - first['origin']
                init = first['words'][init_at:init_at + 2]
                stock = dict(key='COMPRESSOR', proc=2, init=5, relocations=[0, 3, 5, 6, 7])
                updated, words = resident.compressor_bridge(stock, [0, 0] + prefix + [0] + init + [0], first)
                self.assertEqual(updated['relocations'], [0, 7])
                self.assertEqual(words[3], first['labels']['hsc_det'])
                self.assertEqual(words[6], first['labels']['hsc_init'])
                with self.assertRaises(ValueError):
                    resident.compressor_bridge(stock, [0] * 8, first)
                with self.assertRaises(ValueError):
                    resident.compressor_bridge(stock, [0, 0] + prefix + [0, 0, 0, 0], first)
                control = resident.receiver_control(first)
                text = loader.receiver_source(loader.RECEIVER.read_text(), (0x7c8, 0x7c9), 1200,
                                              tag=tag, ids=128, hook_control=control,
                                              hook_reset=resident.receiver_reset(first))
                native, labels = packages.assemble(text, 0x400, work)
                self.assertGreater(len(native), 0)
                self.assertIn('hookstate', labels)
                self.assertIn('hookcontrol', labels)
                self.assertIn('hookreset', labels)
                self.assertIn('hookready', labels)
                self.assertIn('hresetverify', labels)
                # Independent execution uses native emu archives only when explicitly supplied.
                emu = os.environ.get('ELEKLOADER_DSP_EMU_ROOT')
                if emu:
                    emu = Path(emu)
                    executable = Path(work) / 'resident-hooks-native'
                    libraries = [emu / 'out/emu/dsp56300' / part for part in (
                        'dsp56kEmu/libdsp56kEmu.a', 'dsp56kBase/libdsp56kBase.a', 'asmjit/libasmjit.a')]
                    subprocess.run(['c++', '-std=c++17', '-O2', '-DDSP56300_DEBUGGER=0', '-DASMJIT_STATIC',
                                    '-I' + str(emu / 'vendor/dsp56300/source'), '-I' + str(emu / 'vendor/dsp56300/source/asmjit/src'),
                                    str(ROOT / 'sdk/tests/resident_hooks_native.cpp'), *map(str, libraries), '-lpthread',
                                    '-o', str(executable)], check=True, capture_output=True)
                    meta = Path(work) / 'resident-meta.txt'
                    meta.write_text(' '.join(map(str, (0x400, labels['hookcontrol'], labels['hookreset'],
                        labels['hookstate'], labels['hookready'], resident.ALLOWED[tag] & ~resident.PACKAGED,
                        0x33dfe if tag == 'A' else 0x3bdfe, len(first['descriptors'])))) + '\n' + '\n'.join(
                        ' '.join(str(row[key] or 0) for key in ('owner', 'operand', 'offValue', 'onValue')) for row in first['descriptors']) + '\n')
                    subprocess.run([str(executable), str(Path(work) / 'dsp.400.bin'), str(meta)], check=True, capture_output=True)
                # Descriptor tampering cannot turn CAS into an arbitrary P writer.
                first['descriptors'][0]['operand'] = 0
                with self.assertRaisesRegex(ValueError, 'escapes'):
                    resident.receiver_control(first)


if __name__ == '__main__':
    unittest.main()
