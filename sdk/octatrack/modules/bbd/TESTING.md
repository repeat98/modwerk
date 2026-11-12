# BBD Delay testing

The software evidence here comes from the octabam native toolchain
(`dsp_asm`, `dsp_host`) and a private image built from my own OS 1.40C MAIN
OS. 0.1.1 ran over USB on the owner's Octatrack MKII and the author played
0.1.0's card image on an MKII; see [Hardware](#hardware). Firmware, images, dumps and renders stayed outside the
repository.

## 0.1.2-experimental: the buffer claim is what BBD uses (30 October 2026)

`buffer_words` drops from 16,384 to 0x203A (8,250), as octabam has had it since sambanks/octabam#783: BBD reads and writes its FX2 slot's Y buffer only at +$0000..+$0FFF (the ring, at most 4,095 words, and the 4,096-word clear on an STGS change or reset) and +$2000..+$2039 (the 58 filter coefficients); TIME changes how often the ring advances, not how far it reaches. The author confirmed the extent and agreed to the change ([#1064](https://github.com/repeat98/modwerk/issues/1064)). The DSP and ColdFire code are unchanged, and so is the native card image of BBD alone (MAIN OS `bd2015f2…`, built from main before and after this change).

Why now: the base's key bus moves to Y $7E00-$7FFF, the tail of the first internal FX2 slot, with Sidechain Compressor 0.2.1. With the full-slot claim, BBD would be refused on T1 and T5 FX2 while Sidechain Compressor or Sidechain Ringmod is installed; with 8,250 words it stays clear of the bus by more than 7,600 words.

- **Hardware (card):** the author of Sidechain Compressor flashed Modwerk's native image of BBD Delay with Sidechain Compressor 0.2.1 (MAIN OS `c234d13ce64efdf96a8843065feaf1c400f4d9ada081a680d557d639d112019f`, `MW_BBDSC`) on his MKI, 30 October 2026: BBD on T1, T5 and T3 FX2 beside a keyed compressor, at maximum TIME, STGS 4096 and FRZ, clean, and the compressor still ducks ([evidence/sidechain-pair-hardware.md](evidence/sidechain-pair-hardware.md)).
- **Card builds with Sidechain Compressor:** the full-slot claim met Sidechain Compressor's cross-core key window (the last 514 words of the T3/T7 slots), so `modules:pairs` refused the pair; with 8,250 words it builds (`compatibility-pairs.json`: the bbd+sidechain-compressor entries are gone in all three contexts).
- **USB:** the package changes only in its buffer claim (`buffer` 8,250; package `58b77069…`); not run on a unit in this version.

## Commands and exact revision

Every run below used this folder's `bbd.asm`, `manifest.py`, `bbd_ref.py`,
`verify.py` and `perf.py` (the source fingerprint in the manifest's
qualification record). The run tree is a disposable copy of this repository's
`sdk/octabam` with the module at `modules/bbd` and `vendor/` plus
`out/raw/section_3_MAIN_OS.bin` linked from a native octabam checkout.

```sh
python3 modules/bbd/verify.py                         # render gates on a private image
python3 tools/harness/benchmark_stock_dsp.py          # stock baseline, 4,096 blocks
python3 modules/bbd/perf.py bench  <out>               # matched benchmark
python3 modules/bbd/perf.py stress <out> --seconds 32  # stress
npm run module:verify -- bbd --os <OCTATRACK_OS1.40C.bin>   # browser builder against native octabam
npm run perf:audit -- check evidence/performance.json
```

The private image is the native build of BBD beside the stock effects, as the
site places it: BBD in the space of SPRING REV and PLATE REV, every other stock
effect kept, and the stop kill's hook at `0x40004d0c` (0.1.1: MAIN OS SHA-256
`e648cee078b70174f250ae61830f644a151ab07f3d553578ae6577c5a1ffa1b9`; 0.1.0's,
which the author played, was `bc53d1b3…`; stock MAIN OS
`164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`). The
browser builder reproduces it byte for byte (`sdk/native-comparisons/bbd.json`,
the BBD-only selection with stock FX2 kept). BBD sits at `P:0x01000..0x01458` on
payload A and `P:0x00dc0..0x01218` on B: 1,112 words. SPRING REV alone would
hold it, but DARK REV calls a 35-word routine at SPRING REV+820; BBD starts at
PLATE REV's base and ends before it (the `stock` gates).

