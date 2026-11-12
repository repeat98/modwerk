# LOFI2: hardware reports

## 0.1.1-experimental (octabam `7795adf0`): the USB package on an MKII (22 October 2026)

A functional report by ear, as the tester gave it; not a measured qualification.

- **Unit:** the contributor's Octatrack MKII, OS 1.40C, RAM-booted (never flashed) into a development twin of the beta base: identity `53ddaf60f435aedff44cf97bda8f6cba01f3fa72f4d3006db7efc48f4f067eb7`, MAIN.raw SHA-256 `712666cb0f464ed324c77aca2d7210643fdc41c18e640797030f9a90878013bd`. It is main `4d4f731d` plus two unmerged base fixes (the KEY step on first show and key-bus reader admission); neither is on LOFI2's path.
- **Package under test:** `public/octatrack-modules/lofi2/0.1.1-experimental.mwrm`, SHA-256 `a2ab27325404c06197ccf2737b64b480121c6799b439798440b8c73e7884c92c`, built from octabam `7795adf0`. It differs from 0.1.0's package below in three bytes, the SHIFT feedback cap (0.45 to 0.40).
- **Date:** 22 October 2026. **Tester:** npp1993 (the contributor of this port; LOFI2's author is Bryan T), listening at the unit; installation and settings driven over USB by a coordinating session.
- **Other modules installed:** RINGMOD SC 0.2.

| Step | Result |
| --- | --- |
| Install `a2ab2732…` over USB | accepted, generation 2 |
| LOFI2 on FX2 of one playing track (which track was not recorded); SHIFT DOWN, RNGE HIGH, FREQ 64, MIX 127, FDBK 127; input played, then stopped (the issue 825 repro) | the tail dies away, no feedback runaway: pass (by ear) |
| LOFI2's other functions on the same build | the tester reports all pass; no per-mode or per-knob detail recorded |
| Remove LOFI2 over USB | accepted, generation 3 |

Observed in the same session, not a LOFI2 result: with LOFI2 0.1.1 and RINGMOD SC installed, Sidechain Compressor was refused with loader refusal 2 (not enough module memory); after LOFI2 was removed it installed. The modules share the base's module memory; refusal 2 for a full pool is a known base behaviour (docs/OCTATRACK_BETA_TEST_PLAN.md, finding 37).

**Not run with 0.1.1:** a second instance, FX1, the other DSP core, the full module set, FREQ 72 and UP for the issue 825 case, a level measurement, Part and project reload, a power cycle and persistence (a RAM-booted twin cannot show reboot persistence), the base self-test. Those ran only with earlier sources, below.

The author's own report for the change (Bryan T, sambanks/octabam pull request 843; his MKII, his own octabam build `_bt_oct` 16; not this build): the issue 825 repro (DOWN, RNGE HIGH, FREQ 64, MIX 127, FDBK 127) dies away; eight LOFI2 in SHIFT DOWN on T1-T8 at once with FX1 empty ran with no issues; with FILTER on FX1 of T5-T8, four in SHIFT there locked the unit, on upstream `main` as well; the author attributes it to FX1 sharing the core's DSP budget. Open upstream as [octabam issue 850](https://github.com/sambanks/octabam/issues/850).

## 0.1.0-experimental (octabam `8250be0c`): the USB package on an MKII (20 October 2026)

A functional report, as the tester gave it; reported evidence by ear, not a measured qualification.

- **Unit:** Octatrack MKII, OS 1.40C, flashed beta base `6650236a…` (main's committed base at `e370b78e`, uncached module code; MAIN.raw SHA-256 `69d28e954674f18e5e3fb80c0e0ab7083755e89615bd41a7753b93f4221cc329`, reproduced here byte for byte from main with the beta flags).
- **Package under test:** `public/octatrack-modules/lofi2/0.1.0-experimental.mwrm`, SHA-256 `4f794ebcb6ebe69f4c66412463f7cef41952551b2b2484cebf2cbfe004e5662c`, built from octabam `8250be0c` (Bryan T's SHIFT fix `153063d8`).
- **Date and duration:** 20 October 2026, about 15 minutes. **Tester:** npp1993 (the contributor of this port; LOFI2's author is Bryan T), at the unit; installation driven over USB by a coordinating session.
- **Other modules installed:** Output Matrix `9f97f3bd…`, Analog BD, Apply Scene `bd90b397…`, Quantize Live Rec `026464de…` and one private module.

### Installation

| Step | Result |
| --- | --- |
| Remove the kept previous package `7ee9277f…`, then trial `4f794ebc…` and Keep | accepted (generation 2) |
| Swap back to `7ee9277f…`, then again to `4f794ebc…` | both accepted; final state `4f794ebc…` kept (generation 6) |
| Removal while a track used LOFI2 | refused, loader refusal 7 (in use), as designed |

### Panel checks (the tester's results)

On the first attempt FREQ, MIX, GAIN and SRR seemed to do nothing. The tester then found scene locks active on that track, which hold those parameters: the test setup, not the module. With the scene locks off:

| Check | Result |
| --- | --- |
| RING with RNGE LOW | amplitude modulation (tremolo) |
| DOWN and UP | an audible frequency shift |
| MODE swept through RING, DOWN and UP | works |
| FREQ, MIX, GAIN and SRR | each acts |
| The fix by ear: UP, RNGE HIGH, FREQ about 30, MIX 127, FDBK 0, bright material | "seems good": one shifted copy, the mirror image not prominent. By ear only; no A/B against the previous build was recorded |
| Two instances, T1 FX2 and T2 FX2 | both ran |
| A third on the same core, T1 FX1 | refused, DSP FULL |
| The self-sustaining SHIFT feedback found in `dsp_host` (TESTING.md, re-pin): MODE UP, RNGE HIGH, FREQ 64, MIX 127, FDBK 127, SRR 0, BRR 0, LPF 127, a short sound then silence | reproduced: a sustaining tone continued after the input ended; with FDBK turned down to 120 it died away. Level not measured ("a sustaining tone" only) |

### The base's self-test

Run over USB with `4f794ebc…` installed beside the five other modules: **FAILED**, "the CPU over 90 % (LOFI2)". Modules 6/6 intact, 2 with DSP effects, together 2/2 ran; peaks: CPU 98.8 %, T1-4 26.7 %, T5-8 43.2 %; longest frame 391 µs; card set 7, 6/6.

The failing figure is the ColdFire CPU, not a DSP core. Main's beta notes tie 80-100 % ColdFire CPU with six or seven modules to module code running uncached (`docs/OCTATRACK_BETA_TEST_PLAN.md`, findings 20, 52 and 56: testers' self-tests refused at 98-100 % CPU), and this base runs module code uncached. That this is the cause here is an interpretation, **not confirmed**: LOFI2 alone, or the same set without it, was not self-tested. LOFI2 itself has no ColdFire code (an ABI 6 DSP package with no sites).

Asked about the result afterwards, the tester said they noticed no lag or sluggishness during the session with all six modules installed. That is their impression at the panel, not a measurement.

### Not run on 0.1.0's source

BRR and LPF individually, the self-sustaining feedback in DOWN, at other FREQ values or with the previous coefficients, Part and project reload, a power cycle and persistence, the missing-module fallback, FX1 on a card image, eight instances, scenes and the crossfader. Against the previous source only 16 DSP coefficient data words differ (TESTING.md, re-pin), so its results below carry over **by argument only, not by observation**.

### Limits

- One unit, about 15 minutes, by ear; no recording, chip timing or memory check.
- The self-test failure above is unexplained on this evidence.
- The tester is the contributor of the port, not an independent reviewer.

## Previous source (history)

> **Previous source.** Everything below was run on the source pinned to octabam `21f6de90` (the unsquared SHIFT coefficients): the card image `3d63406d…` and the USB package `7ee9277f…`. On 20 October 2026 the module was re-pinned to octabam `8250be0c` for Bryan T's SHIFT fix (`153063d8`). That source differs only in sixteen DSP coefficient words (TESTING.md, re-pin), and these reports do not bind it: its own run on a unit is pending. They are kept as the previous source's history.

A functional report, as the tester gave it. It is reported evidence, not a measured stress qualification.

- **Unit:** Octatrack MKII.
- **Date:** 13 October 2026.
- **Tester:** npp1993 (the contributor of this port; LOFI2's author is Bryan T).
- **Image:** `OCTATRACK_LOFI2T03.bin`, a private native build of the submitted source (octabam `21f6de905df71c2d7e4faba6cc7b5c7f7fb53de7` with the Modwerk adaptations): LOFI2 on the FX2 chooser beside twelve stock effects, PLATE REV and SPRING REV given up, stock DSP code built in. MAIN OS SHA-256 `3d63406d3254e161b1fc52c9acfbfc14af6130b2c9314a554030e0ac060678e2`; card file SHA-256 `0446107ddea33ca5b6cb45af749dd0fd0a058d2e0ad1cc41c60dd8881bf80e99`. The image stays on the tester's computer.
- **Duration:** about 5 to 10 minutes.

## What was asked and what came back

| Check | Result |
| --- | --- |
| Select LOFI2 in FX2 SETUP; sound unchanged at the defaults; SETUP shows RNGE, MODE and AMPH, MODE's value under the knob | pass |
| RING, then DOWN and UP; no click or freeze when MODE changes | pass |
| SRR, BRR and LPF each act | pass |
| Several instances with different settings, a track in 1-4 and one in 5-8 | pass; five instances in SHIFT at once |
| A parameter lock on FREQ | works; the tester noticed the locked value stays after the locked step (see below) |
| Part reload restores the settings | pass |
| Power cycle restores the settings | pass |
| The faint residue in SHIFT after the input stops (about -77 dBFS in `dsp_host`) | "can't really hear a faint tone" |

Remarks from the same session and from an earlier combined private image (12 October source): the range label was too wide and MODE printed its value twice, both fixed before this image; "the low pass filter doesn't seem to do a ton" (LPF is a 12 dB shelf by design); "ring mode sounds like amp mod" (it is amplitude modulation by a bipolar carrier, a tremolo on RNGE LOW).

## The lock that stays after its step

The tester locked FREQ on a trigless (green) trig and heard the value hold past that step, then saw the same with stock FILTER. Checked under `ot_emu` on the tester's unmodified OS 1.40C and on this image, with one project: track 1 with trigs on steps 1 and 9 and a trigless lock on step 5, track 2 with a lock on a trig at step 5 and its next trig on step 9; locks on AMP VOL, an FX1 slot and an FX2 slot; the live track record dumped at every step for 19 steps.

On both images each locked value appears at step 5, holds through steps 6, 7 and 8, and returns to the stored value at step 9, the track's next trig. The lock timing is identical on the stock image and on the LOFI2 image (the records differ only in one page-2 byte that the firmware clamps to MODE's three values). So a lock holding until the next trig is the instrument's own sequencer behaviour, and LOFI2 follows it.

## The USB package on the beta base (15 October 2026)

The published runtime package, not a card image: `public/octatrack-modules/lofi2/0.1.0-experimental.mwrm`, SHA-256 `7ee9277f3510988366912a0b7ed4e7ca0b5523503b48844e94af7b7ff33fe976`, built from source at `c20b7756`. Same MKII, OS 1.40C, the flashed beta base `acf91e0a…`. Driven over USB by a coordinating session with `npm run device`; the panel and listening checks are the tester's. The only other module installed was APPLY SCENE.

| Check | Result |
| --- | --- |
| Trial without Keep (`try --seconds 3`) | the slot ran, then rolled back (Undo) |
| Install with Keep (`try --accept`) | accepted; the inventory lists LOFI2 at handle 9, module `d7bf66ce` |
| FX2 on T1 (core 1) and T5 (core 0), then FX1 on T1 and T5 | pass: in both choosers, defaults sound unchanged, SETUP shows RNGE, MODE and AMPH with MODE's value under the knob |
| RING, DOWN and UP, SRR, BRR, LPF | pass: RING FREQ and MIX audible, RNGE LOW a tremolo; DOWN and UP shift with FDBK, no click or freeze on MODE changes; SRR and BRR audible, LPF 0 darkens |
| Two instances on different cores (T1 and T5 FX2, different settings) | pass: independent |
| Two on one core (T1 and T2 FX2) | admitted, the other core-1 slots at NONE; clean audio, no crackle or freeze |
| A third on core 1 (T1 FX1) | refused, DSP FULL |
| Removal while a track runs it | refused twice, loader refusal 7 (in use) |
| Removal with every slot at NONE | accepted; LOFI2 left the inventory |
| Missing module | `npm run device -- missing` listed LOFI2; the reloaded project showed MODULE MISSING; after reinstalling, nothing missing and the project put LOFI2 back on T1 and T5 with their settings |
| Persistence | Part save, knob change, RELOAD: settings back. Project save, power cycle: module still installed, T1 and T5 ran LOFI2 with their settings |

Not run on this base: a worst-case timing pass (the flashed base has no development meters). The package's 637 cycles come from the timing on a development twin (TESTING.md, USB loading).

## Limits

- One unit, one short session, by ear. No measurement of chip load, no memory check, no recording.
- Five instances at once, not the eight the cycle and memory records price.
- Scenes and the crossfader were not confirmed. Project save and reload was not reported separately from the Part reload and the power cycle.
- FX2 only on the card image (LOFI2T03). FX1 was run with the USB package, above.
- LOFI2 beside other Modwerk modules: only APPLY SCENE, in the USB run.
