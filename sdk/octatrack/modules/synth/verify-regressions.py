#!/usr/bin/env python3
"""Replay #264 and #273 on private Octemu images. Run inside the documented sandbox.

Use a firmware-created, sample-free card/battery copy with a step-1 trig and
FX1/FX2 NONE. Every case gets a fresh battery and card. Only summary JSON may
leave the private output folder; images, cards, WAVs and raw logs stay local.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import wave
from array import array
import sys


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def walk(case):
    steps = [{'record': 0}, {'wait_text': 'PTCH', 'timeout_ms': 60000},
             {'wait_guest_ms': 16000}, {'tap': 'NO'}, {'tap': 'T1'},
             {'press': 'FUNC'}, {'tap': 'SRC'}, {'release': 'FUNC'},
             {'wait_guest_ms': 300}]
    steps += [{'tap': 'DOWN'}] * 5
    steps += [{'tap': 'YES'}, {'tap': 'SRC', 'until': 'RAT0'},
              {'encoder': 2, 'delta': -1, 'times': 32, 'over_ms': 1200},
              {'tap': 'AMP'},
              {'encoder': 2, 'delta': -1, 'times': 87, 'over_ms': 1600}]
    if case == 'midi':
        steps += [{'tap': 'SRC'}, {'tap': 'MIDI'}, {'press': 'FUNC'},
                  {'tap': 'DOWN'}, {'tap': 'DOWN'}, {'tap': 'UP'},
                  {'tap': 'DOWN'}, {'release': 'FUNC'}, {'tap': 'MIDI'},
                  {'tap': 'SRC', 'until': 'RAT0', 'timeout_ms': 15000}]
        return steps
    steps += [{'encoder': 3, 'delta': 1, 'times': 127, 'over_ms': 1600}]
    if case == 'poly':
        steps += [{'tap': 'LFO'},
                  {'encoder': 2, 'delta': 1, 'times': 3, 'over_ms': 300},
                  {'encoder': 5, 'delta': 1, 'times': 127, 'over_ms': 1000}]
    steps += [{'tap': 'SRC'}, {'record': 1}, {'tap': 'PLAY', 'until_lamp': 1, 'lit': 1},
              {'wait_guest_ms': 1000}, {'tap': 'STOP', 'until_lamp': 1, 'lit': 0},
              {'tap': 'STOP', 'until_lamp': 1, 'lit': 0}, {'wait_guest_ms': 1000},
              {'record': 0}]
    return steps


def audio_summary(path):
    with wave.open(str(path)) as wav:
        assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) == (2, 2, 44100)
        raw = wav.readframes(wav.getnframes())
    pcm = array('h'); pcm.frombytes(raw)
    if sys.byteorder != 'little': pcm.byteswap()
    left = pcm[::2]
    active = [i for i, value in enumerate(left) if abs(value) > 20]
    assert active and len(left) > active[0] + 5096, 'No sustained generated audio'
    section = left[active[0] + 1000:active[0] + 5096]
    error = {lag: sum((section[i] - section[i-lag]) ** 2 for i in range(lag, len(section))) / (len(section)-lag) for lag in range(90, 180)}
    period = min(error, key=error.get)
    return {'frames': len(left), 'peak': max(map(abs, pcm)),
            'pcmSha256': hashlib.sha256(raw).hexdigest(), 'carrierPeriodFrames': period,
            'finalHalfSecondPeak': max(map(abs, pcm[-44100:]))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['octemu', 'image', 'card', 'battery', 'output']:
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--image-sha256', required=True)
    parser.add_argument('--case', choices=['midi', 'mono', 'poly'], required=True)
    parser.add_argument('--timeout', type=int, default=300)
    args = parser.parse_args()
    assert sha(args.image) == args.image_sha256, 'Wrong local test image'
    args.output.mkdir(parents=True, exist_ok=False)
    case = args.output
    shutil.copy2(args.card, case/'card.img'); shutil.copy2(args.battery, case/'nvram.bin')
    (case/'walk.jsonl').write_text(''.join(json.dumps(s) + '\n' for s in walk(args.case)))
    command = [str(args.octemu.resolve()), '--headless', '--read-only', '--cf-card', str(case/'card.img'),
               '--nvram', str(case/'nvram.bin'), '--os', str(args.image.resolve()),
               '--script', str(case/'walk.jsonl'), '--timeout', str(args.timeout)]
    if args.case != 'midi': command += ['--recording', str(case/'audio.wav')]
    with (case/'raw.log').open('w') as log:
        result = subprocess.run(command, cwd=args.octemu.resolve().parent, stdout=log, stderr=subprocess.STDOUT, timeout=args.timeout + 30)
    log = (case/'raw.log').read_text()
    passed = result.returncode == 0 and 'saw RAT0' in log and not any(s in log.lower() for s in ['script failed', 'timed out', 'deadline'])
    report = {'case': args.case, 'imageSha256': args.image_sha256,
              'fixtureCardSha256': sha(args.card), 'fixtureBatterySha256': sha(args.battery),
              'emulatorSha256': sha(args.octemu), 'walkSha256': sha(case/'walk.jsonl'),
              'status': 'passed' if passed else 'failed',
              'limitations': ['Software emulator only; no physical hardware, chip timing, all-track load or complete memory qualification.']}
    if args.case == 'midi':
        # Initial selection and the post-selector SRC gate must both execute.
        passed = passed and log.count('saw RAT0') >= 2
    elif passed:
        report['audio'] = audio_summary(case/'audio.wav')
        passed = report['audio']['finalHalfSecondPeak'] <= 2
        if args.case == 'mono': passed = passed and 167 <= report['audio']['carrierPeriodFrames'] <= 170
    report['status'] = 'passed' if passed else 'failed'
    (case/'summary.json').write_text(json.dumps(report, indent=2) + '\n')
    if not passed: raise SystemExit('Regression failed; see private raw.log')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