## Render gates (`verify.py`)

All 52 pass:

```
[PASS] source: init leaves r1/n1/m1 alone
[PASS] source: static cycles: 378 cycles/sample per instance (the tick path), 4 per core = 1512 of 3120; marker no-op True
[PASS] placement: payload A: BBD P:0x01000..0x01458 (1112 words) in P:0x01000..0x01679
[PASS] placement: payload B: BBD P:0x00dc0..0x01218 (1112 words) in P:0x00dc0..0x01439
[PASS] dry: MIX 0 is the input sample for sample (static): 0 of 48000 words differ
[PASS] dry: MIX 0 is the input sample for sample (moving knobs): 0 of 48000 words differ
[PASS] dry: MIX 0 is the input sample for sample (moving knobs, split 5): 0 of 48000 words differ
[PASS] reference: TIME 0: -73.0 dB against bbd_ref (limit -60), peak -8.1 dBFS
[PASS] reference: TIME 64: -70.3 dB against bbd_ref (limit -60), peak -8.2 dBFS
[PASS] reference: TIME 127: -57.1 dB against bbd_ref (limit -50), peak -8.3 dBFS
[PASS] reference: TIME 32, STGS 1024: -70.9 dB against bbd_ref (limit -60), peak -8.1 dBFS
[PASS] reference: TIME 96, STGS 1024: -59.0 dB against bbd_ref (limit -50), peak -8.2 dBFS
[PASS] reference: MIX 64: -73.4 dB against bbd_ref (limit -60), peak -6.9 dBFS
[PASS] reference: FDBK 80: -72.7 dB against bbd_ref (limit -40), peak -8.1 dBFS
[PASS] reference: FDBK 90, TONE 127: -67.8 dB against bbd_ref (limit -40), peak -8.1 dBFS
[PASS] reference: FDBK 70, TONE 0: -72.9 dB against bbd_ref (limit -40), peak -8.1 dBFS
[PASS] reference: FDBK 40, TONE 0, FREQ 0: -73.1 dB against bbd_ref (limit -40), peak -8.1 dBFS
[PASS] reference: FDBK 40, TONE 0, FREQ 127: -72.7 dB against bbd_ref (limit -40), peak -8.1 dBFS
[PASS] reference: FDBK 40, FRZ 64: -69.9 dB against bbd_ref (limit -40), peak -13.5 dBFS
[PASS] reference: FDBK 100, TONE 0, LIM 120: -60.5 dB against bbd_ref (limit -40), peak -8.1 dBFS
[PASS] reference: MIX 32: -78.2 dB against bbd_ref (limit -60), peak -6.9 dBFS
[PASS] reference: MIX 96: -71.3 dB against bbd_ref (limit -60), peak -9.6 dBFS
[PASS] reference: HPF 1 (20 Hz): -67.8 dB against bbd_ref (limit -60), peak -8.0 dBFS
[PASS] reference: HPF 64: -71.7 dB against bbd_ref (limit -60), peak -8.1 dBFS
[PASS] reference: HPF 127 (400 Hz): -71.2 dB against bbd_ref (limit -60), peak -10.6 dBFS
[PASS] splits: split 1 matches the model split alike: -72.5 dB
[PASS] splits: split 7 matches the model split alike: -72.5 dB
[PASS] splits: split 15 matches the model split alike: -72.5 dB
[PASS] stages: STGS 4096 -> 1024 -> 4096 mid-signal matches the model: -69.8 dB through two fades and clears
[PASS] stages: the same with TIME moving every block matches the model: -70.9 dB
[PASS] kill: matches the model through the kill and its release: -74.4 dB
[PASS] kill: the input exactly while it holds: 0 of 41600 words differ
[PASS] kill: no tail after its release: peak -102.4 dBFS
[PASS] kill: without the kill the tail still rings after block 3316: peak -44.0 dBFS
[PASS] freeze: FRZ 127 mid-signal matches the model: -70.4 dB
[PASS] freeze: the frozen loop sustains: peak -32.1 dBFS 1 s after the freeze, -31.9 dBFS at the end
[PASS] freeze: a 0.5 s crossfade to FRZ 127 keeps a self-oscillating loop's level: -32.8 dBFS RMS before, -32.9 frozen (-0.0 dB; LIM 127, TONE 0)
[PASS] freeze: FRZ 100 with TONE 0 and FDBK 20 lengthens the trails without droning: -138.5 dBFS RMS 8.5-10 s after a 0.25 s burst (limit -70)
[PASS] idle: FDBK 90, the last 0.5 s of a 9.5 s tail: -114.4 dBFS
[PASS] idle: FDBK 10, TONE 0, the last 0.5 s of a 9.5 s tail: -132.5 dBFS
[PASS] idle: FDBK 127, TONE 0, LIM 0 self-oscillates, bounded below full scale: peak -0.33 dBFS, last 0.5 s -2.6 dBFS RMS
[PASS] idle: FDBK 127, TONE 0, LIM 127 self-oscillates, bounded below full scale: peak -6.49 dBFS, last 0.5 s -32.5 dBFS RMS
[PASS] idle: LIM 127 settles the oscillation at least 8 dB under LIM 0 (off): 29.9 dB quieter
[PASS] isolation: eight instances under -guard 0x4000 -guard-shared -dirty 0x5a: 8 instances guarded, 0 stray regions, 0 clobbers
[PASS] isolation: each instance alone renders bit-identically: 8 of 8 identical
[PASS] garbage: on silence, a garbage block renders exactly as a zeroed one, below -100 dBFS: 4 fills x 2 knob sets, 600 blocks, Y dirty too; loudest sample 2 LSB (-132.5 dBFS): the bucket noise
[PASS] garbage: a tone from a garbage block starts like a zeroed one: first 256 blocks peak within 1 dB
[PASS] zipper: no block-rate step on any continuous knob: 8 knobs, then TONE inside the loop; jump up / jump down / turn, move/static dBFS above; flagged none
[PASS] stock: DARK REV on core A (fixed) renders as on the stock OS: 0 of 176384 words differ
[PASS] stock: DARK REV on core A (moving) renders as on the stock OS: 0 of 176384 words differ
[PASS] stock: DARK REV on core B (fixed) renders as on the stock OS: 0 of 176384 words differ
[PASS] stock: DARK REV on core B (moving) renders as on the stock OS: 0 of 176384 words differ
```

