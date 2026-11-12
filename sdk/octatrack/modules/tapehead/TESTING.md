# TapeHead testing

## 0.1.2-experimental: the input level (2 Oct 2026)

Everything in this section is for 0.1.2. The sections after it are the 0.1.1
record, kept as it was released.

| file | SHA-256 |
|---|---|
| `tapehead.asm` (0.1.2) | `d102114c6eb47a89bbd5f74cc601e53d0657e2d9abffe07a4ffcbec20e23fa12` |
| `tapehead.asm` heard as OCTABAM6 (level fix, before the cycle payback) | `c6896b3eebc21365db9d00f99ac46320e33e2d70890e92e9a1bde710f4f532b2` |
| `tapehead.asm` (0.1.1) | `eb30c36f76344df2e9e53a0cf397665a0203cd203573da13fcc4a45c1b92eda5` |

Base: Octamod `main` at `866ea9e` (after PR #42), the vendored DSP56300 tree at
pin `8ccdd843` with `tools/patches/dsp56300.patch`, Linux x86-64. Local MAIN OS
section SHA-256 `164f3122…0a84e` (the `stock_guard.py` fingerprint).

### Why

Heard on the unit with 0.1.1 (OCTABAM2): TapeHead saturates less than the
JSFX. The render gate said the arithmetic matched, and a re-run reproduced
0.1.1's 4.68e-4 exactly, so the difference is the level. The mixer model
(`sdk/octabam/docs/remixer/HARNESS.md`, measured under the ColdFire port)
applies AMP VOL as (v/127)² before the FX chain: at the default VOL 64 a
0 dBFS sample reaches the module at 0.254 FS. TapeHead's saturation depends on
level, and the JSFX is normally fed full-scale material in a DAW. Character's
TAPE mode met the same thing on 23 Sep 2026 ("much too subtle") and got
+12 dB of drive.

0.1.1 in `dsp_host`, a 0.89-amplitude 100 Hz sine scaled by 0.254, against the
JSFX on the unscaled sine (COLOR NORM, TRIM 18):

| DRIVE | 0.1.1 THD | JSFX THD | 0.1.2 THD |
|---:|---:|---:|---:|
| 36 | −33.7 dB | −11.1 dB | −11.0 dB |
| 70 | −21.7 dB | −8.8 dB | −8.8 dB (float model) |
| 100 | −12.7 dB | −8.3 dB | −8.3 dB (float model) |

### The change

`out = JSFX(4x) / 4`, a fixed +12.04 dB in and the same out, so the wet/dry
level relation stays the JSFX's. The state's existing /4 headroom absorbs the
×4, so the input costs four shifts and moves per channel. The JSFX's input clip
(on 4x) and output clip (on y) are limiting moves (`move a,x0` from an
accumulator in extension). `reference.py` gains `INPUT_GAIN` and `render()`
models the module; `render_jsfx()` is the plugin alone.

Those 12 instructions per sample were paid back in the recursion: each
multiply-then-add/sub became one `mac y1,y0,a` / `mac -y1,y0,b` (both
disassemble as signed; exact, since `mpy` leaves the full product and the add
is exact), and y1n/y3 go to y1 from the accumulator instead of being reloaded
from the word just stored (the same limiter either way). Against the OCTABAM6
source: **684 mono renders and a stereo render, bit-identical** (COLOR 0–2 ×
DRIVE {0, 36, 70, 127} × TRIM {0, 18, 127} × impulse/step/220 Hz–12 kHz at
three levels plus full-scale white noise).

### The render gate

`python3 verify.py` (same setup as below; about a minute):

```
assembled 422 words; init P:2000 proc P:2006
[PASS] tapehead_l is straight-line, one rts
[PASS] tapehead_r is straight-line, one rts
[PASS] no mpysu anywhere []
[PASS] COLOR 0: zero in, zero out
[PASS] COLOR 1: zero in, zero out
[PASS] COLOR 2: zero in, zero out
[PASS] peak error vs the float JSFX <= 0.001 (JSFX units) worst 5.38e-04 at COLOR/DRIVE/TRIM/signal/level (0, 0, 0, 1000, 'hot')
       meter: 274.1 instructions/sample (one instance, dsp_host)
[PASS] COLOR 1 renders MEDIUM, not BRIGHT error vs MED 1.1e-05, vs BRGT 8.9e-02
[PASS] stereo render == two mono renders, bit for bit
[PASS] DRIVE 36 at AMP VOL 64 saturates like the JSFX at 0 dBFS THD module -11.0 dB, JSFX -11.1 dB
all TAPEHEAD gates passed
```

Changes to the gate: error is measured in the JSFX's units (module error ×
`INPUT_GAIN`); every signal runs at −2 dBFS (input clip engaged) and at
0.22 FS (a normalized sample at VOL 64); gate 7 pins the THD match. Against
0.1.1's source gate 7 fails by 22.6 dB.

