#!/usr/bin/env python3
"""Prepare private matched FLEX/FRACT projects from a local empty-bank template.

Offline files only. Use a NEW private output directory, never a mounted card.
The template is read-only input; its Octatrack format bytes are not published.
Run with the reviewed upstream tools in the isolated build environment.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import sys
import wave

FRAMES = 88200
NATIVE_MAIN = bytes((64, 0, 0, 127, 0, 79))
FRACT_MAIN = bytes((18, 86, 127, 0, 64, 64))
FRACT_SETUP = bytes((0, 64, 0, 127, 0, 168))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checksum(data):
    return (sum(data[0x10:-2]) & 0xffff).to_bytes(2, 'big')


def sample(path, width, channels):
    data = bytearray()
    for n in range(FRAMES):
        phase = n % 200
        left = 50 * ((phase if phase < 100 else 200 - phase) - 50)
        right = -left
        for value in (left, right)[:channels]:
            data.extend(struct.pack('<h', value) if width == 2 else
                        (value * 256).to_bytes(3, 'little', signed=True))
    path.parent.mkdir(parents=True)
    with wave.open(str(path), 'wb') as output:
        output.setparams((channels, width, 44100, FRAMES, 'NONE', 'not compressed'))
        output.writeframes(data)
    with wave.open(str(path), 'rb') as check:
        if (check.getnchannels(), check.getsampwidth(), check.getframerate(), check.getnframes()) != (channels, width, 44100, FRAMES):
            raise ValueError('Generated sample header differs')


def make_bank(template, fract, bank_number, op, ob):
    data = bytearray(template)
    ob.check_tags(data)
    for part in range(op.NPARTS_ALL):
        base = op.PART_BASE + part * op.PART_STRIDE
        if data[base:base + 4] != b'PART':
            raise ValueError('Unrecognized Part record')
        for track in range(8):
            data[base + op.MTYPE_OFF + track] = 1
            data[base + op.SLOT_OFF + 5 * track + 1] = 0
            data[base + 0x1b + 2 * track] = 55
            data[base + op.FX1_OFF + track] = data[base + op.FX2_OFF + track] = 0
            data[base + op.P1_OFF + 24 * track:base + op.P1_OFF + 24 * track + 12] = bytes(12)
            data[base + op.P2_OFF + 30 * track:base + op.P2_OFF + 30 * track + 12] = bytes(12)
            main, setup = base + 0x39 + 30 * track, base + 0x1e9 + 30 * track
            data[main:main + 6] = FRACT_MAIN if fract and track == 0 else NATIVE_MAIN
            data[setup:setup + 6] = FRACT_SETUP if fract and track == 0 else bytes((1, 0, 0, 0, 0, 64))
            data[base + 0x45 + 30 * track:base + 0x48 + 30 * track] = b'FR\x01' if fract and track == 0 else bytes(3)
            lfo = base + op.LFO_P1_OFF + 24 * track
            data[lfo + 3:lfo + 6] = bytes(3)
            if fract and part % 4 == 1 and track == 0:
                data[lfo:lfo + 6] = bytes((20, 36, 52, 32, 32, 32))
                mapping = base + op.LFO_PM_OFF
                data[mapping:mapping + 6] = bytes((0, 1, 3, 1, 1, 1))
    # Keep current/saved Parts identical: Reload Part must not resurrect the template.
    for part in range(4):
        a = op.PART_BASE + part * op.PART_STRIDE
        b = a + 4 * op.PART_STRIDE
        data[b:b + op.PART_STRIDE] = data[a:a + op.PART_STRIDE]
    for pattern in range(16):
        p = ob.PTRN_BASE + pattern * ob.PTRN_STRIDE
        data[p + ob.PTRN_STRIDE - 5] = 1 if fract and bank_number == 1 and pattern == 5 else 0
        data[p + ob.PTRN_STRIDE - 9:p + ob.PTRN_STRIDE - 7] = bytes((64, op.SCALE_NAMES.index('1X')))
        for track in range(8):
            tag = ob.trac(pattern, track)
            data[tag + ob.DATA:tag + ob.DATA + 64] = bytes(64)
            data[tag + ob.LOCKS:tag + ob.LOCKS + 64 * 32] = bytes([255]) * (64 * 32)
            data[tag + ob.DATA + ob.TRK_LENGTH] = 64
            data[tag + ob.DATA + ob.TRK_SCALE] = op.SCALE_NAMES.index('1X')
            if bank_number == 1 and pattern < 5 and (track == 0 or pattern == 4):
                steps = range(64) if pattern >= 3 else (0,)
                ob.set_mask(data, pattern, track, sum(1 << step for step in steps))
                if pattern in (1, 2):
                    data[tag + ob.LOCKS + (5 if fract and track == 0 else 0)] = 0 if pattern == 1 else 127
            if fract and bank_number == 1 and pattern == 5 and track == 0:
                ob.set_mask(data, pattern, track, (1 << 64) - 1)
                for step in range(64):
                    at = tag + ob.LOCKS + step * 32
                    data[at:at + 6] = bytes((0 if step % 2 else 127, 1 if step % 2 else 127,
                                            64, 127, 0 if step % 2 else 127, 64))
        # The known MTRA stride is guarded by all eight tags before any write.
        midi = p + ob.TRAC_OFF + 8 * ob.TRAC_STRIDE
        for track in range(8):
            tag = midi + track * 0x8b9
            if data[tag:tag + 4] != b'MTRA':
                raise ValueError('Unrecognized MIDI track record')
            data[tag + 9:tag + 9 + 64] = bytes(64)
    data[-2:] = checksum(data)
    return bytes(data)


def build(args):
    template, out = args.template.resolve(), args.output.resolve()
    if out.exists() or template == out or template in out.parents or str(out).startswith(('/Volumes/', '/dev/')):
        raise ValueError('Use a new local output outside the template and mounted cards')
    sys.path.insert(0, str(args.upstream.resolve() / 'tools'))
    from hw import ot_bank as ob, ot_project as op
    inputs = {name: digest(template / name) for name in ('bank02.work', 'project.work', 'markers.work')}
    bank = (template / 'bank02.work').read_bytes()
    if bank[-2:] != checksum(bank) or any(ob.mask(bank, p, t, m) for p in range(16) for t in range(8) for m in range(8)):
        raise ValueError('Require a valid empty bank02, not an active project bank')
    project = (template / 'project.work').read_bytes()
    # Remove all inherited paths. The only file-backed slot will be our own triangle.
    project = re.sub(rb'\[SAMPLE\].*?\[/SAMPLE\]\r?\n*', b'', project, flags=re.S)
    for key, value in ((b'BANK', b'0'), (b'PATTERN', b'0'), (b'TRACK', b'0'), (b'MASTER_TRACK', b'0'), (b'TEMPOx24', b'2880'),
                       (b'MIDI_CLOCK_SEND', b'0'), (b'MIDI_CLOCK_RECEIVE', b'0'),
                       (b'MIDI_TRANSPORT_SEND', b'0'), (b'MIDI_TRANSPORT_RECEIVE', b'0'),
                       (b'TRACK_MUTE_MASK', b'0'), (b'TRACK_CUE_MASK', b'0')):
        project, count = re.subn(rb'(?m)^' + key + rb'=\d+', key + b'=' + value, project, count=1)
        if count != 1:
            raise ValueError('Missing project key: ' + key.decode())
    marker = bytearray((template / 'markers.work').read_bytes())
    if marker[-2:] != checksum(marker) or len(marker) < 0x16 + 784 + 2:
        raise ValueError('Invalid marker template')
    marker[0x16:0x16 + 784] = struct.pack('>III', 0, FRAMES, 0) + bytes(772)
    marker[-2:] = checksum(marker)
    out.mkdir(parents=True, mode=0o700)
    report = {'schema': 1, 'state': 'FILES_VALIDATED_EMULATOR_LOAD_PENDING', 'hardware': 'NOT_RUN',
              'deviceOpened': False, 'templateInputs': inputs, 'projects': [],
              'cases': {'A01': 'T1, one trig per 64 steps, neutral pitch', 'A02': 'T1, same, minimum pitch lock',
                        'A03': 'T1, same, maximum pitch lock', 'A04': 'T1, trig every step, neutral pitch',
                        'A05': 'T1-T8 stock FLEX activity; FRACT substitutes T1 only',
                        'A06': 'FRACT only: Part 2, dense trigs, POS/SIZE/REVS/SPRD/SHPE locks and three LFOs; not a matched native case'},
              'limits': 'Generated from a private format template; files are not a hardware result. One FRACT owner on T1, FX1/FX2 NONE, TSTR off, baseline LFO depths zero, tempo 120, 64 steps at 1X. A06 uses three LFOs on Part 2 only. Native and FRACT source controls differ by design; their grain controls are not equivalent. Confirm normal pattern mode, no mutes, and the sample slot on the unit. Arranger files are not copied.'}
    for width, channels, fmt in ((2, 1, '16M'), (2, 2, '16S'), (3, 1, '24M'), (3, 2, '24S')):
        for fract in (False, True):
            name = ('FR' if fract else 'FX') + fmt
            dest = out / name; dest.mkdir()
            sample(dest / 'AUDIO/BENCH.wav', width, channels)
            block = b'\r\n[SAMPLE]\r\nTYPE=FLEX\r\nSLOT=001\r\nPATH=AUDIO/BENCH.wav\r\nTRIM_BARSx100=100\r\nLOOP_BARSx100=100\r\nBPMx24=2880\r\nTSMODE=0\r\nLOOPMODE=1\r\nGAIN=48\r\nTRIGQUANTIZATION=-1\r\n[/SAMPLE]\r\n'
            for suffix in ('work', 'strd'):
                (dest / ('project.' + suffix)).write_bytes(project + block)
                (dest / ('markers.' + suffix)).write_bytes(marker)
            for num in range(1, 17):
                data = make_bank(bank, fract, num, op, ob)
                for suffix in ('work', 'strd'):
                    path = dest / f'bank{num:02d}.{suffix}'; path.write_bytes(data)
                    check = path.read_bytes(); ob.check_tags(check)
                    if check[-2:] != checksum(check):
                        raise ValueError('Written bank checksum differs')
            hashes = {str(p.relative_to(dest)): digest(p) for p in sorted(dest.rglob('*')) if p.is_file()}
            report['projects'].append({'name': name, 'machine': 'FRACT' if fract else 'FLEX',
                                       'bits': width * 8, 'channels': channels, 'files': hashes})
    if inputs != {name: digest(template / name) for name in inputs}:
        raise ValueError('Template changed during generation')
    (out / 'projects.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'state': report['state'], 'projects': len(report['projects']), 'templateUnchanged': True, 'deviceOpened': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--template', type=Path, required=True)
    parser.add_argument('--upstream', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    build(parser.parse_args())
