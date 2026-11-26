"""The shared DSP host-test library, sdk/octatrack/tools/dsp_gate.py.

    python3 -B -m unittest discover -s sdk/tests -p test_dsp_gate.py -v

The image, the knob rows and the parsing of dsp_host's report run everywhere. The renders need dsp_asm,
dsp_host and the disassembler (npm run upstream:tools, then make setup in that octabam checkout) and skip
without them: CI has none.
"""
import json
import pathlib
import struct
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "sdk/octatrack/tools"))
import dsp_gate as G  # noqa: E402

TOOLS = G.tools_present()
NOTHING = "init:\n        rts\nproc:\n        rts\n"   # sdk/templates/dsp/engine.asm: leaves the audio in place

REPORT = """instance 0: core 0 pos 0, r7 = X:0x06200 (idx 0), base = Y:0x04000 (X:0x256 idx 0), audio X:0x00700, init P:0x02000 proc P:0x02001
instance 1: core 1 pos 2, r7 = X:0x06400 (idx 1), base = Y:0x04000 (X:0x257 idx 1), audio X:0x00700, init P:0x02000 proc P:0x02001
ran 4 blocks x 16 frames on 2 instance(s), 2 core(s) lock-step
  core 0 meter: max 120 instructions in block 2, mean 100 (7.5/sample max, 6.3/sample mean at 16 frames); inits 12
  core 1 meter: max 160 instructions in block 0, mean 150 (10.0/sample max, 9.4/sample mean at 16 frames); inits 12
  instance 0: 6.2 instructions/sample (4 calls)
  instance 0: 0 non-zero output samples, 0 stray write regions, 0 CLOBBERING a loaded module
  instance 1: 9.1 instructions/sample (4 calls)
  instance 1: 4 non-zero output samples, 1 stray write regions, 2 CLOBBERING a loaded module
"""


