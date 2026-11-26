# Combo testing

What was run, on which build, and what it showed. "Not tested" means exactly that. Emulator and hardware runs are kept apart.

## Render gate (dsp_host, 25 November 2026)

`python3.12 verify.py` on the draft's source at its first commit, with the vendored dsp56300 tools (`~/.cache/modwerk-upstream/octabam`). No firmware is read: the assembly runs from a synthetic memory image with the CAB table at P:0x3000.

- Every product decodes as the signed `mpy`/`mac x0,y1` form (34 of 34), there is no `rep`, the state stays inside X:(r7+$00..$4f), and the assembly carries tables.py's constants.
- Bit for bit against reference.py's fixed-point model: stereo noise at the defaults; a loud 220 Hz tone at the dearest setting; every CAB; automation over every knob's range; a 5-frame trig split every block; a GAIN word carrying an LFO's fraction bits; garbage state before init; a stored CAB of 9 (plays 4X12); two instances with their own knobs.
- Silence in gives exact silence out at the defaults, the dearest setting, GAIN and LEV at 0, and all three bands at -64.
- At CAB OFF, the render matches the float design (reference.float_combo) at 1 kHz within 0.00 dB.
- Cycle meter: 381.2 a sample, the same at the defaults and the dearest setting (the work does not depend on the knobs).

Two encoding traps showed up on the first assembly and are fixed: `lua (r7+$40)` assembled as `(r7-$40)` (lua offsets reach ±63), and the label `cmb_seed` was a prefix of `cmb_seeded`, which sent a branch astray. Both are in sdk/octabam/AGENTS.md.

## On the unit

Not tested.

## In the emulator

Not tested.

## Stock flows

Not tested.

## Sound quality

Not tested: npm run fx:audit (aliasing, clipping, DC, sums to mono, idle) has not been run. The curve sees a signal band-limited at 7 kHz, but at high GAIN its limit still makes harmonics that alias; the audit will say how much.

## Performance

381.2 cycles a sample measured in dsp_host (above). Stock SPRING REV is about 314 (docs/OCTATRACK_ELEKLOADER_MIGRATION.md), so COMBO is about 1.2 times its cost before any optimisation. Not yet measured: the static floor (cycle_count.py), evidence/performance.json, the stress run and the CPU price on a unit.
