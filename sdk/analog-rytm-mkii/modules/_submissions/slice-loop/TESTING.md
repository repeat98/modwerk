# Slice Loop — test report

- Module: `slice-loop` 1.0.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.3.
- Source: https://github.com/Iced-Cream/rytm2_mods at `afd461d4a8ef4306bb2a57d4c61ad35c362b3940` (tag `v1.2`), `slice-loop`.
  `src/slice-loop.s` (`619f9755…9d15`, rytm2_mods' `slice-loop/os1.74/slice-loop.s`) and `include/ar2-1.74.inc`
  (`c57431f7…874b`) are byte-identical to it. The source has not changed since rytm2_mods' OS 1.74 port
  (`13ad537`), so v1.1 and v1.2 carry the same file.
- Original: MrScruff's rytm-mods `0012-slice-loop`.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`.
- Tested build R8T2 (OS 1.74, core-ar2 0.1 ported to 1.74 + eight ports): `.syx`
  `94c8b8c4f3f537132b7ee689ad1221591186f14dc605a420cdefe3df804e3c39`.
- Tested build C3A4 (OS 1.74, core-ar2 0.3 before #153 + all eleven rytm2_mods v1.2 ports): `.syx`
  `04d987ced36850eef5eb5cd1215d411edf621a5af94f980525ab561c9108f951`, main OS `fc871476…d529`.
- Tested build SXH4 (OS 1.74, released core-ar2 0.3 `6b97dfb3…3e58` + the six rytm2_mods v1.2
  objects submitted to Modwerk + a remote-control test layer that shares no site with them): `.syx`
  `e4d01a6aec250bd2af7743c9f8b0e9c560d805b52564932dddc41d872e1c5000`, main OS `0ef422bf…8fb8`.
  Without the test layer the same inputs give SX74, `.syx` `2a352718…4371`.
- Tested build SLH4 (OS 1.74, released core-ar2 0.3 `6b97dfb3…3e58` + this module alone + the same
  remote-control test layer): `.syx` `10ef52bfdda5f24f1d0adf0f22055ff6fe4cc7acf711d9275d7943369205c95e`, main OS `6ecc66c7…bcbe`.
- Build SL74 (OS 1.74, released core-ar2 0.3 + this module): `.syx` `f6563d2e440273b6885ccaeabab7d5b3f6297d1e43fe103deb54eeb31cd0bc65`,
  main OS `0f5738561f1a40dd6b78baee3740dc7d8394d1674330f0b512bcc60927fcb36d`. Emulator only.

## Hardware

On an Analog Rytm MKII with OS 1.74, 2026-10-18, Iced-Cream flashed R8T2 with Elektron
Transfer, ran the build's test steps and restored stock 1.74. This module's step:

8. On an empty sound track, FUNC + CHRO > SLICE LOOP shows LOOP SLICED and places 16 trigs.
   Choosing it again shows TRACK NOT EMPTY.

It passed. On 2026-10-20, in C3A4 (core-ar2 0.3 and all eleven v1.2 ports, including
this module's release object `b1b8f51b…1cf9`), each mod's own test passed again.
Relinking C3A4's core and v1.2's eleven release objects on stock 1.74 gives C3A4's main OS
byte for byte. Duration was not recorded. See [the hardware report](evidence/hardware-testing.json).

On 2026-10-24 and 2026-10-25 the same unit ran SXH4, the released core-ar2 0.3 with the six
Analog Rytm MKII modules submitted together (Ctrl All, Env Reset Amp, Slice Loop, Main RMS,
Euclid Accents, Velocity Humanise) and a remote-control test layer that shares no site with
them. A scripted bench drove it over USB in a `~T` test project, took screenshots and recorded
every output over USB audio, then restored stock 1.74.

For this module: on an empty sound track FUNC + CHRO > SLICE LOOP showed LOOP SLICED, and
choosing it again showed TRACK NOT EMPTY (screens). The 16 trigs were not counted separately,
and the loop was not heard with a real sample.

In a four-minute play with samples, delay and reverb sends and knob turns, nothing froze and
no output had a gap or level dip. Clicks flagged on the main mix also appear on a build with
the same core and test layer but none of the six modules, so they are not this module's. Results are in the
[hardware report](evidence/hardware-testing.json).

On 2026-10-25 the same unit ran SLH4: the released core-ar2 0.3 with this module as the only
module, plus the same remote-control test layer. The bench flashed the six solo builds one after
another from stock and restored stock 1.74 at the end; every flash finished without a stall.
On an empty sound track FUNC + CHRO > SLICE LOOP showed LOOP SLICED, and choosing it again
showed TRACK NOT EMPTY and left the pattern unchanged (screens and the pattern's memory). The
first choice changed the pattern in a regular sixteen-step layout, which was not decoded
field by field, and the loop was not heard with a real sample. No output froze or dropped out.

## Source build comparison

The module is a submission (`modules/_submissions/`) until the browser can build it. Modwerk's own validation and compiler path, run on this folder:

```sh
node scripts/machine-modules.mjs --drafts --base origin/main
MODWERK_CROSS=m68k-linux-gnu- node scripts/build-elemod-packages.mjs --output OUT --source-commit <commit> --drafts --module analog-rytm-mkii:slice-loop
node scripts/verify-elemod-source-parity.mjs --packages OUT --oracle ORACLE --out RESULT --firmware analog-rytm-mkii:Analog-Rytm_MKII_OS1.74.syx
```

`ORACLE` held elekloader's `core-ar2-0.3.elemod` release (`core-ar2-v0.3`, 769d9aa,
`6b97dfb3…3e58`) and rytm2_mods v1.2's release `slice-loop-1.0-os1.74.elemod` (`b1b8f51b…1cf9`).
The materialised Modwerk package linked with that core gives main OS `0f573856…b36d`,
byte-identical to the core linked with the release object, and to SL74
([source-parity.json](evidence/source-parity.json)). `.run` is 752 bytes, one site, six
relocations (the stub's references to its own label, action, icon and strings).

Compiler: Ubuntu 24.04 `m68k-linux-gnu` GCC 13.3.0 and binutils 2.42. Modwerk's pinned Docker
toolchain was not run here, and CI's `elemod-source` job compiles published folders only. The
firmware and the linked builds stayed on the owner's computer.

## Emulator

[rytm-emu](https://github.com/trigcondition/rytm-emu) `c5732f0`, headless `dtboot`
([capture plan](media/capture.json)), on SL74:

| Input | SL74 |
| --- | --- |
| FUNC + CHRO on BD | track menu ends with SLICE LOOP (stock: ends at SAVE TRACK) |
| SLICE LOOP, YES | LOOP SLICED |
| grid recording, SAMPLE page, hold trig 2 | STA 6, END 12, both locked |
| hold trig 16 | STA 90, END 96, both locked |
| SLICE LOOP again on BD | TRACK NOT EMPTY |

Every screen before the track menu opens is identical on stock 1.74 and SL74. The stock
run stopped at its track menu, since the same keys there would choose SAVE TRACK. The
emulator has no card, so no sample is assigned and nothing about the sliced audio can be
judged here. The trigs, their locks and the TRIG defaults are all the module changes.

## Load and memory

752 bytes in the shared DDR area, no `.bss`, no fast SRAM. The site runs when the track
menu is built; the action runs once when chosen, through stock's `trig_place`,
`track_lock_set` and `param_set_value`. Nothing runs in the audio, sequencer or tick
paths. Static reading, not a measurement.

## Not tested

- Other modules beside it, except rytm2_mods' own ports.
- NEEDS 16 STEPS and ONLY ON SOUND TRACKS were not recorded on 1.74 hardware; the sliced loop's sound with a real sample, and a power cycle with this build, were not recorded.
