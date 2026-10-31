#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Prove native audio from the packaged fixture on an independent DSP emulator.

Reuses exact-package reconstruction/loader attestation and normal panel edits.
PCM is captured from the real emulator's main output and per-track DSP taps.
"""
import array
import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
from types import SimpleNamespace
import wave

import reconstruction_emulator as reconstruction
import stress_emulator as fixture

STATE = {}


def capture_audio(port, run, out, label, action=None):
    port.command('audio start tracks')
    if action:
        run(100)
        action()
    chunks = []
    for _ in range(20):
        run(50)
        line = port.command('audio read 4096', b'audio ')
        _, count, *raw = line.split()
        data = bytes.fromhex(raw[0]) if raw else b''
        assert len(data) == int(count) * 48
        chunks.append(data)
    status = port.command('audio status', b'audio status ')
    assert 'dropped=0' in status, status
    port.command('audio stop')
    data = b''.join(chunks)
    values = array.array('h'); values.frombytes(data)
    if sys.byteorder != 'little': values.byteswap()
    frames = len(values) // 24
    assert frames >= 40000, 'Too little native PCM captured'
    channels = [values[c::24] for c in range(24)]
    metrics = []
    for samples in channels:
        metrics.append(dict(rms=math.sqrt(sum(x*x for x in samples) / len(samples)), peak=max(abs(x) for x in samples)))
    assert metrics[2]['rms'] > 20 and metrics[3]['rms'] > 20, 'Native MAIN output is silent'
    def strength(samples, frequency):
        cosine = 2 * math.cos(2 * math.pi * frequency / 44100)
        a = b = 0.0
        for sample in samples:
            a, b = sample + cosine*a - b, a
        return a*a + b*b - cosine*a*b
    stems = []
    for track, row in enumerate(STATE['fixture']['originalGeneratedSamples']):
        index = 8 + 2 * track
        assert max(metrics[index]['rms'], metrics[index + 1]['rms']) > 10, 'Silent track T%d' % (track + 1)
        strongest = max(STATE['fixture']['originalGeneratedSamples'], key=lambda tone: strength(channels[index], tone['frequencyHz']))
        assert strongest['frequencyHz'] == row['frequencyHz'], ('Wrong sample/pitch on T%d' % (track + 1), strongest)
        stems.append(dict(track=track + 1, machine=row['machine'], rms=metrics[index]['rms'],
                          peak=metrics[index]['peak'], expectedToneHz=row['frequencyHz'], expectedToneDominant=True))
    with wave.open(str(out / (label + '-tracks.private.wav')), 'wb') as wav:
        wav.setnchannels(24); wav.setsampwidth(2); wav.setframerate(44100); wav.writeframes(data)
    main = array.array('h')
    for at in range(0, len(values), 24): main.extend(values[at + 2:at + 4])
    if sys.byteorder != 'little': main.byteswap()
    with wave.open(str(out / (label + '-main.wav')), 'wb') as wav:
        wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(44100); wav.writeframes(main.tobytes())
    result = dict(frames=frames, sampleRate=44100, channels=24, ringDroppedFrames=0,
                  mainRms=[metrics[2]['rms'], metrics[3]['rms']], mainPeak=[metrics[2]['peak'], metrics[3]['peak']],
                  stems=stems, pcmSha256=hashlib.sha256(data).hexdigest())
    STATE['captures'][label] = result
    print('Captured ' + label + ': MAIN and eight expected track tones verified', flush=True)
    return result


def exercise(port, run, tap, key, encoder, capture, out, reboot):
    assert not reboot
    bank = fixture.u32(port, 0x46c82456)
    assert port.peek(0x100b14d0, 1) == b'\0'
    before = fixture.read(port, bank, 8 * 0x91a)
    assert fixture.read(port, 0x1001614e, len(before)) == before
    part = bank + 0x8ed80
    for track in range(8):
        kind = port.peek(part + 0x22 + track, 1)[0]
        assert kind == (1 if track < 4 else 0)
        assert port.peek(part + 0x2ca + 5 * track + kind, 1)[0] == track
        assert before[track * 0x91a:track * 0x91a + 8] == bytes([255]) * 8
    STATE.update(port=port, run=run, tap=tap, out=out)
    tap(0x25, 1)
    assert fixture.u32(port, 0x800065b8)
    run(250)
    capture_audio(port, run, out, 'module-closed')
    def menu(clear):
        port.command('key 0x25 32'); run(80); tap(0x23, 32); port.command('key 0x25 0'); run(80)
        encoder(6, -24); encoder(6, 20 if clear else 16); key('YES')
        assert port.ui_phase() == 2
        encoder(0, 4); key('YES'); assert port.ui_phase() == 3
    expected = bytearray(before)
    for track in range(8):
        for step in range(64): expected[track * 0x91a + 0x78 + 32 * step] = track
    for clear, label, wanted in ((False, 'after-512-lock', bytes(expected)), (True, 'after-512-clear', before)):
        menu(clear)
        # Capture starts before final YES and continues through the edit.
        capture_audio(port, run, out, label, action=lambda: key('YES'))
        assert port.ui_phase() == 0
        assert fixture.read(port, bank, len(before)) == wanted
        assert fixture.read(port, 0x1001614e, len(before)) == wanted
        assert fixture.u32(port, 0x800065b8)
        assert port.peek(0x46c7d48c, 64) == bytes([0 if clear else 255]) * 64
        port.attest()
    # Exercise the saved Clear fixtures too, including both flag-scan ends.
    for pattern in range(1, 4):
        tap(0x24, 128); assert not fixture.u32(port, 0x800065b8)
        port.command('key 0x25 64'); run(80); tap(0x20, 1 << pattern)
        port.command('key 0x25 0'); run(100)
        assert port.peek(0x100b14d0, 1) == bytes([pattern])
        at = bank + pattern * 0x8ed8
        original = fixture.read(port, at, len(before))
        expected_clear = bytearray(original)
        for track in range(8):
            assert original[track * 0x91a:track * 0x91a + 8] == bytes([255]) * 8
            for step in range(64):
                offset = track * 0x91a + 0x78 + 32 * step
                assert original[offset] == track
                expected_clear[offset] = 255
        tap(0x25, 1); run(250)
        capture_audio(port, run, out, 'A%02d-before-clear' % (pattern + 1))
        menu(True)
        capture_audio(port, run, out, 'A%02d-through-clear' % (pattern + 1), action=lambda: key('YES'))
        assert port.ui_phase() == 0 and fixture.u32(port, 0x800065b8)
        assert fixture.read(port, at, len(before)) == expected_clear
        assert fixture.read(port, 0x1001614e + pattern * 0x8ed8, len(before)) == expected_clear
        assert port.peek(0x46c7d48c, 64) == bytes([0 if pattern == 1 else 255]) * 64
        port.attest()
    # The loader's ENTER requires stopped transport. This is explicit test
    # teardown, separate from Apply's verified playback-preservation behavior.
    tap(0x24, 128); assert not fixture.u32(port, 0x800065b8)
    return dict(allEightTrackAssignmentsVerified=True, allEightTracksHave64SampleTrigs=True,
                maximumLiveLocksWritten=512, maximumLiveLocksCleared=512, nativePlaybackPcmVerified=True,
                allFourSavedPatternsExercised=True, lockIndexCompared=True,
                patternAndMirrorCompared=True, audibleHardwareVerified=False)


def after_undo(port, out):
    STATE['tap'](0x25, 1)
    capture_audio(port, STATE['run'], out, 'without-module')
    STATE['tap'](0x24, 128)
    for address in (0x4002dc68, 0x4002dc90, 0x4002dcc4):
        assert hashlib.sha256(port.peek(address, 6)).hexdigest() == 'd35bfe797abb5bb27e98ec6d4cb422e20c44f307e5d6597af674380832f8dbdf'
    (out / 'audio-fixture.json').write_text(json.dumps(dict(hardware=False,
        explicitMainLevel=64, originalGeneratedSamples=True, captures=STATE['captures'],
        fixtureCardSha256=STATE['fixture']['cardSha256'], allEightExpectedTonesVerified=True,
        listeningVerdict=None, audioDuringCommitNotYetCompared=True,
        limitations='Native emulator PCM, not physical playback or dropout/CPU/stack qualification.'), indent=2) + '\n')
    return dict(audioVerifiedWithoutModule=True, allDeclaredSitesRestored=True)


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--fixture', type=Path, required=True)
    args, remaining = parser.parse_known_args()
    STATE.update(fixture=json.loads(args.fixture.read_text()), captures={})
    original_load = reconstruction.capture.load
    original_port = reconstruction.capture.Port
    class AudioPort(original_port):
        def __init__(self, command, directory):
            assert '--main-level' in command
            command[command.index('--main-level') + 1] = '64'
            super().__init__(command, directory)
    def load(name, filename):
        if name == 'psl_exercise': return SimpleNamespace(exercise=exercise, after_undo=after_undo)
        return original_load(name, filename)
    reconstruction.capture.load = load
    reconstruction.capture.Port = AudioPort
    sys.argv = [sys.argv[0], *remaining]
    reconstruction.main()


if __name__ == '__main__': main()
