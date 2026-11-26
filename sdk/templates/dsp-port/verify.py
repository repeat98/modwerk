#!/usr/bin/env python3
"""__NAME__'s render gate: engine.asm assembled and run in dsp_host, held to reference.py's model.

    python3 -B verify.py                              (needs the DSP tools; about a minute)
    python3 -B verify.py --fx-audit PLAN RENDERS      (renders npm run fx:audit -- plan PLAN at the dearest
                                                       setting into RENDERS, for npm run fx:audit -- check)

No firmware is read: the harness is sdk/octatrack/tools/dsp_gate.py, a synthetic image and dsp_host. Knobs
arrive as value << 16. What this cannot see: the composed image, the real dispatcher, the panel and the sound
on a unit.

Gates:
  1. Every instruction decodes as written: no mpysu/macsu, no rep, every product the signed mpy/mac x0,y1
     form, and the state inside X:(r7+$00..$1f).
  2. Bit for bit the model: stereo noise at the defaults, a loud tone at the dearest setting, knob automation
     over every knob's range, a 5-frame trig split every block, a knob word carrying an LFO's fraction bits,
     garbage in the state block before init, and two instances with their own knobs.
  3. Silence in is exact silence out at the defaults, the dearest setting and every knob at 0; a burst's tail
     ends in exact silence.
  4. The cycle meter, printed for TESTING.md and evidence/performance.json (perf.py measures the rest).
"""
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def _library():
    """sdk/octatrack/tools, from the module folder, its mirror under sdk/octabam/modules or sdk/drafts."""
    for base in HERE.parents:
        if (base / "sdk/octatrack/tools/dsp_gate.py").is_file():
            return base / "sdk/octatrack/tools"
    sys.exit("[FAIL] sdk/octatrack/tools/dsp_gate.py not found: run this inside a Modwerk checkout")


sys.path.insert(0, str(_library()))
import dsp_gate as G  # noqa: E402
import reference as R  # noqa: E402

SOURCE = HERE / "engine.asm"
STATE_LAST = 0x1f      # the last word of X:(r7+...) the module may use


def rows_over_ranges():
    """Every knob swept over its range, one at a time, then a one-block step and back to the defaults."""
    rows, block = {0: R.DEFAULTS}, 10
    for slot in range(len(R.KNOBS)):
        for value in (0, 127, 64):
            row = list(R.DEFAULTS)
            row[slot] = value
            rows[block] = tuple(row)
            block += 10
    rows[block], rows[block + 1], rows[block + 2] = R.DEAREST, R.DEFAULTS, R.DEAREST
    rows[block + 30] = R.DEFAULTS
    return rows


def main():
    G.require_tools(HERE)
    gate = G.Gates("__ID__")
    with G.workdir("__ID__-verify-") as tmp:
        work = pathlib.Path(tmp)
        asm = G.assemble(SOURCE, work)
        if "--fx-audit" in sys.argv:
            plan, renders = sys.argv[sys.argv.index("--fx-audit") + 1:][:2]
            for path in G.render_fx_audit(asm, plan, renders, R.DEAREST):
                print(path.name, flush=True)
            return

        # 1. decodes as written
        problems = G.trap_problems(asm, forms=("x0,y1",))
        gate("1 decodes as written: signed mpy/mac x0,y1, no rep, no mpysu/macsu", not problems,
             "; ".join(problems[:4]))
        offsets = G.state_offsets(SOURCE.read_text())
        gate("1 state inside X:(r7+$00..$1f)", not offsets or offsets[-1] <= STATE_LAST,
             f"(highest ${offsets[-1]:02x})" if offsets else "(no state yet)")

        # 2. bit for bit the model
        n = 16 * 160
        nl, nr = G.noise(n, 0.7, 1), G.noise(n, 0.7, 2)
        t = G.tone(440, 0.9, n)

        def same(name, inst, **kw):
            r = G.run(asm, [inst], split=kw.get("split"), pwords=kw.get("pwords"), dirty=kw.get("dirty"))
            rows = inst.rows or {0: inst.knobs}
            want = R.render(inst.left, inst.right, rows, split=kw.get("split") or 0, pwords=kw.get("model_pwords"))
            gate.same(name, r.outputs[0], want[:2])
            return r

        meter_def = same("2 defaults, stereo noise", G.Instance(nl, nr, knobs=R.DEFAULTS)).meter
        meter_dear = same("2 the dearest setting, a loud tone and noise", G.Instance(t, nl, knobs=R.DEAREST)).meter
        rows = rows_over_ranges()
        same("2 knob automation", G.Instance(nl, nr, rows=rows))
        same("2 a trig split every block", G.Instance(nl, nr, rows=rows), split=5)
        word = (R.DEFAULTS[0] << 16) | 0xb700
        same("2 a knob word with an LFO's fraction bits", G.Instance(nl, nr, knobs=R.DEFAULTS),
             pwords=[(0, 0, word)], model_pwords={0: 0xb700})
        same("2 garbage state before init", G.Instance(nl, nr, rows=rows), dirty=0x5a5a5a)
        a, b = G.run(asm, [G.Instance(nl, nr, knobs=R.DEFAULTS), G.Instance(t, t, knobs=R.DEAREST)]).outputs
        gate.same("2 two instances: the first", a, R.render(nl, nr, {0: R.DEFAULTS})[:2])
        gate.same("2 two instances: the second", b, R.render(t, t, {0: R.DEAREST})[:2])

        # 3. silence
        z = [0] * n
        for knobs in (R.DEFAULTS, R.DEAREST, (0,) * len(R.KNOBS)):
            (l, r), = G.run(asm, [G.Instance(z, z, knobs=knobs)], tag="zero").outputs
            gate(f"3 silence in, silence out at {dict(zip(R.KNOBS, knobs))}", not any(l + r))
        m = G.FS * 2
        x = G.burst(4410, m)
        (l, r), = G.run(asm, [G.Instance(x, x, knobs=R.DEAREST)], tag="tail").outputs
        gate("3 a burst's tail ends in silence", not any(l[-G.FS // 2:] + r[-G.FS // 2:]))

        # 4. cost
        print(f"[INFO] cycle meter: {meter_def} a sample at the defaults, {meter_dear} at the dearest setting")
        print(f"[INFO] dsp_gate.py {G.provenance(HERE)['dsp_gate.py']}")
    gate("reference.py models upstream, not the scaffold's pass-through", R.PORTED,
         "" if R.PORTED else "(port it, then set PORTED = True)")
    gate.finish()


if __name__ == "__main__":
    main()
