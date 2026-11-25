"""Midiverb's DSP gate: engine.asm in dsp_host, bit for bit against a model of what it must compute.

The model runs each program from programs.json exactly as generate.mjs's DSP form defines it (the original
machine's 16-bit arithmetic on pre-halved words), with the engine's half-rate input, LEVL, output
interpolation and MIX, all in the DSP's integer arithmetic. generate.mjs proves the DSP form against the
original machine; this proves the engine against the DSP form.
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
for up in HERE.parents:
    if (up / "sdk/octatrack/tools/dsp_gate.py").exists():
        sys.path.insert(0, str(up / "sdk/octatrack/tools"))
        break
import dsp_gate as G  # noqa: E402

TABLE = json.loads((HERE / "programs.json").read_text())
RING = TABLE["size"]
PROGRAMS = TABLE["programs"]
TABLE_AT = 0x3000
FS = 1 << 23


def ptable():
    index, body = [], []
    for p in PROGRAMS:
        index.append(len(PROGRAMS) + len(body))
        body += p["words"]
    return index + body


def clamp(v):
    return max(-FS, min(FS - 1, v))


def wrap(v):
    return ((v & 0xFFFFFF) ^ 0x800000) - 0x800000


def half(x):
    """half() on a left-aligned 16-bit word, as the engine computes it."""
    return ((x >> 1) & ~0xFF) + (0x100 if x < 0 else 0)


def model(words, left, right, knobs, block=16):
    """What the engine outputs for one instance, block by block (no splits)."""
    prog, lev, mix = knobs[0], knobs[1] << 16, knobs[5] << 16
    mix = 0x7FFFFF if mix == 0x7F0000 else mix
    ring = [0] * RING
    p = acc = phase = s = 0
    y_prev, y_cur, out_run = [0, 0], [0, 0], [0, 0]
    out_l, out_r = list(left), list(right)
    calls, armed, counter = 0, False, 0
    for start in range(0, len(left), block):
        calls += 1
        if counter:
            counter -= 1
            continue
        if not armed:
            armed, counter = True, 0x80
            continue
        for n in range(start, min(start + block, len(left))):
            dl, dr = left[n], right[n]
            if phase == 0:
                s = (dl + dr) >> 1
                phase = 1
                wet = [(y_prev[0] + y_cur[0]) >> 1, (y_prev[1] + y_cur[1]) >> 1]
            else:
                x0 = (dl + dr + 2 * s) >> 2
                x1 = clamp((x0 * lev) >> 21)
                v = (x1 >> 3) & ~0x1FF
                w_in = half(v)
                acc, p = run(words, ring, p, acc, w_in, out_run)
                y_prev, y_cur = y_cur, list(out_run)
                wet, phase = list(y_prev), 0
            out_l[n] = mixed(dl, wet[0], mix)
            out_r[n] = mixed(dr, wet[1], mix)
    return out_l, out_r


def mixed(dry, wet, mix):
    a = (dry << 24) - 2 * dry * mix + 2 * wet * mix
    return clamp(a >> 24)


def run(words, ring, p, acc, w_in, out):
    at = lambda off: (p + off) % RING  # noqa: E731
    i = 1
    for _ in range(words[0]):
        w = words[i]; i += 1
        if not w & 0x800000:
            for off in words[i:i + w]:
                acc += ring[at(off)]
            i += w
            continue
        kind, off = (w >> 16) & 0x7F, w & 0x3FFF
        x = wrap(acc)
        if kind == 0x01:
            ring[at(off)] = half(x); acc = x + ring[at(off)]
        elif kind == 0x02:
            acc = ring[at(off)]
        elif kind == 0x04:
            ring[at(off)] = half(-x - 0x100); acc = ring[at(off)]
        elif kind == 0x08:
            ring[at(off)] = w_in
        elif kind in (0x18, 0x28):
            out[0 if kind == 0x28 else 1] = clamp(ring[at(off)] * 16)
        else:
            v = x if kind in (0x38, 0x48) else -x - 0x100
            ring[at(off)] = half(v)
            out[0 if kind in (0x48, 0x68) else 1] = clamp(v * 8)
    return wrap(acc), (p + 1) % RING


def main():
    G.require_tools()
    tmp = G.workdir("midiverb-gate-")
    work = pathlib.Path(tmp.name)
    asm = G.assemble(HERE / "engine.asm", work, replace={"$fab1e0": f"${TABLE_AT:x}"})
    problems = G.trap_problems(asm)
    ok = not problems
    print(("[PASS]" if ok else "[FAIL]") + f" assembler traps: {problems or 'none'}")
    image = G.write_image(asm.words, work / "m.mem", org=asm.org, extra=[(G.P, TABLE_AT, ptable())])
    n = 16 * 360
    sig = [0] * 2400 + G.burst(1400, n - 2400, amp=0.45)
    right = [0] * 2400 + G.burst(1400, n - 2400, amp=0.3, seed=7)
    # (PROG, LEVL, -, -, -, MIX)
    cases = [(0, 32, 0, 0, 0, 127), (9, 64, 0, 0, 0, 90), (17, 127, 0, 0, 0, 127), (21, 16, 0, 0, 0, 127),
             (23, 32, 0, 0, 0, 0)]
    meter = 0
    for k in cases:
        # One instance a run: the synthetic image hands every instance the same allocator buffer.
        r = G.run(asm, [G.Instance(sig, right, knobs=k)], image=image)
        meter = max(meter, r.meter)
        got_l, got_r = r.outputs[0]
        want_l, want_r = model(PROGRAMS[k[0]]["words"], sig, right, k)
        diff = next((i for i in range(n) if (got_l[i], got_r[i]) != (want_l[i], want_r[i])), None)
        good = diff is None and any(got_l)
        ok &= good
        where = "" if diff is None else f", first difference at frame {diff}: got {got_l[diff], got_r[diff]} want {want_l[diff], want_r[diff]}"
        print(("[PASS]" if good else "[FAIL]") + f" {PROGRAMS[k[0]]['label']} PROG {k[0]} LEVL {k[1]} MIX {k[5]}: bit-exact{where}")
    print(f"meter: {meter} executed instructions a sample, the dearest case")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
