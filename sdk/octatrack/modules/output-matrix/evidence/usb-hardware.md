# Output Matrix 0.1.1-experimental over USB on an MKII

- **Date:** 16 October 2026. **Tester:** npp1993 (the author), at the unit; installation driven over USB by Claude Code.
- **Unit:** Octatrack MKII, OS 1.40C, flashed with beta base `99336d35…`.
- **Base under test:** RAM-booted with `npm run device -- boot DIR --chunk 4096`; nothing flashed. Base identity `3e3e3de1f350781b…`, MAIN.raw SHA-256 `5ca0afbf038e17f7919c4d7cfb6ef518e3a4d9c41a12cfa69f59f1ac64a2acc4`, built with the beta flags (`--usb-midi --usb-audio 'USB AUDIO OUT TRACKS MAIN CUE' --site-events --table-owners --resident-stock-hooks --resident-on-demand --controllers`) from source commit `44738eaf` (main `a59677ee` plus this version). The same command on unmodified main reproduced main's committed base here byte for byte first.
- **Package under test:** `public/octatrack-modules/output-matrix/0.1.1-experimental.mwrm`, SHA-256 `e2df2fbfff7f956846c030a87c50ff391af427b8719d40018e6449cef8e48acd` (ABI 7, 20 sites, 6 stock copies).

## Installation

1. `try … --seconds 10` (trial, then roll back): the trial ran 10 s with the slot running. The rollback was refused once with `needs-recovery`; a few seconds later, with no further command, the unit read `normal, generation 2` with an empty inventory, so the base finished the rollback on its own. The site's client retries a rollback from recovery for the same reason (`octatrack-link.ts`: the engine's code was still being placed).
2. `try … --seconds 5 --accept`: accepted; `status` read `normal, generation 3, active e2df2fbf…`; INVENTORY listed OUTPUT MATRIX alone.

## Panel checks (the author's results)

| # | Check | Result |
|---|---|---|
| 1 | PROJECT > CONTROL > AUDIO > OUT CFG > MATRIX, YES: the switch goes through, no freeze | pass |
| 2 | In MATRIX the LEV box shows each track's destination (MN, PHN, M+C, …) without CUE held | pass |
| 3 | CUE + LEVEL on a playing track: MAIN, CUE, PHONES, a mono jack (PHL) and OFF; audio comes out where the label says | pass |
| 4 | MIXER MIX sets the PHONES level | pass |
| 5 | OUT CFG back to NORMAL: stock behaviour returns | pass |

## Flashed and power-cycled (same day)

The author then flashed the same base from the card (browser-built `.bin` `ca8b457f…`, identity `3e3e3de1…`). The set kept on the RAM-booted base was restored at once (Output Matrix in INVENTORY); Analog BD, Apply Scene, LOFI2, Quant Live Rec, LIFT and BS WAVESHAPER were then installed and kept beside it. With OUT CFG on MATRIX and a track routed to MNL, a power cycle: all seven modules came back (INVENTORY over USB), OUT CFG still read MATRIX and the track's routing was kept.

**Display issue after the power cycle:** the track's LEV box first showed stock's split bars (half MAIN level, half CUE) instead of Output Matrix's solid bar; pressing CUE redrew it as MNL with a solid full-width bar. Likely cause, not yet confirmed: the base restores the saved module set after the first screen is drawn, and nothing redraws the page once the module's patches are in. A static build has the module from the first draw.

Follow-up (20 Oct 2026, the author's MKII, RAM boots driven over USB, panel observations by the author). The cause is in the stock code: CUE's press handler (`0x4004e978`) does nothing but call the track screen's drawer `0x4004d948(-1)`, and nothing called it after the base installed the module. The 0.1.1 package is unchanged.

| Base | Step | Observed |
|---|---|---|
| `b5fae2ae` (unfixed, package `c5b77b56`) | fresh RAM boot, install with OUT CFG on MATRIX | stock LEV label and split bars: the issue |
| `b5fae2ae` | RAM-boot restore of a kept set | MNL, solid bar: the MODULES LOADED dialog's close redrew |
| `3e3e3de1` (package `e2df2fbf`) | install | stock LEV label and split bars: the issue |
| `3e3e3de1` | RAM-boot restore | the screen redrew as the module loaded: MNL, solid bar |
| `2f575d3e` (fix, package `c5b77b56`) | install and keep, OUT CFG on MATRIX | the module's own label at once, no key pressed: pass |
| `2f575d3e` | route to MNL, save, RAM-boot restore | MNL with a solid bar; CUE changed nothing: pass |
| `2f575d3e` | install and remove Apply Scene with a PROJECT menu open | menu intact; MNL kept: pass |
| `2f575d3e` | remove Output Matrix while MATRIX uses its DSP code | refused (loader refusal 7), as expected |
| `6650236a` (fix, rebased; package `9f97f3bd`) | fresh RAM boot, install and keep | MNL, solid bar at once, no key pressed: pass |
| `6650236a`, flashed | first boot after the flash restores the kept set | MNL, solid bar after MODULES LOADED, no key pressed: pass |
| `6650236a`, flashed | power cycle with Output Matrix, Analog BD, Apply Scene, LOFI2, Quant Live Rec and LIFT kept | all six restored (read over USB); MNL, solid bar, no key pressed: pass |

`2f575d3e` was a build made before the fix was rebased onto newer main code. The fix ships in base `6650236a` (package `9f97f3bd`, relinked on main for its moved arena), which passed on the unit, RAM-booted and flashed, including a real power cycle. A RAM-boot restore did not reproduce the issue on any base. The record above stays as it was observed on `3e3e3de1`.

## Limitations

- No project save and reload or Part reload on this version over USB; one power cycle, with the display issue above.
- Output Matrix alone on the base: no other module installed beside it; MASTER TRACK, STUDIO, the mode conversion's other Parts and banks, and CC 51 out were not checked on the unit for this version.
- Functional checks by ear; no audio recording or chip timing. The smaller DSP code's sample-identical output is shown in the emulator (TESTING.md), not measured on the unit.
- One MKII; no MKI.
