# E-Verb testing

The author's measurements below were run locally on the native builder, DSP56300 emulator (`dsp_host`)
and headless ColdFire emulator (`ot_emu`), not on hardware. The owner subsequently reported a MKII
functional audition on EVRB01T01; [the exact-build report](evidence/owner-hardware.md) records its scope.
No emulator result below is relabelled as hardware evidence. Firmware, images, memory dumps and renders stayed outside the
repository and were deleted.

## Commands and exact revision

Source tested: the files of this folder at the commit named by `tests.evidenceRevision` in
`octamod.module.json`, on top of `306e3dc` (main, 9 October 2026). The renders were made on `a5dee01`; on the
new base the private image rebuilds byte-identical (same SHA-256 below) and the gates print identical
output. File SHA-256:

| File | SHA-256 |
|---|---|
| everb.asm | 0b463c9951b8528677e60016e1b75e1baafca48987cf7044e65f16555d9fe473 |
| generate.py | cacfac5704455491ad4ae8e59ef16cd597b586a4a69f5b6cf0678e886c32392c |
| manifest.py | aa390830ea8022baa07d4944e7819508c043fddb133878d3e13e4551c5438b12 |
| verify.py | 9067bffd3d71fc4717237ba4c04c7839bf9631f76eb784a107225924d9082100 |
| perf.py | a6efbf22ecfba5299e18b6237d5999d84beb10b1970380fc3a59c1e342de3d65 |

Tools: macOS 15.7.3 arm64, Python 3.14.6, Node 24.21.0, dsp56300 at `8ccdd843` with octabam's patch
(`dsp_host` b38019ef…), `ot_emu` built from `sdk/octabam/tools/emu/ot_emu` (9af97ff3…). OS: the official
OCTATRACK_OS1.40C (update file 34695b60…; MAIN OS extraction 164f3122…, the stock benchmark's
`stock_sha256`).

Private image: `verify.py` and `perf.py` build it with the native builder the way
`scripts/export-composition-proofs.py` does, with stock DSP code built in (`OCTABAM_STATIC_STOCK=1`)
and the FX2 chooser the site gives E-Verb on its own (every stock effect except SPRING REV and DARK REV,
then E-Verb). SHA-256 b776efe203efecd0ceda90f68d7fe109cc8fc13a1f07bed00303f81af2769195, 1,112,560 bytes; the
build is deterministic (rebuilt byte-identical several times). E-Verb sits at P:0x01252–0x01885 on
payload A and P:0x01012–0x01645 on payload B.

The original draft was temporarily copied into the native registry for these runs. The release
now lives directly in `sdk/octabam/modules/everb/`; the same source commands run in place:

```sh
cd sdk/octabam
python3 modules/everb/generate.py --check                    # everb.asm is what the generator writes
python3 modules/everb/verify.py                              # the render gates (about 40 s)
python3 modules/everb/perf.py bench  <out>                   # matched benchmark with stock (about 1 min)
python3 modules/everb/perf.py stress <out> --seconds 32      # the stress run (about 12 min)
cd ../..
npm run perf:audit -- check sdk/octabam/modules/everb/evidence/performance.json
npm run fx:audit -- plan <dir> --tail 12                     # then the renders below, then check
```

## Changes after review

