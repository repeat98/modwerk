#!/usr/bin/env python3
"""DEJA VU's gate: dejavu.c compiled for the host (-DDV_HOST), checked against its contract.

    python3 -B verify.py            # needs a host C compiler (cc); m68k-elf-gcc for the unit check

- every MULT gives a loop of 1 << MULT that repeats exactly when locked (SPD 127)
- the replay chance is SPD / 127 (+-3 %), exactly 0 at SPD 127 and certain at SPD 0
- the step modes against the step counter as measured in ot_emu (1.40C): the counter (1..length-1, 0 on the last
  step) moves on tick 0, a trig fires a tick later, tick 1 follows; it may already show 1 while stopped or move
  to 1 in the PLAY frame. FREE and HOLD play bar 1 exactly as bar 2 on 1-, 2- and 16-step tracks in both cases;
  FREE steps without trigs, the last step is the last slot; TRIG restarts on a trig, HALF holds after one pass
- DJC glides into each value without a jump
- DJQ on PTCH lands on root, fifths and octaves only, through the LFO engine's own arithmetic
  (EMAC fractional: the destination word gains (DEP_word << 8) * out >> 31; a PTCH semitone is 5 knob steps)
- a state that starts as garbage (card builds do not zero it) behaves as a fresh one
- dejavu_core.s is what dejavu.c, hooks.s and icon.py generate (when m68k-elf-gcc is on PATH)
"""
import ctypes
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
FREE, TRIG, HOLD, ONE, HALF = range(5)
DJV, DJC = 0, 2
NOTES = {-12, -5, 0, 7, 12}
failed = []


def check(name, ok, detail=""):
    print(("[PASS] " if ok else "[FAIL] ") + name + (f": {detail}" if detail and not ok else ""))
    if not ok:
        failed.append(name)


def engine_add(out, depw):
    return (((depw + (0x100 if depw == 0x7F00 else 0)) << 8) * out) >> 31


