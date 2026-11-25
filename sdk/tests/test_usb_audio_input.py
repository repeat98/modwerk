# SPDX-License-Identifier: GPL-3.0-or-later
"""Run the authored injector on synthetic samples and dirty host-port words."""
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import tempfile
import unittest

SDK = Path(__file__).resolve().parents[1] / 'machines/octatrack'
sys.path[:0] = [str(SDK / 'module-adapters'), str(SDK / 'elekloader')]
import dsp_packages  # noqa: E402
import usb_audio_input  # noqa: E402


def memory_record(space, address, words):
    return struct.pack('<BII', space, address, len(words)) + struct.pack(f'<{len(words)}I', *words)


def pair_words(samples, channels):
    result = [0xbb0001 if channels else 0xaa0000]
    for frame in range(16):
        for channel in channels:
            sample = samples[channel][frame]
            result += [0xa00000 | sample >> 8, 0x8ff000 | (sample & 255)]
    return result


class UsbAudioInput(unittest.TestCase):
    def test_both_banks_inject_only_the_routed_channels_and_consume_each_block(self):
        assembler = os.environ.get('ELEKLOADER_DSP_ASM')
        host = Path(assembler).with_name('dsp_host') if assembler else None
        if not host or not host.is_file():
            self.skipTest('dsp_host is required beside ELEKLOADER_DSP_ASM')
        bank_offset = usb_audio_input.DESTINATION & 0xfff
        end = 0x1fdf
        rx = 0x8100
        samples = [[((ch + 1) * 0x294931 + frame * 18353) & 0xffffff
                    for frame in range(16)] for ch in range(4)]
        analog = [((sample + 20) * 1337 + 1) & 0xffffff for sample in range(64)]
        routing = [('OFF', (), ()), ('AB', (), (0, 1)), ('CD', (0, 1), ()),
                   ('ABCD', (2, 3), (0, 1))]
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            source = usb_audio_input.dsp_source()
            sized, _ = dsp_packages.assemble(source, end, work)
            origin = end - len(sized)
            inject, _ = dsp_packages.assemble(source, origin, work)
            for bank in (0x2000, 0x4000):
                wrapper = f"""init:
        rts
proc:
        move #>${bank:x},r6
        move #>${origin:x},r5
        jsr  (r5)
        rts
"""
                boot, labels = dsp_packages.assemble(wrapper, 0x1000, work)
                mailbox = bank + bank_offset
                fixture = (memory_record(0, 0x1000, boot) + memory_record(0, origin, inject)
                           + memory_record(1, 0x202, [rx]) + memory_record(1, 0x20d, [16])
                           + memory_record(1, rx, analog))
                addresses = [mailbox, *range(rx, rx + len(analog))]
                for mode, cd, ab in routing:
                    with self.subTest(bank=hex(bank), mode=mode):
                        marker = usb_audio_input.MAGIC if mode != 'OFF' else 0
                        payload = [0xc00000 | marker, 0] + pair_words(samples, cd) + pair_words(samples, ab)
                        image = work / 'audio-input.mem'
                        image.write_bytes(fixture + memory_record(1, mailbox, payload) + b'\xff')
                        run = subprocess.run([host, '-mem', image, '-init', f'{labels["init"]:x}',
                                              '-proc', f'{labels["proc"]:x}', '-ctx', '100f,100f,1010',
                                              '-blocks', '1', '-frames', '16', '-out', work / 'audio.raw',
                                              '-peekx', ','.join(f'{at:x}' for at in addresses)],
                                             capture_output=True, text=True, timeout=10)
                        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
                        words = {int(at, 16): int(value, 16) for at, value in
                                 re.findall(r'X:0x([0-9a-f]+)\s*=\s*0x([0-9a-f]+)', run.stdout)}
                        expected = analog.copy()
                        for first, channels in ((0, cd), (2, ab)):
                            for slot, channel in enumerate(channels, first):
                                expected[slot::4] = samples[channel]
                        self.assertEqual([words[at] for at in addresses[1:]], expected)
                        self.assertEqual(words[mailbox], 0 if marker else 0xc00000)


if __name__ == '__main__':
    unittest.main()
