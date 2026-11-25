"""Midiverb's DSP gate: engine.asm in dsp_host, bit for bit against a model of what it must compute.

The ColdFire half streams a program through FX2's page 2 (stream.c); here a test driver placed before the engine
copies each call's three stream words into the parameter block, as stream.c leaves them in the frame record, then
runs the engine unchanged. The model takes the stream as engine.asm must (chunk 0 first, in order, the checksum,
the ring cleared meanwhile) and runs each program as generate.mjs's DSP form defines it, with the engine's half-rate
input, LEVL, output interpolation and MIX in the DSP's integer arithmetic. generate.mjs proves the programs against
the original machine; this proves the engine against them.
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
STREAM_AT = 0x3000
FS = 1 << 23
NONE = None
DRIVER = """
; verify.py's test driver: this call's three stream words into the parameter block, then the engine.
proc:
        move    #>$ffffff,m4
        move    x:(r7+$40),a
        move    a,b
        asl     b
        add     b,a                     ; 3c
        move    a,n4
        move    #>$fab2e0,r4
        nop
        move    (r4)+n4
        move    p:(r4)+,x0
        move    x0,x:(r6+$c)
        move    p:(r4)+,x0
        move    x0,x:(r6+$d)
        move    p:(r4)+,x0
        move    x0,x:(r6+$e)
        move    x:(r7+$40),a
        add     #>$1,a
        move    a,x:(r7+$40)
        bra     mvqPROC
"""


def clamp(v):
    return max(-FS, min(FS - 1, v))


def wrap(v):
    return ((v & 0xFFFFFF) ^ 0x800000) - 0x800000


def half(x):
    """half() on a left-aligned 16-bit word, as the engine computes it."""
    return ((x >> 1) & ~0xFF) + (0x100 if x < 0 else 0)


def stream(plan, calls, kills=()):
    """The three page-2 words of every call, as stream.c sends them: plan is [(from_call, program or None)];
    kills [(from_call, to_call)] the calls STOP's tail kill holds the track."""
    out, k, sent = [], 0, None
    for c in range(calls):
        g = next((p for start, p in reversed(plan) if c >= start), None)
        if g is None:
            out.append((0, 0, 0))
            sent = None
            continue
        if any(a <= c < b for a, b in kills):
            out.append(((0xFF << 16) | ((g[0] if isinstance(g, tuple) else g) << 8), 0, 0))
            continue
        if isinstance(g, tuple):        # a deliberately broken stream: (program, word index to corrupt)
            g, broken = g
        else:
            broken = None
        if g != sent:
            sent, k = g, 0
        w = list(PROGRAMS[g]["words"])
        if broken is not None:
            w[broken] ^= 1
        words, i = (w[0] & 0x7FFF) + 1, 2 * k
        a, b = w[i], (w[i + 1] if i + 1 < words else 0)
        out.append(((k << 16) | (g << 8), a << 8, b << 8))
        k = k + 1 if i + 2 < words else 0
    return out


