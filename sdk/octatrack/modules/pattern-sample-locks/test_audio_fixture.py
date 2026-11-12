# SPDX-License-Identifier: MIT
"""Measurement sanity: silence and a swapped sample must fail the PCM check.

Synthetic PCM only. These tests do not replace native emulator captures.
"""
import array
import math
from pathlib import Path
import sys
import tempfile
import unittest

import audio_fixture_emulator as audio


class RecordedPort:
    def __init__(self, raw): self.raw = raw; self.at = 0
    def command(self, command, prefix=None):
        if command == 'audio start tracks': self.at = 0; return 'ok'
        if command.startswith('audio read'):
            data = self.raw[self.at:self.at + 2205 * 48]; self.at += len(data)
            return 'audio %d %s' % (len(data) // 48, data.hex())
        if command == 'audio status': return 'audio status dropped=0'
        if command == 'audio stop': return 'ok'
        raise AssertionError(command)


class AudioMeasurementTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = [dict(frequencyHz=256 + 128*t, machine='FLEX' if t < 4 else 'STATIC') for t in range(8)]
        values = array.array('h')
        for n in range(44100):
            tones = [round(1000*math.sin(2*math.pi*row['frequencyHz']*n/44100)) for row in cls.rows]
            frame = [0] * 24
            frame[2] = frame[3] = sum(tones)
            for t, value in enumerate(tones): frame[8+2*t] = frame[9+2*t] = value
            values.extend(frame)
        if sys.byteorder != 'little': values.byteswap()
        cls.good = values.tobytes()

    def check(self, data):
        audio.STATE.update(fixture=dict(originalGeneratedSamples=self.rows), captures={})
        with tempfile.TemporaryDirectory() as temp:
            return audio.capture_audio(RecordedPort(data), lambda ms: None, Path(temp), 'synthetic')

    def test_accepts_all_eight_identifiable_tones(self):
        self.assertEqual(len(self.check(self.good)['stems']), 8)

    def test_refuses_silent_output(self):
        with self.assertRaisesRegex(AssertionError, 'MAIN output is silent'):
            self.check(bytes(len(self.good)))

    def test_refuses_swapped_track_samples(self):
        data = bytearray(self.good)
        for at in range(0, len(data), 48):
            data[at+16:at+20], data[at+20:at+24] = data[at+20:at+24], data[at+16:at+20]
        with self.assertRaisesRegex(AssertionError, 'Wrong sample/pitch on T1'):
            self.check(data)


if __name__ == '__main__': unittest.main()
