# Ctrl All — test report

- Module: `ctrl-all` 1.2.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.3.
- Source: https://github.com/Iced-Cream/rytm2_mods at `afd461d4a8ef4306bb2a57d4c61ad35c362b3940` (tag `v1.2`), `ctrl-all`.
  `src/ctrl-all.s` (`61678879…833d`, rytm2_mods' `ctrl-all/os1.74/ctrl-all.s`) and `include/ar2-1.74.inc`
  (`c57431f7…874b`) are byte-identical to it.
- Original: MrScruff's rytm-mods `0014-ctrl-all`, with his 1.1 (rytm-mods-src `76ae299`) and 1.2 (`9831bdf`) updates.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`.
- Tested build R8K4 (OS 1.74, core-ar2 0.1 ported to 1.74 + seven ports with ctrl-all 1.2): `.syx`
  `4f54db92ed3955be1be32123f6cb51c8ebd081936dead60130111f46fba329b8`.
- Tested build C3A4 (OS 1.74, core-ar2 0.3 before #153 + all eleven rytm2_mods v1.2 ports): `.syx`
  `04d987ced36850eef5eb5cd1215d411edf621a5af94f980525ab561c9108f951`, main OS `fc871476…d529`.
- Tested build SXH4 (OS 1.74, released core-ar2 0.3 `6b97dfb3…3e58` + the six rytm2_mods v1.2
  objects submitted to Modwerk + a remote-control test layer that shares no site with them): `.syx`
  `e4d01a6aec250bd2af7743c9f8b0e9c560d805b52564932dddc41d872e1c5000`, main OS `0ef422bf…8fb8`.
  Without the test layer the same inputs give SX74, `.syx` `2a352718…4371`.
- Tested build CAH4 (OS 1.74, released core-ar2 0.3 `6b97dfb3…3e58` + this module alone + the same
  remote-control test layer): `.syx` `7c09272dc47d3a3c51d759d931d739f81c7893e6ec4eea894164c6b0166f1f16`, main OS `72b62487…78f6`.
- Build CT74 (OS 1.74, released core-ar2 0.3 + this module): `.syx` `c4a1fc0b88d46abb115454f774538fb6d30529cadf2e315cc5881f8ad724567e`,
  main OS `da53bc86f5ac4f8da00226c56eb059fa7b49a88a6d56571032d0abb9cd848a1c`. Emulator only.

## Hardware

On an Analog Rytm MKII with OS 1.74, 2026-10-19, Iced-Cream flashed R8K4 with Elektron
Transfer, ran the port's four test steps and restored stock 1.74:

1. FILTER page: holding TRK and turning FRQ on one track moves another track's FRQ by the same amount.
2. SYNTH page, BD HARD on track 1 and SD HARD on track 2: every knob pairs by its place on the
   screen, and a machine with an empty knob stays put for that knob.
3. FILTER page: TRK + TYP sets every track to the type the selected track reaches.
4. With the FX track selected, or a trig key held, only the selected track changes.

All four passed. On 2026-10-20, in C3A4 (core-ar2 0.3 and all eleven v1.2 ports, including
this module's release object `cc7d1b3c…bc7b`), each mod's own test passed again. Relinking
C3A4's core and v1.2's eleven release objects on stock 1.74 gives C3A4's main OS byte for byte.
Duration was not recorded. See [the hardware report](evidence/hardware-testing.json).

On 2026-10-24 and 2026-10-25 the same unit ran SXH4, the released core-ar2 0.3 with the six
Analog Rytm MKII modules submitted together (Ctrl All, Env Reset Amp, Slice Loop, Main RMS,
Euclid Accents, Velocity Humanise) and a remote-control test layer that shares no site with
them. A scripted bench drove it over USB in a `~T` test project, took screenshots and recorded
every output over USB audio, then restored stock 1.74.

For this module: on the FILTER page, holding TRK and turning FRQ moved BD, SD and CH FRQ
together; with the FX track selected only the FX track changed (screens). The trig-key-held
case and the SYNTH and TYP tests were not repeated on SXH4.

In a four-minute play with samples, delay and reverb sends and knob turns, nothing froze and
no output had a gap or level dip. Clicks flagged on the main mix also appear on a build with
the same core and test layer but none of the six modules, so they are not this module's. Results are in the
[hardware report](evidence/hardware-testing.json).

On 2026-10-25 the same unit ran CAH4: the released core-ar2 0.3 with this module as the only
module, plus the same remote-control test layer. The bench flashed the six solo builds one after
another from stock and restored stock 1.74 at the end; every flash finished without a stall.
Holding TRK and turning FRQ on the FILTER page set FRQ to 0 on BD, SD and CH together; with
the FX track selected only the FX track changed and BD stayed put (screens). The SYNTH and TYP
steps were not repeated alone. No output froze or dropped out.

## Source build comparison

The module is a submission (`modules/_submissions/`) until the browser can build it. Modwerk's own validation and compiler path, run on this folder:

```sh
node scripts/machine-modules.mjs --drafts --base origin/main
MODWERK_CROSS=m68k-linux-gnu- node scripts/build-elemod-packages.mjs --output OUT --source-commit <commit> --drafts --module analog-rytm-mkii:ctrl-all
node scripts/verify-elemod-source-parity.mjs --packages OUT --oracle ORACLE --out RESULT --firmware analog-rytm-mkii:Analog-Rytm_MKII_OS1.74.syx
```

`ORACLE` held elekloader's `core-ar2-0.3.elemod` release (`core-ar2-v0.3`, 769d9aa,
`6b97dfb3…3e58`) and rytm2_mods v1.2's release `ctrl-all-1.2-os1.74.elemod` (`cc7d1b3c…bc7b`).
The materialised Modwerk package linked with that core gives main OS `da53bc86…848a1c`,
byte-identical to the core linked with the release object, and to CT74
([source-parity.json](evidence/source-parity.json)). `.run` is 432 bytes, one site, no
relocations.

Compiler: Ubuntu 24.04 `m68k-linux-gnu` GCC 13.3.0 and binutils 2.42. Modwerk's pinned Docker
toolchain was not run here, and CI's `elemod-source` job compiles published folders only. The
firmware and the linked builds stayed on the owner's computer.

## Emulator

[rytm-emu](https://github.com/trigcondition/rytm-emu) `c5732f0`, headless `dtboot`, the same
input on CT74 and on stock 1.74 ([capture plan](media/capture.json)): FILTER on BD, TRK held
while FRQ turns from 127 to 75, then TRK + the SD pad.

| Screen | Stock 1.74 | CT74 |
| --- | --- | --- |
| BD FILTER page, TRK + FRQ to 75 | as shown | identical |
| SD FILTER page afterwards | FRQ fully open | FRQ curve closed to the middle |

Every one of the run's screens is identical until SD is selected; on SD's page the two differ
only in the filter curve (x 84–162, y 117–134 of the 384×192 PNG). The analog voices are
stubbed in the emulator, so this says nothing about sound, which the module does not touch.

## Load and memory

432 bytes in the shared DDR area, no `.bss`, no fast SRAM. The site is in
`param_apply_delta`, which applies a knob turn; with TRK held it calls each track's delta
handler twelve times instead of once. Nothing runs in the audio, sequencer or tick paths.
Static reading, not a measurement.

## Not tested

- Other modules beside it, except rytm2_mods' own ports.
- Long sessions, project save and reload, and a power cycle with this build were not recorded.