def model(chunks, left, right, knobs, block=16):
    """What the engine outputs for one instance, a call a block (no splits)."""
    lev, mix = knobs[1] << 16, knobs[5] << 16
    mix = 0x7FFFFF if mix == 0x7F0000 else mix
    s = dict(playing=NONE, loading=NONE, next=0, loaded=False, sum=0, n=0, chk=None, counter=0, fade=0, kill=False)
    area, ring = [0] * 262, [0] * RING
    p = acc = phase = held = 0
    wet_mix = step = 0
    y_prev, y_cur, out_run = [0, 0], [0, 0], [0, 0]
    out_l, out_r = list(left), list(right)
    for call, start in enumerate(range(0, len(left), block)):
        c, d, e = chunks[call]
        k, g, A, B = c >> 16, (c >> 8) & 0xFF, (d >> 8) & 0xFFFF, (e >> 8) & 0xFFFF
        if k == 0xFF:                               # the tail kill: silent, the ring cleared once
            if not s["kill"]:
                s.update(kill=True, fade=0, counter=31)
                p = acc = phase = 0
                y_prev, y_cur = [0, 0], [0, 0]
                ring = [0] * RING
        elif s["fade"]:
            s["kill"] = False
            s["fade"] -= 1
            if not s["fade"]:
                s["playing"] = NONE
        elif s["playing"] != g:
            if s["loading"] != g and s["playing"] is not NONE:
                s["fade"], step = 16, mix >> 8          # the wet's mix falls from the mix by a 256th a sample
                wet_mix = mix
            else:
                if s["loading"] != g and k == 0 and A & 0x8000 and 4 <= (A & 0x7FFF) <= 0x105:
                    s.update(loading=g, n=A & 0x7FFF, next=0, loaded=False, sum=0, chk=None, playing=NONE, counter=31)
                    p = acc = phase = 0
                    y_prev, y_cur = [0, 0], [0, 0]
                    ring = [0] * RING
                if s["loading"] == g and not s["loaded"] and s["next"] == k:
                    i, n = 2 * k, s["n"]
                    area[i] = A
                    if i == n:
                        s["chk"] = A
                    else:
                        s["sum"] += A
                    if i + 1 <= n:
                        area[i + 1] = B
                        if i + 1 == n:
                            s["chk"] = B
                        else:
                            s["sum"] += B
                    s["next"] = k + 1
                    if 2 * (k + 1) > n:
                        if ((s["sum"] & 0xFFFF) ^ 0xA5A5) == s["chk"]:
                            s["loaded"] = True
                        else:
                            s["loading"] = NONE
        if k != 0xFF:
            s["kill"] = False
        quiet = False
        if s["counter"]:
            s["counter"] -= 1
            quiet = True
        else:
            if s["loaded"]:
                s.update(playing=s["loading"], loading=NONE, loaded=False)
            quiet = s["kill"] or s["playing"] is NONE
        if quiet:                                   # the reverb silent, the dry at its mix
            for n in range(start, min(start + block, len(left))):
                out_l[n], out_r[n] = mixed(left[n], 0, mix, 0), mixed(right[n], 0, mix, 0)
            continue
        if not s["fade"]:
            wet_mix = mix
        for n in range(start, min(start + block, len(left))):
            dl, dr = left[n], right[n]
            if phase == 0:
                held, phase = (dl + dr) >> 1, 1
                wet = [(y_prev[0] + y_cur[0]) >> 1, (y_prev[1] + y_cur[1]) >> 1]
            else:
                x0 = (dl + dr + 2 * held) >> 2
                x1 = clamp((x0 * lev) >> 21)
                acc, p = run(area, ring, p, acc, half((x1 >> 3) & ~0x1FF), out_run)
                y_prev, y_cur = y_cur, list(out_run)
                wet, phase = list(y_prev), 0
            if s["fade"]:
                wet_mix = max(0, wet_mix - step)
            out_l[n] = mixed(dl, wet[0], mix, wet_mix)
            out_r[n] = mixed(dr, wet[1], mix, wet_mix)
    return out_l, out_r


def mixed(dry, wet, mix, wet_mix):
    return clamp(((dry << 24) - 2 * dry * mix + 2 * wet * wet_mix) >> 24)


HANDLERS = ["run", "st", "ld", "stn", "in", "outR", "outL", "stR", "stL", "stnR", "stnL", "end"]
SLOT = 16  # generate.mjs SLOT: a unit's first word is its handler's offset from mvqJTAB
LABELS = ["mvqRUN_", "mvqST__", "mvqLD__", "mvqSTN_", "mvqIN__", "mvqOUTR", "mvqOUTL", "mvqSTR_", "mvqSTL_", "mvqSNR_",
          "mvqSNL_", "mvqEND_"]


