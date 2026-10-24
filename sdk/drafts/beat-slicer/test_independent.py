"""Independent synthetic-data audit of the imported planner; no audio evidence.

Run alongside test_planner.py. Reuse only its FFI declarations and compiler
fixture; expectations below use rational arithmetic and a separate set model.
"""
import ctypes as C
from fractions import Fraction
import random
import unittest

import test_planner as ffi


def grid(start, end, rate, bpm24, beats):
    step = Fraction(rate * 60 * beats * 24, bpm24)
    points = []
    for n in range(65):
        exact = start + n * step
        rounded = (exact + Fraction(1, 2)).__floor__()
        if rounded >= end:
            break
        points.append(rounded)
    return points


class IndependentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ffi.PlannerTests.setUpClass()
        cls.fixture = ffi.PlannerTests()

    @classmethod
    def tearDownClass(cls):
        ffi.PlannerTests.tearDownClass()

    def run_preview(self, request, expected):
        result = ffi.Plan()
        C.memset(C.byref(result), 0xA5, C.sizeof(result))
        before = bytes(result)
        inputs = bytes(request)
        markers = list(request.existing[:request.existing_count])
        code = self.fixture.lib.bs_preview(C.byref(request), C.byref(result))
        self.assertEqual(bytes(request), inputs)
        self.assertEqual(list(request.existing[:request.existing_count]), markers)
        if len(expected) > 64:
            self.assertEqual(code, 2)
            self.assertEqual(bytes(result), before)
        else:
            self.assertEqual(code, 0)
            self.assertEqual(list(result.starts[:result.count]), expected)
        return result

    def test_random_exact_union_against_fraction_oracle(self):
        rng = random.Random(20261023)
        for case in range(2000):
            rate = rng.randint(8000, 192000)
            bpm = rng.randint(720, 7200)
            beats = rng.choice((1, 4, 16, 32, 64))
            length = rng.randint(1, min(0xFFFFFFFF, rate * 150))
            start = rng.randint(0, 0xFFFFFFFF - length)
            end = start + length
            existing = sorted(rng.sample(range(start, end), min(length, rng.randrange(65))))
            expected = sorted(set(existing) | set(grid(start, end, rate, bpm, beats)))
            source = case % 2
            request = self.fixture.request(
                existing=existing, sample_rate=rate, trim_start=start, trim_end=end,
                sample_bpm24=bpm if source == 0 else 0,
                project_bpm24=bpm if source == 1 else 0,
                tempo_source=source, beats=beats)
            with self.subTest(case=case):
                result = self.run_preview(request, expected)
                if len(expected) <= 64:
                    self.assertEqual(result.bpm24, bpm)
                    self.assertEqual(list(result.needs_fade[:result.count]), [0] * result.count)

    def test_stereo_search_against_exhaustive_oracle(self):
        rng = random.Random(3221)
        for case in range(200):
            rate, bpm = rng.choice((8000, 44100, 96000)), rng.randint(720, 7200)
            start, end = 17, rate * 3 + 17
            radius = rate // 500
            salt = rng.randrange(100000)

            def pcm(frame):
                # Deterministic signed channels, with different quiet positions.
                return ((frame * 37 + salt) % 30001 - 15000,
                        (frame * 71 + salt) % 30001 - 15000)

            def peak(frame):
                return max(abs(v) for f in (frame - 1, frame) for v in pcm(f))

            existing = sorted(rng.sample(range(start, end), rng.randrange(5)))
            expected = set(existing)
            for target in grid(start, end, rate, bpm, 1):
                if target == start:
                    expected.add(target)
                    continue
                if any(abs(target - old) <= radius for old in expected):
                    continue
                candidates = range(max(start + 1, target - radius), min(end - 1, target + radius) + 1)
                quiet = [f for f in candidates if peak(f) <= 8388]
                expected.add(min(quiet, key=lambda f: (peak(f), abs(f - target), f)) if quiet else target)
            request = self.fixture.request(existing=existing, sample_rate=rate,
                                           trim_start=start, trim_end=end,
                                           sample_bpm24=bpm, snap=1, reader=pcm)
            with self.subTest(case=case):
                result = self.run_preview(request, sorted(expected))
                self.assertEqual(list(result.needs_fade[:result.count]),
                                 [int((max(map(abs, pcm(f))) if f == start else peak(f)) > 8388)
                                  for f in sorted(expected)])
                self.assertEqual(result.end_needs_fade, int(max(map(abs, pcm(end - 1))) > 8388))

    def test_threshold_edges_and_outside_trim_refusal(self):
        for value, flag in ((8388, 0), (-8388, 0), (8389, 1), (-8389, 1)):
            request = self.fixture.request(trim_end=1, reader=lambda f: (value, -value))
            result = self.run_preview(request, [0])
            self.assertEqual(result.needs_fade[0], flag)
            self.assertEqual(result.end_needs_fade, flag)
        # Existing markers outside trim are refused, not silently discarded.
        for existing in ((0,), (200,)):
            request = self.fixture.request(trim_start=100, trim_end=200, existing=existing)
            result = ffi.Plan()
            C.memset(C.byref(result), 0xA5, C.sizeof(result))
            before = bytes(result)
            self.assertEqual(self.fixture.lib.bs_preview(C.byref(request), C.byref(result)), 1)
            self.assertEqual(bytes(result), before)

    def test_maximum_step_and_half_frame_rounding(self):
        # Largest accepted product, at capacity and near the uint32 limit.
        step = 192000 * 60 * 64 // 30
        start = 0xFFFFFFFF - step * 64
        request = self.fixture.request(sample_rate=192000, sample_bpm24=720,
                                       beats=64, trim_start=start, trim_end=0xFFFFFFFF)
        self.run_preview(request, [start + n * step for n in range(64)])
        # 8001 Hz / 120 BPM gives half frames: ties go upwards, not to even.
        request = self.fixture.request(sample_rate=8001, trim_end=20000)
        self.run_preview(request, [0, 4001, 8001, 12002, 16002])


if __name__ == '__main__':
    unittest.main(defaultTest='IndependentTests', verbosity=2)