with tempfile.TemporaryDirectory() as tmp:
    so = pathlib.Path(tmp) / "dejavu.so"
    subprocess.run(["cc", "-O2", "-shared", "-fPIC", "-DDV_HOST", "-o", str(so), str(HERE / "dejavu.c")], check=True)
    lib = ctypes.CDLL(str(so))
    lib.dv_host.restype = ctypes.c_int32
    lib.dv_host.argtypes = [ctypes.c_uint, ctypes.c_int] + [ctypes.c_uint] * 6
    lib.dv_quant_of.restype = ctypes.c_int32
    lib.dv_quant_of.argtypes = [ctypes.c_int32, ctypes.c_uint]
    lib.dv_fresh_of.restype = ctypes.c_uint32
    lib.dv_frame.restype = ctypes.c_int32
    lib.dv_frame.argtypes = [ctypes.c_uint, ctypes.c_int] + [ctypes.c_uint] * 8

    def one(i, n, deja, mult):
        return [lib.dv_host(i, 1, deja, mult, ONE, 1, 0, 0) for _ in range(n)]

    for mult in range(7):
        n = 1 << mult
        x = one(mult, 40 * n, 127, mult)
        check(f"MULT {mult}: a locked loop of {n} repeats", x[n:] == x[:-n])
    for deja in (16, 64, 100):
        x = one(10 + deja % 7, 64 * 400 + 64, deja, 6)
        same = sum(a == b for a, b in zip(x[128:], x[64:-64])) / len(x[128:])
        check(f"SPD {deja}: replays {deja / 127:.2f}", abs(same - deja / 127) < 0.03, f"measured {same:.3f}")
    check("SPD 0 always renews, SPD 127 never", lib.dv_fresh_of(0) == 65536 and lib.dv_fresh_of(127) == 0)

    def play(i, mode, trigs, length, bars=2, ctr_at_play=False, mult=6):
        """Per step: (the output when the step's trig fires or would, the output after tick 1)."""
        lib.dv_host(i, 0, 127, mult, mode, 0, 1 if ctr_at_play and length > 1 else 0, 0)   # stopped
        out = []
        for n in range(bars * length):
            ctr = (n % length + 1) % length
            if n == 0 and ctr_at_play and length > 1:
                ctr = 1
            lib.dv_host(i, 0, 127, mult, mode, 1, ctr, 0)
            at_trig = lib.dv_host(i, int(n % length + 1 in trigs), 127, mult, mode, 1, ctr, 0)
            after = lib.dv_host(i, 0, 127, mult, mode, 1, ctr, 1)
            for t in range(2, 6):
                lib.dv_host(i, 0, 127, mult, mode, 1, ctr, t)
            out.append((at_trig, after))
        return out

    i = 30
    for mode, name, col in ((HOLD, "HOLD", 0), (FREE, "FREE", 1)):
        for length in (1, 2, 16):
            for cap in (False, True):
                i = (i + 1) % 24
                x = [v[col] for v in play(i, mode, set(range(1, 17)), length, 2, cap)]
                check(f"{name}, {length} steps, counter {'already 1' if cap else 'moving'} at PLAY: bar 1 = bar 2",
                      x[:length] == x[length:], f"{x[:length][:4]} vs {x[length:][:4]}")
    x = [v[1] for v in play(1, FREE, set(), 16, 2, mult=6)]
    check("FREE steps without trigs, one value per step", len(set(x[:16])) > 8 and x[:16] == x[16:])
    check("FREE: the last step (counter 0) is the last slot, not slot 0", x[15] != x[0] and x[15] == x[31])
    x = [v[1] for v in play(2, FREE, set(), 5, 4)]
    check("FREE on a 5-step track loops every 5 steps", x[:5] == x[5:10] == x[15:20])
    a = play(3, HOLD, {1, 5, 9, 13}, 16, 4, mult=4)
    ref = [v[0] for v in play(3, HOLD, set(range(1, 17)), 16, 4, mult=4)][:16]
    check("HOLD: a trig plays its own step's value", all(a[n][0] == ref[n % 16] for n in range(64) if n % 16 + 1 in (1, 5, 9, 13)))
    t_ = [v[1] for v in play(4, TRIG, {1, 7}, 16, 2, mult=2)]
    check("TRIG: each trig restarts the loop", t_[0] == t_[6] == t_[16] == t_[22] and t_[1] == t_[7])
    h = [v[1] for v in play(5, HALF, {1}, 16, 1, mult=2)]
    check("HALF: one pass, then the last value holds", len(set(h[:4])) > 1 and len(set(h[3:])) == 1)
    w = [v[1] for v in play(21, TRIG, {9}, 8, 1, mult=2)]     # a fresh LFO: never trigged
    check("TRIG: nothing before the first trig", set(w) == {0})

    # DJC: per frame as hooks.s runs it; 344 frames a step at 120 BPM, a tick every 57
    lib.dv_frame(22, 0, 127, 3, FREE, 0, 0, 0, DJC, 0x34000)
    glide = []
    for n in range(12):
        ctr = (n % 16 + 1) % 16
        for f in range(344):
            glide.append(lib.dv_frame(22, 0, 127, 3, FREE, 1, ctr, min(f // 57, 5), DJC, 0x34000))
    jump = max(abs(a - b) for a, b in zip(glide[344:], glide[345:]))
    check("DJC glides after its first value (no frame-to-frame jump over 1 % of the range)", jump < (1 << 24) // 100, f"{jump}")

    for k, want in ((4, {0}), (25, {-5, 0}), (35, {-5, 0, 7}), (60, NOTES), (127, NOTES)):
        adds = [engine_add(lib.dv_quant_of(v << 16, k << 8), k << 8) for v in range(-128, 128)]
        exact = all(a % (5 * 256) == 0 for a in adds)
        notes = {a // (5 * 256) for a in adds}
        check(f"DJQ on PTCH at DEP {k}: root and fifth {sorted(want)}", exact and notes == want, f"{sorted(notes)} exact={exact}")
    base = ctypes.addressof(ctypes.c_char.in_dll(lib, "dv_state"))
    ctypes.memset(base, 0xA5, 116 * 24)
    a = one(20, 64, 127, 3)
    ctypes.memset(base, 0, 116 * 24)
    b = one(20, 64, 127, 3)
    check("a garbage state is set up on first use", a == b)

gen = HERE / "generate.py"
if shutil.which("m68k-elf-gcc"):
    r = subprocess.run([sys.executable, "-B", str(gen), "--check"], capture_output=True, text=True)
    check("dejavu_core.s matches dejavu.c, hooks.s and icon.py", r.returncode == 0, (r.stdout + r.stderr).strip()[-300:])
else:
    print("[SKIP] dejavu_core.s regeneration: m68k-elf-gcc not on PATH")

sys.exit(1 if failed else 0)
