# SEQ testing

Results are separated by where they ran. Nothing ran in the emulator yet.

## Host (26 Nov 2026, branch `module/seq`)

- `python3 -B sdk/drafts/seq/verify.py`: 4 tests pass. `seq.s` assembles for
  the 54455 with no undefined symbols; every `runtime.json` handler and
  manifest symbol is a global text symbol; `upstream/seq.s` is the pinned
  file (SHA-256 `625f0fda…0b63`); the `seq.work` payload offsets, `ef_bank`
  through `ef_dirty`, equal upstream's.
- `npm run module:dev -- seq --build-only`: `seq.mwrm`, 36,760 bytes of code
  and data, 0 of bss, 881 relocations, 8 hooks, 3 stock-code sites.
- `npm run module:doctor -- --draft seq`: the experimental lines are green,
  including cross-compatibility with every active module and the base.

## On the unit: procedure (26 Nov 2026)

Build: revision `69ce65cf`, package SHA-256 `880a54b1…2b26`. Author's MKII,
development twin `4c7eb79b` RAM-booted over the flashed base `eb667962`
(no modules kept). Author's project, A02, Part 1, stopped.
`npm run test:procedure -- seq --no-emulator`:

| # | Step | Result |
|---|---|---|
| 1 | Software checks | passed |
| 2 | Beside every other module | judged by step 1 (draft) |
| 3 | Name the build | passed |
| 4 | DSP cost model | passed |
| 5 | Emulator rehearsal | not run: no adapted `ot_emu` on this computer |
| 6 | Read the unit | passed |
| 7 | Scripted unit pass | passed: no crash, stall, freeze or skipped track; rolled back |
| 8 | Soak | passed: 2,400 operations in 120 s; 0 pattern changes (the project's program-change receive is likely off) |
| 9 | Cost on the unit | passed: at rest adds 0.0 points of the frame interrupt (60.3 before and with it), DSPs within noise |
| 10 | Put back | passed |

## On the unit: by hand (26 Nov 2026)

Same build and twin, A03 (a scratch pattern the author chose), Part 1,
stopped, inside a `module:dev` trial. Keys sent over USB, with screenshots;
trig masks read from the pattern in RAM.

| Check | Result |
|---|---|
| **`[TRACK 1]`** + **`[PAGE]`** opens SEQ | pass: **PULS** 5, **ROT** 0, **TRIG**, **SRC** / **PTCH**, **DPTH** 0, `1>` |
| **PULS** 3, **`[YES]`** | pass: TRIGS CREATED; trigs on steps 1, 7, 12 |
| Turning **ROT** after a write | pass: ARE YOU SURE? opens. The author's own **`[YES]`** unlocked the knobs. A USB-sent **`[YES]`** also reached SEQ's key layer and wrote again, so the knobs stayed locked: a driver artifact, not seen with a real press |
| **ROT** 2, **`[YES]`** | pass: steps 3, 9, 14 |
| PLCK lane, **PULS** 8, **DPTH** 20, **`[YES]`** | pass: trigless trigs on steps 1, 5, 7, 11, 13, 15 (the eight lock steps without the sample trigs) |
| **`[RIGHT]`** | pass: Harmony, `<2`, **SCAL** **MAJ**, **ROOT** **C**, **PHRS** **RAND**, **JUMP** 0; no **VOIC** or **CHRD** on an audio track |
| **`[FUNC]`** + **`[BANK]`**, **CLEAR ALL+TRIGS** | pass: the three menu rows show; trig and trigless masks cleared; SEQ returns |
| **`[MIDI]`** | pass: **NOTE** / **NOTE**, MIDI tracks marked |
| **`[TRACK 2]`** | pass: SEQ and stock both move to track 2 |
| **`[NO]`** | pass: closes to the stock page |
| health during the trial | no crash, stall or loader error |
| **The trial's rollback** | **fail:** the base refused it, `needs-recovery`; `recover` was refused the same way and the inventory still listed SEQ. The procedure's step 7 trial, where SEQ was never opened, rolled back. `diaglog` names no reason. The author's power cycle returned the flashed base with an empty set |

Not run: saving and reloading `seq.work` (needs a project save on the
author's project), MKI paths, KITS and Track Solo beside SEQ, audio
recording over USB.

Open: find what blocks the removal after SEQ has been used (its event
subscriptions put the base's dispatch under the loader's paused-task check;
its window, key layer and toasts are the other candidates). Reproduce in the
emulator before the next unit run.

## On the unit: still to check

On an MKII and an MKI where available:

1. Install over USB; the self-test passes.
2. **`[TRACK]`** + **`[PAGE]`** opens SEQ on audio and MIDI tracks; **`[NO]`** closes it; bare **`[PAGE]`** stays stock.
3. **`[YES]`** writes TRIG and PLCK rhythms; **`[FUNC]`** + **`[BANK]`** clears them (MKII and MKI paths).
4. D never shows an FX page-2 or CX parameter.
5. Save the project, power-cycle, load it: SEQ's settings return.
6. A `seq.work` written by octabam's SEQ loads with its rhythms and depths.
7. With KITS installed beside SEQ on an MKI, **`[FUNC]`** + **`[BANK]`** still reaches KITS' SAVE KIT outside SEQ.
8. With Track Solo installed: a **`[TRACK]`** press in SEQ reaches stock first, so a 0.5 s hold solos that track and SEQ follows it. Check that both still behave.

## Stock flows

Not tested.

## Performance

At rest on the MKII twin above: 0.0 points of the frame interrupt
(`device:price`, 3 readings of 8 s, A02 playing). SEQ adds no frame-interrupt code: its detours are on the PAGE
key and FUNC+BANK paths in the UI task, and its hooks run in the project-file
task.