def run(words, ring, p, acc, w_in, out):
    at = lambda off: (p + off) % RING  # noqa: E731
    i = 1  # words[0] is the header
    while True:
        kind, arg = HANDLERS[words[i] // SLOT], words[i + 1]
        i += 2
        if kind == "end":
            return wrap(acc), (p + 1) % RING
        if kind == "run":
            for off in words[i:i + arg]:
                acc += ring[at(off)]
            i += arg
            continue
        x = wrap(acc)
        if kind == "st":
            ring[at(arg)] = half(x); acc = x + ring[at(arg)]
        elif kind == "ld":
            acc = ring[at(arg)]
        elif kind == "stn":
            ring[at(arg)] = half(-x - 0x100); acc = ring[at(arg)]
        elif kind == "in":
            ring[at(arg)] = w_in
        elif kind in ("outR", "outL"):
            out[0 if kind == "outL" else 1] = clamp(ring[at(arg)] * 16)
        else:
            v = x if kind in ("stR", "stL") else -x - 0x100
            ring[at(arg)] = half(v)
            out[0 if kind.endswith("L") else 1] = clamp(v * 8)


def main():
    G.require_tools()
    tmp = G.workdir("midiverb-gate-")
    work = pathlib.Path(tmp.name)
    source = DRIVER + (HERE / "engine.asm").read_text().replace("\nproc:\n", "\nmvqPROC:\n")
    asm = G.assemble(source, work, replace={"$fab2e0": f"${STREAM_AT:x}"})
    problems = G.trap_problems(asm, forms=("x0,y1", "y0,x0"))  # TRAPS.md: both orders encode signed
    ok = not problems
    print(("[PASS]" if ok else "[FAIL]") + f" assembler traps: {problems or 'none'}")
    base = asm.syms["mvqJTAB"]
    misplaced = [f"{name} at +{asm.syms[name] - base}" for k, name in enumerate(LABELS) if asm.syms[name] - base != SLOT * k]
    ok &= not misplaced
    print(("[PASS]" if not misplaced else "[FAIL]") + f" handlers {SLOT} words apart from mvqJTAB: {misplaced or 'all'}")
    blocks = 900
    n = 16 * blocks
    sig = [0] * 5200 + G.burst(2400, n - 5200, amp=0.45)
    right = [0] * 5200 + G.burst(2400, n - 5200, amp=0.3, seed=7)
    late = [0] * 11600 + G.burst(1200, n - 11600, amp=0.45, seed=5)
    by = {(q["bank"], q["number"]): i for i, q in enumerate(PROGRAMS)}
    a, b = by[("MV1", 12)], by[("MV2", 25)]  # both reverbs that answer at once
    cases = [
        ("streamed from the start", [(0, a)], sig, right, (0, 32, 0, 0, 0, 127)),
        ("switched to another program", [(0, a), (520, b)], late, late, (0, 64, 0, 0, 0, 90)),
        ("STOP's tail kill, then on", [(0, a)], sig, right, (0, 32, 0, 0, 0, 90), [(420, 460)]),
        ("no stream: the reverb silent", [(0, None)], sig, right, (0, 32, 0, 0, 0, 90)),
        ("a broken checksum: the reverb silent", [(0, (a, 9))], sig, right, (0, 32, 0, 0, 0, 90)),
    ]
    meter = 0
    for name, plan, left_in, right_in, knobs, *kills in cases:
        chunks = stream(plan, blocks, kills[0] if kills else ())
        image = G.write_image(asm.words, work / "m.mem", org=asm.org,
                              extra=[(G.P, STREAM_AT, [w for t in chunks for w in t])])
        # One instance a run: the synthetic image hands every instance the same allocator buffer.
        r = G.run(asm, [G.Instance(left_in, right_in, knobs=knobs)], image=image)
        meter = max(meter, r.meter)
        got_l, got_r = r.outputs[0]
        want_l, want_r = model(chunks, left_in, right_in, knobs)
        diff = next((i for i in range(n) if (got_l[i], got_r[i]) != (want_l[i], want_r[i])), None)
        quiet = (got_l, got_r) == tuple(map(list, zip(*[(mixed(l, 0, knobs[5] << 16, 0), mixed(r, 0, knobs[5] << 16, 0))
                                                         for l, r in zip(left_in, right_in)])))
        good = diff is None and (quiet if "silent" in name else not quiet)
        ok &= good
        where = "" if diff is None else f", first difference at frame {diff}: got {got_l[diff], got_r[diff]} want {want_l[diff], want_r[diff]}"
        print(("[PASS]" if good else "[FAIL]") + f" {name}: bit-exact{' and silent' if quiet else ''}{where}")
    print(f"meter: {meter} executed instructions a sample, the dearest case (the driver's few included)")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