A local review (another Claude session, at the user's request) reproduced the figures and found:

- **Shimmer grains could read another line's buffer.** A grain gliding up an octave keeps gliding until
  its line latches again, up to a grain-clock cycle later. When DPTH left the shimmer zone for the
  cyclic side meanwhile, the cyclic offset rose under the glide, the head's delay went negative and it
  read ahead of its line into the next line's buffer: rail-to-rail steps at SPD 0. The heads of lines 0
  and 2 and the old head now never read closer than 2^-11 of the line (1.1 ticks on line 2). No new
  gliding grain starts until the cyclic depth has glided to exactly zero (group 1, once a call). Steady
  shimmer, cyclic and ergodic renders are bit-identical to before; the new depth-locks gate catches the
  old code (below).
- **EDCY could latch a loud drone.** At DCY 80 with EDCY +63 a loud burst pushed the decay into the
  sustain zone, where the sustain kept the envelope up: −12.5 dBFS after 19 s. The envelope may now
  lengthen the decay up to DCY 95 (g = 0.99) but never into sustain: u = min(u + env, max(u, 0.75)).
- **MIX 0 was the dearest setting**, because the wet-off cleanup ran on top of the full gain and tilt
  work. MIX 0 now skips the sine and tilt evaluation (their targets there are 0, so the output is
  bit-identical) and is cheaper than MIX 127.
- **The placement gate was off by one** (the build log's region end is exclusive) and now checks the
  helper against the address `src/engine/assets/stock-dsp-metadata.json` records.
- **The stock comparison was not matched**: E-Verb's figure included trig splits, the stock baselines
  did not. `perf.py bench` now runs the stock effects through the same cases.
- **Every Tcc and logical operation now has a stock precedent**: `tlt x0`, `tge y1` and an abs/add sum
  replace `tgt x0`, `tlt y0`, `tge y0` and an `or` chain, with the same results.
- **Layout**: the user chose to put SPD on the lockable main page and TILT on SETUP (it was the other
  way round), so the modulation pair takes locks and LFOs.

## Render gates

`python3 modules/everb/verify.py`, all passing:

```
[PASS] source: everb.asm is generate.py's output: everb.asm matches generate.py
[PASS] source: init leaves r1/n1/m1 alone
[PASS] source: static cycles: 468 cycles/sample per instance (worst arm), 4 per core = 1872 of 3120; marker no-op True
[PASS] placement: payload A: E-Verb P:0x01252..0x01885 (1588 words) in P:0x01252..0x01aa3; PLATE REV helper P:0x01a47..0x01aa3 as the stock metadata records it, identical to stock; 449 words free before it
[PASS] placement: payload B: E-Verb P:0x01012..0x01645 (1588 words) in P:0x01012..0x01863; PLATE REV helper P:0x01807..0x01863 as the stock metadata records it, identical to stock; 449 words free before it
[PASS] dry: MIX 0 is the input sample for sample (static): 0 of 48000 words differ
[PASS] dry: MIX 0 is the input sample for sample (moving knobs): 0 of 48000 words differ
[PASS] dry: MIX 0 is the input sample for sample (moving knobs, split 5): 0 of 48000 words differ
[PASS] reverb: the onset follows PRE: PRE 0 7.96 ms (pre-delay 6.98), PRE 64 43.38 ms (pre-delay 42.35), PRE 127 250.73 ms (pre-delay 249.70); the same 0.98-1.03 ms path after each
[PASS] reverb: the default tail decays: -39.6 dB from 0.2-0.7 s to 1.5-2.0 s
[PASS] reverb: the channels are decorrelated: correlation -0.018 over 0.1-1.0 s
[PASS] reverb: a higher DCY decays slower: T20 0.083 s at DCY 40, 1.152 s at DCY 90
[PASS] reverb: a larger SIZE decays slower: T20 0.167 s at SIZE 30, 1.447 s at SIZE 100 (DCY 80)
[PASS] idle: the defaults settle after the input stops: last 0.5 s of 11.5 s silence: L [0], R [6] LSB; a constant truncation residue (fixed point of the tank and tilt), no oscillation
[PASS] isolation: eight instances under -guard 0x4000 -guard-shared -dirty 0x5a: 8 instances guarded, 0 stray regions, 0 clobbers
[PASS] isolation: each instance alone renders bit-identically: 8 of 8 identical
[PASS] isolation: only the fed instance makes sound: instances 1-7 silent while instance 0 plays
[PASS] garbage: from a garbage block, silence in is silence out: 4 fills x 2 knob sets, 600 blocks, Y dirty too
[PASS] garbage: a tone from a garbage block starts like a zeroed one: first 256 blocks peak within 1 dB
[PASS] zipper: no block-rate step on any continuous knob: 10 knobs with the modulation off, then SPD at three modulation depths, SIZE under grains and DPTH between grains and shimmer; jump up / jump down / turn, move/static dBFS above; flagged none
[PASS] splits: a split in every block renders the same reverb (modulation off): 50 ms envelope within 0.03 dB of the unsplit render at splits 1, 7 and 15
[PASS] splits: a split in every block renders the same reverb (ergodic grains): tail level -51.33..-51.23 dBFS and decay -68.5..-68.4 dB/s split, against the grains' own -52.46..-50.75 dBFS and -71.1..-69.2 dB/s unsplit
[PASS] splits: knobs moving with a split in every block, guarded: no hang, no stray write
[PASS] reverse: REV switching every 40 ms does not click: largest step -40.1 dBFS switching, -37.8 dBFS held; 0 samples on the rail
[PASS] depth locks: DPTH +63/-64 every 70 ms steps no more than with DPTH held: SPD 0 SIZE 0: -20.5/-20.3; SPD 0 SIZE 64: -20.0/-20.1; SPD 0 SIZE 127: -19.2/-20.0; SPD 64 SIZE 0: -20.2/-19.9; SPD 64 SIZE 64: -20.1/-20.1; SPD 64 SIZE 127: -18.9/-19.3; SPD 127 SIZE 0: -20.5/-20.3; SPD 127 SIZE 64: -18.2/-18.0; SPD 127 SIZE 127: -18.2/-18.3 dBFS, locking/held
[PASS] envelope: EDCY +63 lengthens the decay but cannot hold the tail: -25.8 dBFS RMS at 0.5-1.5 s, -118.6 dBFS at 19-20 s (DCY 80, MIX 127, 0.5 s burst at 0.8 FS)
```

What the gates mean and where they stop:

- **Zipper**: `verify_knob_clicks.py`'s census, copied into the gate because importing it selects the rig
  fixture: a 438.75 Hz tone at 0.3 FS, each continuous knob jumped from 20 to 110 and back, then turned
  one step every two blocks; the block-locked step energy must stay under −70 dBFS or within 6 dB of the
  knob held still. Every knob reads −140 (nothing measurable) in all three windows, first with the
  modulation off and then where the modulation makes the knob act: SPD at DPTH 32 (cyclic), 100 (ergodic)
  and 120 (shimmer), SIZE under ergodic grains, and DPTH between 100 and 127 (grains into full shimmer).
  An earlier build flagged SIZE at −63 dBFS (its glide slope changed every fourth block, a small pitch
  step in every line); SIZE now glides in two stages refreshed on every call. REV is a select and is
  covered by the reverse gate instead. Not run at DPTH 0, full cyclic depth: there the doppler moves the
  heads by up to about 6 ticks a tick, the windows are not steady, and the census flags random phases
  that move with the tone (SPD's jump down and SIZE's turn read about −54 dBFS there, and SIZE with the
  modulation off flags the same way at 517 and 1,033 Hz). The cyclic rate itself is not smoothed: a SPD
  jump is phase-continuous but its speed changes at once.
- **Depth locks**: DPTH locked between 127 (+63, shimmer) and 0 (−64, cyclic) every 193 blocks
  (70 ms), noise in, MIX 127, DCY 90, at SPD 0/64/127 × SIZE 0/64/127; the largest sample step must
  stay within 1.25× of the same render with DPTH held at either end. On the source before the fix it
  fails: steps of −8.9 to +2.9 dBFS against about −20 held (SPD 64, SIZE 127 reaches the rail).
- **Envelope**: MIX 127, DCY 80, EDCY +63, a 0.5 s noise burst at 0.8 FS, then silence; the RMS at
  19–20 s must be 40 dB below that at 0.5–1.5 s. Before the fix: −13.7 dBFS, then −12.5 dBFS after 19 s.
- **Splits**: the dispatcher calls twice in a block with a trig. Sample-exact equality with the unsplit
  render is not expected: the knob glides settle a few LSB apart, and a tail that recirculates for
  seconds turns that into a different phase. With modulation off the 50 ms envelope matches within
  0.03 dB. With ergodic grains the random grains fall elsewhere; the split renders lie inside the spread
  of the same unsplit render with the input shifted by 0–3 blocks. SIZE's first glide stage advances per
  call, so a split in every block makes it glide up to twice as fast; harmless.
- **Idle**: the residue is a constant per channel (0 and +6 LSB at the defaults, −123 dBFS), not an
  oscillation: lines 2 and 3 carry no DC blocker, and floor truncation in the tank and the tilt low-pass
  leaves a fixed point. With TILT at an end the low shelf lifts it to as much as 71 LSB (−101 dBFS); the
  DC loop gain is at most 0.707 g, so nothing builds up. Two in-loop DC blockers and an exact-zero tilt
  state would remove it for about 2 % more cycles; it is far below any converter's noise, so it was left
  and documented. Rounding instead of truncation was tried and did not remove it.
- **Garbage**: the instance block X:(r7+$00..$FF) pre-filled with `verify_dirtystate.py`'s four words, the
  Y ring with `-dirty 0x5a`; init clears X:(r7+$00..$83), which holds every state word, and the ring is
  cleared 128 words a call over the first 128 calls, dry meanwhile.
- **Isolation**: positions 0–3 on both cores; the instance buffers include the shared Y window
  (Y:0x30000–0x3FFFF), hence `-guard-shared`. Each instance alone with the same knobs and input renders
  bit-identically to the eight together.

Instruction forms: the reviewer checked every ALU operation and every parallel-move field of the
disassembled `everb.asm` against the stock payloads (`out/dsp/payload_{A,B}.asm`). The two without a stock
precedent, `or x0,a` and `tgt x0,b`, were replaced, and the conditional transfers added since use stock's
own register forms (`tlt x0`, `tge y1`). A stricter whole-instruction census (each ALU operation together
with its parallel moves) still lists combinations stock never happens to use, all built from fields it does.

## Sound quality

`npm run fx:audit -- plan <dir> --tail 12` (the default 3 s tail is too short for a reverb at the
dearest settings), each signal rendered through one instance on the private image with `dsp_host` (256
silent blocks first, so the ring is clear, cut from the render), then `npm run fx:audit -- check`.
Interleaved stereo int32 renders; the audit judges the worse channel. The limits are the audit's
defaults: aliasing −60 dBc, DC −60 dBFS, idle −90 dBFS. The renders were repeated on the final image;
every table below came out byte-identical to the build before the review fixes, which none of these
fixed-knob settings engage.

**Dearest settings, modulation off**: SIZE 0, DCY 100, ABSB 90, DPTH 64 (off), SPD 127, MIX 127,
TILT 64, PRE 127, REV OFF, EDCY 64, ESIZ 64 (REV is time-varying, so it counts as modulation here).

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db           -18.3      -46.7    -116.2     -50.4    -106.1       0  ok
tone-1100hz-1db             -9.0      -41.0     -96.8     -50.4    -111.7       0  ok
tone-2701hz-12db           -28.1      -75.8    -107.6     -44.9    -100.5       0  ok
tone-2701hz-1db            -17.2      -54.2     -68.7     -45.4     -96.9       0  ok
tone-5301hz-12db           -33.6     -116.3    -101.1     -52.2    -106.6       0  ok
tone-5301hz-1db            -21.6      -72.2     -32.3     -23.4     -94.5       0  FAIL
tone-9102hz-12db           -41.8     -139.9     -91.8     -44.4    -109.3       0  ok
tone-9102hz-1db            -31.4      <-140     -10.5     -16.5     -98.2       0  FAIL
idle                    after the input stops: idle activity of 1 LSB value(s), peak -110.9 dBFS  NOTE
```

**Defaults** (SIZE 64, DCY 64, ABSB 60, DPTH 0, SPD 64, MIX 51, TILT 0):

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db           -11.7      -66.4    -116.4     -58.3    -121.7       0  ok
tone-1100hz-1db             -2.3      -32.9    -102.2     -65.3    -122.0       0  ok
tone-2701hz-12db           -14.3      -62.8    -122.2     -59.6    -121.3       0  ok
tone-2701hz-1db              0.4      -33.3     -43.5     -53.4    -125.5    7112  FAIL
tone-5301hz-12db           -13.6     -132.9    -121.5     -76.9    -120.1       0  ok
tone-5301hz-1db             -2.1      -95.2     -51.9     -45.6    -120.5       0  FAIL
tone-9102hz-12db           -13.0      <-140    -122.4     -66.0    -119.9       0  ok
tone-9102hz-1db             -2.7      <-140     -37.9     -44.2    -121.2       0  FAIL
idle                    after the input stops: idle activity of 1 LSB value(s), peak -120.4 dBFS  NOTE
```

Reading them:

- **Every −12 dBFS tone passes**, at the defaults with aliasing at or below −116 dBc.
- **The −1 dBFS failures** are sustained full-scale tones driving the soft cubic saturation in the
  feedback loop, which the Erbe-Verb design keeps there so that decay can pass 100 %. Its harmonics fold
  at the 22.05 kHz tank rate; some fold onto the audit's 44.1 kHz alias bins. At the dearest corner the
  fundamental itself is damped by ABSB 90 to −21.6 and −31.4 dBFS, so the dBc figures compare the
  products with a weak tone (−54 and −42 dBFS absolute).
- **Clipping**: a −1 dBFS 2.7 kHz sine at the defaults sits on a room resonance; wet plus dry pass full
  scale and the store limiter clips 7,112 samples. Nothing else reaches the rail at the defaults. No
  soft limiter was added: DARK REV and SPRING REV clip more on the same test (below).
- **DC** stays below −94 dBFS at both settings (limit −60).
- **Idle** is the constant residue described under the gates: a note, not a failure.

**Other settings**, summarised (full tables on request; the renders are reproducible with the commands
above):

| Setting | Result |
|---|---|
| Hall: SIZE 127, DCY 100, ABSB 38, MIX 127 | every tone fails and idle reads −20.8 dBFS after 12 s: at DCY 100 and SIZE 127 the gain per pass is 0.997, a decay of minutes; sustained tones build up into the saturation. Rings by design |
| DCY 127 (120 %), SIZE 64, MIX 127 | sustains by design: idle −2.3 dBFS; −1 dBFS 2.7 kHz reaches the rail (5,792 samples) |
| Cyclic DPTH 0 (−64), SPD 90, MIX 127 | modulation sidebands fill aliasing and residual (+7 to +25 dBc), as the guide expects; −1 dBFS 1.1 and 2.7 kHz reach the rail (630, 53 samples); idle a note |
| Ergodic DPTH 100, SPD 100, MIX 127 | sidebands as above; −1 dBFS 1.1 and 2.7 kHz reach the rail (916, 12); idle a note |
| Shimmer DPTH 127, MIX 127 | octave products and sidebands as above; −1 dBFS 1.1 kHz reaches the rail (316); idle a note |
| Reverse REV ON, PRE 90, MIX 127 | the reverse windows' amplitude modulation fills the residual; no rail; idle a note |

**The stock reverbs on the same signals**, MIX 64, other knobs at their defaults, rendered the same way
on the original OS image (for comparison only):

| Effect | −12 dBFS tones failing | −1 dBFS tones failing | Samples on the rail |
|---|---|---|---|
| E-Verb, defaults (MIX 51) | 0 of 4 | 3 of 4 | 7,112 (2.7 kHz) |
| DARK REV | 3 of 4 | 4 of 4 | 4,528, 5,330, 271, 80 |
| SPRING REV | 1 of 4 | 3 of 4 | 21,380, 17,803 |
| PLATE REV | 3 of 4 | 4 of 4 | 0 |

**Wet level against stock**: a 10 ms noise burst at 0.5 FS, fully wet (MIX 127), one instance in
`dsp_host`, RMS over the second after the burst. Stock effects at their defaults on the original image:
DARK REV 0.0211 (−33.5 dBFS), SPRING REV 0.0212 (−33.5 dBFS), PLATE REV silent (its default GATE).
E-Verb: the defaults 0.0114 (−38.9 dBFS); SIZE 96, DCY 80: 0.0151 (−36.4 dBFS); the README's Hall
(SIZE 110, DCY 90, ABSB 45): 0.0211 (−33.5 dBFS). Measured before the review fixes, none of which
engages at these fixed settings.

**TILT and SPD, checked by name after the layout change**: TILT 0 lifts 60 Hz by 11.8 dB and cuts
9 kHz by 13.6 dB; TILT 127 lifts 9 kHz by 24.0 dB and dips 60 Hz by 3.3 dB (TILT 96: +12.2 and −5.0).
With full cyclic depth the wet tone's zero-crossing jitter is 5.2 samples at SPD 0, 46.9 at SPD 64 and
7.6 at SPD 127 (where the swirl turns into sidebands); TILT leaves it unchanged.

## Stock flows

E-Verb changes no stock flow. Compared on the original OS image and on the final private image with the
same panel sequence in `ot_emu` (MKII panel, empty card, stopped transport), LCD captures byte-compared:

| Flow | Result |
|---|---|
| Boot and the date dialog | identical |
| Track 1 FX2 main page with the default DELAY | identical |
| FX1 SETUP chooser, top and bottom of the list | identical (FILTER … LO-FI; no E-Verb on FX1) |
| FX2 SETUP chooser opened on DELAY, and its top | identical |
| FX2 SETUP chooser, bottom | differs: stock ends DELAY, PLATE REV, SPRING REV, DARK REV; E-Verb's build ends DELAY, PLATE REV, E-Verb |
| Track 1 FX1 main page | identical |

The chooser difference is the builder's ordinary rule for module DSP code (two stock reverbs give up
their code space), documented in the README, not a change E-Verb makes. A saved project with SPRING REV
or DARK REV on FX2 dispatches to the null stub in this build, and a project saved with E-Verb dispatches
effect ID 0x1b to the same stub on the original OS (both cores): `dsp_host` shows the stub passes the
input unchanged, as NONE. What the panel shows for such a slot was not tested.

Not tested: Parts and their reload, pattern and bank changes, scenes and the crossfader, the arranger,
recorders and sampling, MIDI in and out, USB, saving and loading projects, copy and paste of FX pages,
and anything with the transport running. E-Verb adds no ColdFire code and takes over no message, so none
of these should change, but none was run.

## Performance

`npm run perf:audit -- check sdk/octabam/modules/everb/evidence/performance.json`:

```
✓ record          dsp record for everb@0.1.0-experimental
· cycles          4 x 468 = 1872 of 3120 per sample per core (60%), measured 381.69 per instance; over half a core: say what stays free for stock effects and other modules
· stock benchmark 381.69 vs DARK REV 242.38 (1.57x); the dearest stock effect is 330.94; justified in the record
✓ stress          4 per core, eight tracks, 3 LFOs and 16 locked slots, 32 s, no clobber, no hang
```

**Static**: `cycle_count.py` (run in-process with an E-Verb selection; `--verify` shows the marker is a
no-op): 468 cycles/sample, the dearer of the two MODEFORK arms (the other is 382). The arms strictly
alternate, so the per-frame floor is 425 and 468 is a conservative ceiling. The per-call knob code runs
once per block and is outside that count but inside the measured figure. Four per core use 1,872 of the
3,120 cycles for their sample loops alone; this does not establish headroom for another heavy module.
The release's full-call bound in [evidence/release-bounds.md](evidence/release-bounds.md) is 47,680 of
49,920 modeled cycles/core/block, leaving 2,240 per block for additional custom work. Stock work is
reserved separately, and real-chip contention remains unmeasured.

**Measured**: `perf.py bench`, `benchmark_stock_dsp.py`'s own method, E-Verb on the private image and the
stock effects on the original one through the same cases (executed instructions/sample, null stub
subtracted, peak and mean of the dearer core):

| Case | E-Verb peak | E-Verb mean |
|---|---|---|
| Fixed (defaults, MIX 127) | 335.56 | 329.50 |
| Moving knobs | 361.44 | 354.02 |
| Moving knobs, trig split at every position (worst) | 367.31 | |
| Dearest (SIZE 0, DPTH 127, REV on) | 375.81 | 368.92 |
| Dearest, trig split at every position (worst) | **381.69** | 374.79 |
| Dearest with MIX 0 | 373.75 | 367.71 |
| Dearest with DPTH 0 (no modulation) | 361.56 | 356.10 |
| Dearest with REV off | 349.81 | 342.92 |

| Effect | Worst, unsplit | Worst, trig splits at any position | `benchmark_stock_dsp.py` |
|---|---|---|---|
| E-Verb | 375.81 | 381.69 | |
| SPRING REV | 257.50 | 314.19 | 257.50 |
| DARK REV | 193.25 | 242.38 | 193.25 |
| PLATE REV | 183.94 | 218.25 | 183.94 |
| DJ EQ | 293.38 | 330.94 | 293.38 |

The stock rows' unsplit figures reproduce `out/stock_dsp_bench/results.json` exactly (a positive control
for the matched runs). Splits cost the stock effects 34 to 57 instructions/sample and E-Verb 6. Under
matched conditions E-Verb's worst is 1.57× DARK REV (the closest stock reverb in function), 1.21× SPRING
REV (the cost target for new FX) and 1.15× DJ EQ, the dearest stock effect; unsplit, 1.94×, 1.46× and
1.28×. It is dearer than every stock effect, so the record carries a justification for the owner. The
cost buys the feature set; the loop was hand-scheduled from about 432 to 336 instructions/sample at the
defaults. Further savings would cost features: the early-reflection taps (about 8/sample), a two-band
tilt (about 10), saturation on two lines only, a cheaper interpolator, or one head instead of two for
the grains.