class Offline(unittest.TestCase):
    def test_image_layout(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = G.write_image([0x00000c, 0x00000c], pathlib.Path(tmp) / "m.mem",
                                 extra=[(G.P, 0x3000, [1, 2, 3])], x={0x20d: 8})
            data, records = path.read_bytes(), []
            while True:
                space, addr, count = struct.unpack_from("<BII", data)
                data = data[9:]
                if space == 0xff:
                    break
                records.append((space, addr, list(struct.unpack_from(f"<{count}I", data))))
                data = data[4 * count:]
        self.assertEqual(data, b"")
        self.assertEqual(records[0], (G.P, 0x2000, [0x0c, 0x0c]))
        self.assertEqual(records[1], (G.P, 0x40, [0, 0, 0, 0]))
        self.assertEqual(records[2], (G.P, 0x3000, [1, 2, 3]))
        x = {addr: words[0] for space, addr, words in records if space == G.X}
        self.assertEqual(x[0x213], 0x256)
        self.assertEqual(x[0x20d], 8)
        self.assertEqual([x[0x256 + i] for i in range(16)], [0x4000] * 16)

    def test_knobs_and_words(self):
        self.assertEqual(G.knob_row((13, 127)), [13, 127] + [0] * 10)
        self.assertEqual(len(G.knob_row(range(20))), 12)
        self.assertEqual(G.s24([0xffffff, 0x7fffff, -5, 0x800000]), [-1, 0x7fffff, -5, -0x800000])
        self.assertEqual(G._pwords([(0, 0, 0x1eb700), (1, 3, 0x10000)]), "0:0=1eb700,1:3=10000")
        self.assertEqual(G._pwords("0:0=1eb700"), "0:0=1eb700")

    def test_report(self):
        r = G._parse(REPORT, 2, [([], []), ([], [])], 3, [])
        self.assertEqual(r.meters, {0: 7.5, 1: 10.0})
        self.assertEqual(r.means, {0: 6.3, 1: 9.4})
        self.assertEqual(r.meter, 10.0)
        self.assertEqual(r.layout, [(0, 0), (1, 2)])
        self.assertEqual(r.per_instance, [6.2, 9.1])
        self.assertEqual(r.nonzero, [0, 4])
        self.assertEqual((r.stray, r.clobbers), ([0, 1], [0, 2]))
        self.assertFalse(r.harness_word(1), "only an eight-instance run")
        eight = G._parse(REPORT, 8, [([], [])] * 8, 0, [])
        eight.layout = [(k // 4, k % 4) for k in range(8)]
        self.assertEqual([k for k in range(8) if eight.harness_word(k)], [6])

    def test_source_reading(self):
        src = "x:\n  mpy x0,y1,a ; mac in a comment\nlbl: mac -x0,y1,b\n  mpyr x0,y1,a\n  move a,x:(r7+$1e)\n  move x:(r7+$03),a\n"
        self.assertEqual(G.source_products(src), 3)
        self.assertEqual(G.state_offsets(src), [0x03, 0x1e])

    def test_missing_tool_says_how(self):
        old = G.os.environ.get("DSP_HOST")
        G.os.environ["DSP_HOST"] = "/nonexistent/dsp_host"
        try:
            self.assertIsNone(G.find_tool("dsp_host"))
            with self.assertRaisesRegex(G.ToolMissing, "npm run upstream:tools"):
                G.tool("dsp_host")
        finally:
            if old is None:
                del G.os.environ["DSP_HOST"]
            else:
                G.os.environ["DSP_HOST"] = old


@unittest.skipUnless(TOOLS, "dsp_asm, dsp_host or the disassembler is not built here (npm run upstream:tools)")
class Renders(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="dsp-gate-test-")
        self.work = pathlib.Path(self.tmp.name)
        self.asm = G.assemble(NOTHING, self.work)

    def tearDown(self):
        self.tmp.cleanup()

    def test_assemble(self):
        self.assertEqual((self.asm.syms["init"], self.asm.syms["proc"]), (0x2000, 0x2001))
        self.assertEqual(self.asm.words, [0x00000c, 0x00000c])
        self.assertEqual([l.mnemonic for l in G.disassemble(self.asm)], ["rts", "rts"])
        with self.assertRaises(G.HostError):
            G.assemble("proc:\n        notaninstruction a\n", self.work, name="bad")

    def test_pass_through_split_and_two_instances(self):
        n = 16 * 12
        left, right = G.noise(n, 0.5, 1), G.tone(440, 0.5, n)
        r = G.run(self.asm, [G.Instance(left, right, knobs=(64, 0))])
        self.assertEqual(r.outputs[0], (left, right))
        self.assertEqual(r.layout, [(0, 0)])
        self.assertIsNotNone(r.meter)
        r = G.run(self.asm, [G.Instance(left, right, rows={0: (1,), 3: (127,)}), G.Instance(right[:100], left[:100])],
                  split=5, pwords=[(0, 0, 0x1eb700)], dirty=0x5a5a5a)
        self.assertEqual(r.outputs[0], (left, right))
        self.assertEqual(r.outputs[1], (right[:100] + [0] * (n - 100), left[:100] + [0] * (n - 100)))
        self.assertEqual(len(r.layout), 2)

    def test_second_core_and_guard(self):
        n = 16 * 4
        x = G.noise(n, 0.5, 2)
        r = G.run(self.asm, [G.Instance(x, x, core=0, split=3), G.Instance(x, x, core=1, split=0)], guard=True)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(set(r.meters), {0, 1})
        self.assertEqual([o[0] for o in r.outputs], [x, x])
        self.assertEqual(r.clobbers, [0, 0])

    def test_traps(self):
        good = G.assemble("init:\n        rts\nproc:\n        mpy x0,y1,a\n        mac -x0,y1,b\n        rts\n",
                          self.work, name="good")
        self.assertEqual(G.trap_problems(good), [])
        # TRAPS.md: dsp_asm encodes mpy x0,y0 as mpysu, silently.
        bad = G.assemble("init:\n        rts\nproc:\n        mpy x0,y0,a\n        rts\n", self.work, name="trap")
        problems = G.trap_problems(bad)
        self.assertTrue(any("mpysu" in p for p in problems), problems)
        self.assertEqual(G.trap_problems(bad, forms=None)[:1], problems[:1])
        rep = G.assemble("init:\n        rts\nproc:\n        rep #4\n        nop\n        rts\n", self.work, name="rep")
        self.assertTrue(any("rep" in p for p in G.trap_problems(rep)))

    def test_fx_audit_render(self):
        plan = self.work / "plan"
        plan.mkdir()
        names = {"tone": [1, -2, 3] * 20, "idle": [5] * 30 + [0] * 30, "noise": [0, 7] * 25}
        for name, samples in names.items():
            (plan / f"{name}.raw").write_bytes(struct.pack(f"<{len(samples)}i", *samples))
        (plan / "plan.json").write_text(json.dumps({"tones": [{"file": "tone"}], "idle": {"file": "idle"},
                                                    "noise": {"file": "noise"}}))
        written = G.render_fx_audit(self.asm, plan, self.work / "renders", (64,))
        self.assertEqual([p.name for p in written], ["tone.raw", "idle.raw", "noise.raw"])
        out = struct.unpack("<120i", written[0].read_bytes())
        self.assertEqual(list(out[0::2]), names["tone"])
        self.assertEqual(list(out[1::2]), names["tone"])


if __name__ == "__main__":
    unittest.main()
