# Octatrack base 0.8.2: the recorder update's CS1 skip, 23 November 2026

Source: `base/octatrack-next` on main `4c35b504a` (base 0.8.1) plus `mw_rec_update` (`status.s`), hooked at
`0x4000432c` (`build_core.py`'s `DYNLOAD_HOOKS`). Idea and hardware figures for the technique: Bryan T.

## What changes

Stock's recorder control-record update runs about 1.5 times a frame for every recording track. It stores the clamped
length in the track's 44-byte record at `0x46c938c4 + 44 × id`, reads `[r+300]` and `[r+308]` of its CS1 record
(`0x100d38f0 + 1096 × id`) and writes six fields. The base's copy keeps stock's arithmetic and every other write, but
stores `[r+300]` and `[r+308]` only when the new value differs from the one it read. It reads them under stock's own
interrupt mask (stock reads them just before taking it), so no interrupt can store between the read and the skipped
write: CS1 ends as stock leaves it. The routine is replaced whole; nothing else patches `0x4000432c..0x400043f2`
(`modules:compat` and the base build's `catalogue_overlaps` pass).

## Emulator A/B (`sdk/machines/octatrack/elekloader/rec-harness/`)

Stock's routine and the base's, on two emulated machines, 1,000,000 random calls: ids 0-9; zero, short, negative and
large lengths; the flag; other writers storing into all six CS1 fields and the 44-byte records between calls; the tempo
words moving; repeated calls as in steady recording; SR at 0x2700 or lower masks. After every call, every register, the
CS1 records of ids 0-9, the 44-byte records and the arguments on the stack equal stock's. SR's system byte equals
stock's; its condition codes, and the same five bits of d0 (which ends holding SR), differ, and no C caller reads them
after a call. **PASS.** CS1 writes a call: stock 4.49, base 3.02 (6 and 4 on a call that runs the whole routine with
both values unchanged).

The harness found one mistake on the way: stock's indexed store into the 44-byte record is at +16 (objdump prints that
form's displacement in hex), not +10.

## Builds (OS 1.40C, outside Git)

| Build | Identity / MAIN.raw SHA-256 |
| --- | --- |
| Release 0.8.2 (`octatrack:base -- --beta --write`) | base `6852c1ff706094a7…`; browser = native `.bin` `4afe6fef21f7b63c…` (831,484 bytes), +220 bytes on 0.8.1 |
| Development twin of 0.8.1 (main `4c35b504a`), beta flags without controller rows, `--dev` | MAIN `ace30d0ffa6b1ee4…`, RAM-booted as `4c7eb79b844c8139…` |
| Development twin of 0.8.2, the same flags | MAIN `db0a7f9b29da8b56…` |

## On the owner's MKII

The unit started on another session's RAM-booted development twin `d7e727cd84cf2d99…` (flashed base 0.8
`e11525835106699a…`), with an empty inventory and card set 4. Its recorder setup on track 1 read INAB A B, INCD C D,
RLEN MAX, TRIG ONE, SRC3 MAIN, LOOP ON, 16 s.

The RAM boot of the 0.8.1 twin `4c7eb79b` staged and armed, and the unit did not come back on USB within 60 s, nor in
the ten minutes after (#1985's symptom: about one RAM boot in three on 22 November). No measurement ran.

## Not run

- The CPU A/B with eight tracks recording (TRACK + REC1 on each, `guard` and ten `stats` readings each on the 0.8.1 and
  0.8.2 twins), and a byte check of the recorded buffers.
- A RAM boot of the release image `6852c1ff`, a trial on it, a Keep, a power cycle and a flash.
- The unit was left off USB after the 0.8.1 twin's RAM boot; a power cycle returns it to the flashed 0.8.

## 24 November 2026: the boot stub with the late-combine guard (#2028)

`build_stub.py` now compiles `stub.s`, `stub.c` and `slots.c` one by one with `-fno-late-combine-instructions` and runs
`check_mcf54455` on the two C objects, as every other ColdFire C compile of the base does. The stub's code is 890 bytes
(was 900), `stub_body.c` `5be076c9…` (was `89b61a6d…`); `STUB_VERSION` stays 1, so units already on two slots keep their
stub and only a unit converted from this base on gets the new one.

- Release 0.8.2 rebuilt: base `c5791ec973ba6e76…` (was `6852c1ff`); browser = native `.bin` `a9d3c56a082c1513…`
  (831,484 bytes); MAIN 1,348,058 bytes (12 fewer). Base-bound packages relinked with unchanged bytes.
- Emulator: `check_stub.py` passed all six slot states on #2028's build (its description has the record).
- Not run on a unit: a two-slot conversion writes the stub to NOR at `0x4000` and only a cold start runs it. The A/B and
  release-image steps above now apply to `c5791ec9` instead of `6852c1ff`.

## 24 November 2026: the CPU record's own tracks, and the slot behind an in-use refusal

`diag.c`'s CPU record keeps every track refused since the start in its top byte and adds the tracks refused since the
previous CPU record in bits 16-23 (per-track counters that `cpu_refuse` and `status.c`'s frame admission bump; no shared word is cleared), the count now in
the low 16 bits. `dsp.c` keeps the slot whose running effect made its admission return `RUNTIME_IN_USE`, and the self-test record
carries it above the refusal (`selftest.h`, bits 16-23) only while the loader's refusal is that admission's
(`RUNTIME_CHECK_DSP`): Analog BD's and Output Matrix's controllers refuse in use too, and an earlier sync's slot must not
name a track for them. So the site names the track and FX slot.

- Release 0.8.2 rebuilt: base `8f179f5eb41220d9…` (was `c5791ec9`); browser = native `.bin` `b5336893689f44a3…`
  (831,616 bytes); container 831,600 bytes (132 more). The resident port's `dsp.c` hunks moved 4 lines, re-pinned.
  Base-bound packages relinked with unchanged bytes; Analog BD's reviewed recipe still matches.
- Host: `test_diag.c` (a second record names only its new track), `test_status.c` (a frame-admission refusal moves its track's counter: on a twin a POLY8 pick refused on T3 had logged recent tracks 0), `test_dsp.c` (T6's FX2 slot) and `test_selftest.c`
  (the slot above an admission's refusal, none above a controller's) pass; each fails without the change.
- On a unit: a development twin of this source, below. Not run: the release image itself, and an in-use refusal.
  The steps above now apply to `8f179f5e` instead of `c5791ec9`.

### On the owner's MKII, 24 November 2026

Source `6663f66d1`; `test:procedure -- --base --no-unit` passed steps 1-4 on it (package `566cc2d6…`). Development twin
`58babe99` (`build_core.py`, the beta flags without the controller rows, plus `--dev`, OS 1.40C, outside Git); a twin of
`bfe28f137`, `b2d608af`, ran the first CPU case. The unit started and ended on its flashed base `eb667962` (0.8.1) with nine
kept modules. Three RAM boots, the CF card in, nothing kept or flashed. The loaded project's Part 1 was checked equal to its
saved copy (6,322 bytes) before each case and after it, and its saved copy never changed.

| What | Twin | Observed |
| --- | --- | --- |
| POLY8 0.3.3 in a trial, picked on T1, then on T3, stopped | `b2d608af` | T1 admitted; T3 refused: "CPU FULL, T3 SRC, POLY8 NEEDS +46%, CPU 95%". CPU record `a=0x04000001`: T3 since the start, no recent track (the fault `751daf8fa` fixes). RELOAD put Part 1 back; the trial rolled back. |
| The same | `58babe99` | The same box. Record `a=0x04040001`: T3 since the start and since the last record, count 1. The record's machines show T3 on its old machine: a refused pick never reaches the track, so the pull prints "this time T3 stock", not POLY8. |
| Mini Verb in a trial on T6 FX2, the trial left to end | `b2d608af` | Rolled back: a trial's rollback parks the effect (T6 FX2 read NONE until RELOAD), so it is no in-use refusal. Self-test record: refusal 0, slot 0. |
| 18 packages as one set, 225,044 bytes, 30 s | `58babe99` | Installed, no crash, stall, freeze or skipped track; rolled back to none. |
| The other 20, 225,208 bytes, 30 s | `58babe99` | The same; CPU at 90 % or more for 1.5 s, no fault. |
| Back on the flashed base | `eb667962` | The same nine modules and handles; card set 1, 9 saved, 9 live. |

- Not run: an in-use refusal on a unit (it needs a module installed outside a trial, which on a twin takes a Keep that
  rewrites the card's kept-set file); the soak (it drives the loaded project over USB MIDI); the price; the release image.
- `test:procedure -- --base`'s large set (39 packages) was refused `RUNTIME_CONFLICT` on this twin: it holds RINGMOD SC,
  which a twin without controller rows does not admit, and its 449,088 bytes pass the module pool (0.8.1: 396,428 did not
  fit). Run as the two sets above, without RINGMOD SC.

## 25 November 2026: a table owner may rest its detours; Mute Modes 0.2.4 admitted

- **Why:** Mute Modes 0.2.4 rests while MUTE MODE is OT (`ev_in_use`, runtime.json `"rests"`), so it costs nothing while
  idle. 0.2.3 added 0.9 points of the frame interrupt at rest. Before this change the base admitted no resting table owner:
  `table_declarations.validate` read a site's length byte with the rest bit (loader.h `RUNTIME_SITE_RESTS`, 0x80) set
  as a length, so 0.2.4's declaration was refused.
- **Change:** `table_declarations.py` reads that bit on a table owner's own detours and refuses it on its table pointer
  and count sites: those must hold while the module rests, or MUTE MODE's rows would leave PERSONALIZE and the module
  could not be woken from the menu. `test_table_declarations.py` covers both cases with synthetic packages.
- **Table owner:** Mute Modes 0.2.4, package `7542f10c…` (3,026 bytes), declaration `64253fe3…`, tables at 1412 / 1480 /
  1548, beside 0.2.2 and 0.2.3. Approved by the owner on 25 November 2026. Source: Zac-Kyoti/octatrack-kyoti-fw#5.
- Release 0.8.2 rebuilt: base `910e6625e1a463e2…` (was `8f179f5e`); browser = native `.bin` `f6e46d0663a18d8e…`
  (831,656 bytes). Base-bound packages relinked with unchanged bytes.
- **On a unit (MKII, OS 1.40C, 25 November 2026):** a development twin of 0.8.1's source (`493c9cc5`, the beta flags,
  `--dev`, controller rows) with the same validator change and the three table owners, RAM-booted over the flashed
  `eb667962`. `device:price`, three readings of 8 s per state, MUTE MODE OT: 0.2.3 at rest +0.9 frame / +0.9 CPU,
  0.2.4 at rest +0.0 / +0.2. Both installed and rolled back.
- Not run: this source's own twin; MUTE MODE switched from OT to OTFX, OTFX-T and DT-T with a muted track while
  playing (0.2.4 waking); an upgrade from 0.2.3 in a kept set; an MKI.

## 25 November 2026: the UI tick's bookkeeping kept between changes (idle cost of installed modules)

- **Why:** the owner's goal (25 November 2026) is that installed modules nobody uses cost next to nothing, so big sets
  stay safe. A per-module scan on the owner's MKII (0.8.1 development twin, `profile:3`, stopped) found every DSP
  effect adding 33 to 37 µs to each UI tick while used nowhere, machines 17 to 22, Tape Echo 78, and the empty tick
  itself about 157 µs. ot_emu on development twins of this branch, PC watches at each stage of `mw_ui_tick`, traced it
  to the base, not the modules (instructions a tick, medians over 243 ticks):

  | | nothing installed | Mini Verb | Tape Echo |
  | --- | --- | --- | --- |
  | before (`bd301dacc`): whole tick | 12,793 | 15,673 (peaks 21,087) | 17,647 |
  | of which `modwerk_status_hush` | 11,092 | 12,059 | 13,131 |
  | of which the rest poll | 41 | 1,954 (peaks 7,368) | 1,824 |
  | of which deadline rows, machines, tables | 1,076 | 1,076 | 2,108 |
  | after, without the rest-poll loop: whole tick | 4,147 | 6,599 | 6,701 |
  | of which `modwerk_status_hush` | 2,387 | 3,310 | 3,361 |

- **What changed:**
  - `machine_registry.c` `modwerk_machine_pattern_trigs`: each track's 64-step trig mask is read once (8 bytes) and
    every step counted at once in bit planes. It was a byte read per step and track, 512 reads of the uncached banks a
    tick, for the busiest step and the tracks that trig of the pattern that plays (and one queued). A host test
    compares it with the step-by-step count on 2,000 random patterns of every density.
  - `machine_registry.c` `modwerk_machine_rest_booked`: the sum is kept while the loader's owner epoch (even) and the
    cost table (`status.c` `modwerk_status_costs_key`) stand; it was a search of the cost table for every installed
    module, every tick.
  - `machine_registry.c` `deadline_rows` / `modwerk_machine_deadline_effects`: the `ev_frame_deadline` rows' effect
    handles are kept while the rows, the owner epoch and the handle map's generation stand. Each row's owner was a walk
    of the loader's modules, twice a tick (Tape Echo: about 1,000 instructions, resting or not).
  - `fxmap.c`: the whole check of the handle map (3 KB of battery RAM, about 420 µs on a unit) runs once a second by
    DTIM3, with 3,600 calls as a backstop, instead of once in 60 calls. Every UI tick asks the map for each installed
    effect module, so the more effects, the more often it ran (Mini Verb's rest poll peaks of 7,368). With nothing
    installed it now runs once a second where before it rarely did: about 5,400 instructions once a second. And
    `modwerk_fxmap_handle` keeps its answers for the checked generation until an entry is written (`put`, `widened`).
  - `loader.c` rest poll: only the asking positions are judged. Stepping through all 32 for one asking module cost
    about 1,300 instructions a tick (`trace_fn`: the judge itself, `modwerk_machine_in_use`, is about 190).
- **Tests:** `test_fxmap.c` (the cache answers a reassignment and an unsealed write at once; damage that keeps the
  generation is found by the timed whole check), `test_machine_registry.c` (the bit-plane count; the rest booking
  across an install, a table change and a removal), `test_runtime_loader.py`, `test_machine_events.py`,
  `test_fract_public_registry.py`, `test_table_declarations.py`, elekloader `test_recipe`: pass.
- Release 0.8.2 rebuilt: base `fad2c7297a6ca7f1…` (was `910e6625`); browser = native `.bin` `1520e947a31dfcd9…`
  (832,656 bytes). Base-bound packages relinked to it; Recorder Loop Fix 0.1.0's bytes change with the base's addresses
  (`6b568782…`, written under `public/octatrack-base-packages/`).
- Not run on a unit: any of this. Next: the per-module `profile:3` pass on a twin of this source, and the price at rest.

## 25 November 2026: one NO leaves FX SETUP after a module pick

- **Why:** a module effect picked in FX1 or FX2 SETUP seemed stuck: its knobs did nothing until the page was left and
  entered again (Midiverb, the owner's MKII). After a pick the base shows the memory box for 1.5 s, and `status.c`
  took NO as well as YES while it showed. The musician's NO back to the effect's page closed only the box and left the
  knobs on SETUP, where a module without setup parameters has none. The owner's rule (14 October 2026) was "a popup:
  YES only closes it; any other key goes on to stock"; #640 merged the dialogs' key paths and took NO there too.
- **Change:** `modwerk_status_key` takes NO only for the other dialogs; on the box after a pick NO closes it and goes on
  to stock, as every other key does. YES still only closes it.
- **Tests:** `test_status.c` (NO closes the box and reaches stock, its release too) passes, and fails without the change.
- **On the owner's MKII (OS 1.40C, 25 November 2026):** a development twin of `8b26f3492` (ev_frame_record) plus this
  change, the beta flags without controller rows and `--dev` (MAIN `b141d148…`, booted as `f680c696…`), RAM-booted over
  the twin `e229c6a8`; Midiverb in a trial. T1 FX2 DELAY, then FUNC+FX2, MIDIVERB, YES: the memory box. One NO: the FX2
  page; PROG moved at once (0, 1, 2, 3 for three turns of three detents). The same steps on `e229c6a8` left FX2 SETUP
  showing after the NO, with every knob dead until a second NO.
- Release 0.8.2 rebuilt: base `1306e1255c983bb9…` (was `fad2c729`); browser = native `.bin` `e5ead7406b2b8ee5…`
  (832,684 bytes). Base-bound packages relinked with unchanged bytes.
- Not run: the release image; FX1; a pick refused for memory or time (its box still takes NO, unchanged).

## 25 November 2026: a module page's knob staged in its input layer too

- **Why:** after the NO fix above, the owner still found PROG stuck after a fresh pick until FX2 was left and entered
  again. Read on the unit: after DELAY, then MIDIVERB picked on FX2 SETUP and one NO, the FX2 page's input layer
  (stock's, `0x460d165c` +8: 22 bytes a knob, the slot, a 0, then the knob's record) still held DELAY's staging for all
  six knobs (step 0x100, 128 values). The panel copies a knob's definition into its record (`0x46c7dede` + 20 × knob)
  before each turn, so `mw_knob_step` found the old step at every detent, restaged the record and cleared the remainder
  the stepper carries: ten slow detents left PROG at 0, quick bursts moved it about one value in four detents. FX1 →
  FX2 stages the layer from Midiverb's page, which is why that cleared it.
- **Change:** `mw_knob_step` (`fxpage.s`) also stages the turned knob's definition in the page's input layer, as its
  record, when the definition is that knob's and names the main pages' knob routine (`0x40055008`); a held scene's
  or a window's layer is left as it is, and stock pages still go straight on.
- **Tests:** `knob_step_fixture.cpp` case E (opt-in `sdk/tests/test_knob_step.py`, run on a development twin's MAIN):
  the definition staged, the next turn keeps the remainder, a scene's definition and a stock page's layer untouched;
  8 checks pass, and case E fails without the change.
- **On the owner's MKII (25 November 2026):** twin `6ff8e526` (this source plus `ev_frame_record`, MAIN `06b3f9ce…`),
  Midiverb in a trial. T1 FX2 DELAY, then FUNC+FX2, MIDIVERB, YES, NO: the layer held DELAY's staging; twelve slow
  detents (about 0.5 s apart) took PROG 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, the pace it had after FX1 → FX2 on the
  twin before; the layer then held PROG's step (0x2aa) and count (48).
- Release 0.8.2 rebuilt: base `a991caf0e7b55b31…` (was `1306e125`); browser = native `.bin` `247a1173db25f62f…`
  (832,704 bytes). Base-bound packages relinked with unchanged bytes.
- Not run: FX1; SRC, AMP and LFO pages of module machines; RINGMOD SC's KEY on a unit.

## 26 November 2026: a retriggered recorder's bank no longer blocks syncs (#2211)

- **Why:** a tester's syncs were refused as `unsafe` at `enter` ("Stop playback or finish recording") on a stopped
  unit until a power cycle, in a session where they had recorded into Flex buffers with track recorders.
- **Cause:** stock keeps two state rows per track recorder (`0x80004f1e + 84 × (track + 8 × bank)`, 0 idle, 1 pending,
  2 recording) and selects the bank each track records into with bit t of `0x80004f18`. A recording started again
  while it records moves to the other bank; STOP clears only that one, and the bank it left keeps its 2 until the
  track records again. `modwerk_machine_stopped()` read any nonzero row as recording, so the base stayed "not
  stopped", and `boot.c` did not press STOP either.
- **Change:** `modwerk_machine_recorder_busy()` (`runtime.c`) reads the row each track records into, and its other row
  only for a state other than idle or that retained 2. `modwerk_machine_busy()` names the reason and the track; the
  self-test reply carries it in the refusal word's top byte (`ep0.c`), and the site records it on an unsafe
  `sync_failed` (`busy`) and names the recorder's track in its notice.
- **Tests:** `test_runtime.c` replays the emulator's row sequence (`sdk/drafts/beat-slicer/boot_recorder.py`);
  `octatrack-link.test.ts` and `octatrack-diagnostics-fields.test.ts` for `busy`.
- **On the owner's MKII (26 November 2026):** development twin `c6e64b77…` of this branch (beta flags without controller
  rows, `--dev`), RAM-booted over the flashed 0.8.1. T1's recorder started with T1 + REC AB (key 0x2b), readings of the
  bank word and T1's two rows (bytes 0-3, the state at +2):

  | Step | `0x80004f18` | T1 bank A | T1 bank B | Result |
  | --- | --- | --- | --- | --- |
  | STOP | 1 | `00000000` | `00000000` | |
  | T1 + REC AB | 0 | `00000201` | `00000000` | recording in A |
  | T1 + REC AB again | 1 | `00000201` | `00000201` | moved to B, A keeps 2 |
  | STOP, and 10 s later | 1 | `00000201` | `00000000` | **A's 2 retained** |
  | try a module, not accepted | | | | admitted, trial ran, rolled back; `busy` 0 |
  | T1 + REC AB (live recording) | 0 | `00000201` | `00000000` | `busy` 1 (track 1's recorder); **enter: unsafe** |
  | STOP | 0 | `00000000` | `00000000` | `busy` 0 |

  The retained 2 is the state that the old test read as recording until a power cycle; the twin admits the change
  with it, and still refuses while T1 really records. Nothing was saved or kept.
- Not run: the same steps on a twin with the old test (the unit had none booted; the flashed 0.8.1 takes no USB keys);
  the release base, which still needs Analog BD's recipe recaptured once the 0.8.2 fixes are folded.

## 26 November 2026: the release image with the testers' fixes (#2216)

In since the entry above: NO and the arrows on a MODWERK page go back to the menu (#2217); big DSP effects load under
Sidechain's engine words, and a refused COMPRESSOR pick says SIDECHAIN PAUSED / DSP MEMORY (#2222, for #2189); a power-up
keeps the current bank when stock's checks fix a value, with a RESTORE record (#2223, for #2201); a freeze records the
processor's PC, level and task (#2226, for #2225: the save freeze itself was not reproduced). The saved-set change #2109
is still an open draft and is **not** in 0.8.2.

- **Builds** (OS 1.40C, outside Git): main `4d4af12f2` merged; Analog BD's recipe recaptured (only its `imageSha256`,
  `ec3a42c0` → `3d24a7fe`). Release base `24e480c435a41324…`, browser = native `.bin` `390ae8f5702aa234…` (834,708 bytes;
  container 834,692 of 851,712). Development twin of the same source with controller rows `8a3417258c90dfda…`.
- **Base-bound packages relinked:** the controller write lease moved (`0x40a9d794`/`0x40a9d7b0` → `0x40a9d850`/`0x40a9d86c`).
  Output Matrix 0.1.1 `0c9e62f2…`, Analog BD 0.1.7 `2ce9f2f5…` and Sidechain Compressor 0.2.2 `f403fd92…` are the 0.8.1
  packages with those two addresses substituted and no other byte changed (6, 2 and 2 words), so their active-load
  readings are rebound (`2026-11-21-octatrack-active-load.json`).
- **Release image on the owner's MKII, RAM boot over the flashed 0.8.1:** back on USB in 18 s; a Screen Off trial
  admitted and rolled back; development keys refused, as a release base refuses them. The first screen read BASE UPDATE /
  WAITING FOR MODWERK (an unconfirmed RAM boot), then MISSING MODULES for the project's seven modules.
- **Development twin `8a341725` over USB** (throwaway copy of a project; nothing saved, kept or flashed):

  | Case | Why this change makes it a risk | How run | Result |
  | --- | --- | --- | --- |
  | A retriggered recorder, then a sync (#2221) | the busy test reads the selected bank only | T1 + REC AB twice, STOP, try a module; then T1 + REC AB and try again | pass: bank B kept 2, trial admitted and rolled back; refused `unsafe` while T1 recorded |
  | Sidechain beside E-Verb and Resonator (#2222) | big effects now load below Sidechain's words | E-Verb T6 FX2 (@2361), Resonator T7 FX1 (@850), COMPRESSOR on T5 FX1 | pass: FX1 SETUP shows RMS MON KEY KGN KBAS KWID |
  | NO and the arrows on MODWERK pages (#2217) | the page now returns to the menu instead of closing it | SETTINGS > NO, RIGHT, LEFT; MODULES > NO; PROJ | pass: each back on the MODWERK list; PROJ closes it |
  | MODULES on/off with the menu open (#2217) | the list redraws under the open page | twin `8a341725`, Slow LFO 0.1.0 kept; PROJ > MODWERK > MODULES, YES, YES, NO | pass: OFF, then ON, the page stayed; NO back on the MODWERK list at MODULES |
  | Power-up with a clean bank (#2223) | the base now runs stock's checks before stock's restore | two boots | pass: no RESTORE record (none expected), Part 1 back with its effects |
  | Power-up with a value to fix (#2223) | the case the tester hit | emulator two-process power cycle only | not run on a unit: the tester's value is unknown |
  | Playing with picks and Part switches | the UI tick and restore changes run every frame | set + picks, 12 s and 90 s with Part switches | pass: 0 stalls, 0 skips, 0 late entries, CPU 37-52 % |
  | E-Verb picked beside Tape Echo | the effect placement below Sidechain's words | `pick:T6:FX2:E-VERB` with Tape Echo in the set | fail: not admitted within 5 s, on T6 FX2 later; unexplained |
  | CPU with eight tracks recording, 0.8.1 vs 0.8.2 | the recorder skip's saving | twins side by side | not run |

- **Flash and Keep, 26 November 2026, over USB (the owner away from the unit):** release `24e480c4` RAM-booted again, then
  `npm run device -- flash`: written and verified into slot B (generation 24, not confirmed, no start used; 0.8.1 stays in
  slot A, generation 23). The project's three missing modules kept on it: Tape Echo 0.1.9, Euclid 0.1.5, Air Chorus
  0.1.3 (trial 8 s, no crash, stall, freeze or skipped track; MISSING then empty). No restart after the flash: every
  restart, a RAM boot too, spends one of the unconfirmed slot's starts.
- **Not run:** the first start from slot B (a power cycle with USB connected 15 s confirms it), with the project's bank
  and the kept set coming back; the CPU A/B.