**Stress**: `perf.py stress` (about 12 min). `stress_project.py` needs a template Octatrack project,
which is not available here, so the same load goes straight into `dsp_host` on the private image:

- E-Verb on FX2 of all eight tracks (four per core), DJ EQ on every FX1;
- per block, three LFOs on SIZE, DPTH and MIX (sine, triangle, square) and a new random value on every
  slot of both effects each sixteenth at 120 BPM: 16 slots changed per step, of which 11 can be locked on
  a unit (E-Verb's six main-page knobs and DJ EQ's five); E-Verb's five SETUP knobs change only with
  Parts on a unit, so this changes more than locks can;
- trig splits of 1, 3, 7, 8, 12 and 15 frames on six tracks;
- eight different 32 s stems (drums with full-scale clicks, a chord, noise bursts, sweeps, a full-scale
  square, impulses, DC steps, plucks) and a 2 s tail;
- `dsp_host -guard 0x4000 -guard-shared -dirty 0x5a`.

Result: no hang; every E-Verb instance 0 stray writes and 0 clobbers; the stock DJ EQs write their own
Y:0x40–0x6F scratch as on stock (0 clobbers); per-core peak 2,806.0 and 2,793.6 executed
instructions/sample with all sixteen effects. Tracks reach the rail: the fixture's full-scale stems
through random EQ boosts, TILT ends and DCY up to 127, as `pressure.py render` reports a dearest-knob
fixture. The run exercises the DSP side only: the firmware's own LFO and lock delivery, Part switches and
the ColdFire side are not in it.

