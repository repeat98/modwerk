# SEQ testing

Version **0.1.0-experimental** (`sdk/octatrack/modules/seq`). Results are separated by where they ran.

## CUE and trial rollback (fix36)

Package SHA-256 `5c88a76b8748de8e656351884e2249805061c2d803ca387820fd2c74a565d771`.
Development twin `4c7eb79b`. After closing SEQ following CUE, the draft
clears remaining SEQ pointers in the stock dispatch cache after the layer
is popped and the cache rebuilt. The cleanup saves its registers in correctly
sized frames. The host verifier passed all four checks.

The emulator passed removal trials after pressing **`[CUE]`** then
**`[NO]`**, after tapping **`[CUE]`** before pressing **`[TRACK 2]`** and
**`[TRACK 3]`** and closing with **`[TRACK 1]`** + **`[PAGE]`**, and after
holding **`[CUE]`** through the track presses and closing with
**`[TRACK 1]`** + **`[PAGE]`**. The loader reported an empty
slot during each removal trial. On the MKII in A03, the tap sequence
left SEQ installed after timed Undo and an explicit recovery attempt, both
with `needs-recovery`. This sequence can open the rhythm confirmation on a
track with existing trigs. The run did not capture the screen immediately
after CUE, so it did not establish which UI state blocked Undo. The trial
was never accepted. A power cycle returned the flashed base with no live
modules.

Two fresh timed trials on the same MKII then passed. Both ended at the
development twin's original active identity with an empty live inventory.
The loader reported zero saved modules before and after the trials.

| Keys after opening SEQ on T1 | LCD and rollback |
| --- | --- |
| Hold CUE, press and release T2 and T3, release CUE, then close with TRACK+PAGE | Stock page after the close. Timed Undo passed at generation 2. |
| Tap CUE on the track with existing trigs, then press NO twice | CUE opened ARE YOU SURE?. The first NO returned to SEQ. The second NO returned to the stock page. Timed Undo passed at generation 4. |

On 27 Nov, standalone `remove` also passed on the MKII with the same
package and development twin. The accepted installation showed one live
and one saved module. Holding CUE through T2/T3 and closing with
TRACK+PAGE returned the LCD to the stock page. `remove --accept` then ran
with an empty slot and zero loader refusals, and finished at generation 2
with zero live and zero saved modules. The trial log reported no crash,
stall, freeze or skipped track.

On 28 Nov, shipping package `5c88a76b` on twin `43ac24652a89f28b`, the
author re-ran the CUE tap case that failed on A03 in the draft package:
tap **`[CUE]`** on a track with trigs, press **`[NO]`** twice, close with
**`[TRACK 1]`** + **`[PAGE]`**, then timed Undo. The trial rolled back
with an empty inventory.

### Emulator rollback after use (26 Nov 2026, draft `fix22`, package `25f5d04f…`)

Twin `4c7eb79b`, `ot_emu` without `--dsp`. With `--dsp`, USB key sequences often hit the 21 s bench limit.

For each case, start a fresh emulator session, install and accept the SEQ trial,
open SEQ on **`[TRACK 1]`**, send the listed keys, then run standalone
removal. A pass means removal rolled back without `RUNTIME_UI_OPEN` or
`needs-recovery`.

| Keys after opening SEQ | Result |
| --- | --- |
| Press **`[NO]`** to close, then `remove` | pass |
| Close with **`[TRACK 1]`** + **`[PAGE]`**, then `remove` | pass |
| Hold **`[CUE]`**, press **`[TRACK 2]`** and **`[TRACK 3]`**, close with **`[TRACK 1]`** + **`[PAGE]`**, then `remove` | pass |
| Press **`[CUE]`**, then **`[NO]`**, then `remove` | pass |

All four emulator rollback cases passed on 26 Nov 2026 in about 11 minutes without `--dsp`.

## On the unit: close and trial removal (26 Nov 2026, fix22)