### Cycles and memory

`REMIX=tapehead-spring BUILD=7 XBUS=1 SPEC=1 python3 -B
tools/build/cycle_count.py --verify --json`: marker no-op identical,
**295 cycles/sample** (`tapehead_l` 137, `tapehead_r` 137 words/call), worst
core 1,180 with four FX2 instances. (OCTABAM6's source counted 301.)

The conservative block model of [cycles](evidence/cycles.md), same method:
16 × 295 + 3 × 422 + 144 = **6,130 code cycles/instance/block**; eight inserts
per core **49,040** against the 49,920 usable-work budget, 880 to spare (0.1.1:
6,000 and 48,000). OCTABAM6's 301-cycle source would have priced 49,952, over
the budget, which is why the payback was done before submitting.

Memory, as in [memory](evidence/memory.md): 422 P words per core, 844 words,
**2,532 bytes**; descriptor stride 416 and COLOR formatter 60 unchanged:
**3,008 shared bytes**; state/scratch unchanged at 31 X words (93 bytes) per
instance; **4,496 bytes** at sixteen inserts.

### Composed image and benchmark

`hardware-test-remix.py` as `remixes/tapehead-spring/remix.py`, `make image
REMIX=tapehead-spring BUILD=7` on `866ea9e`:

```
TAPEHEAD      P:0x01252..0x013f8 ( 422 words)  id 0x1f      (payload A)
TAPEHEAD      P:0x01012..0x011b8 ( 422 words)  id 0x1f      (payload B)
round-trip: payload ok, checksum ok
```

| artifact (local only, never committed) | SHA-256 |
|---|---|
| `out/mainos_bus.bin` (0.1.2, BUILD=7) | `774aa99723625fb698e5f0bb6fc32ea3196996931f55beb10ce1ec53eccc328b` |
| `out/OCTATRACK_OCTABAM7.bin` | `deef3808544729014eebcb611f4cb580f2848acacfa3d5a1c079837c7204b892` |
| `out/mainos_bus.bin` heard as OCTABAM6 | `2f1f98015e7e8c61f01bbe8cf9b3038e6ef1b44aa2c6b5c205ca0c4f2d37e3b9` |
| `out/OCTATRACK_OCTABAM6.bin` | `5405cd6c445095adfc77810c9b8c7a25cdf6726f097cb84918419ace952afc39` |

OCTABAM6 was built on `433fa32` with the draft layout; the same source on
`866ea9e` reproduces its MAIN OS byte for byte. The same setup reproduces
0.1.1's OCTABAM2 (`2f01f013…`) from 0.1.1's source.

On BUILD=7: `verify_menu` ALL CHECKS PASSED, `verify_initregs` 0 failures,
`verify_replaces --image` OK, `label_fmt` OK. `benchmark.py`'s runner on the
composed payloads renders TAPEHEAD within 6.0e-5 (JSFX units) of `reference.py`
at the defaults, L = R for mono input.

`REMIX=tapehead-spring python3 modules/tapehead/benchmark.py` (2,048 blocks,
executed instructions, not hardware cycles):

| case | 0.1.2 | 0.1.1 | SPRING REV |
|---|---:|---:|---:|
| one instance, fixed controls, per 16-sample block | 4,383 | 4,287 | 4,186 |
| one instance, per sample | 273.9 | 267.9 | 261.6 |
| four per core, fixed controls, peak per block | 17,532 | 17,148 | 16,744 |
| four per core, modulated, peak per block | 17,544 | 17,160 | 16,748 |
| four per core, worst of all splits, peak per block | 18,000 | 17,616 | 20,376 |
| init, per core | 24 | 24 | 380 |

### OT UI captures

`scripts/capture-module-ui.py` with 0.1.1's plan (`media/capture.json`) on
`ot_emu` SHA-256 `2360ffb2…5115` (built from `tools/emu/ot_emu`, pinned
`vendor/mc68k`; the binary the original draft captured with), MKII panel, empty
scratch card, transport stopped, the BUILD=7 image. location, controls and
COLOR MED are byte-identical to 0.1.1's `media/` PNGs and were reviewed; the
chooser frame again still shows DELAY before YES and is not used.

### Hardware

2 Oct 2026, devilfish707, Octatrack MKII:

- OCTABAM6 (MAIN OS `2f1f9801…`, the level fix before the cycle payback):
  "yes this works" after comparing with the JSFX, which 0.1.1 had
  under-saturated.
- OCTABAM7 (MAIN OS `774aa997…`, this source): "yes it sounds the same",
  about three minutes with TapeHead on seven tracks under p-lock automation
  and scene changes. No overload reported.

A listening report, not a stress run: no measured timing, memory canary,
recording or recovery test, and seven instances rather than the sixteen-insert
maximum. Record: [hardware](evidence/hardware.md).

### Release integration (5 Oct 2026)

The draft (PR #53, `sdk/drafts/tapehead` at `f890330`) moved into
`sdk/octabam/modules/tapehead/`; the catalog pins 0.1.2-experimental.
`evidence/parity.md` has the browser package and parity record.

- Browser packages: rebuilt from this source with `scripts/build-module-packages.py`
  and imported as a development build. Only the TapeHead DSP package (422
  words, `c54070fc…`) and the version pins changed; every other module's
  DSP, resident Character, descriptor, menu and platform record recompiled
  identically.
- `npm run check` was not run: the session's npm registry refused the app's
  packages. The repository's dependency-free checks and the TapeHead,
  package, composition and qualification tests were run under Node.


## Commands and exact revision (0.1.1)

Contributor results below used PR #42 source on top of Octamod `main` at
`433fa32c0f5b381cf5a71930dc45e121609b7f4d` (2 Oct 2026), with the vendored
DSP56300 tree built from `sdk/octabam/scripts/vendor.sh dsp56300` (pin
`8ccdd843`, `tools/patches/dsp56300.patch` applied) on Linux x86-64.

| file | SHA-256 |
|---|---|
| `tapehead.asm` | `eb30c36f76344df2e9e53a0cf397665a0203cd203573da13fcc4a45c1b92eda5` |
| octabam's `modules/tapehead/tapehead.asm` (before the fixes) | `097c6d2b066fda5596d2eab5568ca138ae276c12290d35606fe3809495d1ba02` |

### The render gate: `verify.py`

```sh
cd sdk/octabam
bash scripts/vendor.sh dsp56300
cmake -S vendor/dsp56300 -B vendor/dsp56300/build -DCMAKE_BUILD_TYPE=Release
cmake --build vendor/dsp56300/build --target dsp56kDisassemble dsp_asm dsp_host -j8
python3 modules/tapehead/verify.py
```

No firmware is read. `verify.py` assembles `tapehead.asm` at P:0x2000 and
runs it in `dsp_host` as one instance from a synthetic memory image: a no-op
frame-context routine (`-ctx 40,41,42`), 16-sample blocks, r7 = 0x6200,
r6 = 0x506, page-1 knobs as value << 16. It takes about 35 seconds.

Result on the revision above:

```
assembled 416 words; init P:2000 proc P:2006
[PASS] tapehead_l is straight-line, one rts
[PASS] tapehead_r is straight-line, one rts
[PASS] no mpysu anywhere []
[PASS] COLOR 0: zero in, zero out
[PASS] COLOR 1: zero in, zero out
[PASS] COLOR 2: zero in, zero out
[PASS] peak error vs the float JSFX <= 0.001 worst 4.68e-04 at COLOR/DRIVE/TRIM/signal (0, 0, 0, 1000)
       meter: 268.1 instructions/sample (one instance, dsp_host)
[PASS] COLOR 1 renders MEDIUM, not BRIGHT error vs MED 6.0e-05, vs BRGT 7.0e-02
[PASS] stereo render == two mono renders, bit for bit
all TAPEHEAD gates passed
```

Negative control: the same `verify.py` against octabam's unfixed source
fails two gates, peak error 1.62 (COLOR 1, DRIVE 127, TRIM 0, 4 kHz) and
COLOR 1 matching neither MEDIUM (4.0e-1) nor BRIGHT (3.7e-1) because the
other two defects also distort that render. With only the two arithmetic
fixes applied, COLOR 1 matched BRIGHT to 5.6e-5 and MEDIUM to 7.0e-2.

The 4.7e-4 residual is the polynomial fits of DRIVE and TRIM plus Q1.23
truncation. The peak sits at DRIVE 0, TRIM 0, 1 kHz, where the output is
loudest.

What this gate cannot see: the composed image, the real dispatcher, the
panel, placement beside other modules, and two cores. Those need `make check`
with the source now integrated, and the reported hardware operation.

### Contributor checks before the UI/qualification integration

With the draft copied to `sdk/octabam/modules/tapehead/` and a scratch
`remixes/test/tapehead/remix.py` (both removed afterwards):

- `REMIX=tapehead python3 tools/build/cycle_count.py`: **288 cycles/sample**
  (`bsr tapehead_l 133w/call, bsr tapehead_r 134w/call`). Four FX2 instances
  on one core: 1,152. With TAPEHEAD also on FX1, eight per core: 2,304,
  headroom 816 against 3,120 usable.
- `tools/remix/ledger.check` over CHARACTER, EUCLID, MINIVERB, MODULATION,
  SPECTRUM, TAPE ECHO and TAPEHEAD: no conflicts. No two modules share an FX2
  ID, priority 17 is unused, layout letter `4` is unused.
- `tools/remix/selftest.py`: `[PASS] tapehead: insert, tracks 1-8` and
  `every module declares category, author, author_url, proof`. The rest of
  the selftest needs remixes the SDK does not carry and was not counted.
- `octamod.module.json` parses with `parseModuleDocument`; publication is
  refused for missing OT UI captures and missing qualification, as intended.

### Disassembly

`dsp56kDisassemble` of the assembled blob: 14 `mpy y1,y0,a`, 5
`mpy y1,y0,b`, 10 `mpy x0,y1,a`, 4 `mpy x1,y0,a` and 2 `mpy x0,x0,a`,
all signed. poly6's negative coefficients sit in y0 of `mpy y1,y0`, which is
signed, so the open question octabam carried about them is closed.

octabam squared the knobs with `mpy x0,x1`, which encodes as `mpysu`.
Harmless there (t ≥ 0), but the Octamod build refuses any mpysu not in its
audit table, so both are now `mpy x0,x0` (2 words fewer, output unchanged:
verify.py's 4.68e-4 is identical before and after).

## What changed from the octabam build

Each was found by the render above and confirmed by fixing it alone.

1. **MIN stages returned 2 × min.** The branchless clamp is
   `max = (P + LO + |P − LO|) / 2`, then `min = (M + HI − |M − HI|) / 2`. The
   max had its `/2`; the six min stages did not. Smoothstep therefore saw
   twice the drive and was evaluated outside ±1, where `1.5v − 0.5v³` folds
   back towards zero, and the y3 output clamp passed 2 × y3. Fix: one
   `asr #$1,b,b` after each min stage (+6 cycles/sample).
2. **The g3 term was limited.** `|g3| · y3c` reaches 1.16 at full-scale y3.
   It was stored to r7 at full scale, where the store limits to 0.99999. The
   half is stored now and doubled in the accumulator before the subtract.
3. **COLOR's MED selected BRGT.** Page-1 values arrive as value << 16
   (`docs/remixer/HARNESS.md`; Mini Verb decodes its RATE select with
   `asr #$10`). COLOR was tested with `tst` (works for 0) and `sub #1` (never
   zero for 0x010000). It now subtracts 0x010000.

Effect on sound: the octabam build was louder and harsher than the JSFX.
At DRIVE 36 / TRIM 18 its peak output on a test mix was 0.80 against 0.62
now; at DRIVE 100 it hit full scale against 0.91 now.

## Stress and audio quality

A maximum-load hardware stress test was not run. The owner removed the mandatory
60-minute/eight-track requirement and accepted the contributor's functional
operation report. See [hardware evidence](evidence/hardware.md) for the statement
and its unknown model, duration, track count and coverage limitations.

## Resources

- DSP cycles: 288 cycles/sample per instance, static (`cycle_count.py`), the
  same at every setting. dsp_host meter: 268.2 instructions/sample. Neither
  is a hardware measurement; worst case under modulation in a composed image
  is reproduced in evidence/benchmark.md.
- DSP program: 416 words (1,248 bytes at 24 bits) in each payload's donor
  region (composed build report).
- DSP X: 31 words per instance (r7 + $00–$12, $20–$25, $30–$35), inside the
  dispatcher's own 256-word r7 block. No allocator buffer, no Y memory, no
  tables beyond immediates.
- ColdFire: 402-byte descriptor in a 416-byte stride and 60-byte COLOR formatter; no audio processing.

## Hardware

2 Oct 2026: the author flashed `OCTATRACK_OCTABAM2.bin` (SHA-256 above)
and reported that TapeHead works well on the unit. That is a listening
report: the panel model, project, duration and track count were not
recorded, and it is not a measured maximum-load stress pass. The octabam build heard on 12 Sep 2026 had different
arithmetic (see above).

## The hardware test image

`hardware-test-remix.py` (as `sdk/octabam/remixes/tapehead-spring/remix.py`,
with this draft copied to `sdk/octabam/modules/tapehead/`):

```sh
cd sdk/octabam
make image REMIX=tapehead-spring BUILD=2
```

Built 2 Oct 2026 from the author's own OS 1.40C (MAIN OS section SHA-256
`164f3122…0a84e`, the fingerprint `stock_guard.py` expects). The build
report:

```
TAPEHEAD      P:0x01252..0x013f2 ( 416 words)  id 0x1f      (payload A)
TAPEHEAD      P:0x01012..0x011b2 ( 416 words)  id 0x1f      (payload B)
region P:...  (1063 words)  used 416  FREE 647
donor ids (SPRING) -> null stub
TAPEHEAD      slot 2  COLOR prints NORM|MED|BRGT
out/mainos_bus.bin: 1,112,560 bytes, 2547 changed
```

| artifact (local only, never committed) | SHA-256 |
|---|---|
| `out/mainos_bus.bin` | `bb700652540fc42068d1f92791960fb3c86b672932d113f538776c2b1441a0f7` |
| `out/OCTATRACK_OCTABAM2.bin` | `2f01f0136755e0d37a9a320eb3ae38be1fe634df4cfff8799a956b5fad1d6942` |
| `out/OCTATRACK_OS1.40C_OCTABAM2.syx` | `1817eeae554395d379b0ff92d0cf42eec377b8c80c36630aba43266907b228f5` |

`make_bin.py` round-trips the card image (payload and checksum ok). Gates run
on this remix:

- `verify_menu.py`: ALL CHECKS PASSED (TAPEHEAD's three drawn names are the
  manifest's; SPRING's own descriptor unchanged).
- `verify_initregs.py`: TAPEHEAD's init preserves r1.
- `verify_replaces.py --image`: every stock id is stock's.
- `label_fmt.py`: COLOR's label cave verifies (60 B, NORM MED BRGT).
- `cycle_count.py`: 288 cycles/sample; worst core 1,152 (four FX2 slots).
- Not runnable in the SDK: `verify_dirtystate.py` (needs the absent `send`
  module), `verify_slots.py` (needs `busverb`), and the ColdFire-port gates
  that need the `.venv`.
- Composed-image render: `benchmark.py`'s TAPEHEAD dump, one instance at the
  defaults, is within 3.9e-5 of `reference.py`, L = R for mono input.

## TapeHead against SPRING REV: `benchmark.py`

```sh
cd sdk/octabam
REMIX=tapehead-spring python3 modules/tapehead/benchmark.py
```

It reuses `tools/harness/benchmark_reverbs.py`'s runner, which measured Mini
Verb against the stock reverbs: both cores from their real payloads (stock
SPRING REV from the untouched 1.40C, TAPEHEAD from the image above), four FX2
slots per core at the real r7 stride, 16-sample blocks, 2,048 blocks per
case. "Modulated" moves every active control every block; the `split` cases
cover all 16 trigger-split positions. The unit is **executed DSP
instructions**, not hardware cycles: the meter leaves out the dispatcher,
ColdFire work, DMA and memory stalls.

| case | TapeHead | SPRING REV |
|---|---:|---:|
| one instance, fixed controls, per 16-sample block | 4,287 | 4,186 |
| one instance, per sample | 267.9 | 261.6 |
| four per core, fixed controls, peak per block | 17,148 | 16,744 |
| four per core, modulated, peak per block | 17,160 | 16,748 |
| four per core, worst of all splits, peak per block | 17,616 | 20,376 |
| per core, per sample, worst | 1,101 | 1,273.5 |
| init, per core | 24 | 380 |

SPRING REV's worst, 20,376, is the figure the Mini Verb benchmark recorded
for pristine 1.40C on 20 Sep 2026, so the two runs agree. At equal settings
TapeHead costs about 2% more than Spring at its defaults; Spring's costlier
types and split paths make its worst case 16% higher than TapeHead's, which
costs the same at every setting.

Memory:

| | TapeHead | SPRING REV |
|---|---:|---:|
| DSP program, per payload | 416 words | 1,063 words |
| FX2 instance buffer (allocator) | none | 16,384 words per instance slot |
| per-instance state | 31 words of its r7 block | not measured |
| ColdFire | cloned descriptor, 60 B label cave | stock descriptor |

## OT UI capture evidence

`scripts/capture-module-ui.py` on `ot_emu` (SHA-256 the exact hash in `media/capture.json`, built
from `tools/emu/ot_emu` with the pinned `vendor/mc68k`), MKII panel, empty
scratch card, transport stopped, the image above. Plan and hashes:
`media/capture.json`. Reviewed:

- `media/ot-location.png`: FX2 SETUP after YES, TAPEHEAD highlighted in the
  row after PLATE REV, no SETUP controls.
- `media/ot-controls.png`: the FX2 main page, DRIVE, TRIM, COLOR, footer
  `FX2▸TAPEHEAD`.
- `media/ot-color.png`: COLOR turned once, printing MED with the tick widget.

The emulator boots the image and draws the chooser and page. This is UI
evidence only: it is not a hardware or audio test.


## Publication evidence, 2 October 2026

The owner accepted the author-reported listening/parameter-lock test and removed
the mandatory 60-minute, eight-track stress requirement. This version includes
the exact same DSP instructions as the reported hardware image; its hash was
reproduced locally. Model, duration and maximum hardware workload remain unknown.
See [the actual report](evidence/hardware.md), [worst-case code-cycle model](evidence/cycles.md),
[exact memory inventory](evidence/memory.md) and [reproduced full benchmark](evidence/benchmark.md).
The static model prices eight inserts per core, including split/reselection
overhead; it is not a chip wall-clock measurement or a hardware maximum-load pass.
Fresh actual monochrome LCD captures were reviewed in the MKII emulator.

The algorithm is the **JClones VladG TapeHead clone**, pinned to JSFXClones
`88a1503d668c378ced4c166e772378272f3b72ea`, [original JSFX](https://github.com/JClones/JSFXClones/blob/88a1503d668c378ced4c166e772378272f3b72ea/jsfx/JClones_TapeHead.jsfx).
JClones is credited for the original implementation, devilfish707 for the port,
and Sam Banks for the SDK. Full MIT notices accompany the source and site.
The inspected source does not establish an Airwindows derivation.

## Browser release integration

The 0.1.1-experimental publication preserves the corrected DSP and manifest
from c53daa9. The 512-profile original-module matrix, 224 requested-module
profiles, 48 approved-utility profiles, actual browser build fingerprint and
reproduction commands are recorded in [native/browser integration](evidence/parity.md).
Those records contain only fingerprints, lengths, menu facts and refusal
reasons. The contributor's initial missing-qualification rejection above is
historical; the current version includes the required source/cycle/memory/UI
records and the owner-accepted functional hardware report.