## Resources

Cycles, one processor (DSP), per sample at 44.1 kHz in 16-frame blocks: one instance 468 static (worst
arm), 381.69 executed worst case; four per core 1,872 static against 3,120 usable per core
(`cycle_count.py` USABLE, which already leaves the stock share). Maximum configuration measured: eight
instances behind eight DJ EQs, 2,806.0 executed instructions/sample on the busier core. Executed
instructions are not chip cycles: no stall or contention is modelled, and the real-chip margin is
unmeasured.

Memory, exact, from the native build:

| Region | Space | Words | Bits | Bytes | Scope |
|---|---|---|---|---|---|
| Program, payload A (core 0), P:0x01252–0x01885 | dsp-p | 1,588 | 24 | 4,764 | shared |
| Program, payload B (core 1), P:0x01012–0x01645 | dsp-p | 1,588 | 24 | 4,764 | shared |
| State: X:(r7+$00..$83) of the stock instance block, cleared by init (127 used) | dsp-x | 132 | 24 | 396 | instance |
| Delay ring: the stock FX2 instance buffer, 16,369 of 16,384 used | dsp-y | 16,384 | 24 | 49,152 | instance |
| System stack during proc: the dispatcher's call plus one `do` or `bsr`, both cores | dsp-x | 24 | 8 | 24 | shared |
| Cloned FX2 descriptor (CPU flash 0x400D6B20) | cpu-flash | 416 | 8 | 416 | shared |
| REV OFF/ON formatter (CPU flash 0x400D6CC0) | cpu-flash | 52 | 8 | 52 | shared |

