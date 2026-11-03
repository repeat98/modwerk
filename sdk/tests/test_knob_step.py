# SPDX-License-Identifier: GPL-3.0-or-later
"""fxpage.s's mw_knob_step under the ColdFire emulator, beside stock's default stepper (opt-in).

Needs MODWERK_PRIVATE_STOCK_MAIN (your own 1.40C MAIN image) and the built native emulator (OCTABAM_NATIVE, its
out/emu archives). Never firmware in CI. The routine is assembled alone from fxpage.s (it names only stock addresses)
and run on a module descriptor whose staging is stale and on a stock one (knob_step_fixture.cpp)."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
GLUE, ADAPTERS = ROOT / 'sdk/machines/octatrack/elekloader', ROOT / 'sdk/machines/octatrack/module-adapters'


class KnobStep(unittest.TestCase):
    def test_module_pages_restage_and_stock_pages_go_straight_on(self):
        stock = os.environ.get('MODWERK_PRIVATE_STOCK_MAIN')
        native = Path(os.environ.get('OCTABAM_NATIVE', Path.home() / '.cache/modwerk-upstream/octabam'))
        if not stock:
            self.skipTest('explicit local stock MAIN required; never firmware in CI')
        archives = [native / 'out/emu' / name for name in ('libot_machine.a', 'mc68k/lib68kEmu.a', 'dsp56300/dsp56kEmu/libdsp56kEmu.a',
                                                           'dsp56300/dsp56kBase/libdsp56kBase.a', 'dsp56300/asmjit/libasmjit.a')]
        tools = [shutil.which('m68k-elf-' + name) for name in ('as', 'objcopy')] + [shutil.which('c++')]
        if not all(tools) or not all(p.is_file() for p in archives):
            self.skipTest('ColdFire tools and the built native emulator required')
        text = (GLUE / 'fxpage.s').read_text()
        routine = text[text.index('        .global mw_knob_step'):]
        self.assertIn('jmp     (MW_STEPPER).l', routine)
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            (work / 'knob.s').write_text('        .text\n' + routine)
            subprocess.run(['m68k-elf-as', '-mcpu=5475', str(work / 'knob.s'), '-o', str(work / 'knob.o')], check=True)
            subprocess.run(['m68k-elf-objcopy', '-O', 'binary', '-j', '.text', str(work / 'knob.o'), str(work / 'knob.bin')], check=True)
            subprocess.run(['c++', '-O2', '-std=c++17', '-I' + str(native / 'tools/emu/ot_emu'), '-I' + str(native / 'vendor'),
                            '-I' + str(native / 'vendor/dsp56300/source'), str(ADAPTERS / 'knob_step_fixture.cpp'), *map(str, archives),
                            '-lpthread', '-o', str(work / 'fixture')], check=True, capture_output=True)
            result = subprocess.run([str(work / 'fixture'), stock, str(work / 'knob.bin')], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn('5 checks passed', result.stdout)


if __name__ == '__main__':
    unittest.main()
