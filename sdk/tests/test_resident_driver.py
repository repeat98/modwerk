"""Actual native frame driver, checked record metadata and transfer seams."""
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ADAPTER = ROOT / 'sdk/machines/octatrack/module-adapters'
ELEK = ROOT / 'sdk/machines/octatrack/elekloader'
RUNTIME = ADAPTER / 'resident-runtime'
sys.path.append(str(ADAPTER))
import resident_boot as boot
import resident_dsp as dsp
import resident_driver as driver
import resident_source


class ResidentDriver(unittest.TestCase):
    def test_private_source_copies_require_every_exact_base_input(self):
        changed = resident_source.sources()
        self.assertEqual(set(changed), {'dsp.c', 'dsp_loader.py', 'dsp_receiver.asm'})
        self.assertIn('if (enable) return MW_HOOK_STATE;', changed['dsp.c'])
        self.assertIn('CORE1_IDLE = TABLE_END', changed['dsp_loader.py'])
        for name in changed:
            self.assertNotEqual(changed[name], (ELEK / name).read_text())
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            destination = root / 'sdk/machines/octatrack/elekloader'
            destination.mkdir(parents=True)
            for name in changed:
                shutil.copyfile(ELEK / name, destination / name)
            self.assertEqual(resident_source.sources(root), changed)
            (destination / 'dsp.c').write_text((destination / 'dsp.c').read_text() + '\n')
            with self.assertRaisesRegex(ValueError, 'review the private port'):
                resident_source.sources(root)

    def generated(self):
        spec = importlib.util.spec_from_file_location('resident_driver_core_fixture', ELEK / 'build_core.py')
        core = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(core)
        texts = {}
        for name in core.DYNLOAD_SOURCES:
            text = (core.DYNLOAD / name).read_text()
            for old, new in core.DSP_EDITS.get(name, ()) + core.WIDTH_EDITS.get(name, ()):
                self.assertEqual(text.count(old), 1)
                text = text.replace(old, new)
            texts[name] = driver.transport(text) if name == 'transfer.c' else text
        return texts

    @unittest.skipUnless(shutil.which('cc'), 'Host C compiler unavailable')
    def test_actual_generated_frame_packets_flags_refusal_and_timeout(self):
        texts = self.generated()
        # Substitute only the timer's MMIO read, never the job/packet/ACK logic.
        clock = '*(volatile uint32_t *)0xfc07c00cu'
        self.assertEqual(texts['transfer.c'].count(clock), 1)
        texts['transfer.c'] = '#include <stdint.h>\nextern volatile uint32_t test_clock;\n' + texts['transfer.c'].replace(clock, 'test_clock') + '\nvoid modwerk_diag_frame(void) {}\n'
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            for name, text in texts.items():
                (work / name).write_text(text)
            shutil.copyfile(ELEK / 'fxids.h', work / 'fxids.h')
            executable = work / 'transport'
            compiled = subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic', '-DDL_NATIVE_TEST',
                            '-DMODWERK_FX_IDS=64', '-DMODWERK_DSP_TABLE0=4096', '-DMODWERK_DSP_TABLE1=4096',
                            '-DMODWERK_DSP_WORDS0=2000', '-DMODWERK_DSP_WORDS1=2000', '-I' + str(work),
                            str(work / 'transfer.c'), str(RUNTIME / 'test_resident_transport.c'), '-o', str(executable)],
                           capture_output=True, text=True)
            self.assertEqual(compiled.returncode, 0, compiled.stderr)
            result = subprocess.run([str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'ColdFire compiler unavailable')
    def test_actual_device_binding_and_generated_transfer_compile(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            for name, text in self.generated().items():
                (work / name).write_text(text)
            (work / 'dsp.c').write_text(resident_source.sources()['dsp.c'])
            flags = ['-mcpu=54455', '-Os', '-Wall', '-Wextra', '-Werror', '-ffreestanding',
                     '-fno-builtin', '-DMODWERK_RESIDENT_STOCK_HOOKS', '-DMODWERK_FX_IDS=64',
                     '-DMODWERK_DSP_ALLOWANCE0=3120', '-DMODWERK_DSP_ALLOWANCE1=3565', '-DMODWERK_DSP_RESERVE=342']
            flags += ['-DMODWERK_DSP_%s%d=4096' % (name, core) for name in ('TABLE', 'WORDS', 'MISS', 'METER') for core in (0, 1)]
            for source in (work / 'transfer.c', work / 'dsp.c', RUNTIME / 'stock_hooks.c', RUNTIME / 'stock_hook_driver.c'):
                compiled = subprocess.run(['m68k-elf-gcc', *flags, '-I' + str(work), '-I' + str(ELEK), '-I' + str(RUNTIME),
                                '-I' + str(ROOT / 'sdk/runtime/loader'), '-I' + str(ROOT / 'sdk/runtime/upload'), '-c', str(source),
                                '-o', str(work / (source.stem + '.o'))], capture_output=True, text=True)
                self.assertEqual(compiled.returncode, 0, compiled.stderr)

    @unittest.skipUnless(shutil.which('cc'), 'Host C compiler unavailable')
    def test_actual_stream_lease_ack_quarantine_resource_and_ui_fences(self):
        receipt, arrays = [], []
        for tag in 'AB':
            fragments, records, total = [], [], 0
            # The controller's record order is X first, followed by owned Y.
            rows = sorted(dsp.resource_ranges(tag), key=lambda r: r['space'] != 'x')
            for n, row in enumerate(rows):
                raw = boot.records_bytes([dict(space=row['space'], address=row['address'], words=[0] * row['words'])],
                                         [(row['space'], row['address'], row['words'])])
                packed = boot.pack_zeros(raw)
                symbol = 'mw_resident_records_%s_%d' % (tag, n)
                arrays.append('static const uint8_t %s[] = {%s};\n#define %s_end (%s+sizeof %s)\n' %
                              (symbol, ','.join(map(str, packed)), symbol, symbol, symbol))
                fragments.append(dict(symbol=symbol, authoredBytes=len(raw)))
                records.append(dict(space=row['space'], address=hex(row['address']), words=row['words'], owner=row['owner']))
                total += len(raw)
            receipt.append(dict(tag=tag, packedFragments=fragments, records=records, authoredBytes=total))
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            fixture = work / 'fixture.c'
            metadata = '\n'.join(line for line in driver.controller_c(dict(receipt=receipt)).splitlines() if not line.startswith('extern '))
            fixture.write_text('#include <stdint.h>\n' + '\n'.join(arrays) + metadata + '\n')
            executable = work / 'driver'
            subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic', '-I' + str(ELEK),
                            '-I' + str(RUNTIME), str(fixture), str(RUNTIME / 'stock_hooks.c'), str(RUNTIME / 'stock_hook_driver.c'),
                            str(RUNTIME / 'test_stock_hook_driver.c'), '-o', str(executable)], check=True, capture_output=True)
            result = subprocess.run([str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_transport_substitutions_refuse_drift_and_keep_upstream_exact(self):
        spec = importlib.util.spec_from_file_location('resident_driver_core_fixture', ELEK / 'build_core.py')
        core = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(core)
        original = (core.DYNLOAD / 'transfer.c').read_text()
        changed = original
        for old, new in core.DSP_EDITS['transfer.c'] + core.WIDTH_EDITS.get('transfer.c', ()):
            self.assertEqual(changed.count(old), 1)
            changed = changed.replace(old, new)
        private = driver.transport(changed)
        self.assertIn('dl_hook_reset_start', private)
        self.assertIn('unsigned end=(feature == 1u ? (offset < 16u ? 16u : offset < 530u ? 530u : 1042u) : feature == 2u ? 193u : '
                      'feature == 4u ? 3776u : feature == 8u ? (offset < 514u ? 514u : 1026u) : 0u);', private)  # one owned range per chunk
        self.assertIn('feature==8u ? 1026u', private)  # the key bus
        self.assertIn('op!=10u', private)
        self.assertEqual((core.DYNLOAD / 'transfer.c').read_text(), original)
        with self.assertRaisesRegex(ValueError, 'seam changed'):
            driver.transport(original)


if __name__ == '__main__':
    unittest.main()