Author's MKII, OS 1.40C. Flashed base `eb667962` (USB keys need a development
image; trial upload there still reports slot running with loader refusals).
**RAM-booted development twin** `4c7eb79b`, stopped, author's project.
Package SHA-256 `05120b20ec4f52f321cebd71babf4b536d928bc3a6ba8d10fdadff08248070a9`
(branch `module/seq`, draft `seq.s` with unlink + selective scrub after LPOP,
`ef_page` close without `PAGE_GO`, `ev_in_use`, kthunks). Keys over USB
(`device-send` / `device.mjs key`).

| Scenario | Result |
| --- | --- |
| `try` 60 s, `--accept` | pass: verdict clean, generation 1, package active |
| **`[TRACK 1]`** hold, **`[PAGE]`** release (open) | pass: USB sequence completes |
| **`[CUE]`** press/release, **`[TRACK 2]`**, **`[TRACK 3]`**, release, **`[TRACK 1]`** + **`[PAGE]`** close | pass: sequence completes; status stays normal; no trial fault in the run |
| **`remove`** right after the CUE chord | **fail:** loader refusal 11 `RUNTIME_UI_OPEN` |
| **`[NO]`** then **`remove`** after the CUE chord | **fail:** same `RUNTIME_UI_OPEN` |
| Open via **`[TRACK 1]`**+**`[PAGE]`**, close via **`[PAGE]`**, **`[NO]`**, **`remove`** | pass: `rolled back`, generation 3 |
| health during accepted trial | no new crash/stall in trial verdict for these runs |
| `diaglog` | one crash record still listed (vector 14, PC `0x400005a6`); not tied to a step above |

After the same chord on the panel (not the automated `remove` rows), the
author reported SEQ open/close and stock page behaviour acceptable for this
build. The fix36 tests above supersede the removal failures on fix22.

## Host (26 Nov 2026, branch `module/seq`)

- `python3 -B sdk/octatrack/modules/seq/verify.py`: 4 tests pass. `seq.s` assembles for
  the 54455 with no undefined symbols; every `runtime.json` handler and
  manifest symbol is a global text symbol; `upstream/seq.s` is the pinned
  file (SHA-256 `625f0fda…0b63`); the `seq.work` payload offsets, `ef_bank`
  through `ef_dirty`, equal upstream's.
- `npm run module:dev -- seq --build-only`: `seq.mwrm`, 36,760 bytes of code
  and data, 0 of bss, 881 relocations, 8 hooks, 3 stock-code sites.
- `npm run module:doctor -- --draft seq`: the experimental lines are green,
  including cross-compatibility with every active module and the base.

## On the unit: `test:procedure` for catalog release (27 Nov 2026)

Build: revision `90ecc046`, package `5c88a76b8748de8e656351884e2249805061c2d803ca387820fd2c74a565d771`. Author's MKII, OS 1.40C. Flashed **release base** `eb6679620d0c9ed7` does not answer USB development requests, so the runner RAM-booted the **development twin** `43ac24652a89f28b` built from that release (`scope-dev-current-20261127-2`; a power cycle returns to `eb667962`). Author's project, bank **A pattern 2**, Part 4, stopped (`--pick-pattern 2`). `npm run test:procedure -- seq --no-emulator --out /tmp/seq-procedure-release-eb667962`:

| # | Step | Result |
|---|---|---|
| 1 | Software checks | passed |
| 2 | Beside every other module | passed |
| 3 | Name the build | passed |
| 4 | DSP cost model | passed |
| 5 | Emulator rehearsal | not run (`--no-emulator`) |
| 6 | Read the unit | passed |
| 7 | Scripted unit pass | passed (`device:test`; rolled back, no crash/stall/freeze) |
| 8 | Soak | passed (120 s seeded soak) |
| 9 | Cost on the unit | passed: 0.0 frame points at rest (`evidence/cpu-price.json`, twin of `eb667962`) |
| 10 | Put back | passed |

