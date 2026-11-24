#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Sam Banks. octabam's tools/verify/verify_ident.py at e4c207a2, widened by Yves Rosius
# (sambanks/octabam#1172); licence text in sdk/octabam/LICENSE. Modwerk's adaptations are marked "Modwerk" and
# listed in sdk/imports/octabam-verify-ident-e4c207a2.json.
"""Prove a rewritten DSP insert renders BIT-IDENTICALLY to a saved reference.

    python3 sdk/cycle-scan/verify_ident.py <module> ref     # stamp from the current build
    python3 sdk/cycle-scan/verify_ident.py <module> check   # compare the current build
    python3 sdk/cycle-scan/verify_ident.py <module> check --scratch 0c,47
                                          # r7 words the rewrite stopped writing on purpose
    python3 sdk/cycle-scan/verify_ident.py <module> check --ref FILE   # a reference stamped elsewhere

The reference is out/ident_<module>_ref.json in the octabam tree (gitignored, per worktree). Stamp
it on the tree you trust (origin/main), copy it into the candidate's tree, and check there.
OCTABAM_ROOT names a built tree other than sdk/octabam, as for interlock_scan.py.

The matrix (the first 13 labels are the original gate's, unchanged, so a
reference stamped before the wider net still compares on them):
  defaults, mode<i>_hot / mode<i>_cool (every value of the first 2..8-way select,
  every 128-step knob at 90 / 40), zeros, max -- on the module's own slot
  (schema.render_slot), payload A, 15-sample blocks, 6,000 samples, mono;
  other-slot/   defaults and max on the other FX slot (FX1 <-> FX2): an
                fx1_only module's FX2 instance is its dry pass;
  B/            defaults, max and every mode on payload B (core 1), where an
                absolute stock-table address sits 13 words off (trap-stock-tables);
  f16/          the unit's 16-sample block;
  long/         about 2 s, for lines and echoes that start after 0.136 s;
  ramp          every knob ramped up and back down over 12,000 samples, the
                select stepping through its values: glides, snaps, mode changes;
  stereo/       different L and R inputs: a channel read from the wrong side;
  split/        the dispatcher's split call (a=0 for 5 frames, then the rest);
  dear, mode<i>_dear  the manifest's `dear` knobs, as-is and with every value
                of the select, in each family above (a module whose generic
                settings never engage it, STUTTR, is reached here).

Every render also records the instance block, r7 $00..$83, after every block
(dsp_host -track), and the check compares it word by word: "Compare persistent
state after every block, not only audio" (docs/contributing/MODULES.md). A word
the candidate legitimately stopped writing (a scratch word a register now holds)
is named with --scratch; any other state difference fails.

Two controls run in both modes:
  - placement (Modwerk's, in place of upstream's SEND alias): the module's fx id must
    dispatch to other entry points in the scratch image than in the pristine stock
    image and than NONE (id 0x00). Modwerk has no SEND module, so a scratch image
    without the module falls back to the stock effect or NONE on that id, and a render
    of that would hash whatever the stock code does, before and after any change.
  - `defaults` and `max` (or the manifest's `dear`) must render different audio (on
    payload A and on B), or the render never reached the module: a wrong slot, a dry pass.
"""
import hashlib, json, math, os, pathlib, struct, subprocess, sys

# Modwerk: the gate lives in sdk/cycle-scan, outside the module-source fingerprint
# (scripts/module-source.mjs); it runs against the octabam tree at sdk/octabam or OCTABAM_ROOT.
ROOT = pathlib.Path(os.environ.get("OCTABAM_ROOT", pathlib.Path(__file__).resolve().parents[1] / "octabam")).resolve()
os.chdir(ROOT)
sys.path.insert(0, str(ROOT / "tools")); import toolpath  # noqa: E402,F401
import send_probe  # noqa: E402
from remix import registry, schema  # noqa: E402

if len(sys.argv) < 2:
    sys.exit(__doc__)
MOD = registry.by_name(sys.argv[1])
K = MOD.knob_map()
MEM = f"out/dsp/_ident_{MOD.name}_A.mem"
MEM_B = f"out/dsp/_ident_{MOD.name}_B.mem"
HOST = str(send_probe.HOST)
FXID = MOD.menu.fx2_id
FRAMES, N = 15, 6000
SR = 44100
LONG = 88200                    # 2 s, a whole number of 15-sample blocks
RAMP = 12000
STATE = range(0x84)             # the per-instance block (trap-r7-scratch)
TMP = pathlib.Path(f"out/_identgate_{MOD.name}")
TMP.mkdir(parents=True, exist_ok=True)
REF = pathlib.Path(f"out/ident_{MOD.name}_ref.json")


