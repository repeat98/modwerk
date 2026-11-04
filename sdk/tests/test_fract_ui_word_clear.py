"""Compare all framebuffer words with the frozen scalar renderer."""
from pathlib import Path
import os
import subprocess
import tempfile
import unittest
from host_flags import SANITIZE

ROOT=Path(__file__).resolve().parents[2]

class FractWordClearTests(unittest.TestCase):
    def test_complete_frames_match_scalar_reference(self):
        with tempfile.TemporaryDirectory(prefix='fract-word-clear-') as tmp:
            binary=Path(tmp)/'frames'
            gc='-Wl,-dead_strip' if os.uname().sysname=='Darwin' else '-Wl,--gc-sections'
            flags=['cc','-std=c11','-O1','-Wall','-Wextra','-Werror',*SANITIZE,
                   '-fno-sanitize-recover=all','-DOG_MACHINE_GRAIN_ONLY',
                   '-ffunction-sections','-fdata-sections',gc]
            for folder in ['sdk/drafts/fract-machine','sdk/drafts/fract-machine/support']:
                flags+=['-I',str(ROOT/folder)]
            r=subprocess.run([*flags,str(ROOT/'sdk/tests/fixtures/fract_ui_word_clear.c'),'-o',str(binary)],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stderr)
            r=subprocess.run([str(binary)],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stdout+r.stderr)
            self.assertIn('every pixel identical',r.stdout)

if __name__=='__main__':
    unittest.main()