## On the unit: procedure (26 Nov 2026, earlier draft package)

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

## On the unit: persistence and stock flows (28 Nov 2026)

Package `5c88a76b…`, twin `43ac24652a89f28b`, author's project on the MKII.
The author saved the project with SEQ installed, power-cycled, reloaded the
project, and opened SEQ on a track that had written rhythms: PULS, ROT, LANE
and depths matched the state before save. After the power cycle the unit ran
the flashed release base `eb667962` (no development USB). For the reload check
the author RAM-booted twin `43ac24652a89f28b` again; SEQ stayed in the kept
module set on the card, so the project load did not need a new trial. The stock-flow rows from
`docs/TEST_PROCEDURE.md` (project copy and save with the module kept) passed
on the panel.

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

Persistence on the shipping package is recorded in the section above. This
by-hand row used draft package `880a54b1…` only.

## Emulator: rollback after use (26 Nov 2026)

The unit's failed rollback reproduced in the emulator (`ot_emu` on the
twin base, the build of 6d814d4d). The base refuses removal while its UI
walk finds a word pointing into SEQ. Two causes, both fixed in 924a6e6a:

- A stock layer pushed above one of SEQ's (the **`[TRACK]`** hold, the
  CLEAR list's cancel) keeps its next link at SEQ's layer after stock pops
  it, and `LPOP`'s cache refill follows that link.
- Upstream's **`[CUE]`** release handler overwrites `%d2`, where stock's key
  dispatch (`0x40031734`) keeps the key number. Stock then cleared the
  wrong key's held flag, and **`[CUE]`** stayed routed to SEQ.

Each case ran in a fresh `ot_emu` session on twin `4c7eb79b`. The test
started a SEQ trial, accepted it, opened SEQ on **`[TRACK 1]`**, sent the keys below, then
ran standalone removal. A pass means removal rolled back without
`RUNTIME_UI_OPEN` or `needs-recovery`. These results come from the emulator,
not the unit. With the layer fix alone, the **`[CUE]`** case still failed; it
passed once the handlers ran through the thunks.

| Keys after **`[TRACK 1]`** + **`[PAGE]`** | 924a6e6a |
| --- | --- |
| **`[NO]`** | pass |
| **`[TRACK 1]`** + **`[PAGE]`** | pass |
| **`[FUNC]`** + **`[BANK]`**, **`[NO]`**, **`[NO]`** | pass |
| encoders, **`[YES]`**, **`[NO]`** at the dialog, **`[NO]`** | pass |
| **`[CUE]`**, **`[NO]`** | pass |
| **`[CUE]`**, **`[MIDI]`**, **`[TRACK 3]`**, **`[NO]`** | pass |
| the by-hand flow above | pass |
| bare **`[PAGE]`** twice (SEQ never opens) | pass |

## Not tested

- MKI: install, **`[TRACK]`** + **`[PAGE]`**, FUNC+BANK clear path, and D
  never offering FX page-2 or CX destinations (the SymbolRef exists; no MKI
  unit run).
- KITS beside SEQ on an MKI: **`[FUNC]`** + **`[BANK]`** reaching KITS' SAVE
  KIT outside SEQ.
- Track Solo beside SEQ: a 0.5 s **`[TRACK]`** hold soloing while SEQ follows
  the track change.
- A `seq.work` written by octabam's SEQ on hardware (layout only in
  `test_seq_port.py`).
- Audio capture over USB while editing SEQ.

Hardware rows name two RAM-booted twins of release base `eb667962`: full id
`43ac24652a89f28b` in the 27 Nov catalog procedure and stress runs, and
`4c7eb79b` in the 26 Nov draft-package runs.

## Performance

At rest on twin `43ac24652a89f28b`: 0.0 points of the frame interrupt
(`device:price`, 3 readings of 8 s, bank A pattern 2). SEQ adds no
frame-interrupt code: its detours are on the PAGE key and FUNC+BANK paths in
the UI task, and its hooks run in the project-file task.
