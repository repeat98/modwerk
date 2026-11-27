# SPDX-License-Identifier: GPL-3.0-or-later
"""The recording's drift trim while the host plays in (usb_audio_output_trim.c, #2263), compiled for the host: the
interpolated packet, and the ring held while packets go out at the host's nominal rate and the producer runs on the
unit's crystal."""
import ctypes
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'octatrack/modules/usb-audio-out-tracks-main-cue/usb_audio_output_trim.c'
RING, WORDS, STRIDE, SPAN = 1024, 20, 80, 4   # layouts/usbaudio.s AUD_FRAMES, a frame's words, SLOT_BYTES; a slip's frames
RATE, BLOCK, PACKET, STEP = 44100, 16, 250e-6, 11025   # the producer's 16 frames, a poll, frames a poll x1000


def put(ring, index, values):
    at = (index % RING) * STRIDE
    for word, value in enumerate(values):
        ring[at + 4 * word:at + 4 * word + 4] = struct.pack('<i', value * 256)  # pad byte first


def get(ring, index, word=0):
    at = (index % RING) * STRIDE + 4 * word
    return struct.unpack_from('<i', bytes(ring[at:at + 4]))[0] >> 8


class OutputTrim(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        compiler = shutil.which('cc') or shutil.which('gcc')
        if not compiler:
            raise unittest.SkipTest('a host C compiler is required')
        cls.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        library = Path(cls.temp.name) / 'trim.so'
        stub = Path(cls.temp.name) / 'counters.c'
        stub.write_text('#include <stdint.h>\nuint32_t mwua_out_trims, mwua_sent_words = 0xfffffu;\n')
        subprocess.run([compiler, '-std=c99', '-O2', '-Wall', '-Wextra', '-Werror', '-shared', '-fPIC',
                        str(SOURCE), str(stub), '-o', str(library)], check=True)
        cls.lib = ctypes.CDLL(str(library))
        cls.lib.mwua_output_trim.restype = ctypes.c_int32
        cls.lib.mwua_output_trim.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32]
        cls.lib.mwua_output_slip.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32]

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_a_slip_interpolates_its_frames_and_joins_both_neighbours(self):
        for words in (0xfffff, 0b1111 << 16):   # every word, or MAIN and CUE alone
            for step in (1, -1):
                with self.subTest(words=hex(words), step=step):
                    ring = (ctypes.c_uint8 * (RING * STRIDE))()
                    start = RING - 2   # across the ring's wrap
                    for i in range(-2, 40):   # a ramp of 64 a frame crossing zero, opposite in odd words
                        put(ring, start + i, [(i - 20) * 64 * (1 if w % 2 == 0 else -1) for w in range(WORDS)])
                    self.lib.mwua_output_slip(ring, start, step, words)
                    for k in range(SPAN):
                        want = (k * (SPAN + step) / SPAN - 20) * 64   # one frame absorbed (or repeated) over SPAN frames
                        for w in range(WORDS):
                            got = get(ring, start + step + k, w) * (1 if w % 2 == 0 else -1)
                            if words >> w & 1:
                                self.assertLessEqual(abs(got - want), 32, (k, w, got, want))   # 19 bits inside a slip
                            else:
                                self.assertEqual(got, (step + k - 20) * 64)   # a word the packet does not send: untouched
                    # after the slip the stream continues where it left off, untouched
                    for k in range(SPAN, SPAN + 8):
                        self.assertEqual(get(ring, start + step + k), (step + k - 20) * 64)

    def test_full_scale_input_neither_wraps_nor_leaves_24_bits(self):
        top, bottom = (1 << 23) - 1, -(1 << 23)
        for step in (1, -1):
            with self.subTest(step=step):
                ring = (ctypes.c_uint8 * (RING * STRIDE))()
                values = [top if i % 2 else bottom for i in range(RING)]
                for i, value in enumerate(values):
                    put(ring, i, [value] * WORDS)
                self.lib.mwua_output_slip(ring, 100, step, 0xfffff)
                for k in range(SPAN):
                    i, t = divmod(k * (SPAN + step), SPAN)
                    t /= SPAN
                    p0, p1, p2, p3 = (values[100 + j] for j in range(i - 1, i + 3))
                    want = p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
                    got = get(ring, 100 + step + k)
                    self.assertTrue(bottom <= got <= top)
                    self.assertLessEqual(abs(got - max(bottom, min(top, want))), 64, (k, got, want))

    def run_stream(self, ppm, seconds):
        """The producer adds 16 frames every block on the unit's clock; the host polls every 250 us on its own and each
        packet takes the nominal 11.025 frames (layouts/usbaudio.s's accumulator), the trim first, as the seam has it.
        Returns the trims, underruns and overruns after settling, the fills seen, and how often a frame the packets
        sent did not follow the one before it: frame values are the producer's counts times 64 (a slip works at 19 bits),
        so consecutive frames step by 1, and by 1 +- 1/n inside a slip."""
        ctypes.c_uint32.in_dll(self.lib, 'mwua_out_trims').value = 0
        ring = (ctypes.c_uint8 * (RING * STRIDE))()
        produced, consumed, acc = 64, 0, 0          # the stream starts AUD_TARGET behind the producer
        for i in range(produced):
            put(ring, i, [(i & 0xffff) * 64] * WORDS)
        block_period = BLOCK / (RATE * (1 + ppm * 1e-6))  # the unit's 16 frames, seen on the host's clock
        next_block, now, last = block_period / 3, 0.0, None
        fills, underruns, overruns, jumps = [], 0, 0, 0
        poll = 0
        while now < seconds:
            now = poll * PACKET
            while next_block <= now:
                for _ in range(BLOCK):
                    put(ring, produced, [(produced & 0xffff) * 64] * WORDS)
                    produced += 1
                next_block += block_period
            poll += 1
            fill = produced - consumed
            if fill > RING:
                overruns += 1
                consumed = produced - RING
                continue
            acc += STEP
            n = acc // 1000
            if fill < n:
                underruns += 1
                acc -= STEP
                continue
            acc -= n * 1000
            consumed += self.lib.mwua_output_trim(ring, consumed, fill, n)
            for k in range(n):
                value = get(ring, consumed + k)
                if last is not None and not (0.5 <= ((value - last) % (1 << 22)) / 64 <= 1.6):
                    jumps += 1
                last = value
            consumed += n
            if now > 2:
                fills.append(fill)
        trims = ctypes.c_uint32.in_dll(self.lib, 'mwua_out_trims').value
        return trims >> 16, trims & 0xffff, underruns, overruns, fills, jumps

    def test_the_ring_holds_at_the_hosts_rate_whatever_the_drift(self):
        for ppm in (0, 59, -59, 100, -100):
            with self.subTest(ppm=ppm):
                absorbed, repeated, underruns, overruns, fills, jumps = self.run_stream(ppm, 40)
                self.assertEqual((underruns, overruns, jumps), (0, 0, 0))
                drift = abs(ppm) * 1e-6 * RATE * 40   # frames the two clocks part by in 40 s
                late = abs(ppm) * 1e-6 * RATE * 1.2 + 4   # the settling second's drift and the band
                if ppm > 0:
                    self.assertEqual(repeated, 0)
                    self.assertLessEqual(abs(absorbed - drift), late, (absorbed, drift))
                elif ppm < 0:
                    self.assertEqual(absorbed, 0)
                    self.assertLessEqual(abs(repeated - drift), late, (repeated, drift))
                else:
                    self.assertEqual(absorbed + repeated, 0)
                self.assertLessEqual(max(fills) - min(fills), 40, (min(fills), max(fills)))

    def test_no_drift_sends_every_frame_bit_for_bit(self):
        absorbed, repeated, underruns, overruns, fills, jumps = self.run_stream(0, 10)
        self.assertEqual((absorbed, repeated, underruns, overruns, jumps), (0, 0, 0, 0, 0))

    def test_a_packet_that_does_not_follow_settles_again(self):
        ring = (ctypes.c_uint8 * (RING * STRIDE))()
        consumed = 0
        for _ in range(5000):   # settled at a fill of 64
            self.assertEqual(self.lib.mwua_output_trim(ring, consumed, 64, 11), 0)
            consumed += 11
        self.assertEqual(self.lib.mwua_output_trim(ring, consumed, 90, 11), 0)  # held: no trim inside SPACING's first
        # a resync (the copy's position jumped) starts the average afresh: no trim for a second however far off
        consumed += 500
        for _ in range(4000):
            self.assertEqual(self.lib.mwua_output_trim(ring, consumed, 200, 11), 0)
            consumed += 11


if __name__ == '__main__':
    unittest.main()
