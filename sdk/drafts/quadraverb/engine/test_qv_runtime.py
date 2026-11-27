#!/usr/bin/env python3
"""runtime/qv_runtime.c against the models: built with the host cc (-DQV_HOST) and driven through ctypes in the base's
call order (stream_channel.c, mw_stream_check: at chain c's end, lane by lane, take(c - 1) then fill(c + 2)), every
in-block it fills checked against qvs.ColdFire fed the same out-blocks, with qvs.SplitEngine as the DSP. Also its
m68k-elf-gcc build, warnings as errors. Needs the ROM-derived inputs outside Git; skips without them.

  python3 -B engine/test_qv_runtime.py [-v]
"""
import ctypes
import itertools
import pathlib
import random
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import qvcf  # noqa: E402
import qvs  # noqa: E402

INPUTS = pathlib.Path.home() / ".cache/modwerk-local/quadraverb/engine"
PROGRAMS, LFO = INPUTS / "programs.json", INPUTS / "lfo-all"
N = 16
U16P, U32P = ctypes.POINTER(ctypes.c_uint16), ctypes.POINTER(ctypes.c_uint32)
COUNTERS = ("qv_resyncs", "qv_no_room", "qv_missing", "qv_gaps", "qv_bad_tags")
_copies = itertools.count()


def areas(n):
    """Synthetic areas: index i has 3 + i words, words 0 and 2 relocated (word 0 passes 24 bits once relocated)."""
    return {i: dict(words=[0xFFFFF0, *((i << 12 | j) for j in range(2 + i))], relocs=[0, 2], origin=0x100 + i)
            for i in range(n)}


class Effect(ctypes.Structure):  # struct modwerk_dsp_effect
    _fields_ = [("abi", ctypes.c_uint32), ("program_words", ctypes.c_uint32), ("program", ctypes.c_void_p),
                ("code", ctypes.c_void_p), ("stream_in", ctypes.c_uint16), ("stream_out", ctypes.c_uint16),
                ("fill", ctypes.c_void_p), ("take", ctypes.c_void_p), ("reserved", ctypes.c_uint32)]


class Runtime:
    """A fresh copy of the built library (its own state)."""

    def __init__(self, so):
        path = so.with_name(f"copy{next(_copies)}{so.suffix}")
        shutil.copy(so, path)
        self.lib = lib = ctypes.CDLL(str(path))
        lib.qv_fill.argtypes = lib.qv_take.argtypes = [ctypes.c_uint, ctypes.c_uint32, U16P]
        lib.qv_program.argtypes, lib.qv_program.restype = [ctypes.c_uint], ctypes.c_int32
        lib.qv_code.argtypes = [ctypes.c_uint, ctypes.c_int32, ctypes.c_uint32, U32P]
        lib.qv_code.restype = ctypes.c_uint32
        lib.qv_name.argtypes, lib.qv_name.restype = [ctypes.c_uint], ctypes.c_char_p
        lib.qv_page.restype = ctypes.c_uint32
        self.effect = Effect.in_dll(lib, "qv_effect")

    def count(self, name):
        return ctypes.c_uint32.in_dll(self.lib, name).value

    def take(self, slot, f, block):
        buf = (ctypes.c_uint16 * self.effect.stream_out)(*([0x5A5A] * self.effect.stream_out))  # junk past the block
        buf[:len(block)] = block
        self.lib.qv_take(slot, f, buf)

    def fill(self, slot, f):
        buf = (ctypes.c_uint16 * self.effect.stream_in)(*([0xA5A5] * self.effect.stream_in))
        self.lib.qv_fill(slot, f, buf)
        return list(buf)


