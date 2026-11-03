# Octatrack boot guard on the owner's MKII — 30 October 2026

The boot guard in `modset.c` (branch `claude/boot-guard`) run on the owner's MKII with RAM-booted development twins. No
flash. One power cycle by the owner (below). The flashed base was `d15d3e2d` with no modules installed before and after.

**Builds.** Twin `cc9b9bbd` (commit `a58aeb4c`), then twin `b00b163e` (commit `1a0c69da`, with the popup fix below). Both
use the beta base's `build_core.py` flags plus `--dev`, without controller rows: Analog BD's reviewed recipe refuses a dev
twin's layout, and the test needs no controller. Module: Mini Verb 0.2.3 (`3cbedc9c`), kept once on each twin.

## What was seen

| Step | Guard record (0x100ffb00) | Card set (`saved`) | Installed | Screen |
| --- | --- | --- | --- | --- |
| Twin boots on another base's card sets | written: "MWBG", the twin's id, not armed | 4, another base's | none | |
| `try` Mini Verb (one Keep) | unchanged: a sync does not arm | 7, saved | Mini Verb | |
| RAM boot | armed in the restore, `loading` 0; disarmed 10 s later | 1, restored | Mini Verb | |
| `guardtest`, RAM boot | Mini Verb in the left-out list, set generation 1 | 10, left out | none | MISSING (the project's own modules), then after YES: MINI VERB LEFT OUT |
| `guardtest:0`, RAM boot | not armed, left-out list kept | 11, held | none | after YES: MODULES HELD |
| plain RAM boot | Mini Verb still left out | 10 | none | after YES: MINI VERB LEFT OUT |

**Fixed on the unit.** On twin `cc9b9bbd`, the left-out and held popups never appeared. The bank's MISSING MODULES page
opens right after the restore and covered the popup until the popup timed out. Notices now wait while one of `status.c`'s dialogs
shows, and appear when it closes (twin `b00b163e`, the last three rows).

**A RAM-boot hang, outside the guard.** The second RAM boot of twin `cc9b9bbd`, with Mini Verb kept but on no track,
hung at the logo. Stall record 35 (frames stopped, tick 2481) was written about 41 s into that twin's session, as the
boot was staged. The owner power-cycled. The next twin start showed the guard as designed: not armed, so nothing to
blame. Four later RAM boots from the same states, with Mini Verb kept or left out, did not hang.

**Not run.** A real crash restart or DSP stall inside the restore (`guardtest` stands in for both), and two
unsettled starts in a row with nothing recorded.
