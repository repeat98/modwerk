#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Verify the fixture's eight tones in a 20-channel Tracks/Main/Cue recording.

Reads host PCM only. Device identity and recording provenance belong in the
supervised run's receipt; this analyser does not operate the instrument.
"""
import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import sys
import wave


def power(samples, frequency, rate):
    coefficient = 2 * math.cos(2 * math.pi * frequency / rate)
    a = b = 0.0
    for value in samples:
        a, b = value + coefficient * a - b, a
    return a*a + b*b - coefficient*a*b


def analyse(filename):
    with wave.open(str(filename), 'rb') as wav:
        channels, rate, width, frames = wav.getnchannels(), wav.getframerate(), wav.getsampwidth(), wav.getnframes()
        assert channels == 20 and rate == 44100 and width in (2, 4), 'Expected Tracks + Main + Cue PCM at 44.1 kHz'
        data = array.array('h' if width == 2 else 'i', wav.readframes(frames))
    if sys.byteorder != 'little': data.byteswap()
    assert frames >= rate, 'Record at least one second'
    # Choose a complete one-second window with the strongest main output.
    # Manual transport start can leave silence at either end of a recording.
    starts = list(range(0, frames - rate + 1, max(1, rate // 4)))
    def main_energy(start):
        return sum(x*x for x in data[start*20+16:(start+rate)*20:20])
    start = max(starts, key=main_energy)
    scale = float(1 << (8*width - 1))
    traces = [[x / scale for x in data[start*20+c:(start+rate)*20:20]] for c in range(20)]
    rms = [math.sqrt(sum(v*v for v in trace)/rate) for trace in traces]
    assert min(rms[16:18]) > 0.00001, 'MAIN is silent'
    tones = [256 + 128*t for t in range(8)]
    rows = []
    for track, frequency in enumerate(tones):
        channel = 2*track
        assert max(rms[channel:channel+2]) > 0.00001, 'Silent track T%d' % (track+1)
        values = traces[channel if rms[channel] >= rms[channel+1] else channel+1]
        powers = [power(values, f, rate) for f in tones]
        assert max(range(8), key=lambda t: powers[t]) == track, 'Wrong tone on T%d' % (track+1)
        fraction = 2*powers[track]/(rate*sum(v*v for v in values))
        assert fraction > 0.8, 'Expected tone is weak/distorted on T%d' % (track+1)
        rows.append(dict(track=track+1, expectedHz=frequency, rmsFullScale=rms[channel:channel+2],
                         expectedFrequencyEnergyFraction=fraction))
    main = traces[16]
    main_fractions = [2*power(main, f, rate)/(rate*sum(v*v for v in main)) for f in tones]
    assert min(main_fractions) > 0.005, 'A fixture tone is missing from the MAIN mix'
    return dict(captureSha256=hashlib.sha256(Path(filename).read_bytes()).hexdigest(), channels=channels,
                sampleRate=rate, sourceFrames=frames, selectedWindowStartFrame=start, analysedFrames=rate,
                allEightTrackTonesVerified=True, allEightTonesPresentInMain=True, mainRmsFullScale=rms[16:18],
                mainToneEnergyFractions=main_fractions, tracks=rows,
                scope='Audio fixture preflight only; no timing, dropout, CPU or stack qualification.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('wav', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = analyse(args.wav)
    args.out.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__': main()