class Dsp:
    """One slot's DSP code: waits `wait` frames ([tag, 0xffff]), then runs the plan on noise with K from 0. ref is
    qvs.ColdFire fed the same out-blocks; from frame `skip` of the program on, every in-block must equal its compose
    and be zero past it. A waiting frame 3 or more after this program began must get only zeros. joining: the runtime
    had no room; check zeros until join(K) names the out-block it first filed, then a ref that starts there."""

    def __init__(self, test, idx, plan, wait, seed, skip=0, joining=False):
        self.t, self.idx, self.plan, self.skip, self.joining = test, idx, plan, skip, joining
        self.eng, self.ref = qvs.SplitEngine(plan), qvs.ColdFire(plan)
        self.k, self.age, self.rnd, self.checked, self.sent = -wait, 0, random.Random(seed), 0, {}
        if joining:
            self.skip = 1 << 30

    def join(self, K):
        self.ref = qvs.ColdFire(self.plan)
        self.ref.newest = N * K - 1
        for k in sorted(k for k in self.sent if k >= K):  # what the DSP sent since, too
            self.ref.receive(k, self.sent[k])
        self.skip, self.joining = K + 3, False

    def frame(self, inb):
        tag, self.age = 0x5100 | self.idx, self.age + 1
        zero = [0] * self.t.stream_in
        if self.k < 0:
            self.k += 1
            if self.age > 3:
                self.t.assertEqual(inb, zero, f"index {self.idx}: a waiting frame's in-block")
            return [tag, 0xFFFF]
        k, self.k = self.k, self.k + 1
        want = self.ref.compose(k)
        if k >= self.skip:
            self.t.assertEqual(inb[:len(want)], want, f"index {self.idx}, frame {k}")
            self.t.assertEqual(inb[len(want):], zero[len(want):], f"index {self.idx}, frame {k}: past its words")
            self.checked += 1
        elif self.joining:
            self.t.assertEqual(inb, zero, f"index {self.idx}, frame {k}: no room, so silent")
        _, ob = self.eng.frame(inb, [round(0.45 * (1 << 23) * (2 * self.rnd.random() - 1)) for _ in range(N)])
        self.ref.receive(k, ob)
        self.sent[k] = ob
        self.sent.pop(k - 8, None)
        return [tag, k & 0x7FFF] + ob


def run(rt, dsps, frames, events=None):
    """Chains 0 .. frames - 1. dsps {slot: Dsp} (a slot removed: its lane closed); events {chain: fn} at its start."""
    filled, wrote = {}, {}
    for c in range(frames):
        if events and c in events:
            events[c]()
        for slot, d in dsps.items():
            wrote[slot, c] = d.frame(filled.pop((slot, c), None))
        for slot in sorted(dsps):
            if (slot, c - 1) in wrote:
                block, before = wrote.pop((slot, c - 1)), rt.count("qv_no_room")
                rt.take(slot, c - 1, block)
                if dsps[slot].joining and block[1] != 0xFFFF and rt.count("qv_no_room") == before:
                    dsps[slot].join(block[1])
            filled[slot, c + 2] = rt.fill(slot, c + 2)


