# Direct Jump Kyoti: hardware record

## 0.2.0-experimental over USB (19 November 2026)

The author, Zac Kyoti, on his Octatrack MKI, OS 1.40C, at the owner's request (#1714), the USB side driven by the coding agent with `npm run device` on his say-so; he did the keys, the listening and the power cycle. Nothing was saved to his project.

- Base: a development build of the site from this branch (commit `994c44863`) gave the Modwerk base; he flashed it from the card (OS UPGRADE). Identity `c889442d9b119d5f…`, no modules kept before the run.
- USB package: `direct-jump-kyoti/0.2.0-experimental.mwrm`, SHA-256 `ed3ba88a2f57c7f5ab122a5f572a8a814c91a338c5baa3a56da324c86d71060d` (4,546 bytes), the published file of this branch.

1. Install and Keep: `npm run device -- try <package> --seconds 5 --accept`, the same offer the site's Sync sends: a 5 s trial with no crash, stall, freeze or skipped track logged, accepted, generation 1, the module list `DirectJmp Kyoti` (`075d79a3`).
2. With Direct Jump ON, his checks, all passed: a jump from a pattern on Part 1 into one on Part 2; the restart case (A01, 16 steps, from PLAY; a normal change with Direct Jump OFF to the 12-step A02; Direct Jump ON and, about 4 steps into A02, a jump to the 12-step A03: A03 landed in phase with A02 and the 1:2 hi-hat stayed in step); a latched [FILL] stayed on across a jump; a Part-changing jump with SILENCE TRACKS on made no pop.
3. Power cycle: [PTN] + [YES] showed DIRECT JUMP ON on its first press, so it came back OFF; the module list still held DirectJmp Kyoti.
4. Removal while Direct Jump was ON and a pattern played: `npm run device -- remove <package> --accept`, a 5 s trial with nothing logged, accepted, the list empty (the unit's log: the set went from `[075d79a3]` to `[]`). Afterwards [PTN] + [YES] and a cue behaved as stock.
5. A trial left to roll back: `npm run device -- try <package> --seconds 10` without `--accept`: 10 s running, nothing logged, rolled back, the list empty.
6. CPU price, on a development twin of the same base built from this branch (`878307834ad3c23a…`, RAM-booted; a power cycle returns to the flashed base), the transport stopped between readings, his project's A02 (12 steps) on Part 1 playing for each reading: `npm run device:price -- direct-jump-kyoti`: frame interrupt 54.3 % before and 54.3 % installed (OFF), CPU meter 63.9 % both, DSP cores +0.4 and +0.8 per mille, rolled back. Direct Jump turned ON by him during a second rolled-back trial: 51.7 % and 62.0 %; without the module right after, twice: 51.7 % and 51.7 %, CPU 62.2 % and 62.5 %. No render skipped. Price 0.0.

Limitations: one MKI and one project; the checks are his by ear and eye, nothing recorded. The Plays-Free MIDI track, other lengths and scales and LFO AUTO CHANGE were not run again over USB (they passed on the card image, below). The install went through `npm run device`, not the site's own Sync page. No MKII ran this version.

## 0.2.0-experimental (17 November 2026)

The author, Zac Kyoti, on his Octatrack MKI, OS 1.40C. He flashed the native card image of this module alone with every stock effect kept: `OCTATRACK_MW_DJK73B.bin` (card OS UPGRADE, SHA-256 `912343943b156624d75e526ff8d382bbd3ddc3b8dca950cc9c707d8d3990b20e`), OS VERSION MW_DJK73B, MAIN OS SHA-256 `a7074bfd6fea3c9516eaf872d1693327957fe4c1248b01ead73136fadbfe9f1c`, built from this branch's source at `20d216e1b454edee281d66dcfb179275fe24b4b0` (DIRECT JUMP V7.3 as in Zac-Kyoti/octatrack-kyoti-fw `cd788e9`, byte for byte, and his MIDI Plays-Free fix). His report: "Flashed. All tests pass."

The checklist he ran, all 13 items passed:

1. Boot: starts normally, OS version MW_DJK73B.
2. Toggle: [PTN] + [YES] shows DIRECT JUMP ON; releasing [PTN] leaves the pattern chooser shut; again shows DIRECT JUMP OFF.
3. OFF at power-on: turned ON, power-cycled, it came up OFF (a cue waits for the pattern end).
4. A jump from a pattern on Part 1 to one on Part 2 lands on the next step with Part 2 active and its sounds.
5. Lengths and scales: jumps between patterns of other lengths and into a PER TRACK pattern with differing track scales land where the pattern would be had it played since PLAY, or since the last normal pattern change (in time, no step shift).
6. A cue in the playing pattern's last step lands on its grid point.
7. Trig conditions: 1:2 and 1:4 trigs keep alternating across jumps, in step with what was playing; a latched [FILL] stays on after a jump; a PRE trig right after a jump plays.
8. Restart (V7.3): A01 (16 steps) from PLAY, a normal change with Direct Jump OFF to a 12-step A02, then Direct Jump ON and, about 4 steps into A02, a jump to a 12-step A03: A03 lands in phase with A02, and a 1:2 hi-hat stays in step across the jump.
9. LFO AUTO CHANGE on: a sample ringing from the old pattern keeps its LFO until its own track's first trig in the new pattern; tracks with no trig get the new Part's LFOs at once.
10. SILENCE TRACKS on: a Part-changing jump that silences ringing tracks does not pop.
11. A Plays Free MIDI track with trig quantize DIRECT in PER TRACK mode keeps playing after its trig key starts it and lands with its own scale on a jump; with gear on MIDI OUT, the Program Change follows the pattern that plays and no MIDI START is sent on a jump.
12. With Direct Jump OFF, pattern changes, the arranger and chains behave as on the stock OS.
13. Nothing odd: no crash, freeze or wrong landing.

Items 5 and 7 were worded for V7.3's rule (since PLAY, or since the last normal pattern change) before the run.

Limitations: a functional report from one MKI. The project, how long it ran and whether gear was attached to MIDI OUT for item 11 are not stated; nothing was timed or recorded. The USB package `ed3ba88a…` was not installed in this run (it ran on 19 November 2026, above), and no MKII ran this version.

His own builds of the same Direct Jump code (not Modwerk builds) before this run: on 15 November 2026 the standalone image `140C_KDJ7` (mainos `7c6131e7…`, V7.2.2) ended the SILENCE TRACKS pop at a Part-changing jump, and KYOTI V1.8C (beside his Clyps module) passed landings at other lengths and scales, a cue in the last step, trig conditions across a jump and each track's Part with LFO AUTO CHANGE on; on 16 November 2026 KYOTI V1.8C with V7.3 (`KY18C DJR1`, mainos `9d1a29c9…`) passed the restart case and a Clyps load after the jump.

## 0.1.2-experimental (25 October 2026)

The same unit, base and kept set as the 0.1.1 run below, the same day, at the owner's request; no power cycle, no flash, nothing saved, the kept set put back.

- USB package: `direct-jump-kyoti/0.1.2-experimental.mwrm`, SHA-256 `89a38e18728bb2039a0f5e3f39305fcb7be75e0db260acd6b33bd46d7e281cef`, built from Modwerk commit `cf95656dbc0e386b4fda769e04cc18eb2a5d3364`. It differs from 0.1.1's only in the nine title bytes: same module `075d79a3`, code, relocations and five sites.

1. Installed and kept as a tester's sync does it: accepted, generation 7; the inventory lists the four plus `DirectJmp Kyoti`.
2. Self-test: passed, 5/5 intact (both DSP modules ran), peaks CPU 53.1 %, T1-4 35 %, T5-8 56.1 %, longest frame 419 µs, card set saved 5/5.
3. Removal (kept): accepted, generation 8, the four again.
4. Self-test of the restored set: passed, 4/4, longest frame 418 µs, card set saved 4/4.

The toggle, a jump and the Plays-Free fix were not exercised on the unit (see the 0.1.1 run).

## 0.1.1-experimental (25 October 2026)

Owner's Octatrack MKII, OS 1.40C. Driven over USB by the coding agent with `npm run device -- serve` and `scripts/device-send.py`, at the owner's request. No power cycle, no flash, nothing saved to the owner's project; the kept set was put back as found.

- USB package: `direct-jump-kyoti/0.1.1-experimental.mwrm`, SHA-256 `5c7b2d12d9da96e077d21b371c84b1a09935461214d424df57f698f103fc29ed` (ABI 7, module `075d79a3`, 2,080 bytes of code and data, five stock-code sites), built from Modwerk commit `fd3940e74c5105de7af38dfeb2dbe49c771e15c9`.
- Base: `109f23bd`, the published beta base, flashed and running from RAM on the same image. Kept before the test: SIDECHAIN COMP `95cff696`, Ringmod SC `773c84aa`, Mini Verb `3cbedc9c`, POLY8 `9fa85eef`.

1. Installed and kept the way a tester's sync does it (stage, the base's check of each site's stock bytes against the running code, trial, Keep): accepted, generation 5, inventory the four plus `Direct Jump`.
2. Self-test: passed, modules 5/5 intact (2 with DSP effects, both ran), peaks CPU 46.8 %, T1-4 33.6 %, T5-8 58.2 %, longest frame 421 µs, card set saved 5/5.
3. Removal (kept): accepted, generation 6, inventory the four again.
4. Self-test of the restored set: passed, 4/4 intact, longest frame 422 µs, card set saved 4/4.

Not tested on the unit: the toggle, a jump and the MIDI Plays-Free fix itself. This base answers no development requests (no key presses, no RAM reads), and a development twin would have needed a power cycle afterwards. Direct Jump's own unit is byte-identical to 0.1.0's, whose toggle and jumps ran on a twin (below). The author confirmed the Plays-Free fix on his MKI (28 August 2026, his standalone build); the emulator gate runs the stall against the original OS. Not run: a power cycle with 0.1.1 kept, the card build, an MKI, the site's own review/Keep/Undo pages. About five minutes of use.

## 0.1.0-experimental (24 October 2026)

Owner's Octatrack MKII, OS 1.40C, 24 October 2026. Driven over USB by the coding agent with `npm run device -- serve` and `scripts/device-send.py`, following [Driving the Octatrack](../../../../../docs/OCTATRACK_DRIVING.md). The owner did the power cycle. Nothing was saved to the owner's project; every pattern change was undone and the unit was left on its flashed base with no modules installed, as found.

- USB package: `direct-jump-kyoti/0.1.0-experimental.mwrm`, SHA-256 `c277d24f24bd05d4d75dc008ffced79471e6bf14068de65435175b3a506f655f` (ABI 7, module `075d79a3`, 2,016 bytes of code and data, four stock-code sites), built from Modwerk commit `6116a6a4d127ee0bac0ec835a474984be8b2c73e`.
- The owner's project, bank A: A01 and A16 64 steps, A02 to A15 16 steps, all at 1x on Part 1, 132 BPM.

### On the flashed beta base (`b5fae2ae`)

The base the owner's unit runs, with no modules installed before the test.

1. Installed and kept the way a tester's sync does it (stage, the base's check of each site's stock bytes against the running code, trial, Keep): accepted, generation 1, inventory `Direct Jump`.
2. Self-test: passed, module 1/1 intact, longest frame 372 µs, card set saved 1/1.
3. Power cycle by the owner: the base came back with the kept set, inventory `Direct Jump`. Self-test passed again (1/1, longest frame 372 µs).
4. Removal (kept): accepted, inventory empty.

This base answers no development requests, so the panel and RAM tests below ran on a twin.

### On a development twin (`7889c57a`, RAM-booted)

The beta base's flags (`--dsp-loader --usb-midi --usb-audio --site-events --cached-modules --table-owners --resident-stock-hooks --resident-on-demand --module-sets`) plus `--dev`, built from this branch, RAM-booted with `boot` (no flash). Two trials of the same package, each rolled back at the end; no Keep on the twin.

- **Installed.** The landing and MIDI START sites read `jsr` and the [PTN] release `jmp` into the unit at `0x40d1ca40` (to `dj_land`, `dj_nofa`, `dj_ptnrel`), and the [PTN]-layer YES slot held `dj_toggle`. OFF after each install.
- **Toggle.** [PTN] + [YES] showed DIRECT JUMP ON and set the word; releasing [PTN] left the pattern chooser shut. Again: DIRECT JUMP OFF.
- **Clock-locked jumps, ON.** Playing A16 (64 steps) from STOP, A02 (16 steps) cued with [PTN] + [TRIG 2] took over on the next step, then A16 again. Before and after each jump the master position (step × 6 + tick) equalled the unit's tick count since START plus one constant, modulo the playing pattern's length (6 × 64 ticks for A16, 6 × 16 for A02), within one tick of read lag: A16 came back at step 48, where it would have been had it played since START, not at its start. In a second run three jumps (A16 to A02, A02 to A03, A03 to A16) landed at the unit's ticks 120, 228 and 330, each a step boundary, 8 to 12 ticks after the last reading taken before the key gesture (that window includes the gesture's own USB time).
- **Re-cue.** Three cues in one held [PTN] (A02, A03, A05): A05 landed, at the clock-locked position.
- **OFF is stock.** With the toggle off, A02 cued at A16's step 21 stayed pending until A16's end and then started at its first step; A16 cued back waited for A02's end and started at its first step.
- **Removal.** Each rollback left the four sites with the stock bytes (their SHA-256 equal to the manifest's guards).

### Not tested on hardware (0.1.0)

- A jump into a pattern on another Part, START SILENT and trig conditions on a jump (the owner's patterns are all on Part 1; the emulator gate covers the Part change).
- External MIDI gear: Program Change and the absent MIDI START (emulator only).
- PER TRACK patterns with differing scales (emulator only), the arranger and chains, a cancelled cue (USB key presses arrive about a step apart at 132 BPM, so the attempt made two jumps).
- Listening: nothing was judged by ear; the owner did not run the hand test.
- The card build, an MKI, the site's own review/Keep/Undo pages (the device tool installed and removed the package).
- How long the unit ran with the module: about 15 minutes in all.
