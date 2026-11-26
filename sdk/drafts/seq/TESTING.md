# SEQ testing

Results are separated by where they ran.

### Emulator rollback after use (26 Nov 2026, draft `fix22`, package `25f5d04f…`)

Twin `4c7eb79b`, `ot_emu` without `--dsp` (with `--dsp`, USB key sequences often hit the 21 s bench limit). Build matches listed close hygiene: **unlink + LREBUILD only after LPOP** (not scrub in KEYFN; scrub that cleared whole KEY_CACHE rows wedged the emu). **ef_page** close returns with `bra 8f` (no `PAGE_GO`). **kthunks**, **ev_in_use**, **ef_unlink_queue** (Modwerk).

| Case | Result |
| --- | --- |
| open, **NO**, `remove` | pass |
| **TRACK+PAGE** toggle close, `remove` | pass (script) |
| **CUE** + T2/T3 + **TRACK+PAGE** close, `remove` | pass |
| **CUE** + **NO** | pass |

`scripts/seq-emu-rollback.sh` (26 Nov, `PKG=/tmp/seq-fix22.mwrm`): **4/4 passed**, exit 0 (~11 min, no `--dsp`).

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
build. Automated trial removal after the CUE chord is still open.

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

Each case runs a fresh emulator, installs SEQ as a trial, sends the keys
and rolls back. These results come from the emulator, not the unit. With the
layer fix alone, the **`[CUE]`** case still failed; it passed once the
handlers ran through the thunks.

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