def scratch_mems(mod):
    """Modwerk: build the scratch image (the module and what it requires, beside the stock
    effects, no fallback: Modwerk has no SEND, as interlock_scan.insert_mem) and dump both
    payloads. Rebuilt every run: a stale cache would measure the build before the change."""
    from remix import audition
    need, todo = [], list(mod.requires or ())
    while todo:
        k = todo.pop()
        if k not in need and k != mod.key:
            need.append(k)
            todo += list(registry.by_key(k).requires or ())
    keys = ", ".join(f'"{k}"' for k in [mod.key, *need])
    scratch = ROOT / "remixes/_identgate.py"
    scratch.parent.mkdir(exist_ok=True)
    scratch.write_text(
        f'"""_identgate -- scratch: {mod.name} + what it requires, for verify_ident.\n\n'
        f'Written and removed by sdk/cycle-scan/verify_ident.py.\n"""\n\n'
        f'from remix.schema import Remix\n\n'
        f'REMIX = Remix(\n    name="_identgate",\n    doc="identity gate scratch",\n'
        f'    modules=({keys},),\n    fallback="NONE",\n    static_stock=True,\n)\n')
    keep = audition.IMAGE.read_bytes() if audition.IMAGE.exists() else None
    try:
        for m in (MEM, MEM_B):
            pathlib.Path(m).unlink(missing_ok=True)
        audition._build({"REMIX": "_identgate", "XBUS": "1", "SPEC": "1"})
        send_probe.dump_mem(audition.IMAGE, MEM, "A")
        send_probe.dump_mem(audition.IMAGE, MEM_B, "B")
    finally:
        scratch.unlink(missing_ok=True)
        for junk in (ROOT / "remixes/__pycache__").glob("_identgate*"):
            junk.unlink(missing_ok=True)
        if keep is not None:
            audition.IMAGE.write_bytes(keep)


def placement(mem, payload):
    """Modwerk's control in place of the SEND alias: the id must reach the module's code."""
    from remix import stock
    pristine_mem = pathlib.Path(f"out/dsp/_stock_{payload}.mem")
    if not pristine_mem.exists() or pristine_mem.stat().st_mtime < stock.STOCK_IMAGE.stat().st_mtime:
        send_probe.dump_mem(stock.STOCK_IMAGE, pristine_mem, payload)
    got = send_probe.entry_points(mem, FXID)
    try:
        pristine = send_probe.entry_points(str(pristine_mem), FXID)
    except SystemExit:
        pristine = None                       # an id the stock dispatch does not fill
    if got == pristine:
        sys.exit(f"fx id 0x{FXID:02x} dispatches to the stock image's entry points on payload {payload}: "
                 f"{MOD.name} is NOT in this dump")
    if got == send_probe.entry_points(mem, 0x00):
        sys.exit(f"fx id 0x{FXID:02x} dispatches to NONE's entry points on payload {payload}: "
                 f"{MOD.name} is NOT in this dump")
    return got


scratch_mems(MOD)
if not pathlib.Path(MEM).exists():
    sys.exit(f"no {MEM}: the scratch build wrote no image")
ON_B = "B" in MOD.dsp.payloads and pathlib.Path(MEM_B).exists()
ENTRY = {0: placement(MEM, "A")}
if ON_B:
    ENTRY[1] = placement(MEM_B, "B")

OWN = schema.render_slot(MOD)
OTHER = (2, schema.R7_ALLOC[2]) if OWN == (1, schema.R7_ALLOC[1]) else (1, schema.R7_ALLOC[1])
DEFAULTS = [(p.default or 0) for p in MOD.params]
NAMES = [p.name.decode() if p.name else "" for p in MOD.params]   # MINIVERB has an unnamed slot


def params(**kw):
    v = list(DEFAULTS)
    for name, val in kw.items():
        v[K[name]] = val
    return v


def signal(n=N, f1=440, a1=0.30, f2=2500, a2=0.15, step_at=None):
    step_at = n // 2 if step_at is None else step_at
    a = [a1 * math.sin(2 * math.pi * f1 * i / SR) for i in range(n)]
    b = [a2 * math.sin(2 * math.pi * f2 * i / SR) for i in range(n)]
    return [max(-8388608, min(8388607, int(8388607 * (x + y) + (838860 if i > step_at else 0))))
            for i, (x, y) in enumerate(zip(a, b))]