Per instance 49,548 bytes; shared 10,020; at the maximum of eight instances (FX2 on every track)
406,404 bytes. The program takes the space of SPRING REV and DARK REV (2,037 words up to PLATE REV's
helper; 449 stay free before it). The Y ring and the X block are the allocations the OS makes for every
FX2 effect; E-Verb adds no Y or X memory of its own, no heap and no SDRAM. No ColdFire code: the stock
pages publish its knobs. The chooser rows are rebuilt by the builder for every selection.

## Hardware

**Author: not tested.** The author's Octatrack MKII is broken. The owner later reports a MKII
functional audition on EVRB01T01; see [evidence/owner-hardware.md](evidence/owner-hardware.md). Before this version can be qualified, someone
with an MKI or MKII needs to flash a build containing E-Verb (the site's configurator once promoted, or
a local native build) and report, with model, OS, image SHA-256, date and duration:

1. E-Verb appears at the end of the FX2 chooser on audio tracks, SPRING REV and DARK REV are gone, and
   choosing it shows SIZE DCY ABSB / DPTH SPD MIX and, on SETUP, TILT PRE REV / EDCY ESIZ.
2. Sound: MIX 0 is dry; MIX 100 with a drum loop gives a reverb; DPTH left, right and above +48 give
   chorus, grains and shimmer; REV ON swells; SIZE sweeps glide without crackle; DCY 127 sustains; EDCY
   at +63 after a loud hit lets the tail ring and then fade.
