# SPDX-License-Identifier: MIT
"""Synthetic checks of the hardware-recording analyser, not hardware evidence."""
import array
import math
from pathlib import Path
import sys
import tempfile
import unittest
import wave

from device_audio_preflight import analyse


class DeviceAudioPreflightTests(unittest.TestCase):
    def capture(self, width=2, mode='tones'):
        values = array.array('h' if width == 2 else 'i')
        scale = 1 << (8 * width - 1)
        for n in range(44100):
            tones = [round(scale * 0.01 * math.sin(2 * math.pi * (256 + 128*t) * n / 44100))
                     for t in range(8)]
            if mode == 'dc':
                tones = [round(scale * 0.01)] * 8
            if mode == 'swapped':
                tones[0], tones[1] = tones[1], tones[0]
            main = 0 if mode == 'muted-main' else sum(tones)
            values.extend([value for tone in tones for value in (tone, tone)] + [main, main, 0, 0])
        if sys.byteorder != 'little':
            values.byteswap()
        with tempfile.TemporaryDirectory() as temp:
            filename = Path(temp) / 'synthetic.wav'
            with wave.open(str(filename), 'wb') as output:
                output.setparams((20, width, 44100, 0, 'NONE', 'not compressed'))
                output.writeframes(values.tobytes())
            return analyse(filename)

    def test_accepts_pcm16_and_pcm32_tones(self):
        for width in (2, 4):
            with self.subTest(width=width):
                self.assertTrue(self.capture(width)['allEightTonesPresentInMain'])

    def test_refuses_constant_channels_even_when_loud(self):
        with self.assertRaisesRegex(AssertionError, 'Wrong tone|weak/distorted'):
            self.capture(mode='dc')

    def test_refuses_muted_main_with_active_stems(self):
        with self.assertRaisesRegex(AssertionError, 'MAIN is silent'):
            self.capture(mode='muted-main')

    def test_refuses_swapped_track_tones(self):
        with self.assertRaisesRegex(AssertionError, 'Wrong tone on T1'):
            self.capture(mode='swapped')


if __name__ == '__main__':
    unittest.main()
