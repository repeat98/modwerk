# SPDX-License-Identifier: GPL-3.0-or-later
"""Unwired AB/1 Part retirement semantics; no firmware in CI."""
import hashlib
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'sdk/machines/octatrack/module-adapters/analog-bd-parts'
PINS={
    'sdk/octabam/modules/analog-bassdrum/machine.s':'90f9ddb5c2a4cee47e0334c3cd35a7e92d42b0ee37eb3bbc8062cc7821e6aeb4',
    'sdk/octabam/modules/analog-bassdrum/control.c':'29f392c7e007aaa695076eff0c897729a941676ff582e4bb17957074d56ceac5',
    'sdk/octabam/modules/output-matrix/matrix.s':'a4b9f74062520437ed0db2f8b497d6af89661621ab3deef5078158514194b287',
}
class AnalogBdPartFence(unittest.TestCase):
    def test_authored_marker_and_complete_bank_layout_inputs_remain_exact(self):
        for path,digest in PINS.items():
            self.assertEqual(hashlib.sha256((ROOT/path).read_bytes()).hexdigest(),digest,path)
    @unittest.skipUnless(shutil.which('cc') or shutil.which('gcc'),'native C compiler unavailable')
    def test_complete_layout_aliases_markers_unknown_reads_and_paused_roots(self):
        with tempfile.TemporaryDirectory() as tmp:
            binary=Path(tmp)/'part-fence'
            subprocess.run([shutil.which('cc') or shutil.which('gcc'),'-std=c99','-O2','-Wall','-Wextra','-Werror',
                SOURCE/'analog_bd_part_fence.c',SOURCE/'test_analog_bd_part_fence.c','-o',binary],check=True,capture_output=True)
            result=subprocess.run([binary],check=True,text=True,capture_output=True)
            self.assertIn('PASS conservative AB Part fence',result.stdout)
    @unittest.skipUnless(shutil.which('m68k-elf-gcc'),'ColdFire compiler unavailable')
    def test_actual_coldfire_compilation_has_no_owned_data_or_unresolved_imports(self):
        with tempfile.TemporaryDirectory() as tmp:
            obj=Path(tmp)/'fence.o'
            subprocess.run(['m68k-elf-gcc','-mcpu=54455','-msoft-float','-Os','-ffreestanding','-fno-builtin',
                '-Wall','-Wextra','-Werror','-c',SOURCE/'analog_bd_part_fence.c','-o',obj],check=True,capture_output=True)
            symbols=subprocess.check_output(['m68k-elf-nm',obj],text=True)
            self.assertIn(' T mw_ab_part_fence',symbols)
            self.assertNotIn(' U ',symbols)
            self.assertNotIn(' B ',symbols)
            self.assertNotIn(' D ',symbols)
