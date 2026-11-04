#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Create a private project/card with original tones and saved 512-trig cases.

Project records are cloned from the caller's private seed, never committed.
Uses the SDK's FAT, bank checksum and native file-layout helpers; no device I/O.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import sys
import wave

ROOT = Path(__file__).resolve().parents[3]
SDK = ROOT / 'sdk/octabam'
sys.path.insert(0, str(SDK / 'tools'))
import toolpath  # noqa: E402,F401
import emu_card  # noqa: E402
import ot_project as project  # noqa: E402
import ot_bank as bank  # noqa: E402

RATE = 44100
FRAMES = RATE * 2
TONES = [256 + 128 * t for t in range(8)]
SHA = lambda b: hashlib.sha256(b).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seed-card', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    out = args.out.resolve()
    if out == ROOT or ROOT in out.parents:
        parser.error('Project, audio and card artifacts must stay outside Git')
    out.mkdir(parents=True, exist_ok=False)
    seed = args.seed_card.read_bytes()
    files = emu_card.extract_image(seed)
    projects = [name.rsplit('/', 1)[0] for name in files if name.endswith('/project.work')]
    assert len(projects) == 1, 'Supply an unambiguous private seed project'
    dest = out / 'PROJECT 261023'; dest.mkdir()
    for name, data in files.items():
        if name.rsplit('/', 1)[0] == projects[0] and name.endswith(('.work', '.strd')):
            (dest / name.rsplit('/', 1)[1]).write_bytes(data)
    assert (dest / 'bank01.work').is_file() and (dest / 'markers.work').is_file()
    audio = out / 'AUDIO'; audio.mkdir()
    sample_rows = []
    for track, frequency in enumerate(TONES):
        name = 'PSL_T%d.wav' % (track + 1)
        pcm = bytearray()
        for n in range(FRAMES):
            value = round(2000 * math.sin(2 * math.pi * frequency * n / RATE))
            pcm += struct.pack('<hh', value, value)
        with wave.open(str(audio / name), 'wb') as wav:
            wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(RATE); wav.writeframes(pcm)
        sample_rows.append(dict(track=track + 1, machine='FLEX' if track < 4 else 'STATIC',
                                slot=track + 1, path='../AUDIO/' + name, frequencyHz=frequency,
                                frames=FRAMES, sha256=SHA((audio / name).read_bytes())))
    for suffix in ('work', 'strd'):
        filename = dest / ('project.' + suffix)
        if not filename.exists(): continue
        text = filename.read_bytes().decode('latin1')
        text = re.sub(r'\[SAMPLE\].*?\[/SAMPLE\]\r?\n', '', text, flags=re.S)
        blocks = ''
        for row in sample_rows:
            blocks += ('[SAMPLE]\r\nTYPE={machine}\r\nSLOT={slot:03d}\r\nPATH={path}\r\n'
                       'TRIM_BARSx100=100\r\nLOOP_BARSx100=100\r\nBPMx24=2880\r\n'
                       'TSMODE=0\r\nLOOPMODE=1\r\nGAIN=48\r\nTRIGQUANTIZATION=-1\r\n[/SAMPLE]\r\n\r\n').format(**row)
        text += '\r\n' + blocks
        for key in ('BANK', 'PATTERN', 'TRACK'):
            text, count = re.subn(r'(\r?\n)' + key + r'=\d+', lambda m: m[1] + key + '=0', text, count=1)
            assert count == 1
        filename.write_bytes(text.replace('MASTER_TRACK=1', 'MASTER_TRACK=0').encode('latin1'))
    project.set_tempo(dest, 120)
    for suffix in ('work', 'strd'):
        filename = dest / ('markers.' + suffix)
        if not filename.exists(): continue
        data = bytearray(filename.read_bytes())
        for track, row in enumerate(sample_rows):
            record = track + (0 if row['machine'] == 'FLEX' else 136)
            at = 0x16 + 784 * record
            data[at:at + 784] = struct.pack('>III', 0, FRAMES, 0) + bytes(772)
        data[-2:] = (sum(data[0x10:-2]) & 65535).to_bytes(2, 'big')
        filename.write_bytes(data)
    def mutate(data):
        bank.check_tags(data)
        for p in range(project.NPARTS_ALL):
            base = project.PART_BASE + p * project.PART_STRIDE
            for track in range(8):
                kind = 1 if track < 4 else 0
                data[base + project.MTYPE_OFF + track] = kind
                data[base + 0x2d3 + track * 5 + kind] = track
                data[base + 0x01b + track * 2] = 55
                data[base + project.FX1_OFF + track] = 0
                data[base + project.FX2_OFF + track] = 0
                setup = base + 0x1e3 + track * 30 + 6 * kind
                data[setup] = 1; data[setup + 4] = 0  # loop on, time stretch off
                values = base + 0x033 + track * 30 + 6 * kind
                data[values:values + 6] = bytes((64, 0, 0, 127, 0, 79))
        for pattern in range(16):
            data[bank.PTRN_BASE + (pattern + 1) * bank.PTRN_STRIDE - 5] = 0
            for track in range(8):
                at = project.trac_off(pattern, track)
                data[at:at + 64] = bytes(64)
                data[at + 0x59:at + 0x859] = bytes([255]) * 2048
                data[at + 0x50:at + 0x52] = bytes((64, 2))
                if pattern >= 4: continue
                data[at:at + 8] = bytes([255]) * 8
                for step in range(64):
                    if pattern: data[at + 0x78 + 32 * step] = track
                    if pattern == 2: data[at + 0x59 + 32 * step] = 64
                    if pattern == 3: data[at + 0x59 + 32 * step + 30] = 33
    project._bank_write(dest, 1, mutate, guard=False)
    for pattern in range(4): project.set_pattern_scale(dest, 1, pattern, 64, '1X', guard=False)
    project.write_stored(dest)
    data = (dest / 'bank01.work').read_bytes()
    assert data == (dest / 'bank01.strd').read_bytes()
    assert int.from_bytes(data[-2:], 'big') == sum(data[0x10:-2]) & 65535
    for pattern in range(4):
        for track in range(8):
            assert bank.trigs(data, pattern, track) == list(range(64))
            locks = bank.locks(data, pattern, track)
            assert (len(locks) if pattern else 0) == (64 if pattern else 0)
    card, _ = emu_card.stage_project(dest, 'BEATLAB', 'PROJECT 261023', tree=out / 'card-tree', image_mb=32,
        audio=[str(audio / ('PSL_T%d.wav' % (t + 1))) + ':AUDIO/PSL_T%d.wav' % (t + 1) for t in range(8)])
    (out / 'fixture-card.private.img').write_bytes(card)
    staged = emu_card.extract_image(card)
    for row in sample_rows:
        assert SHA(staged['BEATLAB/AUDIO/' + row['path'].rsplit('/', 1)[1]]) == row['sha256']
    report = dict(hardware=False, seedCardSha256=SHA(seed), cardSha256=SHA(card), originalGeneratedSamples=sample_rows,
                  patterns=['A01 empty SAMPLE locks', 'A02 all SAMPLE locks, no others', 'A03 first other lock', 'A04 last other lock'],
                  sampleTrigsPerPattern=512, bankChecksumAndStoredCopyVerified=True, sampleFilesVerifiedInsideCard=True,
                  nativePlaybackVerified=False, audioCaptureVerified=False, helperSha256=SHA(Path(__file__).read_bytes()))
    (out / 'fixture.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Built private project/card: eight original WAVs; four saved 512-trig patterns. Playback still requires emulator proof.', flush=True)


if __name__ == '__main__': main()
