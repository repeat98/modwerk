"""Host core regressions. Synthetic PCM only; no firmware or hardware evidence."""
import ctypes as C
from fractions import Fraction
from pathlib import Path
import os
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
READ = C.CFUNCTYPE(C.c_int, C.c_void_p, C.c_uint32, C.POINTER(C.c_int32))


class Request(C.Structure):
    _fields_ = [(n, C.c_uint32) for n in (
        'sample_rate', 'trim_start', 'trim_end', 'sample_bpm24',
        'project_bpm24', 'beats', 'tempo_source', 'existing_count')]
    _fields_ += [('existing', C.POINTER(C.c_uint32)), ('snap', C.c_uint32),
                ('read', READ), ('context', C.c_void_p)]


class Plan(C.Structure):
    _fields_ = [('count', C.c_uint32), ('bpm24', C.c_uint32),
                ('starts', C.c_uint32 * 64), ('needs_fade', C.c_uint32 * 64),
                ('end_needs_fade', C.c_uint32)]


class PlannerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='beat-slicer-')
        lib = Path(cls.temp.name) / 'planner.so'
        subprocess.run([os.environ.get('CC', 'cc'), '-std=c99', '-Wall', '-Wextra',
                        '-Werror', '-pedantic', '-O2', '-shared', '-fPIC',
                        str(ROOT / 'planner.c'), '-o', str(lib)], check=True)
        cls.lib = C.CDLL(str(lib))
        cls.lib.bs_preview.argtypes = [C.POINTER(Request), C.POINTER(Plan)]
        cls.lib.bs_preview.restype = C.c_int

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def request(self, existing=(), reader=None, **kw):
        r = Request(sample_rate=44100, trim_start=0, trim_end=88200,
                    sample_bpm24=2880, project_bpm24=2160, beats=1)
        for k, v in kw.items():
            setattr(r, k, v)
        r.existing = (C.c_uint32 * len(existing))(*existing)
        r.existing_count = len(existing)

        def read(_ctx, frame, out):
            if not r.trim_start <= frame < r.trim_end:
                return 1
            value = reader(frame) if reader else (0, 0)
            if value is None:
                return 1
            out[0], out[1] = value
            return 0
        r.read = READ(read)
        return r

    def preview(self, r):
        p = Plan()
        self.assertEqual(self.lib.bs_preview(C.byref(r), C.byref(p)), 0)
        return p

    def test_both_bpm_sources(self):
        r = self.request()
        self.assertEqual(list(self.preview(r).starts)[:4], [0, 22050, 44100, 66150])
        r.tempo_source = 1
        p = self.preview(r)
        self.assertEqual(list(p.starts)[:p.count], [0, 29400, 58800])
        self.assertEqual(p.bpm24, 2160)

    def test_fractional_grid_all_spacings_no_cumulative_drift(self):
        # Independent Fraction oracle: 250 tempo/rate/source/spacing cases.
        for sr in (8000, 44100, 48000, 96000, 192000):
            for bpm in (720, 721, 197 * 24, 2881, 7200):
                for beats in (1, 4, 16, 32, 64):
                    for source in (0, 1):
                        r = self.request(sample_rate=sr, trim_start=123,
                                         trim_end=123 + sr * 7,
                                         sample_bpm24=bpm, project_bpm24=bpm,
                                         beats=beats, tempo_source=source)
                        step = Fraction(sr * 60 * 24 * beats, bpm)
                        expected = []
                        n = 0
                        while True:
                            frame = 123 + (n * step.numerator * 2 + step.denominator) // (2 * step.denominator)
                            if frame >= r.trim_end:
                                break
                            expected.append(frame)
                            n += 1
                        p = self.preview(r)
                        self.assertEqual(list(p.starts)[:p.count], expected)

    def test_existing_markers_retained_sorted_and_deduplicated(self):
        r = self.request(existing=(0, 100, 22050))
        p = self.preview(r)
        self.assertEqual(list(p.starts)[:p.count], [0, 100, 22050, 44100, 66150])

    def test_capacity_failure_leaves_output_and_inputs_unchanged(self):
        r = self.request(existing=tuple(range(64)))
        p = Plan()
        C.memset(C.byref(p), 0xA5, C.sizeof(p))
        before = bytes(p)
        self.assertEqual(self.lib.bs_preview(C.byref(r), C.byref(p)), 2)
        self.assertEqual(bytes(p), before)
        self.assertEqual(list(r.existing[:64]), list(range(64)))

    def test_long_sample_overflow_is_not_silently_truncated(self):
        r = self.request(trim_end=0xFFFFFFFF, sample_bpm24=720)
        p = Plan()
        self.assertEqual(self.lib.bs_preview(C.byref(r), C.byref(p)), 2)

    def test_exact_capacity_and_exclusive_trim_end(self):
        r = self.request(trim_end=22050 * 64)
        p = self.preview(r)
        self.assertEqual(p.count, 64)
        self.assertEqual(p.starts[63], 22050 * 63)

    def test_stereo_quiet_search_and_repeat_apply(self):
        quiet = {22069, 22070}
        r = self.request(trim_end=44100, snap=1,
                         reader=lambda f: (0, 0) if f in quiet else (500000, -500000))
        p = self.preview(r)
        self.assertEqual(list(p.starts)[:p.count], [0, 22070])
        self.assertEqual(p.needs_fade[1], 0)
        self.assertEqual(p.needs_fade[0], 1)
        self.assertEqual(p.end_needs_fade, 1)
        r2 = self.request(existing=(0, 22070), trim_end=44100, snap=1,
                          reader=lambda f: (0, 0) if f in quiet else (500000, -500000))
        self.assertEqual(bytes(self.preview(r2)), bytes(p))

    def test_one_quiet_channel_is_not_a_safe_stereo_boundary(self):
        r = self.request(trim_end=44100, snap=1, reader=lambda f: (0, 8000000))
        p = self.preview(r)
        self.assertEqual(p.starts[1], 22050)
        self.assertEqual(list(p.needs_fade)[:p.count], [1, 1])
        self.assertEqual(p.end_needs_fade, 1)

    def test_snap_window_is_bounded_and_optional(self):
        reader = lambda f: (0, 0) if f in (22249, 22250) else (8388607, -8388608)
        for snap in (0, 1):
            p = self.preview(self.request(trim_end=44100, snap=snap, reader=reader))
            self.assertEqual(p.starts[1], 22050)
            self.assertEqual(p.needs_fade[1], 1)

    def test_no_crossing_existing_marker(self):
        p = self.preview(self.request(existing=(22055,), trim_end=44100, snap=1))
        self.assertEqual(list(p.starts)[:p.count], [0, 22055])

    def test_invalid_inputs_fail_without_writing_output(self):
        cases = [dict(beats=2), dict(tempo_source=2), dict(snap=2),
                 dict(sample_bpm24=0), dict(project_bpm24=0, tempo_source=1),
                 dict(sample_rate=0), dict(trim_start=100, trim_end=100)]
        requests = [self.request(**kw) for kw in cases]
        requests += [self.request(existing=(2, 1)), self.request(existing=(0, 0)),
                     self.request(existing=(88200,))]
        for r in requests:
            p = Plan()
            C.memset(C.byref(p), 0x5A, C.sizeof(p))
            before = bytes(p)
            self.assertEqual(self.lib.bs_preview(C.byref(r), C.byref(p)), 1)
            self.assertEqual(bytes(p), before)

    def test_sample_read_failure_and_invalid_pcm_are_atomic(self):
        for reader in (lambda f: None, lambda f: (8388608, 0), lambda f: (-8388609, 0)):
            r = self.request(reader=reader)
            p = Plan()
            C.memset(C.byref(p), 0x5A, C.sizeof(p))
            before = bytes(p)
            self.assertEqual(self.lib.bs_preview(C.byref(r), C.byref(p)), 3)
            self.assertEqual(bytes(p), before)

    def test_large_frame_coordinates_do_not_wrap(self):
        start = 0xFFFFFFFF - 88200
        p = self.preview(self.request(trim_start=start, trim_end=0xFFFFFFFF))
        self.assertEqual(list(p.starts)[:p.count], [start + i * 22050 for i in range(4)])

    def test_mid_scan_failure_does_not_leak_partial_preview(self):
        r = self.request(snap=1, reader=lambda f: None if f == 22060 else (0, 0))
        p = Plan()
        C.memset(C.byref(p), 0x5A, C.sizeof(p))
        before = bytes(p)
        self.assertEqual(self.lib.bs_preview(C.byref(r), C.byref(p)), 3)
        self.assertEqual(bytes(p), before)


if __name__ == '__main__':
    unittest.main(verbosity=2)