def ramp_file(n, frames):
    """block,p0,p1,... lines: every named param up from 0 to its top over the
    first half and back down over the second; the select steps through its
    values on the way."""
    blocks = n // frames
    lines, last = [], None
    for b in range(blocks):
        t = 2 * b / (blocks - 1) if b < blocks / 2 else 2 * (blocks - 1 - b) / (blocks - 1)
        v = [round(((p.count or 128) - 1) * t) if p.name else d for p, d in zip(MOD.params, DEFAULTS)]
        v += [64] * (8 - len(v))
        if v != last:
            lines.append(f"{b}," + ",".join(str(x) for x in v))
            last = v
    path = TMP / "ramp.txt"
    path.write_text("\n".join(lines) + "\n")
    return path


def render(case):
    n, frames = case.get("n", N), case.get("frames", FRAMES)
    core, (r7, alloc) = case.get("core", 0), case.get("slot", OWN)
    src = TMP / "in.raw"
    if case.get("stereo"):
        L, R = signal(n), signal(n, f1=1000, a1=0.25, f2=6100, a2=0.10, step_at=n // 3)
        src.write_bytes(b"".join(struct.pack("<ii", x, y) for x, y in zip(L, R)))
    else:
        src.write_bytes(b"".join(struct.pack("<i", m) for m in signal(n)))
    out, trk = TMP / "out.raw", TMP / "track.txt"
    init, proc = ENTRY[core]
    # payload B boots only for a core-1 render: a core-0 render stays the
    # original gate's command line, so its stamped references still match
    cmd = [HOST, "-mem", MEM] + (["-memB", MEM_B] if core == 1 else []) + [
           "-init", f"{init:x}", "-proc", f"{proc:x}", "-core", str(core),
           "-inst", "1", "-r7", str(r7), "-alloc", str(alloc), "-inmask", "1",
           "-frames", str(frames), "-blocks", str(n // frames),
           "-in", str(src), "-out", str(out),
           "-params", ",".join(str(x) for x in params(**case.get("kw", {}))),
           "-track", ",".join(f"{o:x}" for o in STATE), "-trackout", str(trk)]
    if case.get("stereo"):
        cmd.append("-stereo")
    if case.get("ramp"):
        cmd += ["-paramfile", str(ramp_file(n, frames))]
    if case.get("split"):
        cmd += ["-split", str(case["split"])]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"dsp_host failed for {case}:\n{r.stdout}\n{r.stderr}")
    d = out.read_bytes()
    w = struct.unpack(f"<{len(d)//4}i", d)
    cols = list(zip(*(ln.split()[1:] for ln in trk.read_text().splitlines())))
    return list(w[0::2])[:n], list(w[1::2])[:n], cols


def settings():
    sel = next((p for p in MOD.params if p.name and 2 <= (p.count or 128) <= 8), None)
    plain = [p.name.decode() for p in MOD.params if p.name and (p.count or 128) == 128]
    hot = {n: 90 for n in plain}
    cool = {n: 40 for n in plain}
    out = {"defaults": {}}
    modes = range(sel.count) if sel else [None]
    for mode in modes:
        m = {sel.name.decode(): mode} if sel else {}
        out[f"mode{mode}_hot"] = dict(hot, **m)
        out[f"mode{mode}_cool"] = dict(cool, **m)
    out["zeros"] = {n: 0 for n in NAMES if n}
    out["max"] = {n: ((MOD.params[NAMES.index(n)].count or 128) - 1) for n in NAMES if n}
    return out


def dears():
    """The manifest's `dear` knobs (the engaging demo the scan and the hardware
    matrix use), as-is and once per value of the select: a module whose generic
    settings never engage it (STUTTR: chance and a free clock) is reached here."""
    dear = {k: v for k, v in (getattr(MOD, "dear", None) or {}).items() if k in K}
    if not dear:
        return {}
    out = {"dear": dear}
    sel = next((p for p in MOD.params if p.name and 2 <= (p.count or 128) <= 8), None)
    if sel:
        for mode in range(sel.count):
            out[f"mode{mode}_dear"] = dict(dear, **{sel.name.decode(): mode})
    return out


def cases():
    base = settings()
    hots = [k for k in base if k.endswith("_hot")]
    out = {k: {"kw": kw} for k, kw in base.items()}          # the original 13, unchanged
    dear = dears()
    base.update(dear)
    out.update({k: {"kw": kw} for k, kw in dear.items()})
    hots += list(dear)                                    # "dear" and its per-mode twins
    for k in ("defaults", "max"):
        out[f"other-slot/{k}"] = {"kw": base[k], "slot": OTHER}
    if ON_B:
        for k in ["defaults", "max"] + hots:
            out[f"B/{k}"] = {"kw": base[k], "core": 1}
    for k in ["defaults", "max"] + hots:
        out[f"f16/{k}"] = {"kw": base[k], "frames": 16}
    for k in ("defaults", "max") + (("dear",) if dear else ()):
        out[f"long/{k}"] = {"kw": base[k], "n": LONG}
    out["ramp"] = {"ramp": True, "n": RAMP}
    for k in ["defaults", "max"] + hots:
        out[f"stereo/{k}"] = {"kw": base[k], "stereo": True}
    for k in ("defaults", "max") + (("dear",) if dear else ()):
        out[f"split/{k}"] = {"kw": base[k], "split": 5}
    return out


def h(v):
    return hashlib.sha1(b"".join(int(x).to_bytes(4, "little", signed=True) for x in v)).hexdigest()[:16]


def hashes():
    out = {}
    for label, case in cases().items():
        L, R, cols = render(case)
        state = [hashlib.sha1(" ".join(c).encode()).hexdigest()[:8] for c in cols]
        out[label] = [h(L), h(R), max(abs(x) for x in L + R), state]
    return out


def controls(got):
    """The render must reach the module: max, or the manifest's dear, differs from defaults."""
    bad = []
    for pre in ("", "B/") if ON_B else ("",):
        a, b, c = got.get(f"{pre}defaults"), got.get(f"{pre}max"), got.get(f"{pre}dear")
        if a and b and a[:2] == b[:2] and (c is None or a[:2] == c[:2]):
            bad.append(f"{pre or 'A/'}defaults and {pre or 'A/'}max{' and dear' if c else ''} render the "
                       f"same audio: the render does not reach {MOD.name} (a wrong slot, a dry pass, "
                       f"or no setting that engages it?)")
    return bad


if __name__ == "__main__":
    args = sys.argv[2:]
    mode = args[0] if args and not args[0].startswith("--") else "check"
    scratch = set()
    if "--scratch" in args:
        scratch = {int(x, 16) for x in args[args.index("--scratch") + 1].split(",") if x}
    if "--ref" in args:
        REF = pathlib.Path(args[args.index("--ref") + 1]).resolve()
    got = hashes()
    ctl = controls(got)
    for c in ctl:
        print(f"  [CONTROL FAIL] {c}")
    print(f"  slot r7 {OWN[0]} / alloc {OWN[1]}, other slot r7 {OTHER[0]}, payload B: "
          f"{'yes' if ON_B else 'no'}, {len(got)} renders")
    if mode == "ref":
        if ctl:
            sys.exit("no reference saved: a control failed")
        REF.write_text(json.dumps(got, indent=1))
        print(f"reference saved: {len(got)} settings -> {REF}")
        for k, v in got.items():
            print(f"  {k:24s} peak {v[2]}")
        sys.exit(0)
    ref = json.loads(REF.read_text())
    bad, state_bad, allowed = [], [], {}
    for k in ref:
        g = got.get(k)
        if g is None or g[:3] != ref[k][:3]:
            bad.append(k)
            continue
        if len(ref[k]) > 3 and len(g) > 3:
            diff = {i for i, (x, y) in enumerate(zip(ref[k][3], g[3])) if x != y}
            if diff - scratch:
                state_bad.append((k, sorted(diff - scratch)))
            elif diff:
                allowed[k] = sorted(diff)
    for k in ref:
        print(f"  [{'FAIL' if k in bad else 'PASS'}] {k}")
    for k, offs in state_bad:
        print(f"  [STATE FAIL] {k}: r7 words differ: {' '.join(f'${o:02x}' for o in offs)}")
    if allowed:
        words = sorted({o for v in allowed.values() for o in v})
        print(f"  [STATE] differ only in --scratch words {' '.join(f'${o:02x}' for o in words)} "
              f"({len(allowed)} renders)")
    unref = [k for k in got if k not in ref]
    if unref:
        print(f"  [NOTE] {len(unref)} renders have no reference (an older stamp): "
              f"{', '.join(unref[:6])}{' ...' if len(unref) > 6 else ''}")
    ok = not bad and not state_bad and not ctl
    print(f"\n{'IDENTICAL' if ok else 'DIFFERS'}: {len(ref)-len(bad)}/{len(ref)} settings bit-identical"
          + (f", state differs in {len(state_bad)}" if state_bad else ""))
    sys.exit(0 if ok else 1)
