#!/usr/bin/env python3
"""Prepare a private T3/T4 tone fixture from an existing generated stress project.

The local template must already be the Air Chorus project produced with the
SDK stress_project helper: FLEX slot 1, normal pitch/rate, loop on. No user
project or firmware is committed. The template is copied, never modified.
"""
import argparse
import math
from pathlib import Path
import shutil
import struct
import sys
import wave

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'sdk/octabam/tools'))
import toolpath  # noqa: E402,F401
import ot_project as otp  # noqa: E402
import ot_bank as bank  # noqa: E402
import emu_card  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--template', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists() or output.is_relative_to(ROOT) or output.is_relative_to(args.template.resolve()):
        parser.error('Choose a new private output folder outside the checkout and template')
    if not (args.template/'STRESS_README.txt').is_file():
        parser.error('Use a generated stress project, not a personal project')
    project = output/'project'
    shutil.copytree(args.template, project)
    for path in project.glob('bank*.*'):
        data = bytearray(path.read_bytes())
        bank.check_tags(data)
        for part in range(8):
            base = otp.PART_BASE + part*otp.PART_STRIDE
            for track in range(8):
                setup = base + 0x1e3 + track*30 + 6
                values = base + 0x033 + track*30 + 6
                if (data[base+otp.MTYPE_OFF+track], data[base+0x2d3+track*5+1],
                    data[setup], data[setup+4], data[values], data[values+3]) != (1, 0, 1, 0, 64, 127):
                    raise ValueError('Template must use looping FLEX slot 1, neutral pitch, forward rate and no timestretch')
                data[base+otp.FX1_OFF+track] = 0
                data[base+otp.FX2_OFF+track] = 30 if track in (2, 3) else 0
                pos = base+otp.P1_OFF+track*otp.TRACK_STRIDE
                data[pos:pos+12] = bytes([0]*6 + [64, 64, 0, 0, 0, 64 if track == 2 else 0])
                lfo = base+otp.LFO_P1_OFF+track*24
                data[lfo:lfo+6] = bytes(6)
        for pattern in range(16):
            for track in range(8):
                pos = otp.trac_off(pattern, track)
                data[pos:pos+64] = bytes(64)
                data[pos+0x59:pos+0x59+64*32] = bytes([255])*(64*32)
                if track in (2, 3) and pattern == 0:
                    data[pos+7] = 1
        data[-2:] = (sum(data[0x10:-2]) & 0xffff).to_bytes(2, 'big')
        path.write_bytes(data)
    sample = project/'AUDIO/STRESS_LOOP.wav'
    with wave.open(str(sample), 'wb') as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(44100)
        wav.writeframes(b''.join(struct.pack('<hh',
            round(6000*math.sin(2*math.pi*441*t/44100)),
            round(5000*math.sin(2*math.pi*882*t/44100))) for t in range(88200)))
    card, _ = emu_card.stage_project(str(project), 'CHORUS', 'CLICK',
        tree=str(output/'card-tree'), image_mb=64,
        audio=[str(sample)+':CLICK/AUDIO/STRESS_LOOP.wav'])
    (output/'card.img').write_bytes(card)
    (output/'mix.midi').write_text(''.join(
        f'{512+value*32} B3 2D {value:02X}\n' for value in range(128)))
    print('Prepared private T3/T4 project and CC45 MIX ramp:', output)


if __name__ == '__main__':
    main()
