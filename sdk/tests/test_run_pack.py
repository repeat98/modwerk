# SPDX-License-Identifier: GPL-3.0-or-later
"""The packed .run and the boot's decoder model (run_pack.py, run_unpack.s): synthetic data only, no firmware."""
import hashlib
import os
from pathlib import Path
import random
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT / 'sdk/machines/octatrack/elekloader'))
sys.path.append(str(ROOT / 'sdk'))
import run_pack
from firmware_codec import aplib, elz

LOAD, RUN, START = 0x40000400, 0x40112830, 0x40a955e0
DST = START + run_pack.UNCACHED
PARITY = '5b6b45e7041999bafc6b033b54293555634303df90ce3fb8cfa39e0f52951eb3'


def gamma(value, trailer=None):
    """Interlaced Elias gamma events: each bit after the leading 1, then a stop bit (1 on the last)."""
    tail = bin(value)[3:]
    return [e for i, b in enumerate(tail) for e in ((int(b), b''), (int(i == len(tail) - 1),
            bytes((trailer,)) if trailer is not None and i == len(tail) - 1 else b''))]


def match(offset, count):
    """One back reference, written independently of the packer from the section format (firmware_codec/elz.py)."""
    length = count - 1 - (offset > 3328)
    raw = offset + 767
    short = [(length >> 1 & 1, b''), (length & 1, b'')] if 1 <= length <= 3 else [(0, b''), (0, b'')] + gamma(length - 2)
    return [(0, b'')] + gamma(raw >> 8, raw & 0xff) + short


def section(events, end=True, tail=b''):
    """[(bit, payload)] -> [u32 length][u32 sum] + stream: tag bytes MSB first, each followed by its group's payloads."""
    events = events + ([(0, b'')] + gamma((1 << 24) + 2, 0xff) if end else [])
    body = bytearray()
    for i in range(0, len(events), 8):
        group = events[i:i + 8]
        body.append(sum(bit << 7 - k for k, (bit, _) in enumerate(group)))
        body += b''.join(payload for _, payload in group)
    body += tail
    return len(body).to_bytes(4, 'big') + (sum(body) & 0xffffffff).to_bytes(4, 'big') + bytes(body)


def generated(rng, n, far=False):
    """Random data built from literals and back references, overlapping and far ones included -> (data, events)."""
    data, events = bytearray(), []
    while len(data) < n or len(data) % 4:  # whole words, as __run_words counts them
        if not data or rng.random() < 0.3 or len(data) >= n:
            b = rng.randrange(256)
            data.append(b); events.append((1, bytes((b,))))
            continue
        offset = rng.randrange(1, len(data) + 1) if not far or rng.random() < 0.5 else len(data)
        count = rng.choice((2, 3, 4, 5, 17, 300, 4096)) + (offset > 3328)
        count = min(count, max(2 + (offset > 3328), n - len(data)))
        for _ in range(count):
            data.append(data[-offset])
        events += match(offset, count)
    return bytes(data), events


