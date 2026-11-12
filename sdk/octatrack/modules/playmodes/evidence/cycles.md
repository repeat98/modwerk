# Play Modes: ColdFire work per event

Method: instruction counts in octabam's ColdFire emulator core (Musashi +
the V4e layer of `tools/emu/ot_emu`), running **only this module's linked
code** (0.2.0: `runtime.elf` of the native `playmodes-test` composition at
Modwerk `fd77b909`, Play Modes from Octaplay `73d5f89`) in an otherwise
empty machine with synthetic sequencer state; no firmware. Harness and
commands: Octaplay `tools/instruction-count/` at `346d9c3` on `pgstath/Octaplay`
`step-repeat` (the author's harness with the STEP REPEAT cases added:
REPEAT in every mode loop, all 16 trig keys held, and the trig-key event).
Instruction counts are exact for the inputs run; cycles are derived with an
allowance of **32 cycles per instruction** (the convention of VECTOR's
conditional static bound), which covers cache misses and bus waits only as
an allowance, not as a measurement.

The author's original harness run on unchanged 0.1.1 (build 24, Octaplay
`41dbdaa`) with the same toolchain reproduces every 0.1.1 figure exactly
(1,161 / 1,884 / 1,417 / 12,548 / 674 / 120 bytes), so the 0.1.1 → 0.2.0
differences below are the code's.

## The sequencer step (the event that bounds the module)

Per track and step the tick calls `pm_audio_step` / `pm_midi_step` →
`pm_step_entry` → `pm_seq_step`, which in 0.2.0 also asks whether the track
repeats. Measured over every mode, lengths 1–64, both scale modes,
MASTER LENGTH INF and 0, PLAY restarts, 16 tracks, and for SHUFFLE 60 runs
(seeds) per length:

| mode | worst instructions, one track step (with a restart) | 0.1.1 |
|---|---|---|
| NORMAL | 1,251 | 1,161 |
| REVERSED | 1,306 | 1,211 |
| PINGPONG | 1,321 | 1,226 |
| RANDOM | 1,341 | 1,246 |
| SHUFFLE | 1,969 (measured) | 1,884 |
| PINGPONG 2 | 1,316 | 1,221 |
| REPEAT, no key held | 1,307 | — |
| REPEAT, keys held (all 16, 0x8001, 0x8000; lengths 1–64; both scale modes) | 1,474 | — |
| any mode, 14-step tracks under MASTER LENGTH 16 (master restarts) | 1,509 | 1,417 |

STEP REPEAT adds about 90 instructions to every track step, held keys or
not (the check and the per-track state), and its held-key path stays below
the master-restart case. A step on which all 16 tracks repeat with every
key held: 9,920 instructions. A step on which all 16 tracks restart in
SHUFFLE (length 33): 11,397 measured in this run (12,548 in 0.1.1's; the
SHUFFLE seeds differ after the REPEAT block, the walk bound below covers
both).

**SHUFFLE's bound.** Unchanged: `pm_map`'s compiled body is identical to
0.1.1's apart from label numbers, so it still costs **101 + 98 × walk**
instructions with a walk of at most 32 (len 33). Worst `pm_map`:
101 + 98 × 32 = 3,237.

**Bound per track step:** the costliest call that is not a long SHUFFLE
walk (1,509, the MASTER LENGTH restart case) + the worst `pm_map` (3,237) =
**4,746 instructions**, an over-estimate (the restart runs once per step,
not per track).

| | instructions | cycles at 32/instruction |
|---|---|---|
| one track step (worstCase) | 4,746 | 151,872 |
| 16 tracks in one step (maxConfiguration) | 75,936 | 2,429,952 |
| budget: one step at 300 BPM, 2X scale (25 ms at 264 MHz) | | 6,600,000 |

## Other events (UI and file context, not the tick)

| event | instructions measured | 0.1.1 |
|---|---|---|
| first use after boot (state init + battery-table read, once) | 65,055 | 64,965 |
| UI step query (`pm_show_entry`, trig LEDs), worst | 1,482 | 1,482 |
| rebuild / look-ahead (`pm_peek_entry`), worst | 1,461 | 1,445 |
| REPEAT with keys held: look-ahead / display | 516 / 169 | — |
| one trig-key event (`pm_trig_key`: press, hold or release; the stub adds a stock rebuild on a change) | 153 | — |
| TRACK + UP / DOWN (`pm_key_updown`, one battery row) | 706 | 674 |
| project load: storing pass start (`pm_project_begin`, full table) | 62,786 | 62,786 |
| project load: one `#PLAY_MODES=` line | 801 | 801 |
| project load: an older single line (every pattern) | 65,322 | 65,322 |
| project write: 256 lines (`pm_project_format` × 256, all set) | 76,454 | 76,454 |
| pattern paste / undo (`pm_pattern_copy`) | 405 | 405 |
| clear pattern (`pm_pattern_clear`) | 433 | 433 |

Deepest stack below the caller's arguments over all runs: 124 bytes (0.1.1:
120).

Not claimed: chip wall-clock cycles, cache behaviour, interrupt latency
added to the stock tick, the stock rebuild a trig-key change triggers, or
headroom under maximum stock audio load.