Notes on the limits:

- **Slow clocks.** The cutoff is 1.7 kHz there, and 24-bit DF1 state noise in
  the anti-alias and reconstruction cascades sits about 56 dB under the
  signal. The residual is broadband below the cutoff, and its in-phase gain
  error is −66 dB, so it is noise, not a response difference.
- **Feedback cases.** These get −40 dB because feedback recirculates every
  difference; they measured −72 to −74 dB.
- **Idle.** The FDBK 10 case runs at TONE 0. That boost is +9 dB; measured on
  `bbd_ref.py`, a full TONE (either end, any FREQ) rings on from FDBK ~39-43,
  and TONE centred keeps a 60 dB tail past 6 s from FDBK ~103.
- **Garbage start.** It is judged as `verify_dirtystate.py` judges it: a
  garbage start must render exactly as a zeroed start and stay below −100 dBFS.
  For about 0.2 s after a reset, the bucket noise, lifted by the
  compander's warm start, leaves at most 2 LSB from either start.

- **HPF at 20 Hz.** The section's poles sit so close to DC that plain rounding
  lifts its noise about 40 dB (−42.6 dB against the model). It feeds its
  truncation back into the next sample; with that, −67.8 dB.
- **Stop-kill input.** The `kill` gates zero the hidden slot 11 for 1,300
  blocks, as `stopkill.s` does while STOP, STOP, STOP holds the track.
- **Resets with TIME moving.** Since 0.1.1 the clock sections a reset needs are
  built in the clear call before it, for TIME's value then. The second `stages`
  gate moves TIME every block across both resets and matches the model (which
  does the same). Against 0.1.0 the output is bit-identical in every
  `perf.py bench` case (45) and in the first `stages` render; with TIME moving
  every block it differs by at most 520 LSB (-84.2 dBFS) after the first reset.

## Native comparison (`module:verify`)