3. Load: E-Verb on FX2 of all four tracks of one core, playing, with heavy FX1 effects (DJ EQ) on the
   same tracks; then all eight tracks. Any stuck step 1, crackle or silence is a failure.
4. Locks and LFOs on SIZE, DCY, DPTH, SPD and MIX; DPTH locked between +63 and −64 on alternate steps; a
   scene morph; Part switching with different SETUP values.
5. Two instances with different settings on tracks of both cores, both slots edited independently.
6. Save the project and the Part, reload both, then power-cycle: the knob values come back.

## OT UI capture evidence

`scripts/capture-module-ui.py` on the private image (b776efe2…) with `ot_emu` (9af97ff3…), MKII panel,
empty scratch card, stopped transport, key interval 150 ms. Plan, per-image hashes, the module's native
source hash and limitations: [media/capture.json](media/capture.json). The five captures are the FX2
SETUP page after choosing E-Verb, the main page at the defaults, MIX turned to 100, DPTH turned to +56
and the SETUP page with REV ON. Each was opened and checked against the declared controls. They show the
interface only, not sound.

## Release qualification accounting

[evidence/release-bounds.md](evidence/release-bounds.md) adds the full per-block software bound and
reserved X padding to the original loop-only/used-memory figures. It changes no DSP source or sound.
