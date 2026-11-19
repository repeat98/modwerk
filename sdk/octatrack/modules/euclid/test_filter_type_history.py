# SPDX-License-Identifier: GPL-3.0-or-later
"""filter.asm under the vendored DSP56300 interpreter: a TYPE that passed AMP leaves nothing behind (#1690).

AMP keeps its gain in x:(r7+$26) and the filter path's tap sum adds dry * $26, so the filter path must clear it.
Turning TYPE from HP to NOTCH passes AMP; before the fix every later filter type mixed the dry signal in (-6 dB).
Two TYPE histories on a stereo sine must settle to the same output: LP throughout, and LP, one AMP block, LP.
Needs dsp_asm (ELEKLOADER_DSP_ASM) and the vendored dsp56300 build (ELEKLOADER_DSP56300), as the resident tests do.
"""
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
ASM = os.environ.get('ELEKLOADER_DSP_ASM') or shutil.which('dsp_asm')
EMU = Path(os.environ.get('ELEKLOADER_DSP56300', '/opt/toolchain/vendor/dsp56300'))
LIBS = [EMU / 'build/source' / part for part in ('dsp56kEmu/libdsp56kEmu.a', 'dsp56kBase/libdsp56kBase.a', 'asmjit/libasmjit.a')]
VTUNE = EMU / 'build/source/vtuneSdk/libvtuneSdk.a'
ORG, TABLE, R6, R7, BUF, FRAMES = 0x1000, 0x3000, 0x6000, 0x6100, 0x7000, 16
LP, AMP = 0, 3


@unittest.skipUnless(ASM and all(p.is_file() for p in LIBS) and shutil.which('c++'), 'dsp_asm or the vendored dsp56300 build unavailable')
class FilterTypeHistory(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.work = tempfile.TemporaryDirectory()
        work = Path(cls.work.name)
        cls.harness = work / 'native'
        subprocess.run(['c++', '-std=c++17', '-O2', '-DDSP56300_DEBUGGER=0', '-DASMJIT_STATIC', '-I' + str(EMU / 'source'),
                        '-I' + str(EMU / 'source/asmjit/src'), str(ROOT / 'sdk/tests/resident_engines_native.cpp'), *map(str, LIBS),
                        *([str(VTUNE)] if VTUNE.is_file() else []), '-lpthread', '-ldl', '-o', str(cls.harness)],
                       check=True, capture_output=True)
        # The cutoff table's address is a placeholder the builder relocates; a monotone stand-in table goes there.
        (work / 'f.asm').write_text((HERE / 'filter.asm').read_text().replace('$fab1e0', '$%x' % TABLE))
        subprocess.run([ASM, '-in', str(work / 'f.asm'), '-org', '%x' % ORG, '-out', str(work / 'f.bin'), '-sym', str(work / 'f.sym')],
                       check=True, capture_output=True)
        data = (work / 'f.bin').read_bytes()
        cls.words = [data[i] | data[i + 1] << 8 | data[i + 2] << 16 for i in range(0, len(data), 3)]
        cls.symbols = {line.split()[0]: int(line.split()[1], 16) for line in (work / 'f.sym').read_text().splitlines() if line.strip()}

    @classmethod
    def tearDownClass(cls):
        cls.work.cleanup()

    def run_types(self, types):
        steps = ['P %d %d' % (ORG + i, w) for i, w in enumerate(self.words)]
        steps += ['P %d %d' % (TABLE + i, 0x080000 + i * 0x4000) for i in range(64)]
        steps += ['X %d 0' % (R6 + i) for i in range(64)]
        steps += ['X %d %d' % (R6, 0x400000), 'X %d %d' % (R6 + 1, 0x200000), 'X %d %d' % (R6 + 0xe, 0x7f00)]  # FREQ, RES, MIX wet
        steps += ['R r 7 %d' % R7, 'ZERO', 'GO %d 100000 0' % self.symbols['init']]
        t = 0
        for block, kind in enumerate(types):
            steps.append('X %d %d' % (R6 + 0xd, kind << 16))
            for frame in range(FRAMES):
                value = int(0x200000 * math.sin(2 * math.pi * 440 * t / 44100)) & 0xffffff
                steps += ['X %d %d' % (BUF + 2 * frame, value), 'X %d %d' % (BUF + 2 * frame + 1, value)]
                t += 1
            steps += ['R r 0 %d' % BUF, 'R r 6 %d' % R6, 'R r 7 %d' % R7, 'R n 7 %d' % FRAMES,
                      'GO %d 200000 0' % self.symbols['proc']]
            if block >= len(types) - 4:
                steps.append('DUMP x %d %d' % (BUF, BUF + 2 * FRAMES))
        steps.append('DUMP x %d %d' % (R7 + 0x26, R7 + 0x27))
        script = Path(self.work.name) / 'script'
        script.write_text('\n'.join(steps) + '\n')
        out = subprocess.run([str(self.harness), str(script)], capture_output=True, text=True, check=True).stdout
        dumps = [line.split()[3:] for line in out.splitlines() if line.startswith('D ')]
        audio = [((int(w) ^ 0x800000) - 0x800000) for dump in dumps[:-1] for w in dump]
        return audio, int(dumps[-1][0])

    def test_amp_leaves_no_dry_signal_in_the_filter(self):
        clean, clean_gain = self.run_types([LP] * 200)
        passed, passed_gain = self.run_types([LP] * 20 + [AMP] + [LP] * 179)
        self.assertEqual((clean_gain, passed_gain), (0, 0), "AMP's gain must not survive into a filter type")
        self.assertGreater(max(map(abs, clean)), 0x100000)
        self.assertEqual(passed, clean, 'a TYPE history through AMP must settle to the same filtered output')


if __name__ == '__main__':
    unittest.main()
