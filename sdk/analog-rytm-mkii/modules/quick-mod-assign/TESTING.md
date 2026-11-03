# Quick Mod Assign testing

Everything below was observed in rytm-emu on the named build. Nothing has run on a unit yet, and the emulator is not hardware evidence.

- Stock OS 1.74: `.syx` `cb0f99d6…e123`, the owner's file. Base: Modwerk base for core-ar2 0.7, `0c92aa45`.
- Build QM03 (core + Quick Mod Assign 0.1.0-experimental, local test image): `.syx` `13a7016fb97323374f1a1a8e422f0c9c5d0d52c393c23fd675f11feff9a76c7a`.
- Build QM04 (QM03 after review: any turn during a FIX hold, LEVEL included, keeps fixed velocity; a missed release frees the knobs; a pad held in PERF or SCNE leaves the turn to stock): `.syx` `d8d093d9624e2be570ee157265f35e2bdfd1c8c63eeea3472c9a7642705da395`.
- Build QM05 (QM04 after a second review: a fresh FIX or RTRG press always starts a new hold; slot matching uses the stored index; top_view stops at the list's end; a sound with no slots is a no-op): `.syx` `1091da0e3fb555d566bf8ae0c8f50d8a8e1bb6f1f7768fe469e1010e12e692bf`.
- Emulator: rytm-emu `2ac0f1f`, headless `dtboot`, a fresh card, the default kit (BD PLASTIC on track 1), the SYNTH page unless named. Events off the `--every` grid. The slots were read on stock's MODULATION SETUP screen and, for aftertouch, from the sound's slot bytes with `DTBOOT_PEEK`.

## rytm-emu (QM03, rerun on QM04 and QM05)

| Check | Result |
| --- | --- |
| Boot | to the main screen, 0 faults in every run |
| FIX + SWT, 10 detents | popup `VEL SWT +10`; SWT unchanged; MODULATION SETUP VEL slot 1 BDPL SWT 10 |
| FIX + SWT +10, release, FIX + SWT -3 | same slot, amount goes down (acceleration in the emulator gave 5 to 7) |
| FIX + TUN, 3 detents (a fine parameter) | `VEL TUN +3` (QM01 left it at 0: the delta comes in TUN's own resolution; fixed in QM02) |
| FIX + SWT, SWD, DEC, TUN, then MOD | slots SWT 3, SWD 4, DEC 3, TUN 3; MOD gives `VEL SLOTS FULL` and changes nothing. Stock's FILT FRQ and FILT RES at 0 counted as free |
| RTRG + SWD, 5 detents | popup `AT SWD +6`; aftertouch slot 2 = SWD (index 15), amount 5; stock's slot 1 (FRQ +16) kept |
| RTRG, BD pad, then SWD turned | stock edit (SWD 127); aftertouch slots unchanged |
| FIX + TRIG page VEL | stock edit |
| FIX + LFO DST | stock opens its destination list (QM05: the LFO page's knob H is DEP; DST is knob D) |
| FIX tap | fixed velocity on at the release (stock: at the press) |
| FIX tap, tap | on, then off |
| FIX held, SWT turned | fixed velocity unchanged (QM02 read stock's bool as a whole word and never toggled; fixed in QM03) |
| FUNC + FIX | stock's FIXED VELOCITY popup, fixed velocity unchanged |
| FIX held, TRIG page VEL turned (QM04) | stock edit; fixed velocity unchanged on release |
| FIX held, LEVEL turned (QM04) | fixed velocity unchanged on release |
| FIX held past key repeat, released (QM05) | toggles, as a tap |
| FIX hold + turn, then a tap (QM05) | the tap toggles |
| FIX + LFO DEP, 4 detents, twice (QM05) | `VEL DEP +4`, then the same slot: LFO DEP 8 |
| FIX + SWT, 130 detents over 4 s (QM05) | popups replace each other: none left 0.4 s after release |

Not tested: a unit; kit save, reload and power cycle; SOUND MANAGER; sequencer running; PERF, SCNE, MUTE and CHRO screens; a sample machine; beside Ctrl All, Velocity Humanise, QPERF and the other Rytm modules; what the velocity and aftertouch links sound like.

## Hardware

Not run yet. Steps for the author's unit, on QM04 or a combined image with it:

1. FIX + FRQ on the FILTER page: popup, FRQ itself unchanged, soft and hard pad hits differ. SOUND SETTINGS, VELOCITY MOD shows FILT FRQ.
2. RTRG + DEC on the AMP page: pad pressure changes the decay. RTRG, a pad, then a knob: the knob edits as stock.
3. Fill four slots, try a fifth: SLOTS FULL. Turn one back to 0, the fifth now fits.
4. FIX tap: fixed velocity toggles on the release. FUNC + FIX: stock's popup.
5. Save the kit, power cycle: the links are kept.