def decode(stream, n):
    return run_pack.decode(stream, n // 4, RUN, DST)


class Decoder(unittest.TestCase):
    def test_the_model_is_the_assembled_routine(self):
        self.assertEqual(hashlib.sha256(run_pack.ASM.read_bytes()).hexdigest(), run_pack.ASM_SHA256)

    def test_random_literals_and_matches_overlapping_and_far(self):
        rng = random.Random(1310720)
        for n, far in ((0, False), (4, False), (64, False), (4096, False), (20000, True), (70000, True)):
            data, events = generated(rng, n, far)
            self.assertEqual(decode(section(events), len(data)), data)

    def test_edge_shapes(self):
        far = random.Random(5).randbytes(70000)
        literals = lambda data: [(1, bytes((b,))) for b in data]
        for data, events in (
                (b'', []),                                                                 # a core alone: the end marker
                (b'\xa5' * 4100, literals(b'\xa5') + match(1, 4099)),                      # one byte, longer than the kit writes
                (b'ab' * 2048, literals(b'ab') + match(2, 4094)),                          # overlapping by 2
                (far + far[:4], literals(far) + match(70000, 4)),                           # from the first byte, past 65536
                (far[:3] + far[:3] + far[:2], literals(far[:3]) + match(3, 3) + match(6, 2))):  # short lengths 2 and 1
            self.assertEqual(decode(section(events), len(data)), data)

    def test_the_far_rule_counts_one_more_past_3328(self):
        base = bytes(random.Random(3).randrange(256) for _ in range(3400))
        for offset in (3328, 3329, 3400):
            data = base + base[-offset:][:8]
            data += bytes(-len(data) % 4)
            events = [(1, bytes((b,))) for b in base] + match(offset, 8) + [(1, b'\0')] * (len(data) - 3408)
            self.assertEqual(decode(section(events), len(data)), data)

    def test_hangs_rather_than_writing_outside_the_run(self):
        lit = [(1, b'x')] * 8
        cases = {
            'a literal past the run': (lit + [(1, b'y')], 8),
            'the stream ended before the run': (lit, 12),
            'an offset before the run': (lit + match(9, 4), 12),
            'an offset of 0 or past the written run': (lit + match(0xc0000000, 4), 12),  # wraps past the run's address
            'a match past the run': (lit + match(1, 5), 12),
            'the reuse code': (lit + [(0, b''), (0, b''), (1, b'')], 12),
        }
        for why, (events, n) in cases.items():
            with self.assertRaises(run_pack.Fatal, msg=why) as caught:
                decode(section(events), n)
            self.assertEqual(str(caught.exception), why)
        whole = section(lit)
        with self.assertRaisesRegex(run_pack.Fatal, 'the run ended before the stream'):
            decode(section(lit, tail=b'\0'), 8)
        with self.assertRaisesRegex(run_pack.Fatal, 'past the stream'):
            decode((len(whole) - 9).to_bytes(4, 'big') + whole[4:-1], 8)
        with self.assertRaisesRegex(ValueError, 'past the section'):  # the model knows only the section as built
            decode(whole[:-3], 8)
        with self.assertRaisesRegex(run_pack.Fatal, 'tag byte past the stream'):  # a wrapped end lies below the start
            decode(b'\xff\xff\xff\xf0' + whole[4:], 8)

    def test_the_packer_round_trips_through_the_model_and_the_depacker(self):
        rng = random.Random(97)
        code = b''.join(p.read_bytes() for p in sorted((ROOT / 'sdk/machines/octatrack/elekloader').glob('*.[cs]')))
        shaped = (b'', bytes(4), os.urandom(4096), bytes(65536 + 8), b'\x4e\x75' * 2048, rng.randbytes(9000) * 9,
                  code[:131072], bytes(rng.choice(b'\0\0\0\x4e\x75\x20\x3c\x48\xe7') for _ in range(50000)))
        for data in shaped:
            data += bytes(-len(data) % 4)
            stream = aplib.pack_section(data)
            self.assertEqual(decode(stream, len(data)), data)
            self.assertEqual(elz.depack_section(stream), data)
        # The browser builder's packer gives these bytes too (src/engine/elekloader/run-pack.test.ts pins the same digest).
        data = bytes(((i * i >> 3) ^ (i >> 7)) & 0xff for i in range(40000))
        data += data[1000:5000] * 3
        self.assertEqual(hashlib.sha256(aplib.pack_section(data)).hexdigest(), PARITY)


class Image(unittest.TestCase):
    def setUp(self):
        self.run = bytes(range(256)) * 16
        self.main = bytes(RUN - LOAD) + self.run
        self.layout = dict(run_load=RUN, ddr=[START, START + len(self.run)])
        self.symbols = dict(__run_load=RUN, __run_start=START, __run_words=len(self.run) // 4)
        self.packer = lambda data: section([(1, bytes((b,))) for b in data])  # store-only: correctness, not size

    def test_packs_the_trailing_run_and_unpacks_it_back(self):
        main, proof = run_pack.pack(self.main, self.layout, self.symbols, LOAD, self.packer)
        self.assertEqual(main[:RUN - LOAD], self.main[:RUN - LOAD])
        self.assertEqual(proof['packedBytes'], len(main) - (RUN - LOAD))
        self.assertEqual(run_pack.unpack(main, self.layout, self.symbols, LOAD), self.main)

    def test_refuses_what_it_cannot_prove(self):
        refusals = [
            (self.main + b'\0\0\0\0', self.layout, self.symbols, self.packer),                  # not ending with .run
            (self.main, dict(self.layout, run_load=RUN + 4), self.symbols, self.packer),
            (self.main, self.layout, dict(self.symbols, __run_words=1), self.packer),
            (self.main, dict(self.layout, ddr=[START]), self.symbols, self.packer),
            (self.main, self.layout, self.symbols, lambda data: self.packer(data[:-4] + b'\0\0\0\0')),  # decodes wrong
            (self.main, self.layout, self.symbols, lambda data: section([(1, b'\0')] * 4)),   # decodes short
        ]
        for main, layout, symbols, packer in refusals:
            with self.assertRaises(ValueError):
                run_pack.pack(main, layout, symbols, LOAD, packer)
        near = dict(run_load=START - 8, ddr=[START, START + 4])
        with self.assertRaisesRegex(ValueError, 'over itself'):
            run_pack.pack(bytes(START - 8 - LOAD) + b'abcd', near, dict(__run_load=START - 8, __run_start=START,
                          __run_words=1), LOAD, self.packer)
        pin = run_pack.ASM_SHA256
        try:
            run_pack.ASM_SHA256 = '0' * 64
            with self.assertRaisesRegex(ValueError, 'decode\\(\\) models'):
                run_pack.pack(self.main, self.layout, self.symbols, LOAD, self.packer)
        finally:
            run_pack.ASM_SHA256 = pin


if __name__ == '__main__':
    unittest.main()