On my own 1.40C file, against native octabam (0.1.1): of BBD's 130 selections,
53 module-owned images match (all outside the platform writes, which now carry
BBD's stop-kill hook) and 77 refusals agree; 0 mismatches. `npm run modules:pairs` runs
octabam's ledger on BBD alone and beside every other module, in each pair
context: no clash. BBD declares no conflicts. Analog BD's native verifier passes
against the build with BBD in it (162 native comparisons, 50 matching
refusals, 6 complete firmware round trips).

## Sound quality (`fx:audit`)

0.1.1's output is bit-identical to 0.1.0's except across a reset with TIME
moving (above), so these tables still describe it. Measured on an earlier source (BBD12/BBD13: wet only, MIX 127, FDBK 0, TONE
64, STGS 4096, the then PRE and POST OFF) and not re-run on this one. With HPF
at 0 this source branches around the high-pass as the earlier one branched
around PRE and POST, and the rest of the wet chain is the same code, so the
tables should still hold; that is an inference, not a measurement.

BBD, TIME 0 (clock 20.5 kHz, cutoff 6.8 kHz):

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db           -12.4      -44.8     -44.1     -25.2     -90.4       0  FAIL
tone-1100hz-1db             -3.1      -24.3     -44.0     -25.1     -85.0       0  FAIL
tone-2701hz-12db           -13.3      -55.5     -24.2     -17.5     -91.6       0  FAIL
tone-2701hz-1db             -4.1      -45.0     -24.5     -17.6     -96.1       0  FAIL
tone-5301hz-12db           -18.1      -68.0     -20.3      -8.1    -103.2       0  FAIL
tone-5301hz-1db             -8.8      -68.1     -20.3      -8.1    -100.8       0  FAIL
tone-9102hz-12db          -103.5      -69.1      20.1      23.3    -124.1       0  FAIL
tone-9102hz-1db            -93.5      -79.8      19.9      22.9    -120.4       0  FAIL
idle                    after the input stops: idle activity of 2 LSB value(s), peak -132.5 dBFS  NOTE
```

BBD, TIME 127 (clock 5.1 kHz, cutoff 1.7 kHz):

```
signal                  out dBFS  harmonics  aliasing  residual   DC dBFS   rails  verdict
tone-1100hz-12db           -24.4      -52.5     -37.0      -9.5     -92.6       0  FAIL
tone-1100hz-1db            -14.7      -52.4     -36.5      -9.3     -85.4       0  FAIL
tone-2701hz-12db          -114.4      -52.9     -12.8       2.9    -139.5       0  FAIL
tone-2701hz-1db           -103.5      -63.9      -7.2       7.5     <-140       0  FAIL
tone-5301hz-12db          -114.3      -64.0     -31.7     -25.3     <-140       0  FAIL
tone-5301hz-1db           -103.4      -75.8     -32.8     -21.4     <-140       0  FAIL
tone-9102hz-12db          -114.3      -76.1     -32.5     -32.7     <-140       0  FAIL
tone-9102hz-1db           -103.4      -75.5     -15.9     -23.5    -139.7       0  FAIL
idle                    after the input stops: idle activity of 2 LSB value(s), peak -132.5 dBFS  NOTE
```

The aliasing limit (−60 dBc) fails, and that is intended: a bucket brigade is
a sampler clocked at 5–20 kHz, and the charge-transfer curve bends the held
samples, so its harmonics fold at the clock rate. Tones above the clock-third
cutoff are removed: their "dBc" compares leftovers with a fundamental 80–140 dB
down. DC passes everywhere (−80 to −139 dBFS against −60), nothing touches
the rails, and idle is 2 LSB of bucket noise.

## Performance

`perf.py bench` runs E-Verb's method: `benchmark_reverbs.run` as
`benchmark_stock_dsp.py` runs it, one instance per core at positions 0 and 4,
audio at X:0, 4,096 blocks, the null stub (67) subtracted. It covers BBD on the
private image and SPRING REV, CHORUS and DJ EQ on the stock image, through the
same cases: fixed, the moving-knob pattern (it reaches every STGS) and a trig
split at every position 1–15. BBD adds the dearest settings with splits and 18
TIME/STGS/FDBK corners. The unsplit stock figures reproduce
`benchmark_stock_dsp.py` exactly.

| effect | worst unsplit | worst with splits |
| --- | ---: | ---: |
| **BBD** | **363.06** | **399.31** (dearest, split 1) |
| SPRING REV | 257.50 | 314.19 |
| CHORUS (closest stock in function: a BBD-style line) | 253.62 | 293.06 |
| DJ EQ (the dearest stock effect) | 293.38 | 330.94 |

Executed instructions per sample, not chip cycles. The static loop is 378
cycles (`cycle_count.py`, the tick path, HPF on), so four per core take 1,512
of the 3,120 usable. BBD is 1.27× SPRING REV and 1.36× CHORUS with splits, and
dearer than every stock effect. At the defaults (HPF 0, fixed knobs) it
measures 326.44. 0.1.0 measured 439.44 with splits and 405.00 without: after a
reset it rebuilt all nine clock sections in the first call that plays audio,
and a split put a second full call in the same block. 0.1.1 builds them in the
dry clear call before the reset, so the worst case is now a steady split call
pair with HPF on.

The extra buys full filter orders: 8th-order anti-alias and 9th-order
reconstruction, both tracking the clock, about 90 words of the loop. It also
buys a 24-step divide a sample for the compander, with the Padé tanh folded
into it. Earlier passes already cut it: FDBK and TONE glide once a call, one
filter section per call follows the clock instead of all nine, and a
bookkeeping pass with bit-identical output. Going further means lower filter
orders, which would change the sound.

**Stress** (`perf.py stress --seconds 2`, 104 s of host time, on the 0.1.1 image; 0.1.0 ran 32 s. Since 15 October 2026 the audit asks for 2 s, the owner's limit on test length). E-Verb's
load, driven straight into `dsp_host` on the private image, because
`stress_project.py` needs a template Octatrack project that isn't available
here:

- BBD on FX2 of all eight tracks (four per core), behind CHORUS on every FX1.
- Per block, three LFOs (sine, triangle, square) on TIME, FDBK and MIX.
- Each sixteenth at 120 BPM, a new random value on all 17 named slots: BBD's
  nine and CHORUS's eight. 12 can be locked on a unit; STGS, LIM, HPF, TAPS
  and FBLP are SETUP knobs. This forces BBD's fade-and-clear again and again.
  Unnamed slots keep their defaults (BBD's hidden slot 11 at 127; a first run
  left it at 0 and held every BBD in its kill path, so it was discarded).
- Trig splits of 1, 3, 7, 8, 12 and 15 frames on six tracks.
- Eight stems: drums, a chord, noise bursts, a sweep, a full-scale square,
  impulses, DC steps and plucks.
- `-guard 0x4000 -guard-shared -dirty 0x5a`.

Result: no hang; BBD's eight instances 0 stray writes and 0 clobbers, and no
instance clobbers another. The guard also counts 13,320,219 stray-write
regions for the stock CHORUS instances, not examined further. Per-core peak
2,695.4 and 2,697.9 executed instructions per sample with all sixteen effects.
It exercises the DSP side only: the firmware's own LFO and lock delivery, Part
switches and the ColdFire side are not in it.

`npm run perf:audit -- check evidence/performance.json` (Node 24):

```
✓ record          dsp record for bbd@0.1.1-experimental
✓ cycles          4 x 378 = 1512 of 3120 per sample per core (48%), measured 399.31 per instance
· stock benchmark 399.31 vs CHORUS 293.06 (1.36x); the dearest stock effect is 330.94; justified in the record
✓ stress          4 per core, eight tracks, 3 LFOs and 17 locked slots, 2 s, no clobber, no hang
```

What stays free: four BBDs on one core leave 1,608 of the 3,120 usable static
cycles for the four FX1 effects on those tracks and any other module on that
core. Real-chip headroom is unmeasured.

`evidence/bench.json` and `evidence/stress.json` are the raw records. They
hold image hashes only: no firmware, dump or audio.

## USB loader

0.1.1's USB package (`public/octatrack-modules/bbd/0.1.1-experimental.mwrm`,
ABI 8, 5,322 bytes, `614bf23b…`) declares 400 executed instructions a sample.
The beta base charges an emulator figure at 7/4, 700, against the 726 one
instance may take beside seven stock slots, so it is admitted; 0.1.0's 440 was
charged 770 and refused. The package is pinned to BBD's card effect id, 14, and
subscribes to the base's `ev_tail_kill` event (`runtime.json`), which replaces
the card build's hook. It carries no stock-code sites, and the publisher's
scans find no run of stock bytes (longest 9 of 12). On the owner's MKII it
installed, ran on both cores and cut its tail on STOP, STOP, STOP
([Hardware](#hardware)).

## Stock flows

From the build, and on the unit BBD DELAY was chosen from the end of the FX2
chooser:

- The FX2 chooser gains BBD DELAY at the end and loses SPRING REV and PLATE REV.
- DARK REV stays and renders bit-identically to the stock OS on both cores,
  fixed and moving (the `stock` gates), and works on the unit.
- The FX1 chooser is unchanged.
- No other page, gesture or stock behaviour is touched. STOP, STOP, STOP cuts
  BBD's tail as it cuts the stock reverbs' (since 0.1.1).

## Hardware

**0.1.1 over USB** on the owner's MKII, 15 October 2026, driven by Claude
Code with the owner's permission: the package on a RAM-booted development twin
of the beta base with `ev_tail_kill` (`e429b787…`). Installed; picked on T1,
T2 (core 1) and T5 (core 0); a second instance on core 0 refused by the DSP
budget, as designed; in a bank whose Part keeps DARK REV on T5-T8 core 0 had no
room (DSP MEMORY FULL, 853 free words); a Part switch away and back kept every
knob; removal refused while in use, taken when not, then the Part played dry
with BBD listed missing until a reinstall restored it; the base's self-test
passed. STOP, STOP, STOP zeroed BBD's slot 11 in its track's frame record and
cut a ringing tail (FDBK 100) to -132 dBFS, where a single STOP left it
ringing for 4.5 s; the track's next trig released it. One instance cost
453-469 chip cycles a sample at the defaults and 527 at the dearest settings
(the base's idle counters). Not covered: project save and reload, a power
cycle, MKI, and the card build's hook on hardware. Details in
`evidence/usb-hardware.md`.

**0.1.0, card build.** Functional report by the author (JamCones), not a formal qualification.

**Release image BBDMW2** (`bc53d1b3…`), Octatrack MKII, OS 1.40C, 14 October
2026, about ten minutes: DARK REV still works on FX2; two BBD instances at once
on T1 and T5 (one per DSP core); HPF and STGS working; a Part reload and a
project save and reload restore the saved settings after unsaved edits; the
saved project comes back after a power cycle; every main-page and SETUP
parameter played, with LFOs on every parameter that takes one and trigless
locks. Details in `evidence/author-hardware.md`.

Earlier private images (11 and 12 October 2026):

- **BBD01–BBD02:** BBD on T5 worked, sounded like a BBD and followed scenes.
  On T1 it crackled, and STGS changes made artefacts and then silenced tracks
  1–4 (core B). BBD on T2, T3 and T4 at once did not crackle. Cause and
  diagnosis are in `REP_DIVIDES.md`.
- **BBD03:** with every `rep` replaced by a `do` loop, no crackle on T1 with or
  without a kick playing, none with PHASER on FX1, STGS changes clean on T1 and
  T5 with tracks 1–4 still playing, and a heavier existing project fine.
- **BBD04–BBD09:** FRZ, FREQ, the ±9 dB TONE, LIM and the MIX curve played as
  intended; LIM's orientation, range and default were set by ear on the unit.
  No problem clipping at MIX 64.
- **BBD10:** PRE and POST sound as intended, with no switch-on thump and no
  crackle.
- **BBD11:** sounds fine; no change heard from BBD10.
- **BBD13** (includes BBD12, not played separately): no issues; FRZ works as
  intended.
- **BBD14** (`ffe65ea1…`, fixed 150 Hz PRE/POST switches, STGS default 4096, LIM on SETUP B): BBD as on BBD13 with no T1
  crackle; DARK REV works on FX2; the FX2 chooser has no SPRING REV or PLATE
  REV; two BBD instances at once; a Part or project save and reload; eight
  instances (FX2 on all eight tracks, four per core) for 30 minutes with
  feedback and modulation running on every track; a saved project restored
  after a power cycle, settings intact; FREQ swept end to end by an LFO; FRZ
  and every other control played through the crossfader.
- **BBD14E**, BBD with E-Verb as the site builds it (`faf93562…`, equal to its
  native record; all three stock reverbs given up): both effects working. An
  extra combination check.

Not reported on 0.1.0's image: MIDI/USB load, recovery, hardware canaries,
wall-clock timing and an MKI.

## OT UI capture evidence

`scripts/capture-module-ui.py` used the headless `ot_emu` (MKII panel, empty
scratch card, stopped transport) on the 0.1.1 image above; the three captures
are byte-identical to 0.1.0's. It captured
`ot-setup.png`, `ot-main.png` and `ot-feedback.png`; hashes and the panel plan
are in `media/capture.json`. The STGS knob draws with the OS's select icon.
UI captures say nothing about audio or hardware.
