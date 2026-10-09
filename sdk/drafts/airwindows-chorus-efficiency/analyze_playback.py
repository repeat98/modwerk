#!/usr/bin/env python3
"""Check a private, full-emulator T3/T4 MIX-ramp reproduction capture.

This checks real ColdFire control delivery and DSP chain output, unlike the
synthetic instance gate. It reports discontinuity measurements, not a claim
that hardware clicking is fixed. Firmware, card, dumps and audio stay private.
See CLICKING.md for the exact fixture and emulator invocation.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'sdk/octabam/tools'))
import toolpath  # noqa: E402,F401
import blockdump  # noqa: E402
import recloop  # noqa: E402


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def measure(samples):
    if len(samples) < 2:
        raise ValueError('Missing captured audio')
    jumps = [abs(b - a) for a, b in zip(samples, samples[1:])]
    peak = max(map(abs, samples))
    return {
        'frames': len(samples),
        'peakFs': peak / 8388608,
        'rmsFs': math.sqrt(sum(s*s for s in samples)/len(samples)) / 8388608,
        'maximumAdjacentStepFs': max(jumps) / 8388608,
        'maximumStepAtFrame': jumps.index(max(jumps)) + 1,
        'railSamples': sum(abs(s) >= 8388607 for s in samples),
    }


def analyze(run, image, emulator):
    log = (run / 'full.log').read_text()
    match = re.search(r'frames run : (\d+) since transport start \(target (\d+)\), run ended (\w+)', log)
    if not match or match.groups() != ('8192', '8192', 'REACHED'):
        raise ValueError('The requested playback did not complete')
    if 'load run ended: LOAD PROJECT handled' not in log:
        raise ValueError('Project load did not complete')
    ids = (run / 'ids.bin').read_bytes()
    if ids != bytes(8) + bytes([0, 0, 30, 30, 0, 0, 0, 0]):
        raise ValueError('Expected NONE in FX1 and Air Chorus only in T3/T4 FX2')
    captured = blockdump.classes(blockdump.read(run / 'blocks.dump'))
    control_blocks = sorted(
        captured.get(('>', 0, 1, 0x80000110), []) +
        captured.get(('>', 0, 1, 0x80000310), []))
    if len(control_blocks) != 8192:
        raise ValueError('Missing real control blocks')
    # ColdFire sends 32 halfwords per track; FX2 page 1 occupies 12..17.
    # The fractional low byte is stock's own parameter slew, before our DSP.
    delivered = []
    for track in (3, 4):
        offset = (track - 1) * 32
        rows = [w[offset+12:offset+18] for _, w in control_blocks[128:]]
        spd, rng = ({r[i] for r in rows} for i in (0, 1))
        mix = [r[5] for r in rows]
        if spd != {64 << 8} or rng != {64 << 8}:
            raise ValueError(f'T{track}: SPD/RNG are not the requested 64/64')
        if track == 3 and set(mix) != {64 << 8}:
            raise ValueError('T3 MIX changed unexpectedly')
        if track == 4 and (min(mix), max(mix), mix[-1]) != (0, 127 << 8, 127 << 8):
            raise ValueError('T4 MIX did not traverse both endpoints and settle')
        if track == 4 and any(b < a for a, b in zip(mix, mix[1:])):
            raise ValueError('T4 MIX ramp was not monotonic')
        delivered.append({'track': track, 'spd': 64, 'rng': 64,
                          'mixMinimum': min(mix)/256, 'mixMaximum': max(mix)/256,
                          'distinctMixValues': len(set(mix))})
    audio = []
    for track in range(1, 9):
        for right in (False, True):
            source = recloop.track_audio(captured, track, right)
            output = recloop.readback_audio(captured, track, right)
            if len(source) != 131072 or len(output) != 131072:
                raise ValueError(f'T{track}: missing input or output frames')
            active = track in (3, 4)
            if bool(any(source)) != active or bool(any(output)) != active:
                raise ValueError(f'T{track}: unexpected silence or signal')
            if active:
                audio.append({'track': track, 'channel': 'R' if right else 'L',
                              'input': measure(source), 'output': measure(output)})
    return {
        'fixture': 'T3/T4 FX2, SPD/RNG 64, T3 MIX 64, T4 MIX 0..127; stock FX1 NONE',
        'sampleRate': 44100, 'blocks': 8192, 'frames': 131072,
        'simulatedSeconds': 131072/44100,
        'mainOsSha256': sha(image), 'emulatorSha256': sha(emulator),
        'privateCaptureSha256': sha(run / 'blocks.dump'),
        'projectLoadCompleted': True, 'playbackCompleted': True,
        'effectAssignmentsPassed': True, 'controlDelivery': delivered,
        'silentOtherTracksPassed': True, 'audio': audio,
        'hardwareStatus': 'untested', 'clickingFixStatus': 'not established',
        'limitations': [
            'Generated tone fixture; original reporter project/settings are unavailable.',
            'Adjacent sample steps are diagnostic measurements, not a universal click detector.',
            'The emulator does not establish physical DSP deadlines or memory stalls.',
            'No physical listening, Part reload, project reload or reboot result.',
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', type=Path, required=True,
                        help='Private folder containing full.log, blocks.dump and ids.bin')
    parser.add_argument('--image', type=Path, required=True)
    parser.add_argument('--emulator', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True,
                        help='Sanitized JSON report; raw data is never copied')
    parser.add_argument('--reference-run', type=Path)
    parser.add_argument('--reference-image', type=Path)
    args = parser.parse_args()
    if bool(args.reference_run) != bool(args.reference_image):
        parser.error('Provide both reference arguments together')
    report = analyze(args.run, args.image, args.emulator)
    if args.reference_run:
        reference = analyze(args.reference_run, args.reference_image, args.emulator)
        left, right = [blockdump.classes(blockdump.read(p/'blocks.dump'))
                       for p in (args.reference_run, args.run)]
        for track in range(1, 9):
            for channel in (False, True):
                for read in (recloop.track_audio, recloop.readback_audio):
                    if read(left, track, channel) != read(right, track, channel):
                        raise ValueError(f'T{track}: full-playback input or output differs from reference')
        for key in left.keys() | right.keys():
            if key[0] == '>' and key[1] == 0 and key[3] in (0x80000110, 0x80000310, 0x80000210, 0x80000410):
                if left.get(key) != right.get(key):
                    raise ValueError('Full-playback control blocks differ from reference')
        report['comparison'] = {
            'referenceMainOsSha256': reference['mainOsSha256'],
            'referenceCaptureSha256': reference['privateCaptureSha256'],
            'inputAndOutputBitIdenticalOnAllTracks': True,
            'realControlBlocksIdentical': True,
            'activeStereoFramesCompared': 2 * report['frames'],
        }
    args.output.write_text(json.dumps(report, indent=2)+'\n')
    print('PASS: actual project load, 8192 playback blocks, T3/T4 control delivery and chain audio')
    print('Hardware clicking remains unverified.')


if __name__ == '__main__':
    main()
