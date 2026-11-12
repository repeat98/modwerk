#!/usr/bin/env python3
"""Check the actual Octemu sine-carrier/stop walk; retain summary only.

The fixture must contain no audio files. Select FM SYNTH, INDX=0, RATO=1,
PTCH=0 and FINE=0; play then double-STOP. This gate covers that one path,
not arbitrary FM patches, timing, hardware or maximum load.
"""
import argparse
import hashlib
import json
import struct
import wave


def analyze(path):
    with wave.open(str(path)) as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (2, 2, 44100):
            raise ValueError('Expected Octemu stereo 16-bit 44.1 kHz recording')
        raw = wav.readframes(wav.getnframes())
    pcm = struct.unpack('<' + 'h' * (len(raw) // 2), raw)
    left = pcm[::2]
    active = [i for i, value in enumerate(left) if abs(value) > 20]
    if not active or active[0] + 5096 >= len(left):
        raise ValueError('No sustained generated carrier')
    section = left[active[0] + 1000:active[0] + 5096]
    # Distinguish C4 FM carrier from the deleted fixture's 440 Hz sine.
    error = {lag: sum((section[i] - section[i-lag]) ** 2
                     for i in range(lag, len(section))) / (len(section)-lag)
             for lag in range(90, 180)}
    period = min(error, key=error.get)
    result = {'frames': len(left), 'nonzeroValues': sum(v != 0 for v in pcm),
              'peak': max(map(abs, pcm)), 'pcmSha256': hashlib.sha256(raw).hexdigest(),
              'firstActiveFrame': active[0], 'lastActiveFrame': active[-1],
              'carrierPeriodFrames': period, 'carrierFrequencyHz': 44100 / period,
              'finalHalfSecondPeak': max(map(abs, pcm[-44100:])),
              'checks': {'generatedCarrier': 'passed' if 167 <= period <= 170 else 'failed',
                         'doubleStopSilence': 'passed' if max(map(abs, pcm[-44100:])) <= 2 else 'failed'}}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('wav')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = analyze(args.wav)
    with open(args.output, 'w', encoding='utf8') as target:
        json.dump(result, target, indent=2)
        target.write('\n')
    if any(status != 'passed' for status in result['checks'].values()):
        raise SystemExit('Audio smoke failed; see sanitized report')


if __name__ == '__main__':
    main()
