# Play Modes testing

## Commands and exact revision

Source: [devilfish707/Octaplay](https://github.com/devilfish707/Octaplay)
`playmodes/` at commit `41dbdaa` (build 24 source, `playmodes.s` generated
with the author's m68k-elf-gcc, 8 Oct 2026); this folder is that source
with `manifest.py`'s category set to MACHINES, without the firmware probe
`investigate.py` (it stays in Octaplay).

```sh
python3 verify.py        # host suites; with m68k-elf-gcc also the ColdFire unit
python3 generate.py      # regenerates playmodes.s (playmode.c + adapter.c + hooks.s)
```

Host gate, author's Mac (Homebrew python 3.14, m68k-elf-gcc) and a Linux
container (gcc, host only): all pass. A deliberate defect (PINGPONG playing
its end step twice) fails the engine suite with 382 failures, so the checks
bite.

What the host suites cover:

- NORMAL / REVERSED for every length 1–64 over three passes.
- PINGPONG: exact sequences for lengths 1, 2, 4; for 3–64 every move is
  ±1 and the end steps are not doubled; it keeps bouncing across passes.
- PINGPONG 2: exact sequences for lengths 1 and 4; for 2–64 every move is
  ±1 and only the end steps repeat, once per turn.
- SHUFFLE: for every length 1–64 and four seeds, each of eight passes plays
  every step exactly once; the order changes between passes.
- RANDOM: 64,000 steps over 16 within ±10 % of uniform; repeats occur.
- NORMAL scale mode: all tracks share one RANDOM / SHUFFLE order; PER TRACK:
  each its own.
- Look-ahead: the step predicted one ahead (also across the pattern end) is
  the step that then plays.
- While stopped: what stock prepares is what PLAY then plays, every mode,
  both scale modes.
- PLAY restarts every track (via the transport-start stubs); playback alone
  never does.
- Lengths: pattern length under NORMAL scale mode; per-track length under
  PER TRACK, cut to the steps MASTER LENGTH lets the track reach, at
  different track scales; INF and 0 do not cut.
- The display (the UI's step query), the popup text, held TRACK + arrows.
- The playhead wins over the pattern bytes: pattern bytes say 10 but stock
  plays 16, and the reverse; a length edit is taken at once; NORMAL passes
  every step through; MASTER LENGTH uses the MASTER SCALE (`0x8e52`); a
  14-step track under MASTER LENGTH 16 (stock 0..13, 0, 1) keeps 14 as its
  length, REVERSED 14..1, 14, 13; PINGPONG 1..14, 13, 12 and PINGPONG 2
  1..14, 14, 13 every master loop.
- Per pattern: two patterns keep their own modes across switches.
- The project lines: their exact text, one per pattern that is not all
  NORMAL, a storing load pass starting from NORMAL, the parse-only pass
  storing nothing, other `#` lines and bad pattern names left alone, short
  lines and bad digits, an older single-line format applied to every pattern.
- Battery RAM: the whole table (all 256 full rows) back after a simulated
  power cycle, a damaged copy read as all NORMAL, nothing written outside
  `0x100f8600..0x100f8f06`.
- Pattern copy / paste / undo through the memcpy hook: the clipboard and
  undo rows, the battery copy ignored, track copies and odd addresses left
  alone, the playing pattern picking up a paste.
- Clear pattern: only that pattern back to NORMAL, the playing one at once,
  the clipboard and odd addresses left alone, the clear in battery RAM.

## Hardware and audio quality

Author's MKII (devilfish707), OS 1.40C, test images built with octamod
(`playmodes-test`: this module and the stock effects), 3–7 Oct 2026. Short
interactive sessions per build, not timed; no stress project.

| build | result |
|---|---|
| 12 | Modes switch with TRACK + UP/DOWN, popup shows `ALL …` / `T1 …`; arrow direction right; PER TRACK shows the track's own mode. LEDs still stock. |
| 13 | LEDs follow the played step. Found: STOP + PLAY did not restart PINGPONG; PER TRACK tracks stopped at 16 (MASTER LENGTH 16, stock). |
| 14 | Restart by run start time: PINGPONG only played forward (that time is rewritten during playback). Reverted. |
| 15 | Restart from the four transport-start sites: PINGPONG bounces and restarts on PLAY. Found: NORMAL → STOP → REVERSED → PLAY fired step 1's trig once at step 16's place. |
| 16 | Mode changes rebuild the prepared step; stopped preparation uses the next run. The phantom is gone. Longer patterns (32/48/64), PER TRACK with MASTER LENGTH INF and various lengths and modes, pattern changes across banks 1–2 and tempo changes all behaved. |
| 17 | Modes saved with the project (one set for all patterns then). Found: the set was shared by every pattern. |
| 18–19 | Per-pattern modes, battery RAM table, pattern copy / paste / undo, clear, PINGPONG 2. About 15 minutes on build 19: PINGPONG 2, save / reload, power cycle, copy / paste (also to other banks) and clear all work ([evidence/hardware.md](evidence/hardware.md)). Found: NORMAL scale mode LEN 10, switched to PER TRACK (16/16), still played 10 steps. |
| 20 | Each track's length follows where the stock playhead really wraps; NORMAL passes every step through; the PER TRACK master cut uses the MASTER SCALE. The reported case is fixed on the unit. Found: PER TRACK, a 14-step track, MASTER LENGTH 16, REVERSED started on step 5 and looped steps 1–2 (MASTER LENGTH's 2-step pass taken as the length). |
| 21 | The longest pass is kept, so MASTER LENGTH's short passes no longer count as the length. REVERSED works. Found: PINGPONG drifted across master loops instead of starting over. |
| 22 | A MASTER LENGTH restart starts PINGPONG and PINGPONG 2 over from step 1; RANDOM and SHUFFLE start a new order. Reported working on the unit. Found: a 15-step track under MASTER LENGTH 16 (stock plays its step 1 twice: the 16th step, then the restart) played step 14 twice in PINGPONG. |
| 23 | The same step twice counts as a new step, so that restart is seen: PINGPONG plays 1–15, 14, then 1. Checked by ear on the unit. Found: the trig LEDs showed step 1 on the 16th step (they trail the step the tick has already prepared). |
| 24 | Each track keeps its last two played steps for the LEDs. LEDs and sound agree on the unit for 15/16 in PINGPONG, PINGPONG 2 and REVERSED, on 14/16 and on a normal 16-step pattern. |

No audio artefacts were heard; audio was not measured (the module adds no
DSP and changes only which step's trig fires).

## Stock flows

- Unchanged by design, and seen unchanged with every pattern on NORMAL:
  playback, PLAY / STOP, tempo, track length and scale, chains, CHAIN AFTER,
  pattern changes across banks, the trig LEDs.
- Deliberate changes: TRACK held + UP / DOWN changes the mode and does not
  reach the stock arrow handler (the author found no stock function of that
  chord on the main screen); `project.work` gains
  `#PLAY_MODES=` comment lines (stock ignores `#` lines); pattern copy,
  paste, undo and clear also move or reset the pattern's modes.
- Not tested: MKI, live recording, trig conditions, micro-timing, slides,
  MIDI tracks beyond a first check, PROJECT > NEW, the arranger, scenes and
  Parts while a mode other than NORMAL plays.

## Performance

Instruction counts of the module's own code in octabam's ColdFire emulator
core (no firmware), with a 32-cycles-per-instruction allowance:
[evidence/cycles.md](evidence/cycles.md). One track step: 1,884
instructions measured (SHUFFLE), bounded at 4,654; sixteen tracks: 74,464
instructions, 2,382,848 cycles, against 6,600,000 for one step at 300 BPM
and 2X scale. No chip timing, no `evidence/performance.json` (perf:audit)
yet.

## Resources

14,876 bytes, all shared: code 7,700, read-only data 102, state and the
pattern table 4,764 (SDRAM platform reserve), battery table 2,310 (CS1
`0x100f8600..0x100f8f06`); stack at most 120 bytes; no heap, DSP memory,
cave space or effect ID. 35 detours, each guarded by the SHA-256 of the
stock bytes it replaces. [evidence/memory.md](evidence/memory.md).

## Hardware

See "Hardware and audio quality": interactive tests on one MKII, no timed
stress run, no chip timing. Qualification for publication still needs the
stress project, its duration and the checks of
`docs/MODULE_QUALIFICATION.md`.

## OT UI capture evidence

7 Oct 2026, devilfish707: `scripts/capture-module-ui.py` with octabam's
`ot_emu` (SHA-256 `f438a3c9…a530c`) on the author's build 19 MAIN OS image
(SHA-256 `24d22dc0…87f6`, the image tested on the unit), MKII panel, empty
scratch card, plan in Octaplay `tools/modwerk/capture-plan.json`: dismiss the
date prompt, hold T1, press DOWN (capture `ALL REVERSED`), press DOWN twice
(capture `ALL PINGPONG 2`), release T1. Record: `media/capture.json`. Both
images checked by eye: the popup over the A01 main screen, no error. They
show the TRACK + arrow control and its popup; they do not show playback.

## Modwerk 0.1.1 release validation

The imported runtime is the author's build 24, Octaplay `41dbdaa`, from
Modwerk fork commit `72cbf56`. The Modwerk version is 0.1.1-experimental.
The project/battery table layout and persistence handlers are unchanged.
Build-19 physical power-cycle and save/reload results remain historical;
build-24 physical reboot, Part/project reload after unsaved edits and
distinct-track isolation have not been rechecked. FX slots and DSP cores
do not apply to this ColdFire project module.

Modwerk's source checks, native/browser composition and current-release UI
captures are recorded below when completed. No firmware is committed.

- `python3 verify.py`: both host suites and the generated ColdFire unit pass.
- Original build-19 adapter with the new regression suite: 360 failures;
  build 24 passes the same checks, including 14/16 and 15/16 playback/LEDs.
- Stock-free package build: pinned GCC 16.2.0 / binutils 2.47 toolchain,
  isolated with no network or firmware. Current object SHA-256
  `433a286c1aafb292bbbedf80f9cc39ecaf2d74813bc3eb543bedce836fd25571`.
- Current stopped LCD captures: real reviewed ColdFire/DSP emulator,
  native Play Modes-only composition; exact image/emulator/screenshot
  hashes and the panel actions are in `media/capture.json`. These captures
  show the controls; they do not establish physical playback or reboot.
- `module:verify`: 110 selection profiles, 54 builds matching native outside
  the platform writes, 56 matching refusals, zero mismatches. Changed stock
  input is refused. Record: `sdk/native-comparisons/playmodes.json`.
- Authored runtime, engine, test and generation files match Octaplay
  `41dbdaa` byte for byte; `sdk/imports/playmodes-41dbdaa.json` recorded them
  (replaced in 0.2.0 by `sdk/imports/playmodes-73d5f89.json`).

Owner exception, 8 October 2026: “Approve scoped exception and release.”
Applies only to Play Modes 0.1.1-experimental and native source
`86105af37d68fcd051cab991b747c949d7813733b73a1fe6d900cf3ec239c5a6`.
Waives fresh physical reboot, Part/project restore after unsaved edits,
distinct-track isolation and stock/flood performance tests. Retain the
author's MKII functional report; missing checks stay unverified.

## Modwerk 0.2.0 (STEP REPEAT) validation

The imported runtime is devilfish707's build 24 plus STEP REPEAT by
pgstath: Octaplay `73d5f89` on `pgstath/Octaplay` `step-repeat` (a fork of
devilfish707/Octaplay, proposed upstream as devilfish707/Octaplay#2).
`sdk/imports/playmodes-73d5f89.json` records every authored file byte for
byte. The Modwerk-side native manifest adds one detour, `0x40060cfc` (the
trig-key dispatcher's tail call into `0x400501d8`, reached only with GRID
REC off), guarded by its six stock bytes. The project/battery table layout
is unchanged; REPEAT is stored as digit / nibble 6, which 0.1.x reads as
NORMAL.

- `python3 verify.py` (Homebrew python 3.12, m68k-elf-gcc 16.2.0): both
  host suites and the generated ColdFire unit pass. New cases: the held
  steps in step order, round and round; steps past a track's length left
  out; keys pressed or let go mid-loop; the second page; look-ahead and
  LEDs naming the repeated step; release to the stock step; stopped, keys
  busy and a release of a key stock pressed left to stock; PER TRACK; MIDI
  tracks; the REPEAT digit in the project line and battery RAM. Planted
  defects fail them (7 engine / 11 adapter failures for a wrong comparison
  in `pm_repeat_next`, 37 adapter failures with the repeat call removed).
  `playmodes.s` regenerated from unchanged `41dbdaa` is byte-identical with
  this compiler.
- ColdFire port (`ot_emu` at Modwerk `c0f513b9`, native remix of Play Modes
  and the 14 stock effects, the contributor's own project on a staged card
  with clock and transport receive off, SCALE MODE NORMAL, 16 steps, 1X,
  about 152 BPM; `--live-script` key events, `--watch-mem` on `pm_hist`,
  the held keys and the stock flags). Port evidence only:

  | case | result |
  |---|---|
  | boot | to the RTOS handoff; loader ran once, fatal hang never (`verify_dram_boot`); its runtime-bytes line reports 87 bytes of `pm_state` that the runtime initialises itself, the same on unchanged 0.1.1 |
  | TRACK 1 + DOWN × 6 | REVERSED, PINGPONG, PINGPONG 2, RANDOM, SHUFFLE, REPEAT |
  | T1, hold TRIG 5 + 8 during stock step 6 | 5 8 5 8 … for 20 steps while the stock counter ran 7..16, 1..10 |
  | let go during stock step 10 | the next step plays 11, then 12, 13 … |
  | MIDI mode (M1), the same hold | M1 and T1 both loop 5 8 and both go on at 11 |
  | GRID REC on / LIVE REC / trig mode 1 poked (CHROMATIC) / stopped | no key taken, every step stock's |

  The stock SET DATE/TIME popup opens after the load on a card without a
  set date and takes UP / DOWN; the scripts dismiss it with NO first.
- Instruction counts (`evidence/cycles.md`, Octaplay harness at `346d9c3`):
  worst one-track step 1,969 measured (SHUFFLE, len 33), bound 4,746;
  REPEAT with keys held 1,474; one trig-key event 153; stack 124 bytes. The
  original harness on unchanged 0.1.1 reproduces every 0.1.1 figure, so the
  differences are the code's (about +90 instructions per track step).
  Memory (`evidence/memory.md`): 16,060 bytes (0.1.1: 14,876).
  `npm run perf:audit -- check`: record and cycles pass (1% of the step
  budget); the stock benchmark and the flood stress fail for missing
  measurements, as for 0.1.1.
- UI captures (`media/capture.json`, image `9d91395f…`): ALL REVERSED and
  ALL PINGPONG 2 byte-identical to 0.1.1's, and ALL REPEAT, reviewed by eye.

Not run for 0.2.0 yet: any unit (MKI or MKII), audio and MIDI out (note
lengths over repeated steps), PER TRACK and patterns longer than 16 steps
under the port, micro-timing / conditions / slides on repeated steps, the
stress project and the stock-load benchmark, chip timing. Physical reboot,
Part/project reload after unsaved edits and distinct-track isolation remain
unverified, as for 0.1.1.
