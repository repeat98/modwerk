#!/usr/bin/env python3
"""GHOST CUT render gates (milestones A to C: TAPE, GRAIN and the drift head) -- the DSP in dsp_host
against ghost_cut_ref.py, plus checks that do not lean on the reference.

The scratch image is built here (GHOST CUT alone, fallback NONE), as Vibrato's
and LOFI2's gates build theirs. It needs the native toolchain and your own OS
1.40C (sdk/README.md, Octatrack native development); CI never runs it.

Gates:
  dry           -> GRAB never set: every frame bit-exact dry, whatever the other knobs
  FX1 slot      -> an FX1-sized slot passes dry with GRAB held
  reference     -> the DSP matches the integer reference sample for sample: AUTO,
                   MAN and OFF capture; FWD, REV and PEND; RATE across its range;
                   MIX; several tempos and every LEN; hysteresis; re-grab in a release;
                   GRAIN across PTCH, RATE, GRN and DIR; ENG switched while looping
  pitch         -> GRAIN plays a sine at PTCH whatever RATE does; TAPE at RATE
  duck          -> switching ENG while looping steps no more than the sine itself
  drift         -> DRFT 0 is one head on both sides; with DRFT, TAPE's left side is
                   unchanged and its right plays the second head; GRAIN keeps one wet;
                   the fastest, deepest drift glides
  the loop      -> at RATE 1x the loop IS the captured mono sum, sample for sample,
                   with the period LEN and the tempo give
  release       -> 256 samples after GRAB falls the track is exact dry again
  seam          -> a sine looped across its seam steps no more than the sine itself
  dirty memory  -> a ring full of garbage is cleared before anything is looped
  guard         -> no write outside the ring and the r7 block, on track 1 and on
                   track 3's FX2 (beside Sidechain Compressor's key window)
  instances     -> four FX2 instances on one core: each the same as one alone
  every knob    -> stored values past every count render without dsp_host dying

    python3 modules/ghost-cut/verify.py
"""
import math, pathlib, re, struct, subprocess, sys

sys.path.insert(0, str(pathlib.Path(__file__).absolute().parents[2] / "tools")); import toolpath  # noqa: E402,F401
import send_probe
from remix import audition, registry

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ghost_cut_ref as REF

ROOT = pathlib.Path(__file__).absolute().parents[2]
MOD = registry.by_name("ghost-cut")
K = MOD.knob_map()
MEM = f"out/dsp/_audition_{MOD.name}_A.mem"
HOST = "vendor/dsp56300/build/source/dsp_host/dsp_host"
FXID = MOD.menu.fx2_id
B = REF.BLOCK
FS = 0x7FFFFF
SR = 44100
TMP = pathlib.Path("out/_gcgate")
TMP.mkdir(parents=True, exist_ok=True)
C0 = REF.CLEAR_BLOCKS

# ---- the scratch image: GHOST CUT alone, rebuilt every run -------------------
pathlib.Path(MEM).unlink(missing_ok=True)
_scratch = ROOT / "remixes/_audition.py"
_scratch.parent.mkdir(exist_ok=True)
_scratch.write_text(
    '"""_audition -- scratch: GHOST CUT alone, for verify.py."""\n\n'
    'from remix.schema import Remix\n\n'
    f'REMIX = Remix(name="_audition", doc="audition scratch", modules=("{MOD.key}",),\n'
    '              fallback="NONE", static_stock=True)\n')
_keep = audition.IMAGE.read_bytes() if audition.IMAGE.exists() else None
try:
    audition._build({"REMIX": "_audition", "XBUS": "1", "SPEC": "1"})
    audition._dump(ROOT / MEM)
finally:
    _scratch.unlink(missing_ok=True)
    for _junk in (ROOT / "remixes/__pycache__").glob("_audition*"):
        _junk.unlink(missing_ok=True)
    if _keep is not None:
        audition.IMAGE.write_bytes(_keep)
if not pathlib.Path(MEM).exists():
    sys.exit(f"no {MEM}: the scratch build did not dump it")
