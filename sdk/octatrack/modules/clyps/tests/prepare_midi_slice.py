# SPDX-License-Identifier: GPL-3.0-or-later
"""Prepare two generated FLEX voices on a disposable copy of the GATE3 shelf."""
import argparse
from math import exp, pi, sin
from pathlib import Path
import re
import struct
import sys
import tempfile
import wave

parser = argparse.ArgumentParser(description=__doc__)
for field in ('octabam', 'gate3_card', 'output'):
    parser.add_argument(field, type=Path)
args = parser.parse_args()
sys.path[:0] = [str(args.octabam / 'tools/emu'), str(args.octabam / 'tools/hw')]
import emu_card
import ot_project

with tempfile.TemporaryDirectory() as tmp:
    tree = Path(tmp)
    emu_card.extract_image(args.gate3_card.read_bytes(), tree)
    project = tree / 'MODWERK/GATE3'
    settings = project / 'project.work'
    data = settings.read_bytes()
    for lane, name in enumerate(('KICK', 'BASS')):
        with wave.open(str(tree / f'MODWERK/AUDIO/{name}.WAV'), 'wb') as voice:
            voice.setparams((1, 2, 44100, 0, 'NONE', 'PCM'))
            pcm = bytearray()
            for i in range(11025):
                t = i / 44100
                phase = (48*t + 3*(1-exp(-50*t))) if lane == 0 else 82.41*t
                pcm.extend(struct.pack('<h', round(14000 * exp(-15*t) * sin(2*pi*phase))))
            voice.writeframes(pcm)
        pattern = rb'\[SAMPLE\]\r\nTYPE=FLEX\r\nSLOT=00' + str(lane+1).encode() + rb'\r\n.*?\[/SAMPLE\]'
        record = f'[SAMPLE]\r\nTYPE=FLEX\r\nSLOT=00{lane+1}\r\nPATH=../AUDIO/{name}.WAV\r\nBPMx24=2880\r\nTSMODE=0\r\nLOOPMODE=0\r\nGAIN=48\r\nTRIGQUANTIZATION=-1\r\n[/SAMPLE]'
        data, count = re.subn(pattern, lambda _: record.encode(), data, flags=re.S)
        if count != 1:
            raise ValueError('expected one synthetic FLEX slot')
    settings.write_bytes(data)

    def assign(bank):
        for part in range(8):
            start = ot_project.PART_BASE + part * ot_project.PART_STRIDE
            for track in range(2):
                bank[start + ot_project.MTYPE_OFF + track] = 1
                bank[start + 0x2d3 + 5*track + 1] = track

    ot_project._bank_write(project, 1, assign, guard=False)
    with args.output.open('xb') as output:
        output.write(emu_card.build_image(tree))
