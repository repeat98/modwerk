# SPDX-License-Identifier: GPL-3.0-or-later
"""Capture Euclid's existing TYPE-history test at a source revision for fx:audit compare."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
MODULE = Path('sdk/octatrack/modules/euclid')
sys.path.insert(0, str(ROOT / MODULE))
import test_filter_type_history as history


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('revision', help='Git revision containing the filter.asm to assemble')
    args = parser.parse_args()
    revision = subprocess.check_output(['git', 'rev-parse', '--verify', '--end-of-options', args.revision + '^{commit}'],
                                       cwd=ROOT, text=True).strip()
    source = subprocess.check_output(['git', 'show', revision + ':' + MODULE.as_posix() + '/filter.asm'], cwd=ROOT)
    captures = Path(tempfile.mkdtemp(prefix='euclid-filter-'))
    # The fixture reads filter.asm from HERE. Its runner and test assertions come from this checkout for both runs.
    history.HERE = captures
    (captures / 'filter.asm').write_bytes(source)
    tools = [ROOT / MODULE / 'test_filter_type_history.py', ROOT / 'sdk/tests/resident_engines_native.cpp',
             *history.LIBS, history.VTUNE]
    assembler = shutil.which(history.ASM or 'dsp_asm')
    if assembler:
        tools.append(Path(assembler))
    record = {
        'revision': revision, 'filterSha256': hashlib.sha256(source).hexdigest(),
        'runnerSha256': {tool.name: digest(tool) for tool in tools if tool.is_file()},
        'target': 'DSP56300 interpreter', 'format': 'signed 24-bit words in little-endian int32, interleaved L R',
        'sampleRate': 44100, 'blockFrames': history.FRAMES, 'renders': {},
    }

    @unittest.skipUnless(assembler, 'dsp_asm unavailable')
    class Capture(history.FilterTypeHistory):
        def run_types(self, types):
            audio, gain = super().run_types(types)
            if not record['renders']:
                record['runnerSha256']['native'] = digest(self.harness)
            name = 'via-amp' if history.AMP in types else 'low-pass'
            (captures / (name + '.raw')).write_bytes(struct.pack('<' + 'i' * len(audio), *audio))
            frames = len(audio) // 2
            record['renders'][name] = {'startFrame': len(types) * history.FRAMES - frames,
                                       'frames': frames, 'dryGainWord': gain, 'peakWord': max(map(abs, audio), default=0)}
            return audio, gain

    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Capture))
    if result.skipped:
        status, code = 'skipped', 77
        record['reason'] = result.skipped[0][1]
    elif result.errors:
        status, code = 'error', 1
    elif result.failures:
        status, code = 'failed', 1
    else:
        status, code = 'passed', 0
    record['result'] = status
    (captures / 'capture.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print(f'{status}: {captures}')
    return code


if __name__ == '__main__':
    sys.exit(main())
