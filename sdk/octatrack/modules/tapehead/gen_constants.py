"""gen_constants.py (octabam: gen_tapehead_constants.py) -- computes every hex constant tapehead.asm
needs, the way gen_inflator_constants.py is described as doing for Inflator
(named in inflator.asm's header; not present in this checkout to run
directly, so this follows the same idea from scratch): print the numbers,
don't hand-type them.

Two kinds of constant:
  - Color (3 discrete settings): K2, K3_MAG computed directly (SR fixed at
    44100, per inflator.asm's own "@ 44.1k" comment -- there is no runtime
    sin() on this chip, and Color only ever has 3 possible values, so these
    are baked in as three immediate hex pairs, selected by a 3-way compare
    in the precompute section, same idea as Inflator's SPLIT toggle but
    resolved at proc-entry instead of per-sample).
  - DRIVE16, TRIM_K (continuous 128-position knobs): degree-5 polynomial
    fits over the knob fraction t = raw/127 in [0,1], same technique as
    Inflator's waveshaper A/B/C/D and every fit in sim_fattener_fixed.py.
"""

import math
import numpy as np

SR = 44100.0
Q123_SCALE = 0x800000


def q123_hex(x):
    """Floor-truncate x (must satisfy |x| < 1) to a Q1.23 hex word, matching
    q123_trunc(x, 0) in sim_tapehead_fixed.py."""
    assert -1.0 <= x < 1.0, f"{x} out of Q1.23 range"
    word = math.floor(x * Q123_SCALE)
    word = max(-Q123_SCALE, min(word, Q123_SCALE - 1))
    return word & 0xFFFFFF


def poly_eval(coeffs, t):
    total = 0.0
    tp = 1.0
    for c in coeffs:
        total += c * tp
        tp *= t
    return total


def fit_and_report(name, func, degree=5, samples=128, headroom_shift=0):
    # t = raw/128 (raw 0..127), matching Inflator's established convention
    # ("value<<16 already IS value/128 in Q1.23, no shift needed") rather
    # than raw/127 -- so the knob's own raw value, read straight as Q1.23,
    # IS t with no rescale needed in the assembly.
    ts = np.array([r / 128.0 for r in range(samples)])
    ys = np.array([func(t) for t in ts])
    coeffs_hi_first = np.polyfit(ts, ys, degree)
    coeffs = tuple(float(c) for c in coeffs_hi_first[::-1])
    fitted = np.array([poly_eval(coeffs, t) for t in ts])
    err = np.abs(fitted - ys)
    print(f"  {name:10s} degree={degree}  max_err={err.max():.3e}  "
          f"range=[{ys.min():.4f},{ys.max():.4f}]  headroom_shift={headroom_shift}")
    scaled = tuple(c / (2 ** headroom_shift) for c in coeffs)
    for i, (c, cs) in enumerate(zip(coeffs, scaled)):
        status = "OK" if abs(cs) < 1.0 else "STILL NEEDS MORE HEADROOM"
        print(f"    p{i} = {c:+.8f}  (stored {cs:+.8f})  ({status})"
              + (f"  hex={q123_hex(cs):06X}" if abs(cs) < 1.0 else ""))
    return coeffs


print("=" * 78)
print("Color: K2, K3_MAG (SR=44100, exact -- only 3 possible settings)")
print("=" * 78)
for color, freq, name in ((0, 2100.0, "NORMAL"), (1, 3680.0, "MEDIUM"), (2, 5000.0, "BRIGHT")):
    k2 = 2.0 * math.sin(freq * math.pi / SR)
    k3 = 1.4 * (-k2)
    k3_mag = -k3
    print(f"  {name:7s} (color={color}, {freq:.0f} Hz): "
          f"K2={k2:.8f} hex={q123_hex(k2):06X}   "
          f"K3_MAG={k3_mag:.8f} hex={q123_hex(k3_mag):06X}")

print()
print("=" * 78)
print("Fixed constants (no knob dependence at all)")
print("=" * 78)
K1 = 5.0 / 7.0
G3 = (10.0 ** (1.4 * 3.0 / 20.0)) * -1.0 * K1
G3_MAG_HALF = abs(G3) / 2.0
print(f"  K1          = {K1:.8f}  hex={q123_hex(K1):06X}")
print(f"  G3          = {G3:.8f}  (magnitude/2, always negated at use)")
print(f"  G3_MAG_HALF = {G3_MAG_HALF:.8f}  hex={q123_hex(G3_MAG_HALF):06X}")

print()
print("=" * 78)
print("DRIVE16(t): t=raw/127 in [0,1] maps to drive_logical 1..10;")
print("DRIVE16 = drive_k/16 = (10**((drive_logical-1)/9) * 0.8) / 16")
print("=" * 78)
def drive16_of_t(t):
    drive_logical = 1.0 + t * 9.0
    drive_k = (10.0 ** ((drive_logical - 1.0) / 9.0)) * 0.8
    return drive_k / 16.0

DRIVE16_FIT = fit_and_report("DRIVE16", drive16_of_t, headroom_shift=0)

print()
print("=" * 78)
print("TRIM_K(t): t=raw/127 in [0,1] maps to trim_dB 0..-21;")
print("TRIM_K = trim_k = 10**(trim_dB/20) * 0.7")
print("=" * 78)
def trimk_of_t(t):
    trim_db = -t * 21.0
    return (10.0 ** (trim_db / 20.0)) * 0.7

TRIMK_FIT = fit_and_report("TRIM_K", trimk_of_t, headroom_shift=2)

print()
print("=" * 78)
print("Sanity: fit error vs. exact, worst case over t (matches the exact")
print("continuous-knob values tapehead.asm will actually produce)")
print("=" * 78)
ts = np.linspace(0, 1, 512)
d_err = max(abs(poly_eval(DRIVE16_FIT, t) - drive16_of_t(t)) for t in ts)
t_err = max(abs(poly_eval(TRIMK_FIT, t) - trimk_of_t(t)) for t in ts)
print(f"  DRIVE16 max fit error: {d_err:.3e}  (relative to range "
      f"[{drive16_of_t(0):.3f},{drive16_of_t(1):.3f}])")
print(f"  TRIM_K  max fit error: {t_err:.3e}  (relative to range "
      f"[{trimk_of_t(1):.3f},{trimk_of_t(0):.3f}])")
