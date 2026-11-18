# LOFI2: testing record

Module version `0.1.1-experimental`. Source: octabam `modules/lofi2` at commit `7795adf0dff8c650968ff53ab5ab47babaf00ffe` on upstream `main`, the merge of the author's pull request 843 (re-pinned 21 October 2026; see [0.1.1](#011-re-pin-to-octabam-7795adf0-here-21-october-2026)). 0.1.0-experimental was pinned at `8250be0c23ca0a0a953cb7e5721e3bdb98dadfe5` (re-pinned 20 October 2026; see [the re-pin](#re-pin-to-octabam-8250be0c-here-20-october-2026)). Until then it was pinned at `21f6de905df71c2d7e4faba6cc7b5c7f7fb53de7`, on upstream `main` since pull request 704 ("LOFI2: 654 -> 414 cycles/sample in SHIFT; eight instances fit", Bryan T) was merged on 13 October 2026 as `fb5daa9766f1af1f61207c6baae056347a2edcd5`. It is the merged LOFI2 (`a6f41a1dff922be622e2e8a7d93bc5a5958c90ab`, pull request 657) plus the author's optimisation and its review fixes. The Modwerk adaptations are listed in README.md.

Pin history of this import: `a6f41a1d`, then `e8665fae` (pull request 704's head while it was open), then `21f6de90`, then `8250be0c` (0.1.0), then `7795adf0` (0.1.1). `21f6de90` differs from `e8665fae` in one instruction form in `lofi2.asm` (the Hilbert parity toggle, `eor #$20,a` became `move #>$20,x0` / `eor x0,a`), comments, the README and ten new SHIFT checks in the verifier. 36 `dsp_host` renders of the two builds (2 s each, both payloads, 16- and 13-sample blocks, eight fixed settings and a moving-knob schedule with MODE switches) are bit-identical. The build, gates, cycle count, benchmark, stress run, fit probes and screenshots below were rerun on `21f6de90`; the fx:audit, idle and master-track renders were made on `e8665fae` and rest on that bit-identity.

Recorded 12 and 13 October 2026. The import is based on `main` at `e9186eb3`, which contains the Elekloader migration (pull request 464).

Everything below marked **here** was run for this import, in the emulator and `dsp_host` on a computer. 0.1.1 ran once over USB on the contributor's MKII (22 October 2026, by ear); it and the earlier sources' hardware runs are in [evidence/hardware.md](evidence/hardware.md) and [Hardware report](#hardware-report-13-october-2026). Everything marked **upstream** is the author's own report, quoted with attribution, and applies to his octabam images, not to this build.

## 0.1.1: re-pin to octabam 7795adf0 (here, 21 October 2026)

Bryan T's pull request 843 (merged 21 October 2026 as `7795adf0dff8c650968ff53ab5ab47babaf00ffe`) answers [octabam issue 825](https://github.com/sambanks/octabam/issues/825), the self-sustaining SHIFT feedback recorded under the 0.1.0 re-pin below. Between `8250be0c` and `7795adf0` upstream changed only `modules/lofi2/lofi2.asm`, `modules/lofi2/README.md` and `tools/verify/verify_lofi2.py` for LOFI2; `manifest.py`, the test remix and the licence are byte-identical. Everything further down that is not repeated here was run on an earlier source.

**What changed in the source.** `lofi2.asm`: the SHIFT feedback cap `move #>$39999a,y1` (0.45) becomes `move #>$333333,y1` (0.40), and two comments are corrected (the doubling that forms the wet signal is inside the loop, so the loop gain is 2 x fdbk; the Hilbert pair cannot shift DC or Nyquist, so the worst two-pass gain is (2 fdbk)^2 sqrt(2): 1.15 at 0.45, 0.905 at 0.40). `verify_lofi2.py`: upstream's three issue 825 checks, merged by hand over the Modwerk adaptations (they use `RANGE=1`, which the existing `K["RANGE"] = K["RNGE"]` alias covers). The author's originals under `upstream/` and `sdk/imports/lofi2-7795adf.json` follow the pin.

**P memory, word by word.** LOFI2's relocatable DSP package (`src/engine/assets/dsp-packages.json`, 1,354 words) before and after: words, init, proc, the four relocations, effect id, key and author identical; exactly one word differs, P+0x244, `0x39999a` to `0x333333`, the extension word of that `move #>imm,y1`; it is not a relocation site. The USB package differs from 0.1.0's `4f794ebc…` in exactly those three bytes (offsets 3197-3199); its header, size (6,300 bytes) and module field `d7bf66ce` are identical.

| Item | SHA-256 |
| --- | --- |
| `lofi2.asm` (unchanged from upstream `7795adf0`) | `bcd479e7426a27176e57bab5f4f0bb1d32f53dac3a9c58bcc462820946c930ac` |
| `manifest.py` (adapted; unchanged since 0.1.0) | `c4cbcdb50f17edf868b6b12400548778600cbb44394224e94ab63a5ef4730b3a` |
| `verify_lofi2.py` (adapted) | `ae21568a5fc225bae8bbbaa8eab61803a437375792241e2d43c769458bc5d10d` |
| Private native image of the `lofi2` test remix (static stock, never committed; built twice, identical) | `cd0f7d5a8c090bd3a46017e63224dc25f798c899571174e8079abee829c31559` |
| USB package `public/octatrack-modules/lofi2/0.1.1-experimental.mwrm` (6,300 bytes, ABI 6, module `d7bf66ce`) | `a2ab27325404c06197ccf2737b64b480121c6799b439798440b8c73e7884c92c` |

**Render gate.** `verify_lofi2.py` on the new image: all 73 checks pass. The new ones (a 0.3 s, 440 Hz, 0.125 FS burst, then silence; FDBK 127, MIX 127, RNGE HIGH; the louder channel's RMS 1.0-1.5 s and 2.5-3.0 s after the input stops; pass if the late window is under -60 dBFS and no more than 0.1 dB above the early one):

| Setting | 0.1.1 (1.0-1.5 s / 2.5-3.0 s) | 0.1.0 source |
| --- | --- | --- |
| DOWN, FREQ 64 | -68.3 / -69.2 dBFS | -8.9 / -4.1: fails |
| DOWN, FREQ 72 | -71.6 / -71.7 | -4.2 / -4.0: fails |
| UP, FREQ 72 | -84.5 / -84.5 | -43.9 / -4.0: fails |

0.1.1's figures equal those in the author's pull request. The negative control: the same verifier on 0.1.0's `lofi2.asm` fails exactly these three checks, and its other 70 pass. `verify_dirtystate` (8 renders, 0 failed), `verify_initregs`, `verify_menu`, `verify_replaces`, `verify_labels` and `verify_modenames` (7 checks) pass on the new image (`OCTABAM_STATIC_STOCK=1`, the commands in [How it was built](#how-it-was-built-here)).

**Cost.** `make cycles REMIX=lofi2`: 416 cycles/sample (4 x 416 = 1,664 per core), as before; native build 838 + 516 words on both payloads, 303 words free, placement unchanged. `perf.py bench` on `cd0f7d5a…`: every figure in the Cost table below again, to the hundredth (SHIFT DOWN dearest 406.44 / 430.06 with a split, UP 406.06 / 429.31, RING 251.06 / 274.31; stock unchanged). `perf.py stress --seconds 32` on the same image: host exit 0, no hang, 16 guarded instances, LOFI2 0 stray write regions and 0 clobbers, per-core peak 3,013.9 and 3,014.1, as before. `evidence/performance.json` names the new image.

**The hardware-timed 637.** The instruction stream, addresses and relocations are those of the package timed on the MKII; only one immediate operand differs. On the DSP56300 neither `move #>imm,y1` nor the multiply that uses it takes a value-dependent number of cycles, so 0.1.1's USB package carries the same 637. It was not timed again on a unit.

**After the input stops: the feedback scan.** 0.1.0's scan repeated on `cd0f7d5a…` with a scratch copy of the verifier's harness (not committed): a 0.3 s, 440 Hz, 0.125 FS burst, then silence, MIX 127; the louder channel's RMS 3.5-4.0 s after the input stops. 232 renders: FDBK 96, 112, 120, 124 and 127 against FREQ 0, 32, 64, 96 and 127 in both ranges and both directions, then FDBK 127 against FREQ 0, 4, … 124 and 127 in both ranges and both directions. No setting sustains: the loudest tail is -68.4 dBFS (DOWN, RNGE HIGH, FREQ 68), two settings are above -70 (DOWN HIGH at FDBK 127, FREQ 68 and 64: -68.4 and -69.2), the next is DOWN HIGH FREQ 64 at FDBK 124 (-71.6), and the rest are lower. Worst per range and direction: DOWN HIGH -68.4, UP HIGH -84.5, DOWN LOW -85.5 (FREQ 127, where the earlier coefficients sustained), UP LOW -85.0. The faint SHIFT residue at FDBK 0 to 64 (about -83 to -94 dBFS, 0.1.0 re-pin table below) was not re-measured. fx:audit was not rerun.

**Screens.** `scripts/capture-module-ui.py` with `media/capture.json`'s plan on `cd0f7d5a…` (`ot_emu` `23ba6f6c…`): the five PNGs are byte-identical to the 0.1.0 captures; `media/capture.json` and the manifest name the new image and version.

**Hardware.** On 22 October 2026 0.1.1's USB package `a2ab2732…` ran on the contributor's MKII over USB (RAM-booted development twin `53ddaf60…` of the beta base, one instance on FX2 beside RINGMOD SC 0.2): the issue 825 setting died away and the tester reported LOFI2's other functions passing, by ear ([evidence/hardware.md](evidence/hardware.md)). `tests.qualification` names that report and the twin's MAIN.raw `712666cb…`. One instance, by ear; no reload, power cycle, FX1 or second instance with 0.1.1. **Upstream** (Bryan T, pull request 843; his MKII, his own octabam build `_bt_oct` 16, not this build): the issue 825 repro (DOWN, HIGH, FREQ 64, MIX 127, FDBK 127) dies away; eight LOFI2 in SHIFT DOWN on T1-T8 at once with FX1 empty, no issues; with FILTER on FX1 of T5-T8, four in SHIFT there locked the unit, on upstream `main` as well (the author: FX1 shares the core's DSP budget; open as [octabam issue 850](https://github.com/sambanks/octabam/issues/850)).

## Re-pin to octabam 8250be0c (here, 20 October 2026)

Bryan T's `153063d85cfe13884f0a18394eb9b4917d650dca` (14 October 2026) squares Niemitalo's Hilbert coefficients in SHIFT: each allpass section is a²(x[n] + y[n-2]) - x[n-2], and the eight immediates per chain had been his a's, unsquared, so the I/Q difference was off 90 degrees. Upstream `main` at `8250be0c` carries that fix, `947fe57a` (octabam-inserts lists LOFI2; manifest.py gains empty DOWN and UP mode views for octabam's MODE DEFAULTS gate, which a name select does not use, so they are not carried) and comment-only renames (`efa8ddb7`, `99f5c087`). Everything in the sections further down that is not repeated here was run on the previous source, `21f6de90`.

**What changed in the source.** `lofi2.asm`: sixteen immediates (`move #>…,y1`, eight per channel chain) and comments; `verify_lofi2.py`: upstream's diff over the Modwerk adaptations (sideband tones 1, 3, 5, 10 and 15 kHz, limit -25 to -40 dB: 58 checks become 70); `manifest.py`: a comment only. `verify_lofi2.py.orig`, a stray copy of the old upstream verifier, is removed.

**P memory, word by word.** LOFI2's relocatable DSP package (`src/engine/assets/dsp-packages.json`, 1,354 words) before and after: words, init, proc, the four relocations, effect id, key and author identical; exactly 16 words differ, at P+0x408, 0x40f, 0x416, 0x41d, 0x42a, 0x431, 0x438, 0x43f and the same eight offsets +0x46 (0x44e … 0x485). Each is the extension word of a `move #>imm,y1` (opcode word `0x47f400`, unchanged in front of every one), old value one of the eight unsquared immediates and new value its squared counterpart; none is a relocation site. The native card image of the test remix (`make bus REMIX=lofi2`, static stock) differs from the previous source's `3d63406d…` in 92 bytes in 32 runs: those 16 words on each of the two payloads, nothing on the ColdFire side. The USB package differs from `7ee9277f…` in 46 bytes, all inside its DSP word array at the same 16 word indices; its 68-byte header is identical.

| Item | SHA-256 |
| --- | --- |
| `lofi2.asm` (unchanged from upstream `8250be0c`) | `cacea07f61baa730753209e2f9acc6341d984a4b97815e4638baa21d349ab025` |
| `manifest.py` (adapted) | `c4cbcdb50f17edf868b6b12400548778600cbb44394224e94ab63a5ef4730b3a` |
| `verify_lofi2.py` (adapted) | `c4afed65bb2b96a79c43d1b6229b6a3fb31b3a3fdb880507330e124e7fc78f6c` |
| Private native image of the `lofi2` test remix (static stock, never committed) | `ddcd347373db5226a712678511c0d644e2b241e3a6d012817b6a92d6b9acba99` |
| USB package `public/octatrack-modules/lofi2/0.1.0-experimental.mwrm` (6,300 bytes, ABI 6, module `d7bf66ce`) | `4f794ebcb6ebe69f4c66412463f7cef41952551b2b2484cebf2cbfe004e5662c` |

The same scratch tree rebuilt from the previous source gives `3d63406d…` again, the image the card-image hardware report names, so the comparison is like for like (same `dsp_host` `bde6cf5f…`, same 1.40C).

**Render gate.** `verify_lofi2.py`: all 70 checks pass. The sideband checks, unwanted sideband in dB re the wanted one, the same at 16- and 13-sample blocks:

| Tone | UP | DOWN | previous source (UP / DOWN) |
| --- | --- | --- | --- |
| 1 kHz | -54.6 | -55.1 | -29.6 / -29.6 |
| 3 kHz | -48.5 | -48.7 | -21.8 / -21.8 |
| 5 kHz | -50.6 | -50.9 | -18.7 / -18.7 |
| 10 kHz | -50.3 | -49.8 | -30.7 / -30.7 |
| 15 kHz | -45.7 | -45.9 | -20.1 / -20.0 |
| UP -> DOWN while playing | | -56.2 | -29.5 |

The new verifier on the previous source fails exactly those 21 checks (49 pass), so the gate catches the old coefficients. Every other check reads the same as on the previous source. `verify_dirtystate` (8 renders, 0 failed), `verify_initregs`, `verify_menu`, `verify_replaces`, `verify_labels` and `verify_modenames` (7 checks) pass on the new image.

**Cost.** `cycle_count.py`: 416 cycles/sample, as before (4 x 416 = 1,664 per core). `perf.py bench` on `ddcd3473…`: every figure in the Cost table below again, to the hundredth (SHIFT DOWN dearest 406.44 / 430.06 with a split, UP 406.06 / 429.31, RING 251.06 / 274.31, defaults 249.88; stock unchanged). `perf.py stress --seconds 32`: host exit 0, no hang, 16 guarded instances, LOFI2 0 stray write regions and 0 clobbers, per-core peak 3,013.9 and 3,014.1, as before. `evidence/performance.json` names the new image.

**The hardware-timed 637.** The instruction stream, its addresses and its relocations are the same as the package timed on the MKII; only the sixteen immediate operands differ. On the DSP56300 neither `move #>imm,y1` nor the multiplies that use y1 take a value-dependent number of cycles, and the loop's only data-dependent branch (SRR's re-latch) does not read these coefficients. So the new package carries the same 637, and `cycle_count.py` and the executed-instruction bench agree. It was not timed again on a unit.

**After the input stops.** The idle measurement below (0.5 s burst, then silence; left channel RMS 0.5, 2.5, 5.5 and 11.5 s after it), repeated with the same script on both sources:

| Setting | new | previous |
| --- | --- | --- |
| RING | silence | silence |
| SHIFT UP, FDBK 0 | -83.0 throughout | -77.0 |
| SHIFT UP, FDBK 64 | -89.5 | -83.5 |
| SHIFT UP, FDBK 127 | -26.9, then **-4.1** (sustained) | -77.0 |
| SHIFT UP, FDBK 127, FREQ 0 LOW | -79.8, then -94.3 | -74.1, then -77.5 to -80.8 |
| SHIFT UP, FDBK 127, FREQ 127 | -83.0 | -76.7 |
| SHIFT DOWN, FDBK 127 | -20.6, then **-4.1** (sustained) | -82.4 to -82.2 |
| SHIFT UP, FDBK 127, MIX 64 | -32.8, then **-10.0** (sustained) | -82.9 |

The residue is 6 dB lower, but at FDBK 127 and FREQ 64 HIGH the shifter's feedback now sustains itself near full scale. A scan (FDBK 96, 112, 120, 124, 127 against FREQ 0, 32, 64, 96, 127 in both ranges and both directions, RMS 4 s after the burst; then FDBK 127 against every fourth FREQ and 56-72 one by one): with the new coefficients, at FDBK 127 it sustains (about -4 dBFS) at RNGE HIGH, FREQ 61-72 in UP and 60-72 in DOWN (UP 60: -45.4; DOWN 76: -31.4); at FREQ 64 it does so from FDBK 124 (DOWN at FDBK 120: -45.6). Every other setting scanned stays under -70 dBFS, and FDBK 112 or less at or under -70 dBFS everywhere. The previous coefficients sustained in the same way at RNGE LOW, FREQ 127 (FDBK 124: -56.0 UP, -9.7 DOWN; FDBK 127: -19.2 UP, -4.1 DOWN), which the October record missed. So it is a property of the shifter's feedback loop at particular shift frequencies, moved by the fix, not new with it. The DSP is the author's, unchanged. On the contributor's MKII (20 October 2026, package `4f794ebc…`, base `6650236a`) MODE UP, RNGE HIGH, FREQ 64, MIX 127, FDBK 127, SRR 0, BRR 0, LPF 127, a short sound then silence: a tone kept sounding after the input ended; with FDBK turned down to 120 it died away. DOWN, other FREQ values and the previous coefficients were not tried on the unit, and the level was not measured. The code caps the feedback at 0.45 and its comment says the loop settles at 0.5/(1-fdbk), inside the rail, so this may not be intended; it is asked upstream as a question in [octabam issue 825](https://github.com/sambanks/octabam/issues/825).

**fx:audit** (`plan`, each signal through one instance, `check`): defaults and LPF 0 give the tables in the fx:audit section below, and RING its figures, to the tenth on both sources. SHIFT UP (MIX 127, FREQ 64 HIGH, FDBK 127): no sample on the rails, the tone checks flagged by construction as before, and idle "still -0.1 dBFS after the tail" (previous source: -71.6 dBFS), the self-sustaining feedback above.

## Identity (previous source, `21f6de90`)

| Item | SHA-256 |
| --- | --- |
| `lofi2.asm` (unchanged from upstream) | `6bb3d9375c790a4a95e7942763223f3b3445b83bd9bf560d9f7d6bd0e7aac2d4` |
| `manifest.py` (adapted) | `781d41a5d67d92e747704525a6228c650bce71373dc12f5edf73ea1bf4c57d9e` |
| `verify_lofi2.py` (adapted) | `1f340b07133c339510ab261af145817dae87b450c36c65b17fcbdc3d9c56feb6` |
| Stock MAIN OS 1.40C used (the tester's own, never committed) | `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e` |
| Private native image of the `lofi2` test remix (static stock, never committed), current source and labels | `3d63406d3254e161b1fc52c9acfbfc14af6130b2c9314a554030e0ac060678e2` |
| The same remix at pin `e8665fae` with the current labels | `b9aac01f078ab2481212156e8224be198abf8a8c4d7f90af86b744307aa4b7a5` |
| The same remix at pin `e8665fae` before the 13 October label change; the fx:audit, idle and master-track runs below were made on it | `43e110ff87d66c0b3aa47fc1eaf8d2effedb331a121f32fcbbc51ff15f21b24e` |
| `dsp_host` | `bde6cf5f348e215d7adca2080044533ee7853407469cee7f887fce8ef3865fd9` |
| `ot_emu` | `23ba6f6cdc6ec4b89b8cf206915e66d3160aec8499b1abfc9b475ac849152b28` |

## How it was built (here)

A scratch copy of `sdk/octabam` with this folder copied to `modules/lofi2`, the patched DSP56300 tools under `vendor/`, the tester's own 1.40C MAIN OS at `out/raw/section_3_MAIN_OS.bin`, and the author's test remix (`upstream/remixes/test/lofi2/remix.py`, LOFI2 beside twelve stock effects with PLATE REV and SPRING REV given up) at `remixes/test/lofi2/`.

```sh
export OCTABAM_STATIC_STOCK=1          # what the Makefile exports; no DSP loader
make bus REMIX=lofi2
python3 modules/lofi2/verify_lofi2.py
python3 tools/verify/verify_dirtystate.py lofi2
python3 tools/verify/verify_initregs.py lofi2
REMIX=lofi2 python3 tools/verify/verify_menu.py
python3 tools/verify/verify_replaces.py --image lofi2
.venv/bin/python3 tools/verify/verify_labels.py lofi2
.venv/bin/python3 tools/verify/verify_modenames.py lofi2
make cycles REMIX=lofi2
```

Build report, both payloads identical in size:

| Payload | Table | Code | Region | Free |
| --- | --- | --- | --- | --- |
| A (core 0, tracks 5-8) | P:0x01000..0x01204, 516 words | P:0x01204..0x0154a, 838 words | PLATE REV + SPRING REV, 1,657 words | 303 |
| B (core 1, tracks 1-4) | P:0x00dc0..0x00fc4, 516 words | P:0x00fc4..0x0130a, 838 words | 1,657 words | 303 |

ColdFire: descriptor clone at 0x400d6b20 (416 bytes), two label formatters (RNGE 54 bytes, MODE 164 bytes), no code of its own. The table stays in P memory in this remix because DJ EQ is kept.

## Render gate: `verify_lofi2.py` (here)

All 58 checks pass (48 before upstream added the SHIFT sideband checks). `dsp_host`, payload A, a scratch image holding LOFI2 alone. Stock LO-FI is rendered from the tester's own stock image for the SRR and BRR comparisons.

| Result | Check | Measured |
| --- | --- | --- |
| PASS | ring level, GAIN 0: -2.80 dB re MIX 0 | -2.79 dB |
| PASS | GAIN 64: +6.02 dB re GAIN 0 | +6.02 dB |
| PASS | GAIN 127: +11.95 dB re GAIN 0 | +11.95 dB |
| PASS | SHIFT UP level: about -0.07 dB re MIX 0 | -0.07 dB |
| PASS | AMPH 0 deg (64): L == R bit for bit |  |
| PASS | AMPH +45 / -45 deg: L untouched |  |
| PASS | AMPH +45 / -45 deg: R moved, differently |  |
| PASS | fade-in: the first 32 samples carry < 20% of the steady wet | 0.026 of steady |
| PASS | fade-in: the wet is back within 0.5 dB by 9 ms | -0.02 dB |
| PASS | MODE RING -> UP: no step larger than the steady states' | switch 13529 vs steady 11685 (d2, LSB) |
| PASS | MODE RING -> UP: passes through the dry | closest 16-sample window 2176 LSB (limit 83886) |
| PASS | SHIFT UP at 1000 Hz, block 16: the upper sideband, the other under -25 dB | wanted 1082.71 Hz, other -29.6 dB |
| PASS | SHIFT DOWN at 1000 Hz, block 16: the lower sideband, the other under -25 dB | wanted 917.29 Hz, other -29.6 dB |
| PASS | SHIFT UP at 10000 Hz, block 16: the upper sideband, the other under -25 dB | wanted 10082.70 Hz, other -30.7 dB |
| PASS | SHIFT DOWN at 10000 Hz, block 16: the lower sideband, the other under -25 dB | wanted 9917.30 Hz, other -30.7 dB |
| PASS | SHIFT UP at 1000 Hz, block 13: the upper sideband, the other under -25 dB | wanted 1082.71 Hz, other -29.6 dB |
| PASS | SHIFT DOWN at 1000 Hz, block 13: the lower sideband, the other under -25 dB | wanted 917.29 Hz, other -29.6 dB |
| PASS | SHIFT UP at 10000 Hz, block 13: the upper sideband, the other under -25 dB | wanted 10082.70 Hz, other -30.7 dB |
| PASS | SHIFT DOWN at 10000 Hz, block 13: the lower sideband, the other under -25 dB | wanted 9917.30 Hz, other -30.7 dB |
| PASS | SHIFT: one carrier across UP, DOWN and both block lengths (within 0.5 Hz) | carrier 82.71 Hz, spread 0.005 Hz |
| PASS | SHIFT UP -> DOWN while playing: the lower sideband after the duck, the other under -25 dB | wanted 917.30 Hz, other -29.5 dB |
| PASS | SRR 16: the hold's droop at 2 kHz matches stock's | stock -0.07 dB, LOFI2 -0.08 dB |
| PASS | SRR 32: the hold's droop at 2 kHz matches stock's | stock -0.23 dB, LOFI2 -0.24 dB |
| PASS | SRR 64: the hold's droop at 2 kHz matches stock's | stock -0.90 dB, LOFI2 -0.98 dB |
| PASS | SRR 96: the hold's droop at 2 kHz matches stock's | stock -2.38 dB, LOFI2 -2.38 dB |
| PASS | SRR 127: the hold's droop at 2 kHz matches stock's | stock -5.09 dB, LOFI2 -5.08 dB |
| PASS | SRR turn 20 -> 110: block-locked step under -70 dBFS | turn -140.0 dBFS, held -140.0 |
| PASS | BRR 16: the step matches stock's | stock 3.32 bits (375 plateaus), LOFI2 3.322 bits (377) |
| PASS | BRR 32: the step matches stock's | stock 7.107 bits (375 plateaus), LOFI2 7.098 bits (376) |
| PASS | BRR 48: the step matches stock's | stock 10.502 bits (375 plateaus), LOFI2 10.5 bits (375) |
| PASS | BRR 64: the step matches stock's | stock 13.458 bits (375 plateaus), LOFI2 13.453 bits (376) |
| PASS | BRR 80: the step matches stock's | stock 15.977 bits (109 plateaus), LOFI2 15.977 bits (110) |
| PASS | BRR 96: the step matches stock's | stock 18.055 bits (26 plateaus), LOFI2 18.054 bits (26) |
| PASS | BRR 112: the step matches stock's | stock 19.699 bits (8 plateaus), LOFI2 19.698 bits (8) |
| PASS | BRR 127: the step matches stock's | stock 20.8 bits (4 plateaus), LOFI2 20.801 bits (4) |
| PASS | BRR 64: unity gain against BRR 0 | -0.001 dB |
| PASS | BRR turn 20 -> 110: block-locked step under -70 dBFS | turn -140.0 dBFS, held -140.0 |
| PASS | LPF 0: the shelf matches its design | c 0.98586 (table 0.98585), DC 0.99995, Nyquist -12.04 dB |
| PASS | LPF 0: no gain above unity anywhere (feedback-safe) | peak -0.0004 dB |
| PASS | LPF 32: the shelf matches its design | c 0.94959 (table 0.94959), DC 0.99999, Nyquist -12.04 dB |
| PASS | LPF 32: no gain above unity anywhere (feedback-safe) | peak -0.0001 dB |
| PASS | LPF 64: the shelf matches its design | c 0.82800 (table 0.82800), DC 1.00000, Nyquist -12.04 dB |
| PASS | LPF 64: no gain above unity anywhere (feedback-safe) | peak -0.0000 dB |
| PASS | LPF 96: the shelf matches its design | c 0.47685 (table 0.47685), DC 1.00000, Nyquist -12.04 dB |
| PASS | LPF 96: no gain above unity anywhere (feedback-safe) | peak -0.0000 dB |
| PASS | LPF 120: the shelf matches its design | c -0.11015 (table -0.11015), DC 1.00000, Nyquist -12.04 dB |
| PASS | LPF 120: no gain above unity anywhere (feedback-safe) | peak +0.0000 dB |
| PASS | LPF 126: the shelf matches its design | c -0.37003 (table -0.37003), DC 1.00000, Nyquist -12.04 dB |
| PASS | LPF 126: no gain above unity anywhere (feedback-safe) | peak -0.0000 dB |
| PASS | LPF 127: the shelf out of circuit, output == input bit for bit | delay 0 samples |
| PASS | LPF turn 20 -> 110: block-locked step under -70 dBFS | turn -140.0 dBFS, held -140.0 |
| PASS | FREQ: an LFO's fraction between two knob steps is heard (64 + 1/2 lands between 64 and 65) | 480.40 / 487.86 / 495.54 Hz, 0.50 of the step |
| PASS | FREQ turn 20 -> 110, RING: block-locked step under -70 dBFS | turn -140.0 dBFS, held -106.6 |
| PASS | FREQ turn 20 -> 110, SHIFT UP: block-locked step under -70 dBFS | turn -140.0 dBFS, held -140.0 |
| PASS | MIX, RING turn 20 -> 110: block-locked step under -70 dBFS | turn -140.0 dBFS, held -140.0 |
| PASS | GAIN, RING turn 20 -> 110: block-locked step under -70 dBFS | turn -140.0 dBFS, held -140.0 |
| PASS | FDBK, SHIFT UP turn 20 -> 110: block-locked step under -70 dBFS | turn -140.0 dBFS, held -140.0 |
| PASS | AMPH, RING (R) turn 20 -> 110: block-locked step under -70 dBFS | turn -140.0 dBFS, held -140.0 |
Not covered by this gate, as its author notes: payload B (tracks 1-4). `verify_dirtystate` below renders both payloads.

## Other gates (here)

| Gate | Result |
| --- | --- |
| `verify_dirtystate.py lofi2` | PASS: 8 renders, 0 failed; defaults and every knob nudged from a garbage-filled instance block, both payloads, tail -138.5 dBFS |
| `verify_initregs.py lofi2` | PASS: init preserves r1 |
| `verify_menu.py` | PASS: the panel prints `LOFI2`, abbreviation `LOF2`, nine drawn slot names match the manifest; FX1 chooser byte-identical to stock in this remix |
| `verify_replaces.py --image lofi2` | PASS: every stock id is stock's, or declared |
| `verify_labels.py lofi2` | PASS: RNGE prints LOW / HIGH, MODE prints RING / DOWN / UP |
| `verify_modenames.py lofi2` | PASS, 7 checks: RING names slot 2 GAIN, DOWN and UP name it FDBK, MODE and RNGE keep their own names, out-of-range values clamp |
| `verify_dram_boot.py`, `verify_hidden.py` | not applicable (no DRAM payload, nothing hidden) |
| `verify_set.py`, `verify_usb.py`, the `verify_knob_clicks.py` census, `make check` as a whole | not run |

Without `OCTABAM_STATIC_STOCK=1` (a direct script run, which adds octabam's experimental DSP loader) `verify_dirtystate` and `verify_replaces` report failures; that loader is not what Modwerk ships and those runs are not counted.

## Size and fit (here)

Native builds with stock DSP code built in; each row is a real `make bus` run of a scratch remix, core 0 shown (core 1 agrees).

| Selection | Stock effects given up | Result |
| --- | --- | --- |
| LOFI2 | none | refused |
| LOFI2 | PLATE REV | refused: 1,354 > 594 words |
| LOFI2 | SPRING REV | refused: 1,354 > 1,063 words |
| LOFI2 | DARK REV | refused: 1,354 > 1,067 words |
| LOFI2 | PLATE REV + SPRING REV | fits: 1,657-word region, 303 free |
| LOFI2 | SPRING REV + DARK REV | fits: 2,130-word region, 776 free |
| Output Matrix + TapeHead + Sidechain Compressor + LOFI2 | three reverbs | refused: 2,933 > 2,724 words |
| the same | three reverbs + CHORUS | fits: 3,053-word region, 120 free |
| the same | three reverbs + LO-FI | fits: two runs, 3,261 words, 328 free |
| Analog BD + LOFI2, with or without the others | three reverbs (+ LO-FI) | refused: "ANALOG BD cannot share DSP memory with LOFI2" (not on `DSP_COMPANIONS` in `tools/build/ab_image.py`) |

Scratch-only probe, **not part of this change and not reviewed**, made at pin `e8665fae` (LOFI2 two words smaller) and not repeated: with `DSP_COMPANIONS` widened locally to admit LOFI2 and Output Matrix, Analog BD + Output Matrix + TapeHead + Sidechain Compressor + LOFI2 is refused with three reverbs + LO-FI given up (LOFI2 needs 1,352 contiguous words, largest opening 1,067), refused with DJ EQ also given up (the build then parks LOFI2's table in the stock curve bank in X memory, and Sidechain Compressor no longer finds an opening: largest 298), and builds with CHORUS given up as well (four runs, 2,903 words, 488 free). That image was only built, never run. A table read from X memory by a dispatched effect is reported hardware-proven in octabam for another module, not for LOFI2.

Module words in those builds: TapeHead 422, Output Matrix 727 + 42 table, Sidechain Compressor 340 + 48 table, LOFI2 838 + 516 table.

## Cost (here)

Static, `tools/build/cycle_count.py`: **416 cycles/sample** on the dearest path (SHIFT); the first merged revision (`a6f41a1d`) counted 654 and pin `e8665fae` 414. Four instances on one core: 1,664 of the 3,120 the counter calls usable.

`python3 modules/lofi2/perf.py bench <out>` (Modwerk's own script, after E-Verb's): `benchmark_stock_dsp.py`'s method (one instance per core at positions 0 and 4, audio at X:0, 4,096 blocks of 16 frames, the null stub's peak subtracted), executed instructions per sample, not chip cycles. LOFI2 on the private image, stock effects on the stock image, through the same fixed, moving and trig-split (positions 1-15) cases:

| Effect | Worst, no split | Worst with splits |
| --- | --- | --- |
| LOFI2, SHIFT DOWN at the manifest's dearest settings | 406.44 | 430.06 |
| LOFI2, SHIFT UP at the dearest settings | 406.06 | 429.31 |
| LOFI2, RING at the dearest settings | 251.06 | 274.31 |
| LOFI2, defaults (passthrough) | 249.88 | not run |
| stock LO-FI | 275.44 | 290.06 |
| stock SPRING REV | 257.50 | 314.19 |
| stock DARK REV | 193.25 | 242.38 |
| stock DJ EQ | 293.38 | 330.94 |

The stock figures without splits reproduce E-Verb's record (SPRING REV 257.5, DARK REV 193.25, DJ EQ 293.38), a positive control on the method. LOFI2 in SHIFT is 1.37x SPRING REV's worst case and 1.48x stock LO-FI's (430.06 against 314.19 and 290.06) (the closest stock effect); in RING 0.87x and 0.95x. The merged revision (`a6f41a1d`) measured 596.4 and 347.4 with an earlier scratch script. SHIFT is dearer than every stock effect (DJ EQ 330.94), which the performance audit accepts only with a justification and the owner's acceptance; the justification is in `evidence/performance.json`.

`python3 modules/lofi2/perf.py stress <out> --seconds 32`: LOFI2 on FX2 of all eight tracks (four per core) behind DJ EQ on every FX1; three LFOs per track on FREQ, SRR and LPF; a new random value on all 14 named slots of both effects every sixteenth at 120 BPM, MODE and RANGE included, so the modes switch under load; trig splits of 1, 3, 7, 8, 12 and 15 frames on six tracks; eight different stems, 32 s plus a 2 s tail; `dsp_host -guard 0x4000 -guard-shared -dirty 0x5a`. Result: host exit 0, no hang, 16 guarded instances, LOFI2's eight instances 0 stray write regions and 0 clobbers, 0 clobbers overall; per-core peak 3,013.9 and 3,014.1 executed instructions/sample with all sixteen effects (944 s of wall time; rerun on the current pin, image 3d63406d...). It exercises the DSP side only.

`npm run perf:audit -- check sdk/octabam/modules/lofi2/evidence/performance.json`:

```
✓ record          dsp record for lofi2@0.1.0-experimental
· cycles          4 x 416 = 1664 of 3120 per sample per core (53%), measured 430.06 per instance; over half a core: say what stays free for stock effects and other modules
· stock benchmark 430.06 vs LO-FI 290.06 (1.48x); the dearest stock effect is 330.94; justified in the record
✓ stress          4 per core, eight tracks, 3 LFOs and 14 locked slots, 32 s, no clobber, no hang
```

No check failed. What stays free: with four SHIFT instances on a core, 1,456 static cycles remain of the 3,120, about four stock effects at SPRING REV's cost on the same core's FX1 slots. Four RING instances leave more.

The author's own weighting of the SHIFT loop by measured chip move costs (his README, "Cost, and how many fit") gives about 995 against about 1,530 for the September source; he calls those ratios, not cycles. Not reproduced here.

## Sound quality: `npm run fx:audit` (here)

`npm run fx:audit -- plan`, each signal rendered through LOFI2 with `dsp_host` on payload A of the private image (mono in, both channels; one instance; a scratch script, not committed), then `npm run fx:audit -- check`. Audit defaults: aliasing -60 dBc, DC -60 dBFS, idle -90 dBFS.

Defaults (MIX 0, SRR 0, BRR 0, LPF 127), the passthrough: no check failed, idle is digital silence.

| signal | out dBFS | harmonics | aliasing | residual | DC dBFS | rails | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tone-1100hz-12db | -12.0 | <-140 | <-140 | -134.5 | <-140 | 0 | ok |
| tone-1100hz-1db | -1.0 | <-140 | <-140 | <-140 | <-140 | 0 | ok |
| tone-2701hz-12db | -12.0 | <-140 | <-140 | -134.5 | <-140 | 0 | ok |
| tone-2701hz-1db | -1.0 | <-140 | <-140 | <-140 | <-140 | 0 | ok |
| tone-5301hz-12db | -12.0 | <-140 | <-140 | -134.6 | <-140 | 0 | ok |
| tone-5301hz-1db | -1.0 | <-140 | <-140 | <-140 | <-140 | 0 | ok |
| tone-9102hz-12db | -12.0 | <-140 | <-140 | -134.5 | <-140 | 0 | ok |
| tone-9102hz-1db | -1.0 | <-140 | <-140 | <-140 | <-140 | 0 | ok |

LPF 0 (the shelf fully in, everything else at its default): no check failed, idle is digital silence. The level drop is the shelf's -12 dB.

| signal | out dBFS | harmonics | aliasing | residual | DC dBFS | rails | verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tone-1100hz-12db | -23.5 | <-140 | <-140 | -121.1 | <-140 | 0 | ok |
| tone-1100hz-1db | -12.5 | <-140 | <-140 | -132.1 | <-140 | 0 | ok |
| tone-2701hz-12db | -24.0 | <-140 | <-140 | -120.6 | <-140 | 0 | ok |
| tone-2701hz-1db | -13.0 | <-140 | <-140 | -131.7 | <-140 | 0 | ok |
| tone-5301hz-12db | -24.0 | <-140 | <-140 | -120.5 | <-140 | 0 | ok |
| tone-5301hz-1db | -13.0 | <-140 | <-140 | -131.6 | <-140 | 0 | ok |
| tone-9102hz-12db | -24.0 | <-140 | <-140 | -120.6 | <-140 | 0 | ok |
| tone-9102hz-1db | -13.0 | <-140 | <-140 | -131.6 | <-140 | 0 | ok |

The three settings that modulate cannot pass this audit by construction, and their figures are recorded, not treated as defects:

- **RING, MIX 127, FREQ 64 HIGH.** The audit looks for the input tone and its harmonics; a ring modulator at full depth removes the tone and leaves the two sidebands, which the audit files under residual (+39 dBc) and, where a sideband lands on a fold frequency, aliasing (-27.5 dBc at 1.1 kHz, -43.2 dBc at 9.1 kHz; 4 checks flagged). DC is under -100 dBFS, no sample on the rails, idle is digital silence.
- **SHIFT UP, MIX 127, FREQ 64 HIGH, FDBK 127.** Every partial is moved, so the same applies (8 tone checks flagged). No sample on the rails. Idle fails: see below.
- **The manifest's dearest settings (SRR 127, BRR 127).** Sample-rate and bit reduction alias by design (up to +36 dBc read as aliasing; DC up to -40.8 dBFS from the coarse quantiser at 20.8 bits removed; 8 checks flagged). Idle is digital silence.

### After the input stops, in SHIFT

Found by the audit's idle row and measured separately: a 0.5 s, 440 Hz burst at 0.5 FS, then 12 s of silence, RMS of the left channel in 0.5 s windows starting 0.5, 2.5, 5.5 and 11.5 s after the burst (`dsp_host`, payload A, MIX 127, FREQ 64, RANGE HIGH unless noted).

| Setting | 0.5 s | 2.5 s | 5.5 s | 11.5 s |
| --- | --- | --- | --- | --- |
| RING | silence | silence | silence | silence |
| SHIFT UP, FDBK 0 | -77.0 dBFS | -77.0 | -77.0 | -77.0 |
| SHIFT UP, FDBK 64 | -83.5 | -83.5 | -83.5 | -83.5 |
| SHIFT UP, FDBK 127 | -76.9 | -77.0 | -76.9 | -77.0 |
| SHIFT UP, FDBK 127, FREQ 0 LOW | -74.1 | -77.6 | -78.6 | -79.5 |
| SHIFT UP, FDBK 127, FREQ 127 | -76.7 | -76.7 | -76.7 | -76.7 |
| SHIFT DOWN, FDBK 127 | -82.3 | -82.2 | -82.2 | -82.2 |
| SHIFT UP, FDBK 127, MIX 64 | -82.9 | -82.9 | -82.9 | -82.9 |
| dearest settings (BRR 127) | silence | silence | silence | silence |

In SHIFT, once signal has passed through, the output does not return to silence: a steady residue of about 1,100 to 2,200 LSB peak (24-bit) stays for as long as measured, with FDBK at 0 too, so it is not the feedback tail. A fresh instance on silence stays silent (`verify_dirtystate`). The merged upstream revision (`a6f41a1d`) rendered the same figures, so this is a property of the author's shifter and not of the port or of the optimisation. The cause was not investigated and the DSP was not changed; it is listed as a limitation and should go to the author. Not checked on hardware.

## A silent master track at BRR 127 (here)

Reported from a combined-image trial: with a fixture project that stores effect id 0x09 on all sixteen FX slots (a free id on stock, LOFI2 here), turning MASTER TRACK on made the main output silent. Reproduced on the LOFI2-only image under `ot_emu`, without Output Matrix; the stock image passes audio in the same run.

- The knob words the T8 FX2 instance receives (`--dsp-peek` at its r6 block; T7's are identical) are FREQ 47, MIX 0, FDBK 127, SRR 0, BRR 127, LPF 0, MODE UP: the fixture's stored bytes, not defaults.
- Clearing T8's FX2 id brings the audio back; clearing only its FX1 does not. Tracks 1-7 with the same knob words pass audio.
- Offline (`dsp_host`, payload A, a 220 Hz sine, those knob words): LOFI2's output is exactly zero for inputs up to 0.10 FS and returns at 0.115 FS. Stock LO-FI at BRR 127 does the same at the same inputs, with the same step once it passes (1,874,262 LSB against LOFI2's 1,871,726 with the shelf out).
- With T8's FX2 cleared, the master bus peaks at about 0.9 million LSB in that fixture, under the rounding threshold of 938,502 LSB (half a step of 2^20.84).

Direct A/B under `ot_emu`, MASTER TRACK on, NORMAL mode, the same fixture project rebuilt with only T8's FX2 page-1 bytes changed (`ot_project.set_fx`; every other slot still LOFI2 with the fixture's bytes). RMS of the main pair over the last 2,000 frames, in LSB:

| T8 FX2 (LOFI2) knob values | MAIN L / R |
| --- | --- |
| the fixture's: FREQ 47, MIX 0, FDBK 127, SRR 0, BRR 127, LPF 0 | 0 / 0 |
| defaults: MIX 0, SRR 0, BRR 0, LPF 127 | 263,375 / 318,836 |
| T8 FX2 set to NONE (no effect), for reference | 263,375 / 318,836 |
| as the fixture but BRR 64 | 145,045 / 217,364 |
| as the fixture but BRR 0 (LPF still 0) | 144,838 / 217,645 |
| RING: FREQ 64, MIX 127, LPF 127 | 189,851 / 237,549 |

LOFI2 on the master track passes audio: at its defaults the main output equals the run without the effect, and every setting but BRR 127 is audible. The mix reaching the master track in that fixture is quieter than half a quantiser step at BRR 127 and rounds to silence, as it would through stock LO-FI. Not a defect; it is listed under limitations. Pokes to the live record and MIDI CC did not change the knob under the emulator, which is why the project was rebuilt. T4 has no master role (the master track is T8, on core 0). Not checked on hardware.

## LOFI2 on the FX1 chooser (here)

The manifest declares FX2, the only chooser the first builds composed. A scratch remix with LOFI2 added to `Remix.fx1` (the author's test remix plus an FX1 list ending in LOFI2; private image `492ca2de...`, static stock) was built and checked in the emulator only:

- `make bus`: "FX1 chooser = 12 rows ... LOFI2", id and cursor tables written; DSP placement unchanged.
- `verify_menu.py`: ALL CHECKS PASSED, including the composed FX1 chooser section. `verify_dirtystate` (8 renders, 0 failed), `verify_initregs` (init preserves r1, which the FX1 dispatcher needs), `verify_labels` and `verify_modenames` pass.
- LCD under `ot_emu` (looked at, not kept as media): LOFI2 is the last row of FX1 SETUP, assigns with YES, shows RANGE, MODE and AMPH there; MODE turned to UP renames the third main-page knob to FDBK; the main page reads `FX1▸LOFI2`.
- DSP on an FX1 slot: in the master-track runs above the fixture puts LOFI2 on FX1 and FX2 of all eight tracks, and audio passes through both on core 0's tracks. `dsp_host` gates and the stress run use FX2 slots only.

Not tested: FX1 on hardware, FX1 on core 1 with audio measured, parameter locks on FX1. `compatibility.location` stays FX2 until one of those exists and the browser builder's chooser is compared.

## USB loading: the runtime package and its cycle figure (here, 15 October 2026)

Previous source. The re-pinned package is `4f794ebc…` and carries the same 637 (see [the re-pin](#re-pin-to-octabam-8250be0c-here-20-october-2026)).

LOFI2 is published as a runtime package for the Modwerk base, built from source by `npm run octatrack:module-packages` (`src/engine/assets/octatrack-module-packages.json`: slots FX1 and FX2, 132 state words, no buffer): `public/octatrack-modules/lofi2/0.1.0-experimental.mwrm`, ABI 6, 6,300 bytes, module `d7bf66ce`, preferred effect id 9, SHA-256 `7ee9277f3510988366912a0b7ed4e7ca0b5523503b48844e94af7b7ff33fe976`. `--check --stock` on the tester's 1.40C: every published package identical, LOFI2's longest run shared with the stock OS 8 non-filler bytes (fails at 12).

**Why the figure is a hardware one.** The base charges an emulator figure (executed or modeled) at 7/4 and admits a module only if one instance fits beside seven stock slots: 3,120 - 7 x 342 = 726 (`dsp.c`). LOFI2's executed worst case (430, trig split) is charged 753 and its static count (416) 728, so both are refused. A figure timed on hardware is charged as it stands.

**How it was timed.** On the tester's MKII, a development twin of the beta base of `main` 836d1c42 (`build_core.py --dsp-loader --dev` with the beta options, RAM boot, no flash), a private measurement-only package with the same DSP words declaring a placeholder 726 so the base would admit it (never published), and `scripts/octatrack-measure.py --pkg ... NONE LOFI2 'SPRING REV'` on Part 1: FX2 of T1 (core 1) and T5 (core 0), playing; as picked, every knob at its minimum, every knob at its maximum. Chip cycles a sample above NONE:

| Effect | Average (core 1 / 0) | Dearest of the three | Peak frame |
| --- | --- | --- | --- |
| LOFI2 | 408.2 / 380.8 | 636.2 / 628.2 | 736.7 / 677.2 |
| SPRING REV | 314.8 / 288.1 | 360.6 / 288.2 | 482.9 / 332.7 |

The package declares 637 (core 1's dearest, rounded up), the convention the base's ledger uses for stock (each stock slot is charged DJ EQ's dearest, 342) and for the modules in docs/OCTATRACK_ELEKLOADER_MIGRATION.md. Peak frames run 40 to 100 above the dearest for every effect; LOFI2's is 100.5 above on core 1, the top of that range. 637 leaves 89 cycles under the 726 limit. The script's maximum pass is MODE UP with LPF 127 (the shelf out of circuit); a hand pass at the manifest's dearest settings (MODE DOWN, LPF 0) is not recorded yet. If it reads higher, the package is rebuilt with that figure.

Emulator dry run (`ot_emu --dsp`, the twin, the measurement package, `scripts/verify-octatrack-dsp-loader.mjs beside:lofi2`): installed; picked on FX2 of T1 and T5, it kept effect id 9; PLATE REV on T2 and DARK REV on T6; each core holds LOFI2's code word for word in its arena; no refused selection, no loader errors. That proves admission and binding only, not timing or audio.

## USB package on the unit (15 October 2026)

Previous source. The package `7ee9277f35109883…` (octabam `21f6de90`) ran on the tester's MKII on the flashed beta base: trial and Undo, install and Keep, FX1 and FX2 on both cores, every mode, two instances on one core admitted and a third refused DSP FULL, removal refused while in use, the missing-module fallback and restore, and Part reload, project reload and power-cycle persistence all passed. Details in [evidence/hardware.md](evidence/hardware.md).

## Screenshots (here)

`scripts/capture-module-ui.py` with the image above, `ot_emu`, MKII panel, empty scratch card, transport stopped. Five PNGs and `media/capture.json` (plan, image, emulator and PNG hashes). Each image was opened and checked: LOFI2 selected in FX2 SETUP with RNGE, MODE and AMPH; the main page at defaults; FREQ 64 / MIX 127; MODE turned to UP (the name stays MODE, UP shows beneath the knob); the main page in UP with slot 2 renamed FDBK and set to 60. They show the pages and labels, not audio or hardware.

## First notes from a unit, and the label change (13 October 2026)

The port's contributor (npp1993) ran LOFI2 on an Octatrack MKII from a combined private image built from the 12 October source and sent three observations. They are notes, not the hardware report the qualification record needs: no duration, instance counts or persistence results came with them.

1. "RANGE text is too wide" on the SETUP page. Fixed: the slot is named `RNGE`, four letters like the other names on that page.
2. On the SETUP page MODE showed its value above and below the knob, unlike stock settings. That is octabam's `mode_slot`, which writes the value into the select's own name field while the turn flash prints it again. Fixed: MODE is declared as a `NameSelect`, as Euclid's selects are, so it keeps the name MODE, shows the value beneath the knob while it turns, and still renames slot 2 to GAIN in RING.
3. "The low pass filter doesn't seem to do a ton." Not changed: LPF is the author's first-order high shelf, which cuts at most 12 dB above its corner and never more; `verify_lofi2` measures exactly that (-12.04 dB at Nyquist at every setting). Whether to deepen it is a voicing decision for the author or the owner.

After the change (here, emulator only): native build with the same DSP placement and (at pin `e8665fae`) 836 + 516 words; the ColdFire formatter for MODE shrinks from 188 to 164 bytes; image `b9aac01f078ab2481212156e8224be198abf8a8c4d7f90af86b744307aa4b7a5`; `verify_lofi2.py` 48 of 48 at that pin; dirty-state, menu, labels and mode-name gates pass; the five screenshots were recaptured and looked at. The DSP source is untouched, so the benchmark, stress, fx:audit, idle and master-track runs were not repeated. The relabelled build has not run on a unit.

## Hardware report (13 October 2026)

The functional report from an Octatrack MKII on the exact image of the previous source (`LOFI2T03`, MAIN OS `3d63406d...`, octabam `21f6de90`), and the emulator check that a parameter lock holding until the next trig is the stock sequencer's behaviour, are in [evidence/hardware.md](evidence/hardware.md).

## Upstream evidence (Bryan T, octabam; not this build)

Taken from the author's README and manifest at the pinned commit (kept under `upstream/`). Effect ID 0x1f, octabam's tree and placement, his own remix.

- `_bt_oct` build 12, 13 Oct 2026, the merged source (416 counted, the register-form EOR): eight LOFI2 in UP, eight in DOWN and eight in RING, each cleanly (the author, pull request 704 and his README).
- Manifest `proof_note` (`Proof.HARDWARE`): "Bryan T's MKII, images 96-99 (Oct 2026, this tree): tracks 1 and 5, five instances at once; `_bt_oct` build 11 (12 Oct 2026, the 414-cycle loop): eight in SHIFT at once, four per core, UP/DOWN switched while playing".
- `_bt_oct` build 11, 12 Oct 2026, this revision's loop: all eight tracks ran SHIFT at once, four on each core, switching between UP and DOWN while playing, cleanly. What FX1 held was not recorded.
- At 506 counted cycles (an intermediate build 10) four in SHIFT cut out on either core.
- Image 96, 10 Oct 2026 (his remix with RECORDER LOOP FIX and USB AUDIO): LPF right on track 1 (payload B), SHIFT on two tracks at once, MODE through RING / DOWN / UP without a fault.
- Image 97: AMPH bipolar, GAIN and the MODE duck ran on the unit.
- Image 98, 10 Oct 2026: his own SRR, BRR and LPF on track 1 and track 5: "sounding and working great", and the MODE change no longer clicks.
- Image 99, 10-11 Oct 2026 (the earlier 654-cycle source): the FREQ, MIX, GAIN/FDBK and AMPH glides with five instances at once; T1-T7 in RING played; three SHIFT UP instances on core 0 (T5-T7) played and a fourth (T8) cut the audio out with bursts of digital noise. The author withdrew his earlier note that four in SHIFT on core 1 had been run.
- Stock LO-FI's SRR rates measured on his unit, 10 Oct 2026: 8,018 Hz at 64 and 3,564 Hz at 127.
- A ten-character MODE label ("SHIFT DOWN") faulted his unit; the labels are five characters or fewer since.
- He states every optimisation step but the per-block glides and the carrier direction is bit-identical to the one before it; not checked here.
- His bit-identity render of the October port against his September source (`rig_render`, T1 on payload B and T5 on payload A) was not repeated here.

## Not tested

- 0.1.1 (octabam `7795adf0`), on a unit: everything beyond one instance on FX2 by ear (see evidence/hardware.md): a second instance, FX1, the other core, the issue 825 case in UP or at FREQ 72, a level measurement, Part and project reload, a power cycle, the full module set, the base self-test.
- Four SHIFT instances on one core with an effect on FX1 (octabam issue 850): not tried on a Modwerk unit; no guard in card builds.
- On 0.1.0's source (octabam `8250be0c`), on a unit: BRR and LPF individually, the self-sustaining SHIFT feedback in DOWN, at FREQ other than 64 or with its level measured (UP, FREQ 64 HIGH, FDBK 127 was reproduced on the unit; see evidence/hardware.md), Part and project reload, a power cycle, the missing-module fallback. They ran with the previous source only and carry over by argument (16 coefficient words), not by observation. What did run with this source is in [evidence/hardware.md](evidence/hardware.md) (20 October 2026), including the failed CPU self-test with six modules.
- On a unit: an MKI, eight instances at once, chip timing, LFO modulation, scenes and the crossfader, and project save and reload as a separate step (evidence/hardware.md lists what was run).
- FX1 in a card image on hardware (FX1 ran on the unit with the USB package only).
- `rig_render` on both cores, `verify_set` under the ColdFire port, `make check` as a whole.
- `stress_project.py` on a real Octatrack project and `pressure.py render`: the stress run above drives the same load straight into `dsp_host`.
- On the flashed beta base: a worst-case timing pass (no development meters there), LOFI2 beside other DSP modules, eight instances.

## Packages (here)

- `scripts/build-module-packages.py`: `lofi2` added to the effect order after `bbd`, with a descriptor guard for FX2 id 0x09 (DARK REV's descriptor as donor, the one E-Verb uses; the id's stock FX2 slot is NONE). Both guard hashes were recomputed from the tester's own OS 1.40C and equal E-Verb's recorded ones; only hashes are kept.
- `bash scripts/build-modules-isolated.sh . <new folder> <modwerk-source-tools image id>` (Docker, no network, no firmware): passed, "Compiled loadable DSP modules with four-origin relocation proofs".
- `npm run modules:import -- <folder>/packages --development`: imported. LOFI2's package in `src/engine/assets/dsp-packages.json`: 1,354 words, init 516, proc 534, words SHA-256 `4815093dc02f8363201d12eb292f7bde43607154c0abae2ac5e1f48b1262c64c` (octabam `8250be0c`; the previous source's was `dcb061b878c2cbf88706165e1bdc4779028428c1734b43056822c3a29922c47c`).

## Repository checks (here)

0.1.0's record. 0.1.1's checks are in [0.1.1](#011-re-pin-to-octabam-7795adf0-here-21-october-2026). On the re-pinned source (octabam `8250be0c`), merged with main `25d9d739` (Quant Live Rec, USB Audio base variants), 21 October 2026:

- `npm run licenses:generate`: passes with the `lofi2` licence component. `npm run sdk:imports:check` passes.
- `npm run perf:audit -- check`: no check failed (above).
- `tests.qualification` binds this source: native source `d87e5aff…`, image `69d28e95…` (MAIN.raw of beta base `6650236a`, the base the 20 October run used, reproduced here from main with the beta flags, as Output Matrix and BBD record their USB runs), the new hardware report. `npm run modules:generate` and `modules:check` pass with it.
- `npm run module:verify -- lofi2 --os <the tester's 1.40C>`: 134 selections, Quant Live Rec in the pool (rerun on `25d9d739`: the same record); 48 native module-owned images match (22 identical outright, 26 outside the platform writes), 86 matching refusals, 0 mismatches. Recorded in `sdk/native-comparisons/lofi2.json`. The 15 October run's three mismatches (native refused crowded selections for menu space where the browser builder refused for DSP space) are gone since the builder's overflow-parity fix (#682).
- The beta base rebuilt for LOFI2's chooser row with the beta flags (`octatrack:base … --resident-on-demand --controllers --usb-audio-variants --write`, Elekloader at kit pin `7b5b5b8`): on main `25d9d739` the default layout's identity is `42326894…`, .bin `3ba0b408…`, and the six other layouts pass the script's link, site and browser-build proofs (main's own `e68be568` and its variants rebuild byte-identical first). The five base-bound packages and Quant Live Rec rebuild byte-identical, and the base-bound ones' `requiredBase` names `42326894`. LOFI2's USB package stays `4f794ebc…`.
- `npm run module:doctor -- lofi2`: no red line.
- `npm run pr:ready` on this Mac (20 October 2026, after the qualification update): generated files current; licences, machines, modules:check, compat, pairs, lint, typecheck, the bundle and the app tests pass. `sdk:check` fails three tests here that do not involve LOFI2 and fail the same way without it: `test_run_pack` (packer parity), `test_base_bound` for CC Map and `test_published_module_packages_rebuild_byte_for_byte` at Tape Echo (both read a local Elekloader checkout that is not at the recipes' pin; LOFI2's package `4f794ebc…` is reported identical before it stops).