def frames_for(plan):
    """At least 600 frames, and every ring filled once and wrapped."""
    return max(600, max(len(r) for r in qvs.ColdFire(plan).ring.values()) // N + 200)


@unittest.skipUnless(PROGRAMS.exists() and LFO.exists(), "no ROM-derived inputs in ~/.cache/modwerk-local")
@unittest.skipUnless(shutil.which("cc"), "no host cc")
class TestRuntime(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()  # its headers hold ROM-derived plans: outside the repository
        cls.dir = pathlib.Path(cls.tmp.name)
        cls.plans = qvcf.plans(PROGRAMS, LFO)
        cls.areas = areas(len(cls.plans))
        cls.header = cls.dir / "qv_tables.h"
        cls.header.write_text(qvcf.tables(cls.plans, cls.areas))
        cls.names = cls.dir / "qv_names.h"
        cls.names.write_text(qvcf.names(PROGRAMS))
        cls.so = cls.build(cls.header, "lib")
        cls.stream_in = max(pl.in_words for pl in cls.plans)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    @classmethod
    def build(cls, header, name, *defs):
        so = cls.dir / f"{name}.so"
        subprocess.run(["cc", "-DQV_HOST", f'-DQV_TABLES="{header}"', f'-DQV_NAMES="{cls.names}"', *defs, "-O2",
                        "-Wall", "-Wextra", "-Werror",
                        "-shared", "-fPIC", "-o", str(so), str(qvcf.SRC)], check=True)
        return so

    def assertQuiet(self, rt, **expect):
        self.assertEqual({c: rt.count(c) for c in COUNTERS}, {c: expect.get(c, 0) for c in COUNTERS})

    def test_real_areas(self):
        """The real areas (gen/areas.json, qvarea.py areas): code() writes what qvarea.relocate gives, which
        verify_area.py runs bit-exact in dsp_host."""
        path = qvcf.GEN / "areas.json"
        if not path.exists():
            self.skipTest("no gen/areas.json: python3 -B engine/qvarea.py areas <programs.json> <lfo_dir>")
        import json
        import qvarea
        real = {int(k): v for k, v in json.loads(path.read_text()).items()}
        header = self.dir / "qv_real.h"
        header.write_text(qvcf.tables(self.plans, real))
        rt = Runtime(self.build(header, "real"))
        self.assertEqual(rt.effect.program_words, max(len(a["words"]) for a in real.values()))
        for i, ar in real.items():
            for at in (0x1234, 0x3c00):
                buf = (ctypes.c_uint32 * rt.effect.program_words)()
                n = rt.lib.qv_code(8, i, at, buf)
                self.assertEqual(list(buf[:n]), qvarea.relocate(ar, at), f"index {i} at {at:#x}")

    def test_record(self):
        rt = Runtime(self.so)
        e, addr = rt.effect, lambda fn: ctypes.cast(fn, ctypes.c_void_p).value
        self.assertEqual((e.abi, e.program_words, e.stream_in, e.stream_out, e.reserved),
                         (1, max(len(a["words"]) for a in self.areas.values()), 352, 146, 0))
        self.assertEqual((e.program, e.code, e.fill, e.take),
                         tuple(addr(f) for f in (rt.lib.qv_program, rt.lib.qv_code, rt.lib.qv_fill, rt.lib.qv_take)))

    def test_every_program(self):
        total = 0
        for idx, pl in enumerate(self.plans):
            rt, slot, wait = Runtime(self.so), 8 + idx % 8, 3 + idx % 5
            d = Dsp(self, idx, pl, wait, seed=idx)
            run(rt, {slot: d}, frames_for(pl) + wait)
            self.assertGreaterEqual(d.checked, 600)
            self.assertQuiet(rt)
            total += d.checked
        print(f"\n{len(self.plans)} programs, {total} frames bit-exact against qvs.ColdFire", file=sys.stderr)

    def test_moving_window(self):
        """No release program streams a moving read; SMALL ROOM with its swept line forced out does (qvs --force 34)."""
        forced = qvs.make_plan(PROGRAMS, 10, LFO, lat=qvcf.LAT, force=(0x34,))
        at = qvcf.PROGRAMS.index(10)
        self.assertTrue(any(x.kind == "moving" for x in forced.windows))
        plans = list(self.plans)
        plans[at] = forced
        header = self.dir / "moving.h"
        header.write_text(qvcf.tables(plans, self.areas))
        rt, d = Runtime(self.build(header, "moving")), Dsp(self, at, forced, 4, seed=7)
        run(rt, {9: d}, frames_for(forced) + 4)
        self.assertGreaterEqual(d.checked, 600)
        self.assertQuiet(rt)

    def test_switch_two_slots(self):
        """Two chambers stream side by side; then one switches to a room mid-run and starts afresh."""
        rt = Runtime(self.so)
        a, b, room = (qvcf.PROGRAMS.index(p) for p in (21, 20, 10))      # two chambers, SMALL ROOM
        dsps = {8: Dsp(self, a, self.plans[a], 3, seed=1), 9: Dsp(self, b, self.plans[b], 4, seed=2)}
        first = dsps[9]

        def switch():
            dsps[9] = Dsp(self, room, self.plans[room], 3, seed=3)
        run(rt, dsps, 1300, {400: switch})
        self.assertGreaterEqual(first.checked, 390)
        self.assertGreaterEqual(dsps[9].checked, 890)
        self.assertGreaterEqual(dsps[8].checked, 1290)
        self.assertQuiet(rt)

    def test_resync(self):
        """The DSP starts the same program again with no wait: its K jumps to 0. The three in-blocks filled before
        the runtime sees it carry the old stream (the latency); from then on it equals a fresh model."""
        i = qvcf.PROGRAMS.index(15)
        rt, dsps = Runtime(self.so), {10: Dsp(self, i, self.plans[i], 3, seed=4)}

        def restart():
            dsps[10] = Dsp(self, i, self.plans[i], 0, seed=5, skip=3)
        run(rt, dsps, 1300, {500: restart})
        self.assertGreaterEqual(dsps[10].checked, 790)
        self.assertQuiet(rt, qv_resyncs=1)

    def test_pool_full(self):
        """The dearest program takes the whole pool: a chamber beside it stays silent, counted, until the first
        slot's lane closes and its rings go back (STALE frames with no fill); then the chamber streams."""
        rt = Runtime(self.so)
        big = max(range(len(self.plans)), key=lambda i: qvs.ColdFire(self.plans[i]).ring_words)
        room = qvcf.PROGRAMS.index(20)
        dsps = {8: Dsp(self, big, self.plans[big], 3, seed=6), 9: Dsp(self, room, self.plans[room], 5, seed=7, joining=True)}
        plate = dsps[8]
        run(rt, dsps, 1200, {300: lambda: dsps.pop(8)})
        self.assertGreaterEqual(plate.checked, 290)
        self.assertGreaterEqual(dsps[9].checked, 850)
        self.assertGreater(rt.count("qv_no_room"), 290)
        self.assertQuiet(rt, qv_no_room=rt.count("qv_no_room"))

    def test_bad_tag(self):
        """A block that is not ours unsyncs the slot (zeros) until the next one that is."""
        rt, pl = Runtime(self.so), self.plans[12]
        out = [0x1234] * pl.out_words
        for f in range(1000):
            rt.take(8, f, [0x5100 | 12, f & 0x7FFF] + out)
            blk = rt.fill(8, f + 3)
        self.assertTrue(any(blk))
        rt.take(8, 1000, [0x0000, 0x1234])
        self.assertEqual(rt.fill(8, 1003), [0] * self.stream_in)
        rt.take(8, 1001, [0x5100 | len(qvcf.PROGRAMS), 1001])        # an index past the list
        self.assertEqual(rt.fill(8, 1004), [0] * self.stream_in)
        rt.take(8, 1002, [0x5100 | 12, 1002] + out)
        self.assertTrue(any(rt.fill(8, 1005)))
        self.assertQuiet(rt, qv_bad_tags=2, qv_gaps=1)

    def test_k_wraps(self):
        """K counts modulo 0x8000: its wrap is neither a gap nor a resync, and the stream goes on."""
        rt, pl = Runtime(self.so), self.plans[12]
        out = [0x1234] * pl.out_words
        for f in range(5, 0x8000 + 2000):                # base 5, so f = 5 + K
            rt.take(8, f, [0x5100 | 12, (f - 5) & 0x7FFF] + out)
            blk = rt.fill(8, f + 3)
        self.assertTrue(any(blk))
        self.assertQuiet(rt)

    def test_code(self):
        lib = Runtime(self.so).lib
        for i, a in self.areas.items():
            for at in (0x2000, 0x10):
                out = (ctypes.c_uint32 * 2048)(*([0xDEADBEEF] * 2048))
                n = lib.qv_code(8 + i % 8, i, at, out)
                want = [(w + (at - a["origin"] if j in a["relocs"] else 0)) & 0xFFFFFF for j, w in enumerate(a["words"])]
                self.assertEqual((n, list(out[:n + 1])), (len(want), want + [0xDEADBEEF]))
        for p in (-1, len(self.plans), 0x7FFFFF):
            self.assertEqual(lib.qv_code(8, p, 0x2000, (ctypes.c_uint32 * 2048)()), 0)

    def test_program(self):
        lib = Runtime(self.so).lib
        mem = (ctypes.c_uint8 * 0x800).in_dll(lib, "qv_host_mem")
        count = ctypes.c_uint32.from_buffer(mem, 0xE0)
        for t in range(8):
            mem[0x110 + t * 64 + 24] = 5                          # bank 0
            mem[0x110 + 512 + t * 64 + 24] = (3 * t, 200)[t == 6]   # bank 1; 200 clamps to the last index
        count.value = 0x12345671
        self.assertEqual([lib.qv_program(8 + t) for t in range(8)], [0, 3, 6, 9, 12, 15, len(qvcf.PROGRAMS) - 1, 21])
        count.value = 0x12345672
        self.assertEqual([lib.qv_program(8 + t) for t in range(8)], [5] * 8)
        self.assertEqual([lib.qv_program(s) for s in (*range(8), 16, 99)], [-1] * 10)

    def test_names(self):
        """Every value PROG can store (and past the list, as a lock or an old project could hold) names in stock's
        message box the program qv_program then picks: its number on the original as the dial shows it (the manifest's
        label), then its ROM name, in at most 19 characters."""
        import json
        from manifest import MODULE
        rom = {p["p"]: p["name"] for p in json.loads(PROGRAMS.read_text())}
        labels = MODULE.params[0].labels
        lib = Runtime(self.so).lib
        mem = (ctypes.c_uint8 * 0x800).in_dll(lib, "qv_host_mem")
        ctypes.c_uint32.from_buffer(mem, 0xE0).value = 0
        self.assertEqual(len(labels), len(qvcf.PROGRAMS))
        for v in range(256):
            mem[0x110 + 24] = v                                   # T1's FX2 knob A, bank 0
            i = lib.qv_program(8)
            self.assertEqual(i, min(v, len(qvcf.PROGRAMS) - 1), f"PROG {v}")
            line, p = lib.qv_name(v).decode(), qvcf.PROGRAMS[i]
            self.assertEqual(line, qvcf.short_name(p, rom[p]), f"PROG {v}")
            self.assertTrue(line.startswith(labels[i] + " ") and line[3:] == " ".join(rom[p].upper().split())[:16].rstrip()
                            and len(line) <= 19, f"PROG {v}: {line!r}")
            self.assertIn(f"/* {i}: program {p} */", self.header.read_text())   # the area code() writes for it

    def test_committed_names(self):
        """gen/qv_names.h is what qvcf.py gen writes for manifest.PROGRAMS."""
        self.assertEqual((qvcf.GEN / "qv_names.h").read_text(), qvcf.names(PROGRAMS))

    def test_page(self):
        """qv_page: the page address the base keeps at recipe + 48, the 'MWPG' recipe the nearest below the image."""
        def page(at, value):
            lib = Runtime(self.so).lib
            image = (ctypes.c_uint8 * 0x4000).in_dll(lib, "qv_host_image")
            if at is not None:
                image[at:at + 4] = list(b"MWPG")
                image[at + 48:at + 52] = list(value.to_bytes(4, "big"))
            return lib.qv_page()
        self.assertEqual(page(None, 0), 0)                        # no recipe
        self.assertEqual(page(0x3f00, 0x4012_3456), 0x4012_3456)
        self.assertEqual(page(0, 0x47FF_FFFC), 0x47FF_FFFC)       # 16 KiB below the image
        self.assertEqual(page(0x3f00, 0), 0)                      # not built yet
        self.assertEqual(page(0x3f00, 0x4800_0000), 0)

    @unittest.skipUnless(shutil.which("m68k-elf-gcc") and shutil.which("m68k-elf-as"), "no m68k-elf-gcc")
    def test_coldfire_build(self):
        """The unit as the builder assembles it (sdk/runtime/loader/build.py: a DRAM unit, -mcpu=54455): the C, then
        qv_entry.s, whose displaced instructions are the site's stock bytes (events.json ev_knob_store's guard)."""
        import hashlib
        unit, obj = self.dir / "unit.s", self.dir / "unit.o"
        unit.write_text(qvcf.unit(f'-DQV_TABLES="{self.header}"', f'-DQV_NAMES="{self.names}"'))
        subprocess.run(["m68k-elf-as", "-mcpu=54455", "--defsym", "MODWERK_EVENTS=1", str(unit), "-o", str(obj)], check=True)
        dump = subprocess.run(["m68k-elf-objdump", "-d", str(obj)], check=True, stdout=subprocess.PIPE, text=True).stdout
        entry = dump[dump.index("<qv_knob_entry>:"):]
        code = [line.split("\t")[1].split() for line in entry.splitlines()[1:] if line.count("\t") >= 2]
        end = code.index(["4e75"])                                                # its rts
        tail = bytes.fromhex("".join(w for words in code[end - 3:end] for w in words))   # the three before it
        self.assertEqual(hashlib.sha256(tail).hexdigest(),
                         "dc6543d672cdf223fc2ec7cc3c04b8a584dbd6e7bb1e3590b91cd3e469e0b324")


if __name__ == "__main__":
    unittest.main()
