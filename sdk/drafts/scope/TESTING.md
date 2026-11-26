# SCOPE testing

Draft Modwerk port of octabam `modules/scope` at
`3fcf4fe45d8f0754828f5f2ef9b11935ac0dd9f9`.

## 0.1.0-experimental

**Hardware status: reported by hand on one MKII over USB, 26 November 2026,
and steps 6 to 10 of the test procedure on a development twin.**
Source: branch `feature/scope-draft` at `6e8f9fb4`, the rebased import
commit; the package was built before the rebase from a draft folder
identical to it (`unit.s` unchanged since the import). Package built with `npm run module:dev -- scope --build-only`:
SHA-256 `48522941a043dad83d0ebfcb26e4b68734ddc439b16d443e5f87eecb6cf63b57`,
module `5f161c91`, 37,584 bytes of code and data, 0 of bss, 195 relocations,
three hashed stock-code sites. Unit: ilia-murzinov's MKII, flashed with the
release base 0.8.1 `eb6679620d0c9ed7…` (rebuilt from 1.40C with
`npm run octatrack:base -- --beta`, byte-identical to the committed base),
no other module installed, so SCOPE was the only DRAM module.

| Case | How run | Result |
| --- | --- | --- |
| RAM trial | `npm run module:dev -- scope`, interrupted after 223 s | rolled back; verdict: no fault logged, one note (CPU at 90 % or more for 1 s, 156 s in) |
| TEMPO alone vs DOWN then TEMPO | by hand, during the trial and installed | pass (reported): TEMPO alone opens the stock tempo window; DOWN then TEMPO opens SCOPE |
| OSC, XY, ALL; GAIN, TIME; help | by hand, screens read over USB (`device -- screen`) | pass: all three views draw live audio, GAIN changes the HUD's G, RIGHT shows the help page |
| Close with TEMPO, YES and NO | by hand | pass (reported) |
| Keep | `npm run device -- try FILE --seconds 20 --accept` | accepted; verdict: no crash, stall, freeze or skipped track |
| Removal while open | `npm run device -- remove FILE --accept` with the window open | refused by the base (loader refusal 11, `RUNTIME_UI_OPEN`); SCOPE stayed installed and running |
| Removal after closing | the same, window closed | accepted; verdict clean; the unit back on the base with no module |
| Undo while open | not run | not run |

The trial's single refusal counter (`refusals 1`) was set at submission and
did not move during the trial.

### Test procedure

`npm run test:procedure -- scope --package <the package above>` stops at
step 1: `module:doctor --draft scope` is red on cross-compatibility (the
three Tuner sites, until the base hook). Steps 6 to 10 were then run one by
one with the commands its plan prints, same package, on a development twin
RAM-booted from 1.40C (`build_core.py … --dev`, base `4c7eb79b844c8139…`),
the author's project on pattern A02 (A01 showed CPU FULL on the twin), USB MIDI through `octatrack-midi-bridge.py`.

| Step | Result |
| --- | --- |
| 6. Read the unit | pass: no module installed; every Part of bank 1 clean (working = saved) |
| 7. Scripted unit pass (`device:test`) | pass: self-test passed, module 1/1 intact, longest frame 375 µs, inventory unchanged, no failures |
| 8. Soak (`octatrack-soak.mjs`, 120 s, inside a RAM trial) | pass: 2,400 operations at 19.7/s, health reply median 12 ms (p95 12, most 27), CPU at most 44.2 % |
| 9. Cost on the unit (`device:price`) | 0.2 % of a frame at rest (frame interrupt 68.4 % before, 68.6 % installed and closed; CPU meter 92.2 % before, 93.3 % at rest), pattern A02 playing; `evidence/cpu-price.json`. The open window was not priced. |
| 10. Put back | pass: no module left; Part 1 on A02 reloaded, working = saved |

The soak's trial process was killed by the shell that started it before its
verdict; `npm run device -- recover` rolled the trial back. The unit's log
for the twin's first five minutes (boot, step 7 and the soak together)
holds one load record (boot 2, minute 5) with a CPU peak of 100 % and a
UI-tick gap of 2,989 frames, about 1.1 s; which of the three caused it is
not known. The
unit then went back to pattern A01 and the flashed base by a RAM boot of
its image.

## Emulator (`verify.py`)

`ot_emu` approximates the instrument: no real-time timing and no audio
check. 26 November 2026, `verify.py` as of this branch: 14 of 14 checks pass.

Image: a native build in a scratch copy of `sdk/octabam` with this folder
copied to `modules/scope` and a local remix of SCOPE plus every stock effect
(`static_stock=True`), `make bus REMIX=scope-stock BUILD=0`: MAIN OS SHA-256
`a219cecc361e4a174fcf3e28c71781327c147b24409dbd5914c972697124d6c9`, the
unit in the DRAM reserve at `0x40a955e0`, detours `sc_tempo` at
`0x40059ef0`, `sc_frame` at `0x4000d99a` and `sc_tick` at `0x40056c72`.
Port: `ot_emu` from octabam `f7d7290` (`npm run upstream:tools`, then
`make setup` and `make emu-cf` there). Fixture: one of the author's own
projects, staged with `stage_card.py`.

```sh
SCOPE_PROJECT=<project folder> python3 modules/scope/verify.py   # from that octabam root
```

- At rest nothing is copied or drawn: `scope_win` 0, the ring index and
  frame count still, `sc_draw` never runs.
- TEMPO alone opens stock's tempo window, not SCOPE; NO closes it.
- DOWN then TEMPO creates SCOPE's window and its view toast, not stock's;
  the ring fills from 0 and `sc_draw` runs (97 times in 1.5 s).
- UP and DOWN step OSC, XY, ALL and back.
- TEMPO, YES and NO each close SCOPE: its window destroyed, and the ring
  and the draw stop again.
- TEMPO alone still opens stock's window afterwards.

## Other commands

```sh
npm run module:doctor -- --draft scope    # experimental lines green but cross-compatibility
npm run modules:compat -- --with scope    # three clashes with Tuner (same detour sites)
```

## Octabam evidence (not Modwerk USB)

Recorded against octabam images, not a Modwerk package:

- Author MKII, `LSCOPE BJ`, 24 Oct 2026: OSC / XY / ALL, clip `!`, G/P HUD,
  DOWN+TEMPO. Busy 8-track + CF METER: ISR mean 291 µs open / 288 µs closed
  (TUE 0, ROE 0). Several minutes ALL, no glitch reported.
- OCTA S2 flashed image, 15 Nov 2026: SCOPE closed vs open across 30 loader
  transitions on `SFX_01`. Zero bad DSP records either side. Median audio gap
  340 ms in both states. Details in upstream README.

## Source pin

| File | Role |
| --- | --- |
| `unit.s` | octabam `modules/scope/scope.s` at the pin above |
| `upstream/modules/scope/` | unchanged octabam README, manifest, scope.s |
| `upstream/LICENSE` | octabam's MIT licence at the pin, for its maintainers' edits |
