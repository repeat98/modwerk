# SPDX-License-Identifier: GPL-3.0-or-later
"""The USB input drift trim (usb_audio_input_trim.c), compiled for the host: the interpolated block and the fill servo."""
import ctypes
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'octatrack/modules/usb-audio-out-tracks-main-cue/usb_audio_input_trim.c'
RING, BLOCK, TARGET = 1024, 16, 96   # usbaudio_in.s IN_FRAMES, BLOCK, IN_TARGET
RATE, PACKET = 44100, 250e-6


def put(ring, stride, index, values):
    at = (index % RING) * stride
    for channel, value in enumerate(values):
        ring[at + 4 * channel:at + 4 * channel + 4] = struct.pack('<i', value * 256)  # pad byte first


def get(ring, stride, index, channels):
    at = (index % RING) * stride
    return [struct.unpack_from('<i', bytes(ring[at + 4 * c:at + 4 * c + 4]))[0] >> 8 for c in range(channels)]


class InputTrim(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        compiler = shutil.which('cc') or shutil.which('gcc')
        if not compiler:
            raise unittest.SkipTest('a host C compiler is required')
        # Windows keeps a loaded library locked, so its folder may outlive the test run there.
        cls.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        library = Path(cls.temp.name) / 'trim.so'
        stub = Path(cls.temp.name) / 'counters.c'
        stub.write_text('#include <stdint.h>\nuint32_t mwua_trims;\n')
        subprocess.run([compiler, '-std=c99', '-O2', '-Wall', '-Wextra', '-Werror', '-shared', '-fPIC',
                        str(SOURCE), str(stub), '-o', str(library)], check=True)
        cls.lib = ctypes.CDLL(str(library))
        cls.lib.mwua_input_trim.restype = ctypes.c_int32
        cls.lib.mwua_input_trim.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32]
        cls.lib.mwua_input_slip.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint]

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def fresh(self):
        ctypes.c_uint8.in_dll(self.lib, 'mwua_trim_fresh').value = 1
        ctypes.c_uint32.in_dll(self.lib, 'mwua_trims').value = 0

    def test_a_slip_interpolates_one_block_and_joins_both_neighbours(self):
        for channels, inputs in ((2, 1), (4, 3)):
            stride = 4 * channels
            for step in (1, -1):
                with self.subTest(channels=channels, step=step):
                    ring = (ctypes.c_uint8 * (RING * 16))()
                    start = RING - 5   # across the ring's wrap
                    # a ramp of 64 per frame crossing zero, opposite in odd channels
                    for n in range(-2, 40):
                        put(ring, stride, start + n, [(n - 20) * 64 * (1 if c % 2 == 0 else -1) for c in range(channels)])
                    self.lib.mwua_input_slip(ring, start, step, channels)
                    begin = start + step
                    got = [get(ring, stride, begin + k, channels)[0] for k in range(BLOCK)]
                    # one frame absorbed (or repeated) over the block: 64 * 17/16 (15/16) a frame
                    self.assertEqual(got, [(k * (16 + step) // 16 - 20) * 64 + (k * (16 + step) % 16) * 4
                                           for k in range(BLOCK)])
                    odd = [get(ring, stride, begin + k, channels)[1] for k in range(BLOCK)]
                    self.assertEqual(odd, [-v for v in got])
                    # the next block starts where the stream continues, untouched
                    self.assertEqual(get(ring, stride, start + BLOCK + step, channels)[0], (BLOCK + step - 20) * 64)

    def test_full_scale_input_neither_wraps_nor_leaves_24_bits(self):
        # Full scale alternating sign every frame: the worst case for the interpolation's products.
        top, bottom = (1 << 23) - 1, -(1 << 23)
        for step in (1, -1):
            with self.subTest(step=step):
                ring = (ctypes.c_uint8 * (RING * 16))()
                values = [top if n % 2 else bottom for n in range(RING)]
                for n, value in enumerate(values):
                    put(ring, 8, n, [value, -value - 1])
                self.lib.mwua_input_slip(ring, 100, step, 2)
                for k in range(BLOCK):
                    position = 100 * 16 + k * (16 + step)
                    i, t = divmod(position, 16)
                    t /= 16
                    p0, p1, p2, p3 = (values[j] / 2 for j in range(i - 1, i + 3))
                    want = 2 * (p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0))))
                    want = max(bottom, min(top, want))
                    got = get(ring, 8, 100 + step + k, 2)[0]
                    self.assertLessEqual(abs(got - want), 8, (k, got, want))

    def run_stream(self, ppm, seconds, channels=2, inputs=1):
        """Packets of the host's nominal rate every 250 us on its clock, blocks of 16 on the unit's,
        the reader as usbaudio_in.s in_build has it. Returns trims, underruns, the fills seen after
        settling, and whether every frame the reader took was one the host sent, in order."""
        self.fresh()
        stride = 4 * channels
        ring = (ctypes.c_uint8 * (RING * 16))()
        produced = consumed = 0
        prefill, underruns, sent = True, 0, 0.0
        packet_period = PACKET / (1 + ppm * 1e-6)   # the host's 250 us on the unit's time
        block_period = BLOCK / RATE
        next_packet, next_block, now = 0.0, block_period / 3, 0.0
        fills, trims, mismatched = [], 0, 0
        while now < seconds:
            if next_packet <= next_block:
                now = next_packet
                sent += RATE * PACKET
                frames = int(sent) - produced
                for _ in range(frames):
                    put(ring, stride, produced, [produced & 0x7fffff] * channels)
                    produced += 1
                next_packet += packet_period
                continue
            now = next_block
            next_block += block_period
            fill = produced - consumed
            if prefill:
                if fill < TARGET:
                    continue
                prefill = False
                ctypes.c_uint8.in_dll(self.lib, 'mwua_trim_fresh').value = 1
            elif fill < BLOCK:
                underruns += 1
                prefill = True
                continue
            if now > 3:
                fills.append(fill)
            step = self.lib.mwua_input_trim(ring, consumed, fill, inputs)
            trims += abs(step)
            consumed += step
            for k in range(BLOCK):
                value = get(ring, stride, consumed + k, channels)[0]
                if not step and value != ((consumed + k) & 0x7fffff):
                    mismatched += 1
            consumed += BLOCK
        return trims, underruns, fills, mismatched

    def test_the_same_clock_is_copied_bit_for_bit(self):
        trims, underruns, fills, mismatched = self.run_stream(0, 20)
        self.assertEqual((trims, underruns, mismatched), (0, 0, 0))

    def test_drift_either_way_is_absorbed_one_frame_at_a_time(self):
        for ppm, channels, inputs in ((100, 2, 1), (-100, 4, 3), (40, 2, 2)):
            with self.subTest(ppm=ppm):
                seconds = 40
                trims, underruns, fills, mismatched = self.run_stream(ppm, seconds, channels, inputs)
                self.assertEqual((underruns, mismatched), (0, 0))
                counts = ctypes.c_uint32.in_dll(self.lib, 'mwua_trims').value
                absorbed, repeated = counts >> 16, counts & 0xffff
                self.assertEqual(absorbed + repeated, trims)
                self.assertEqual(repeated if ppm > 0 else absorbed, 0)
                # one trim per frame of drift once settled (1.5 s), within the band
                expected = abs(ppm) * 1e-6 * RATE * (seconds - 1.5)
                self.assertLess(abs(trims - expected), 6, (trims, expected))
                # the cushion holds: the fill stays within a block of where it settled
                self.assertLess(max(fills) - min(fills), BLOCK + 16, (min(fills), max(fills)))


if __name__ == '__main__':
    unittest.main()
