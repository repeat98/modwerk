"""Build an emulator-only GATE3 card from a local disposable OS 1.40C project."""
import argparse
from pathlib import Path
import re
import shutil
import sys
import tempfile
import wave

parser = argparse.ArgumentParser(description=__doc__)
for name in ('octabam', 'seed_project', 'output'):
    parser.add_argument(name, type=Path)
args = parser.parse_args()
sys.path[:0] = [str(args.octabam.resolve() / directory) for directory in ('tools/hw', 'tools/emu')]
import emu_card
import ot_bank
import ot_project
import ot_spec

with tempfile.TemporaryDirectory() as tmp:
    tree = Path(tmp)
    project = tree / 'MODWERK/GATE3'
    audio = tree / 'MODWERK/AUDIO'
    project.mkdir(parents=True)
    audio.mkdir()
    for name in ['project', 'markers', *(f'arr{i:02}' for i in range(1, 9)),
                 *(f'bank{i:02}' for i in range(1, 17))]:
        shutil.copyfile(args.seed_project / (name + '.work'), project / (name + '.work'))
    track = dict(length=16, scale='1X', trigs='clear', locks={'all': 'clear'})
    ot_spec.apply(project, dict(banks='A', patterns={i: dict(tracks={'all': track}) for i in ('1', '2')}))
    for pattern in (0, 1):
        ot_project.set_pattern_scale(project, 1, pattern, 16, '1X', guard=False)
    ot_project.set_tempo(project, 120)

    def configure(data):
        for pat, masks in enumerate(((0x1008, 0x2041, 0x8204), (0x4081, 0x1109, 0x4811))):
            for lane, mask in enumerate(masks):
                ot_bank.set_mask(data, pat, lane, mask)
        patterns = [m.start() for m in re.finditer(b'PTRN', data)]
        tracks = [m.start() for m in re.finditer(b'TRAC', data)]
        if len(patterns) != 16 or len(tracks) != 128:
            raise ValueError('Unknown bank layout')
        data[patterns[2]:patterns[3]] = data[patterns[1]:patterns[2]]
        data[tracks[17]:tracks[18]] = data[tracks[1]:tracks[2]]

    ot_project._bank_write(project, 1, configure, guard=False)
    proj = project / 'project.work'
    raw, count = re.subn(rb'(?m)^MASTER_TRACK=[01]\r', b'MASTER_TRACK=0\r', proj.read_bytes())
    if count != 1:
        raise ValueError('Expected a project master-track setting')
    proj.write_bytes(raw)
    arr = project / 'arr01.work'
    data = bytearray(arr.read_bytes())
    if (data[8:16] != b'DPS1ARRA' or len(data) != 11336 or data[0x17] or
            sum(data[16:-2]) % 65536 != int.from_bytes(data[-2:], 'big')):
        raise ValueError('Supply a disposable OS 1.40C project with an empty arrangement 1')
    # One stock 16-step A01 row, with its default tempo and no mute overrides.
    data[0x17] = data[0x29] = 1
    data[0x32:0x34] = bytes.fromhex('ffff')
    data[0x37] = 16
    data[-2:] = (sum(data[16:-2]) % 65536).to_bytes(2, 'big')
    arr.write_bytes(data)
    arr.with_suffix('.strd').write_bytes(data)
    with wave.open(str(audio / 'fixture.wav'), 'wb') as stream:
        stream.setparams((1, 2, 44100, 0, 'NONE', 'not compressed'))
        stream.writeframes(bytes(2048))
    with args.output.open('xb') as out:
        out.write(emu_card.build_image(tree))
