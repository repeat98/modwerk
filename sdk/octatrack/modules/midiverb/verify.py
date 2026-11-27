"""Midiverb's DSP gate: engine.asm in dsp_host, bit for bit against a model of what it must compute.

The ColdFire half streams a program through FX2's page 2 (stream.c); here a test driver placed before the engine
copies each call's three stream words into the parameter block, as stream.c leaves them in the frame record, then
runs the engine unchanged. The model takes the stream as engine.asm must (chunk 0 first, in order, the checksum,
the ring cleared meanwhile) and runs each program as generate.mjs's DSP form defines it, with the engine's half-rate
input, LEVL, output interpolation and MIX in the DSP's integer arithmetic, and the chorus and flange programs' LFO
update (generate.mjs lfoUpdate). generate.mjs proves the programs against the original machine; this proves the engine
against them.

  python3 verify.py                  the five cases
  python3 verify.py --all            and every program, unsplit and split at frames 1 and 7
  python3 verify.py --lfo FILE       and the LFOs against the firmware (FILE: generate.mjs --firmware --states)
  python3 verify.py --cycles [MV210 ...]   and sdk/cycle-scan's cycle model of each program (ILSCAN_HOST)
"""
import itertools
import json
import pathlib
import re
import struct
import subprocess
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


def model(chunks, left, right, knobs, lengths=None):
    """What the engine outputs for one instance: lengths, the frames of each call (default 16 a call)."""
    lev, mix = knobs[1] << 16, knobs[5] << 16
    mix = 0x7FFFFF if mix == 0x7F0000 else mix
    s = dict(playing=NONE, loading=NONE, next=0, loaded=False, sum=0, n=0, chk=None, counter=0, fade=0, kill=False)
    lfo = dict(count=0, state=[0, 0, 0, 0])
    area, ring = [0] * 262, [0] * RING
    p = acc = phase = held = 0
    wet_mix = step = 0
    y_prev, y_cur, out_run = [0, 0], [0, 0], [0, 0]
    out_l, out_r = list(left), list(right)
    lengths = lengths or [16] * ((len(left) + 15) // 16)
    starts = [0, *itertools.accumulate(lengths)]
    for call, (start, block) in enumerate(zip(starts, lengths)):
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
                    lfo = dict(count=0, state=[0, 0, 0, 0])
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
                p = run(area, ring, p, half((x1 >> 3) & ~0x1FF), out_run, lfo)
                y_prev, y_cur = y_cur, list(out_run)
                wet, phase = list(y_prev), 0
            if s["fade"]:
                wet_mix = max(0, wet_mix - step)
            out_l[n] = mixed(dl, wet[0], mix, wet_mix)
            out_r[n] = mixed(dr, wet[1], mix, wet_mix)
    return out_l, out_r


def mixed(dry, wet, mix, wet_mix):
    return clamp(((dry << 24) - 2 * dry * mix + 2 * wet * wet_mix) >> 24)


HANDLERS = ["run", "st", "stc", "stn", "stnc", "outR", "outRc", "outL", "outLc", "end", "tick", "sh"]
SLOT, READS = 24, 7  # generate.mjs SLOT and READS: a unit's first word lands k read pairs before its handler
LABELS = ["mvqRUN_", "mvqST__", "mvqSTC_", "mvqSTN_", "mvqSNC_", "mvqOUTR", "mvqORC_", "mvqOUTL", "mvqOLC_", "mvqEND_",
          "mvqTICK", "mvqSH__"]
NO_READS = ("mvqEND_", "mvqTICK")
LFO_EVERY = 8  # generate.mjs LFO_EVERY: program samples between two LFO updates


def m8(t, r):
    """The 8031's signed multiply as the firmware's sine uses it (generate.mjs M8)."""
    return (t * r) >> 8 if t >= 0 else ~((~t * r) >> 8)


def clamp16(v, lim):
    return lim - 1 if v >= lim else -lim if v < -lim else v


def lfo_update(words, state):
    """generate.mjs lfoUpdate: each LFO's step from its block, its w and row written into the program's words."""
    w = lambda i: words[1 + i]  # noqa: E731
    at, l = w(2), 0
    while w(at) != 3:
        mode, rate, lim, y0, base = (w(at + j) for j in range(5))
        if mode == 0:
            u, up = state[2 * l], state[2 * l + 1]
            if up:
                u += rate
                if u > lim:
                    u, up = lim, 0
            else:
                u -= rate
                if u < 0:
                    u, up = 0, 1
            state[2 * l], state[2 * l + 1], value = u, up, u
        else:
            s = 2 if mode == 2 else 0
            x, y = state[2 * l], state[2 * l + 1] + y0
            y = clamp16(y + m8((x << s) >> 8, rate), lim)
            x = clamp16(x + ~m8((y << s) >> 8, rate), lim)
            state[2 * l], state[2 * l + 1], value = x, y - y0, x >> s
        ww, row = base + (value >> 8), (value >> 4) & 15
        words[1 + w(at + 5)], words[1 + w(at + 6)] = (RING - ww) % RING, ww
        words[1 + w(at + 7)], words[1 + w(at + 8)] = w(at + 9 + 2 * row), w(at + 10 + 2 * row)
        at, l = at + 9 + 32, l + 1


def run(words, ring, p, w_in, out, lfo):
    """One program sample: words[0] is the header, words[1] the input's offset, then the units. lfo: the LFO update's
    count and the LFOs' state (an LFO program's tick unit)."""
    base = p
    at = lambda off: (base + off) % RING  # noqa: E731
    ring[at(words[1])] = w_in
    acc, i = 0, 2
    while True:
        h = words[i]
        kind = HANDLERS[h // SLOT]
        i += 1
        if kind == "end":
            assert base == p, "the ring pointer did not come back"
            return (p + 1) % RING
        if kind == "tick":
            lfo["count"] -= 1
            if lfo["count"] <= 0:
                lfo_update(words, lfo["state"])
                lfo["count"] = LFO_EVERY
            i += 1
            continue
        k = READS - (h % SLOT) // 2
        for off in words[i:i + k]:
            acc += ring[at(off)]
        i += k
        if kind == "run":
            continue
        arg, op = words[i], kind[:-1] if kind.endswith("c") else kind
        i += 1
        x = wrap(acc)
        if op == "st":
            ring[at(arg)] = half(x); acc = x + ring[at(arg)]
        elif op == "stn":
            ring[at(arg)] = half(-x - 0x100); acc = ring[at(arg)]
        elif op == "sh":
            base = (base + arg) % RING
        else:
            out[0 if op == "outL" else 1] = clamp(ring[at(arg)] * 16)
        if kind.endswith("c"):
            acc = 0


def render(asm, work, plan, left, right, knobs, kills=(), split=None):
    """One instance in dsp_host (split: frames before each block's trig split) and the model's output for it."""
    blocks = (len(left) + 15) // 16
    lengths = [16] * blocks if split is None else [split, 16 - split] * blocks
    chunks = stream(plan, len(lengths), kills)
    image = G.write_image(asm.words, work / "m.mem", org=asm.org,
                          extra=[(G.P, STREAM_AT, [w for t in chunks for w in t])])
    # One instance a run: the synthetic image hands every instance the same allocator buffer.
    r = G.run(asm, [G.Instance(left, right, knobs=knobs)], image=image, split=split)
    return tuple(r.outputs[0]), model(chunks, left, right, knobs, lengths), r.meter


def silent(left, right, knobs):
    """The output with the reverb silent: the dry at its mix."""
    mix = knobs[5] << 16
    return ([mixed(v, 0, mix, 0) for v in left], [mixed(v, 0, mix, 0) for v in right])


def first_difference(got, want):
    return next((i for i in range(len(got[0])) if (got[0][i], got[1][i]) != (want[0][i], want[1][i])), None)


def every_program(asm, work, left, right):
    """--all: every program in programs.json streamed from the start at LEVL 127 and MIX 127, unsplit and split at
    frames 1 and 7, bit for bit against the model; dsp_host's meter for each (its worst block)."""
    knobs, ok, worst, failed = (0, 127, 0, 0, 0, 127), True, (0, None), []
    for g, q in enumerate(PROGRAMS):
        for split in (None, 1, 7):
            got, want, m = render(asm, work, [(0, g)], left, right, knobs, split=split)
            diff = first_difference(got, want)
            worst = max(worst, (m, f"{q['bank']} #{q['number']}"))
            if diff is not None or got == silent(left, right, knobs):
                failed.append(f"{q['bank']} #{q['number']} split {split}: " + ("silent" if diff is None else f"frame {diff}"))
    ok = not failed
    print(("[PASS]" if ok else "[FAIL]") + f" every program ({len(PROGRAMS)}), unsplit and split at 1 and 7: "
          + (f"bit-exact; the dearest {worst[1]} at {worst[0]} executed instructions a sample" if ok else "; ".join(failed[:8])))
    return ok


def lfo_trace(asm, work, path):
    """--lfo FILE (generate.mjs --mv2 ROM --firmware --states FILE): each chorus and flange program's LFOs, update by
    update, against the Midiverb II's own firmware. The model's lfo_update must keep the firmware's state and write
    the words generate.mjs lfoUpdate writes; the engine in dsp_host, one update a call, must keep the same state in
    r7+$1c-$1f after every call (-track), and its program words must end as the model's (-peeky)."""
    want = json.loads(pathlib.Path(path).read_text())
    by = {(q["bank"], q["number"]): g for g, q in enumerate(PROGRAMS)}
    ok, bad, base = True, [], G.ALLOC_WORD + 0x3cf9  # dsp_host's buffer; r2, the program's words after its header
    for number, rec in sorted(want.items(), key=lambda kv: int(kv[0])):
        g, n = by[("MV2", int(number))], len(rec["states"])
        blocks = n + 200
        chunks = stream([(0, g)], blocks)
        image = G.write_image(asm.words, work / "t.mem", org=asm.org,
                              extra=[(G.P, STREAM_AT, [v for t in chunks for v in t])])
        words, state = list(PROGRAMS[g]["words"]), [0, 0, 0, 0]
        w = lambda i: words[1 + i]  # noqa: E731
        slots = [w(a + j) for a in (w(2), w(2) + 41) for j in (5, 6, 7, 8)]
        track = work / "track.txt"
        r = G.run(asm, [G.Instance([0] * (16 * blocks), knobs=(0, 127, 0, 0, 0, 127))], image=image,
                  extra=["-track", "1b,1c,1d,1e,1f", "-trackout", track, "-peeky", ",".join(f"{base + i:x}" for i in slots)])
        rows = [[int(v) for v in line.split()[1:]] for line in track.read_text().splitlines()]
        start = next(i for i, row in enumerate(rows) if row[0])  # the call of the first update: one a call from there
        got = [[((v & 0xFFFFFF) ^ 0x800000) - 0x800000 for v in row[1:]] for row in rows[start:]]
        for u in range(max(n, len(got))):
            lfo_update(words, state)
            if u < n and (state != rec["states"][u] or [words[1 + i] for i in slots] != rec["words"][u]):
                bad.append(f"MV2 #{number} model, update {u + 1}: {state} want {rec['states'][u]}")
                break
            if u < len(got) and got[u] != state:
                bad.append(f"MV2 #{number} engine, update {u + 1}: {got[u]} want {state}")
                break
        peek = [int(m, 16) for m in re.findall(r"Y:0x[0-9a-f]+ = 0x([0-9a-f]+)", r.stdout)]
        if not bad and peek != [words[1 + i] for i in slots]:
            bad.append(f"MV2 #{number} engine's program words after {len(got)} updates: {peek} want {[words[1 + i] for i in slots]}")
    ok = not bad
    print(("[PASS]" if ok else "[FAIL]") + f" LFOs against the firmware ({len(want)} programs, {n} updates each): "
          + ("the model and the engine keep its state, and write the model's words" if ok else "; ".join(bad[:6])))
    return ok


def cycles(asm, work, which):
    """--cycles: sdk/cycle-scan's model (DSP56300 manual cycles and pipeline stalls) of one steady 16-frame call of
    each program in `which` (indices; LEVL 127, MIX 127), traced by a dsp_host built with -steptrace (ILSCAN_HOST,
    sdk/cycle-scan/build-tools.sh). A model, not a measurement: the unit stays the judge."""
    root = next(up for up in HERE.parents if (up / "sdk/cycle-scan/interlock_scan.py").exists())
    sys.path.insert(0, str(root / "sdk/cycle-scan"))
    import interlock_scan as IL  # noqa: E402
    IL.DIS = G.tool("dsp_disasm")
    host = IL.HOST
    if not host.exists():
        sys.exit("--cycles needs a dsp_host with -steptrace: set ILSCAN_HOST (sdk/cycle-scan/build-tools.sh)")
    blocks, n = 400, 400 * 16
    sig = G.noise(n, 0.3, 11)
    rows = []
    for g in which:
        chunks = stream([(0, g)], blocks)
        image = G.write_image(asm.words, work / "c.mem", org=asm.org,
                              extra=[(G.P, STREAM_AT, [w for t in chunks for w in t])])
        (work / "c.in").write_bytes(struct.pack(f"<{2 * n}i", *[v for x in sig for v in (x, x)]))
        cmd = [str(host), "-mem", str(image), "-init", f"{asm.syms['init']:x}", "-proc", f"{asm.syms['proc']:x}",
               "-ctx", "40,41,42", "-frames", "16", "-blocks", str(blocks), "-inst", "1", "-stereo",
               "-params", "0,127,0,0,0,127,0,0,0,0,0,0", "-in", str(work / "c.in"), "-out", str(work / "c.out"),
               "-diff", str(blocks), "-trace", "400000", "-trackinst", "0", "-steptrace"]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        calls, cur = [], None
        for line in r.stdout.splitlines():
            m = IL.TRACE.match(line)
            if m:
                if int(m.group(1)) == 0:
                    cur = []
                    calls.append(cur)
                cur.append(int(m.group(2), 16))
        if r.returncode or not calls:
            sys.exit(f"dsp_host failed or traced nothing: {r.stdout[-400:]}{r.stderr[-400:]}")
        pcs, pmem = calls[-1], IL.load_p(image)
        ins = IL.decode(pmem, pcs, min(pcs))
        seq = []
        for k, pc in enumerate(pcs):
            i = IL.Ins(pc, *ins[pc])
            if i.cond and k + 1 < len(pcs):
                i.taken = pcs[k + 1] != pc + i.nwords
            seq.append(i)
        total, stalls, _ = IL.analyze(seq)
        q = PROGRAMS[g]
        rows.append((total / 16, len(pcs) / 16, f"{q['bank']} #{q['number']}"))
        print(f"  {q['bank']} #{q['number']}: {total / 16:.1f} cycles a sample ({len(pcs) / 16:.1f} instructions, "
              f"stalls {sum(stalls.values()) / 16:.1f})")
    return rows


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
    entry = [SLOT * k + (0 if name in NO_READS else 2 * READS) for k, name in enumerate(LABELS)]
    misplaced = [f"{name} at +{asm.syms[name] - base}" for k, name in enumerate(LABELS) if asm.syms[name] - base != entry[k]]
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
        got, want, m = render(asm, work, plan, left_in, right_in, knobs, kills[0] if kills else ())
        meter = max(meter, m)
        diff = first_difference(got, want)
        quiet = got == silent(left_in, right_in, knobs)
        good = diff is None and (quiet if "silent" in name else not quiet)
        ok &= good
        where = "" if diff is None else f", first difference at frame {diff}: got {got[0][diff], got[1][diff]} want {want[0][diff], want[1][diff]}"
        print(("[PASS]" if good else "[FAIL]") + f" {name}: bit-exact{' and silent' if quiet else ''}{where}")
    if "--all" in sys.argv:
        ok &= every_program(asm, work, sig, right)
    if "--lfo" in sys.argv:
        ok &= lfo_trace(asm, work, sys.argv[sys.argv.index("--lfo") + 1])
    if "--cycles" in sys.argv:
        names = [a for a in sys.argv[sys.argv.index("--cycles") + 1:] if not a.startswith("--")]
        which = [g for g, q in enumerate(PROGRAMS) if not names or f"{q['bank']}{q['number']}" in names]
        rows = sorted(cycles(asm, work, which))
        print(f"cycles: the dearest {rows[-1][2]}, {rows[-1][0]:.1f} modelled chip cycles a sample; "
              f"the median of {len(rows)}, {rows[len(rows) // 2][0]:.1f}")
    print(f"meter: {meter} executed instructions a sample, the dearest case (the driver's few included)")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
