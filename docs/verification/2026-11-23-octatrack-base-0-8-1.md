# Octatrack base 0.8.1 development twins on an MKII, 23 November 2026

Source `b973f6863` (`base/octatrack-next`: #2049 receiver one-word forms, #2048 key-bus charge 43, the USB input
recipe fix). The release image `48133772ba8c7a42…` itself was not run. Two development twins were built from that source
with the beta base's flags plus `--dev`, on OS 1.40C, outside Git:

- `c06f9e21cda0faa2…`, without controller rows, as `docs/OCTATRACK_DRIVING.md` describes;
- `91a0a86e0e7f89b0…`, with controller rows encoded against the twin (Analog BD's recipe captured for the twin's
  layout, the committed `machine-recipes.json` restored afterwards).

The owner's MKII started and ended on its flashed base `e11525835106699a…` (0.8) with eight kept modules. The CF card
stayed in, every trial rolled back, and nothing was kept or flashed. After the run the inventory read the same as before.

## Results

| What | Twin | Observed |
| --- | --- | --- |
| Each of 35 catalogue packages alone, 3 s | `c06f9e21` | 26 rolled back. RINGMOD SC was refused (`RUNTIME_CONFLICT`). Amiga's trial ended `needs-recovery` while the loaded project's tracks named Amiga (the trap in `OCTATRACK_DRIVING.md`); `recover` and a RAM boot were refused, and the owner's power cycle returned the flashed base with its eight modules. The 7 packages after it were not tried there. |
| RINGMOD SC alone, 10 s | `91a0a86e` | Rolled back: the refusal above came from the twin without controller rows. |
| MIDI Scenes, Kits, Tuner, Vibrato, Butter Fingers, Screen Off alone, 5 s each | `91a0a86e` | All rolled back. |
| All 38 non-base-bound packages at once | `c06f9e21` | Refused `RUNTIME_CONFLICT`: the set holds three declared conflicts (Kits and Pattern Sample Locks, Synth and Quantizer, Vector and Synth). |
| 35 packages, one of each conflicting pair left out | `c06f9e21` | Refused `RUNTIME_CONFLICT` (RINGMOD SC, as above). |
| 33 packages, also without Amiga and Grain | `91a0a86e` | Refused `RUNTIME_MEMORY`: 396,428 bytes do not fit the module pool. |
| Those 33 in two sets of 17 (267,792 bytes) and 16 (129,116 bytes), 30 s each | `91a0a86e` | Both installed; "no crash, stall, freeze or skipped track logged during the trial"; both rolled back to an empty inventory. |
| RINGMOD SC on T1 while the selected pattern played (`device:price --fx-name "ring-sc=RINGMOD SC"`) | `91a0a86e` | Admitted. At rest frame +0, CPU +0.8; in use frame -0.1, CPU -2.7, DSP +0.7 / +0.9 points. The effect was picked back and the trial rolled back. The scene was the owner's loaded project, not named. |

## Idle CPU with large unused sets, and the cost-table fix

The owner reported a high idle CPU with large sets. The same project and scene, transport stopped then playing (the
`guard` line and three `stats` readings, as `device:price` takes them), on controller-row twins of the source before
(`91a0a86e`) and after the fix (`30a67657`, source `5c96e1f93` plus the cost-table copy). Every set was installed in a
rolled-back trial and named by no Part, except one effect in the 17-module set: Part 1 T1 FX2 named it.

| Unused set | CPU meter stopped, before / after | Playing, before / after | `profile:5` module UI ticks, µs a tick, before / after |
| --- | --- | --- | --- |
| none | 39.8 % / 38.4 % | 42.4 % / 40.9 % | 461.8 / 226.5 |
| 16 ColdFire and UI modules (the second set above) | 45.9 % / 40.9 % | 47.2 % / 42.1 % | 1,411.5 / 247.0 |
| 17 effects and machines (the first set above) | 46.4 % / 41.4 % | 47.1 % / 42.2 % | not read |

The empty readings before and after each run agreed within 0.3 points. The 17-module trial on the fixed twin logged one
note, "the CPU at 90 % or more for 1.5 s"; its moment was not separated from the install. No crash, stall, freeze or
skipped track was logged, and every trial rolled back.

## The release image `eb6679620d0c9ed7…`

Built from `823c278f6` with main merged in (the base bytes did not change), 23 November 2026 at about 20:00. A RAM boot
of the release image itself on the same MKII; nothing was kept or flashed.

- It came up normal, generation 0, with an empty inventory (the card's set belongs to the flashed base).
- The 16-module and the 17-module sets above, 30 s each: both installed, "no crash, stall, freeze or skipped track
  logged during the trial", both rolled back.
- The USB input package `0cb56b0c…` in a 15 s trial: installed, the same verdict, rolled back. No audio ran through it.
- The tick lines' refusal count rose about one every 4 s in every trial, whatever was installed, matching the link's
  4 s development pings that a release base refuses; on the development twins it stayed 0.
- A RAM boot of the flashed image brought back `e11525835106699a…` with its four kept modules.

## Not run

- A Keep and a power cycle on the release image, and a flash of it.
- The fast soak: this Mac has no `mido` for `scripts/octatrack-midi-bridge.py`.
- Step 9's price of every package, and #2049's saving in the meter at rest (it needs a 0.8 twin beside it).
- Amiga and Grain trials: the loaded project names them, so a trial's end would need another power cycle.
- USB input on 0.8.1 (a host duplex recording).

`npm run test:procedure -- --base` installs every catalogue package at once in step 7. On today's catalogue that set
can never install: it holds declared conflicts and exceeds the module pool.
