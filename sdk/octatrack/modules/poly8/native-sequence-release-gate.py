#!/usr/bin/env python3
"""Regression for sequenced chord release, using the native ColdFire/DSP port.

First run native-fixture.py, then --stage inside the isolated toolchain (mtools
is needed). Run --image/--symbols/--emulator on the host. All images, generated
projects, audio, logs and memory dumps stay in the private --work directory.
--baseline checks the original failure instead of claiming a corrected pass.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--work', type=Path, required=True)
p.add_argument('--sdk', type=Path)
p.add_argument('--stage', action='store_true')
p.add_argument('--hold', type=int, choices=[32, 127], default=127)
p.add_argument('--release', type=int, choices=[20, 127], default=20)
p.add_argument('--image', type=Path)
p.add_argument('--symbols', type=Path)
p.add_argument('--emulator', type=Path)
p.add_argument('--baseline', action='store_true')
a = p.parse_args()
if a.hold == 32 and a.release == 127:
    p.error('finite-HOLD regression uses finite REL; test REL=INF with HOLD=INF')
w = a.work.resolve()
case = f'hold-{a.hold}-rel-{a.release}'
card = w / f'{case}.img'

if a.stage:
    if a.sdk is None:
        p.error('--stage requires --sdk')
    sdk = a.sdk.resolve()
    sys.path[:0] = [str(sdk / 'tools'), str(sdk / 'tools/verify')]
    import toolpath  # noqa: F401
    import ot_project as otp
    import emu_card
    import verify_repitch as fixture

    def mutate(data):
        for part in range(otp.NPARTS_ALL):
            base = otp.PART_BASE + part * otp.PART_STRIDE
            data[base + 0x129:base + 0x12f] = bytes([0, a.hold, a.release, 64, 64, 0])
            data[base + 0x1e3 + 6] = 1  # LOOP: the sample must not end the test.
        off = otp.trac_off(0, 0)
        data[off:off + 8] = bytes(7) + bytes([0x11])  # native steps 1 and 5
        for step, root in [(0, 72), (4, 84)]:
            data[off + 0x59 + step * 32] = root
            data[off + 0x59 + step * 32 + 30] = 67  # four adjacent pitches

    otp._bank_write(w / 'project', 1, mutate, guard=False)
    image, _ = emu_card.stage_project(
        w / 'project', 'OCTABAM', 'POLYBENCH', tree=w / f'{case}-tree',
        image_mb=64, audio=[f'{w}/tone.wav:{fixture.SAMPLE_REL}'])
    card.write_bytes(image)
    print(f'Staged {case} with two native four-note trigs.')
    sys.exit(0)

if any(value is None for value in [a.image, a.symbols, a.emulator]):
    p.error('running requires --image, --symbols and --emulator')
label = ('baseline-' if a.baseline else 'fixed-') + case
sym = {r[2]: int(r[0], 16) for line in a.symbols.read_text().splitlines()
       if len(r := line.split()) == 3}
cmd = [str(a.emulator.resolve()), '--image', str(a.image.resolve()), '--card', str(card),
       '--set', 'OCTABAM', '--project', 'POLYBENCH', '--sequencer', '--internal-clock',
       '--frames', '3000', '--names-early', '--load-ms', '90000', '--dsp', '--main-level', '64']
sizes = {'poly_amp': 32, 'poly_env_stage': 39, 'poly_env_level': 156,
         'poly_extra_voices': 31 * 168, 'poly_primary_shift': 8, 'poly_extra_shift': 31}
for frame in [500, 1500, 2999]:
    for name, size in sizes.items():
        cmd += ['--step', f'{frame}:dump:{sym[name]:#x},{size}={w}/{label}-{frame}-{name}.bin']
    cmd += ['--step', f'{frame}:dump:0x800049d8,1344={w}/{label}-{frame}-voices.bin']
(w / f'{label}-command.json').write_text(json.dumps(cmd, indent=2) + '\n')
with (w / f'{label}.log').open('w') as log:
    subprocess.run(cmd, cwd=w.parent, stdout=log, stderr=subprocess.STDOUT, check=True)

def read(frame, name):
    return (w / f'{label}-{frame}-{name}.bin').read_bytes()

def voices(frame):
    primary, extra = read(frame, 'voices'), read(frame, 'poly_extra_voices')
    shifts = list(struct.unpack('8b', read(frame, 'poly_primary_shift'))) + list(struct.unpack('31b', read(frame, 'poly_extra_shift')))
    stage = read(frame, 'poly_env_stage')
    levels = struct.unpack('>39I', read(frame, 'poly_env_level'))
    active = [bool(primary[i * 168]) for i in range(8)] + [bool(extra[i * 168]) for i in range(31)]
    return sorted((shifts[i], stage[i], levels[i]) for i in range(39) if active[i])

first, second, end = [voices(frame) for frame in [500, 1500, 2999]]
assert [v[0] for v in first] == [-12, -11, -10, -9], first
assert all(v[1:] == (2, 0x40000000) for v in first), first
for frame in [500, 1500, 2999]:
    assert read(frame, 'poly_amp')[:4] == bytes([0, a.hold, a.release, 1])
if a.hold == 32:
    assert [v[0] for v in second] == [0, 1, 2, 3], second
    assert not end, end  # finite HOLD still ends the final chord.
elif a.baseline:
    assert [v[0] for v in end] == [-12, -11, -10, -9, 0, 1, 2, 3], end
    assert all(v[1:] == (2, 0x40000000) for v in end), end
elif a.release == 127:
    assert [v[0] for v in end] == [-12, -11, -10, -9, 0, 1, 2, 3], end
    assert all(v[1] == (3 if v[0] < 0 else 2) and v[2] == 0x40000000 for v in end), end
else:
    assert [v[0] for v in second] == [0, 1, 2, 3], second
    assert end == second and all(v[1:] == (2, 0x40000000) for v in end), end
report = {'case': case, 'baseline': a.baseline,
          'imageSha256': hashlib.sha256(a.image.read_bytes()).hexdigest(),
          'voices': {'500': first, '1500': second, '2999': end}, 'status': 'passed'}
(w / f'{label}-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