init, proc = send_probe.entry_points(MEM, FXID)
print(f"entries from dispatch tables: init=P:0x{init:04x} proc=P:0x{proc:04x}")

DEFAULTS = [(p.default or 0) for p in MOD.params]
SLOTS = {"t1 fx1": ("1", "0"), "t1 fx2": ("2", "1"), "t3 fx2": ("8", "5")}


def knobs(**kw):
    v = list(DEFAULTS)
    for name, val in kw.items():
        v[K[name]] = val
    return v


def schedule(base, events):
    """{block: {knob: value}} on top of base -> {block: [12 knobs]}"""
    cur = dict(base)
    out = {0: knobs(**cur)}
    for at in sorted(events):
        cur.update(events[at])
        out[at] = knobs(**cur)
    return out


def dsp(Ls, Rs, sched, slot="t1 fx2", tempo=None, guard=False, dirty=None, inst=1):
    n = len(Ls)
    src = TMP / "in.raw"
    src.write_bytes(b"".join(struct.pack("<ii", l, r) for l, r in zip(Ls, Rs)))
    out = TMP / "out.raw"
    if inst == 1:
        r7, alloc = SLOTS[slot]
    else:
        r7, alloc = ",".join(str(3 * k + 2) for k in range(inst)), ",".join(str(2 * k + 1) for k in range(inst))
    lines = [f"{b}," + ",".join(str(x) for x in sched[b]) for b in sorted(sched)]
    pf = TMP / "params.txt"
    pf.write_text("\n".join(lines) + "\n")
    cmd = [HOST, "-mem", MEM, "-init", f"{init:x}", "-proc", f"{proc:x}",
           "-inst", str(inst), "-r7", r7, "-alloc", alloc, "-stereo",
           "-frames", str(B), "-blocks", str(-(-n // B)),
           "-in", str(src), "-out", str(out),
           "-params", ",".join(str(x) for x in sched[0])]
    for _ in range(inst):
        cmd += ["-paramfile", str(pf)]
    if tempo:
        cmd += ["-tempo", str(tempo)]
    if guard:
        cmd += ["-guard", str(0x4000), "-guard-shared"]
    if dirty:
        cmd += ["-dirty", str(dirty)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"dsp_host failed:\n{' '.join(cmd)}\n{r.stdout[-3000:]}\n{r.stderr[-3000:]}")
    dsp.log = r.stdout + r.stderr
    outs = []
    for k in range(inst):
        d = pathlib.Path(str(out) + (f".i{k}" if k else "")).read_bytes()
        w = struct.unpack(f"<{len(d) // 4}i", d)
        outs.append((list(w[0::2])[:n], list(w[1::2])[:n]))
    return outs[0] if inst == 1 else outs


def ref(Ls, Rs, sched, tempo=None):
    return REF.render(Ls, Rs, sched, REF.tempo24(tempo) if tempo else 0)


fails = 0


def check(label, ok, detail=""):
    global fails
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}{'  ' + detail if detail else ''}")
    fails += 0 if ok else 1


def noise(n, seed, amp=0.25):
    x, out = seed, []
    for _ in range(n):
        x = (x * 1103515245 + 12345) & 0x7FFFFFFF
        out.append(int(((x >> 7) / (1 << 24) * 2 - 1) * amp * FS))
    return out


def tone(hz, amp, n, phase=0.0):
    return [int(amp * FS * math.sin(2 * math.pi * hz * i / SR + phase)) for i in range(n)]


def worst(a, b):
    return max((abs(x - y) for x, y in zip(a, b)), default=0)


def compare(label, Ls, Rs, sched, tempo=None, tol=0):
    dl, dr = dsp(Ls, Rs, sched, tempo=tempo)
    rl, rr = ref(Ls, Rs, sched, tempo=tempo)
    e = max(worst(dl, rl), worst(dr, rr))
    first = next((i for i, (x, y) in enumerate(zip(dl, rl)) if abs(x - y) > tol), None)
    check(f"reference: {label}", e <= tol,
          f"max error {e} LSB" + (f", first at sample {first} (block {first // B})" if first is not None else ""))
    return dl, dr


N = 1600 * B
L_in = noise(N, 1)
R_in = noise(N, 7)
MONO = [(l + r) >> 1 for l, r in zip(L_in, R_in)]
GRAB_AT, REL_AT = 700, 1400

# ---- 1. dry: GRAB never set ----------------------------------------------------
ok = True
for kw in (dict(), dict(RATE=127, DIR=2, MIX=127, LEN=7), dict(CAPT=1, RATE=0, DIR=1), dict(GRAB=95)):
    dl, dr = dsp(L_in, R_in, schedule(kw, {}))
    if dl != L_in or dr != R_in:
        ok = False
        print(f"      not dry with {kw}")
check("dry: without a GRAB every frame is bit-exact dry (four knob sets, GRAB up to 95)", ok)

# ---- 2. FX1-sized slot ---------------------------------------------------------
dl, dr = dsp(L_in, R_in, schedule(dict(GRAB=127), {}), slot="t1 fx1")
check("FX1 slot: passes dry with GRAB held", dl == L_in and dr == R_in)

# ---- 3. against the reference ---------------------------------------------------
G = {GRAB_AT: dict(GRAB=127), REL_AT: dict(GRAB=0)}
compare("AUTO, 1/16 at 120 BPM, 1x FWD", L_in, R_in, schedule({}, G), tempo=120)
for rate in (0, 20, 50, 80, 110, 127):
    for d, name in enumerate(REF.DIR_LABELS):
        compare(f"AUTO, RATE {rate} {name}", L_in, R_in, schedule(dict(RATE=rate, DIR=d), G), tempo=120)
compare("MAN: records the next 1/16, then loops it", L_in, R_in, schedule(dict(CAPT=1), G), tempo=120)
compare("MAN: released before the recording ends", L_in, R_in,
        schedule(dict(CAPT=1), {GRAB_AT: dict(GRAB=127), GRAB_AT + 100: dict(GRAB=0)}), tempo=120)
compare("OFF: loops what the ring held when CAPT went OFF", L_in, R_in,
        schedule({}, {500: dict(CAPT=2), 900: dict(GRAB=127), REL_AT: dict(GRAB=0)}), tempo=120)
for mix in (0, 1, 64, 126):
    compare(f"MIX {mix}", L_in, R_in, schedule(dict(MIX=mix), G), tempo=120)
compare("MIX moving while looping", L_in, R_in,
        schedule({}, {**G, 900: dict(MIX=20), 1000: dict(MIX=127), 1100: dict(MIX=60)}), tempo=120)
for bpm in (30, 60, 90, 133.33, 174, 300):
    for ln in (0, 3, 7):
        compare(f"{bpm} BPM, LEN {REF.LEN_LABELS[ln]}", L_in, R_in, schedule(dict(LEN=ln), G), tempo=bpm)
compare("no tempo word: 120 BPM", L_in, R_in, schedule(dict(LEN=5), G), tempo=None)
compare("hysteresis: 64 holds, 100 does not grab again, 50 does not grab", L_in, R_in,
        schedule({}, {GRAB_AT: dict(GRAB=127), 800: dict(GRAB=64), 850: dict(GRAB=100),
                      900: dict(GRAB=20), 950: dict(GRAB=50), 1000: dict(GRAB=96), 1200: dict(GRAB=32)}), tempo=120)
compare("GRAB again during the release fade: the same loop fades back", L_in, R_in,
        schedule({}, {GRAB_AT: dict(GRAB=127), 900: dict(GRAB=0), 906: dict(GRAB=127), REL_AT: dict(GRAB=0)}),
        tempo=120)
compare("RATE swept while looping", L_in, R_in,
        schedule({}, {**G, **{900 + 10 * i: dict(RATE=(i * 13) % 128) for i in range(40)}}), tempo=120)
compare("DIR changed while looping", L_in, R_in,
        schedule(dict(RATE=90), {**G, 850: dict(DIR=1), 1000: dict(DIR=2), 1200: dict(DIR=0)}), tempo=120)

# ---- 3b. GRAIN against the reference ---------------------------------------------
GR = dict(ENG=1)
for ptch in (0, 40, 52, 64, 76, 88, 127):
    compare(f"GRAIN, PTCH {ptch - 64:+d}", L_in, R_in, schedule(dict(GR, PTCH=ptch), G), tempo=120)
for rate in (0, 32, 100, 127):
    compare(f"GRAIN, PTCH +12 at RATE {rate - 64:+d}", L_in, R_in, schedule(dict(GR, PTCH=76, RATE=rate), G), tempo=120)
for grn in (0, 64, 127):
    compare(f"GRAIN, GRN {grn}", L_in, R_in, schedule(dict(GR, PTCH=70, GRN=grn), G), tempo=120)
for d, name in enumerate(REF.DIR_LABELS):
    compare(f"GRAIN, {name} at RATE -20, PTCH -7", L_in, R_in, schedule(dict(GR, DIR=d, RATE=44, PTCH=57), G), tempo=120)
compare("GRAIN, 1/64 at 300 BPM: grains capped at half the loop", L_in, R_in,
        schedule(dict(GR, LEN=0, PTCH=100, GRN=127), G), tempo=300)
compare("GRAIN, MAN capture", L_in, R_in, schedule(dict(GR, CAPT=1, PTCH=58), G), tempo=120)
compare("GRAIN, PTCH swept while looping", L_in, R_in,
        schedule(GR, {**G, **{900 + 8 * i: dict(PTCH=(i * 11) % 128) for i in range(50)}}), tempo=120)
compare("ENG switched while looping: TAPE to GRAIN and back (the duck)", L_in, R_in,
        schedule(dict(PTCH=80), {**G, 900: dict(ENG=1), 1100: dict(ENG=0)}), tempo=120)
compare("ENG switched during the release fade", L_in, R_in,
        schedule(dict(PTCH=80), {GRAB_AT: dict(GRAB=127), 900: dict(GRAB=0), 905: dict(ENG=1), 1000: dict(GRAB=127),
                                 REL_AT: dict(GRAB=0)}), tempo=120)

# ---- 3c. GRAIN parts pitch from speed (not leaning on the reference) -------------


def zero_cross_hz(x):
    t = [i - 1 + (-x[i - 1]) / (x[i] - x[i - 1]) for i in range(1, len(x)) if x[i - 1] < 0 <= x[i]]
    gaps = sorted(b - a for a, b in zip(t, t[1:]))
    return SR / gaps[len(gaps) // 2]


s500 = tone(500, 0.5, N)
for eng, ptch, rate, hz in ((1, 76, 64, 1000), (1, 52, 64, 250), (1, 64, 32, 500), (1, 76, 100, 1000),
                            (0, 64, 32, 250), (0, 64, 96, 1000)):
    dl, _ = dsp(s500, s500, schedule(dict(ENG=eng, PTCH=ptch, RATE=rate), G), tempo=120)
    got = zero_cross_hz(dl[GRAB_AT * B + 2000:REL_AT * B])
    check(f"{REF.ENG_LABELS[eng]} at PTCH {ptch - 64:+d}, RATE {rate - 64:+d}: a 500 Hz sine plays at {hz} Hz",
          abs(got - hz) <= 0.03 * hz, f"measured {got:.1f} Hz")
dl, _ = dsp(s500, s500, schedule(dict(PTCH=76), {**G, 900: dict(ENG=1), 1100: dict(ENG=0)}), tempo=120)
def biggest_step(x):
    return max(abs(x[i + 1] - x[i]) for i in range(len(x) - 1))


seg = dl[880 * B:1150 * B]
# the steady output either side: TAPE plays the sine at 500 Hz, GRAIN at +12 at 1 kHz (twice the step)
own = max(biggest_step(dl[(GRAB_AT + 40) * B:880 * B]), biggest_step(dl[1000 * B:1090 * B]))
step = biggest_step(seg)
check("ENG switched while looping: no step past 1.5x the steady output's own (the duck)", step <= 1.5 * own,
      f"largest step {step}, the steady output's {own}")

# ---- 3d. the drift head ----------------------------------------------------------
for eng in (0, 1):
    for drft, motn in ((32, 4), (90, 2), (127, 0), (127, 7)):
        compare(f"{REF.ENG_LABELS[eng]}, DRFT {drft}, MOTN {REF.MOTN_LABELS[motn]}", L_in, R_in,
                schedule(dict(ENG=eng, DRFT=drft, MOTN=motn, PTCH=70), G), tempo=120)
for bpm in (60, 174, 300):
    compare(f"TAPE, DRFT 127, MOTN 1/4B at {bpm} BPM", L_in, R_in, schedule(dict(DRFT=127, MOTN=0), G), tempo=bpm)
compare("GRAIN, DRFT 127 on a 1/64 loop at 300 BPM (two wrap steps)", L_in, R_in,
        schedule(dict(ENG=1, DRFT=127, MOTN=0, LEN=0, PTCH=100, GRN=127), G), tempo=300)
compare("DRFT and MOTN moved while looping", L_in, R_in,
        schedule({}, {**G, 800: dict(DRFT=100), 900: dict(MOTN=0), 1000: dict(DRFT=10), 1100: dict(MOTN=7)}),
        tempo=120)
compare("TAPE, DRFT 127 in REV and PEND", L_in, R_in,
        schedule(dict(DRFT=127, MOTN=1, DIR=1), {**G, 1000: dict(DIR=2)}), tempo=120)

base_l, base_r = dsp(L_in, R_in, schedule({}, G), tempo=120)
drift_l, drift_r = dsp(L_in, R_in, schedule(dict(DRFT=127, MOTN=0), G), tempo=120)
full = range((GRAB_AT + 40) * B, REL_AT * B)   # looping at full level; L and R in are different signals


def sides_alike(l, r):
    return max(abs(l[t] - r[t]) for t in full)    # MIX 127: each side is the wet within 2 LSB of its own dry


check("DRFT 0: both sides alike while looping (one head)", sides_alike(base_l, base_r) <= 4,
      f"largest difference {sides_alike(base_l, base_r)} LSB")
check("TAPE with DRFT: the left side is exactly the one head without DRFT", drift_l == base_l)
late = range((GRAB_AT + 100) * B, REL_AT * B)
moved = sum(1 for t in late if drift_r[t] != drift_l[t])
check("TAPE with DRFT: the right side plays the second head", moved > len(late) // 2, f"{moved} of {len(late)} frames differ")
gl, gr = dsp(L_in, R_in, schedule(dict(ENG=1, DRFT=127, MOTN=0), G), tempo=120)
check("GRAIN with DRFT: one wet on both sides while looping", sides_alike(gl, gr) <= 4,
      f"largest difference {sides_alike(gl, gr)} LSB")
dl, dr = dsp(s500, s500, schedule(dict(DRFT=127, MOTN=0), G), tempo=300)
own = biggest_step(s500[:4000])
step = biggest_step(dr[(GRAB_AT + 40) * B:REL_AT * B])
check("the fastest, deepest drift (1/4 bar at 300 BPM) glides: no step past 3x the sine's own",
      step <= 3 * own, f"largest step {step}, the sine's {own}")

# ---- 4. the loop is the captured mono sum, with LEN's period -------------------
for bpm, ln in ((120, 3), (90, 2), (174, 5), (60, 7)):
    sched = schedule(dict(LEN=ln), G)
    dl, dr = dsp(L_in, R_in, sched, tempo=bpm)
    L = REF.loop_length(ln, REF.tempo24(bpm))
    g0 = GRAB_AT * B
    S = g0 - L                       # AUTO: the last L before the grab block
    bad = big = 0
    for t in range(g0 + 400, REL_AT * B):    # baked, then 112 in: full after 368
        ph = (t - g0 + 1) % L        # the first looped frame plays position 1/L in
        if ph >= L - REF.SEAM or ph == 0 or S + ph < C0 * B:
            continue                 # the seam, or ring the clear left silent (nothing recorded yet)
        # MIX 127 times a full envelope is 1 - 2^-22, not 1: the loop to within 2 LSB
        e = max(abs(dl[t] - MONO[S + ph]), abs(dr[t] - MONO[S + ph]))
        bad += e > 2
        big = max(big, e)
    exp = REF.LEN_N[ln] / REF.tempo24(bpm)
    check(f"the loop at {bpm} BPM, LEN {REF.LEN_LABELS[ln]}: {L} samples ({exp:.1f} exact"
          f"{', halved to fit' if L < exp - 1 else ''}), the captured mono sum outside the seam",
          bad == 0, f"{bad} frames over 2 LSB, largest {big}")

# ---- 5. release: exact dry 256 samples later ---------------------------------
dl, dr = dsp(L_in, R_in, schedule({}, G), tempo=120)
t0 = REL_AT * B + REF.SEAM + B
check("release: exact dry from 256 samples after GRAB falls", dl[t0:] == L_in[t0:] and dr[t0:] == R_in[t0:])
before = REL_AT * B - 1
check("release: still looping right before GRAB falls", dl[before] != L_in[before])

# ---- 6. the seam: a sine looped steps no more than the sine ------------------
sine = tone(220, 0.5, N)
for d, name in enumerate(REF.DIR_LABELS):
    dl, _ = dsp(sine, sine, schedule(dict(DIR=d, RATE=64), G), tempo=120)
    seg = dl[GRAB_AT * B + 300:REL_AT * B]
    own = max(abs(sine[i + 1] - sine[i]) for i in range(2000))
    step = max(abs(seg[i + 1] - seg[i]) for i in range(len(seg) - 1))
    check(f"seam ({name}): a looped 220 Hz sine steps at most 1.5x the sine's own step",
          step <= 1.5 * own, f"largest step {step}, the sine's {own}")

# ---- 7. dirty memory -------------------------------------------------------------
early = schedule({}, {C0 + 10: dict(GRAB=127), C0 + 600: dict(GRAB=0)})
dl, dr = dsp(L_in, R_in, early, tempo=120, dirty=0x5EED)
rl, rr = ref(L_in, R_in, early, tempo=120)
check("dirty memory: grabbing straight after the clear loops only silence and fresh audio",
      dl == rl and dr == rr, f"max error {max(worst(dl, rl), worst(dr, rr))} LSB")

# ---- 8. guard ----------------------------------------------------------------------
dear = schedule(dict(RATE=127, LEN=7, ENG=1, PTCH=127, GRN=127, DRFT=127, MOTN=0), G)
for slot in ("t1 fx2", "t3 fx2"):
    dsp(L_in, R_in, dear, slot=slot, tempo=300, guard=True)
    g = dsp.log
    clean = "nothing written" in g or "guard: ok" in g.lower()
    check(f"guard ({slot}): no write outside the ring and the r7 block", clean,
          ([l for l in g.strip().splitlines() if "guard" in l.lower()] or ["no guard output"])[-1])

# ---- 9. instances ------------------------------------------------------------------
single = dsp(L_in, R_in, dear, tempo=120)
outs = dsp(L_in, R_in, dear, tempo=120, inst=4)
same = sum(1 for o in outs if o == single)
check("four FX2 instances on one core: each bit-identical to one alone", same == 4, f"{same}/4")

# ---- 10. every knob, stored values past every count -------------------------------
ok = True
for name in K:
    for v in (0, 127):
        try:
            dsp(L_in[:400 * B], R_in[:400 * B], schedule({name: v, "GRAB": 127}, {}), tempo=120)
        except SystemExit as e:
            ok = False
            print(e)
check("every knob at 0 and 127 (past every select's count) renders without dsp_host dying", ok)

print("\nALL PASS" if not fails else f"\n{fails} FAILED")
sys.exit(1 if fails else 0)
