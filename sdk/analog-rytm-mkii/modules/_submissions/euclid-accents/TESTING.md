# Euclid Accents — test report

- Module: `euclid-accents` 1.1.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.3.
- Source: https://github.com/Iced-Cream/rytm2_mods at `afd461d4a8ef4306bb2a57d4c61ad35c362b3940` (tag `v1.2`), `euclid-accents`.
  `src/euclid-accents.s` (`1a3d6b53…69a3`, rytm2_mods' `euclid-accents/os1.74/euclid-accents.s`),
  `include/ar2-1.74.inc` (`c57431f7…874b`) and `shared/live-track.s` (`53814de9…82ba`) are byte-identical to it.
- Original: MrScruff's rytm-mods `0002-euclid-accents`.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`.
- Tested build C3A4 (OS 1.74, core-ar2 0.3 before #153 + all eleven rytm2_mods v1.2 ports): `.syx`
  `04d987ced36850eef5eb5cd1215d411edf621a5af94f980525ab561c9108f951`, main OS `fc871476…d529`.
- Tested build SXH4 (OS 1.74, released core-ar2 0.3 `6b97dfb3…3e58` + the six rytm2_mods v1.2
  objects submitted to Modwerk + a remote-control test layer that shares no site with them): `.syx`
  `e4d01a6aec250bd2af7743c9f8b0e9c560d805b52564932dddc41d872e1c5000`, main OS `0ef422bf…8fb8`.
  Without the test layer the same inputs give SX74, `.syx` `2a352718…4371`.
- Tested build EAH4 (OS 1.74, released core-ar2 0.3 `6b97dfb3…3e58` + this module alone + the same
  remote-control test layer): `.syx` `04f4d21ca270ecfb182a801818ebbc8d4086e2d03ba059a7dc9ef404755ed5ca`, main OS `e97c5587…a827`.
- Build EA74 (OS 1.74, released core-ar2 0.3 + this module): `.syx` `48697da941188e56dadd59f1344fd2becc2069296c0b50d7106e47850ac5efc8`,
  main OS `acb72de4548d63d850a2f8e97391c010afcfde0f5087abe9e836d800822b3bb4`. Emulator only.

## Hardware

On an Analog Rytm MKII with OS 1.74, 2026-10-20, Iced-Cream flashed C3A4 (core-ar2 0.3
and all eleven v1.2 ports, including this module's release object `ddba6f8a…fd73`) as
part of the core-ar2 0.3 unit test, ran the module's test steps and restored stock 1.74:

1. TRIG, TRIG again for EUCLIDEAN, EUC on, OP turned fully right: OR\*, XOR\*, AND\*, SUB\*.
2. With OR\* and a few grid trigs, playing: only grid trigs play; those on euclid hits are accented.
3. FUNC + EUC off: the accents are written into the pattern. Save, power-cycle, reload: OP keeps its accent value.
4. With an accent operator EUC stays on and the track plays only its grid trigs. OP back to a
   plain operator: euclid generates the trigs again.

All four passed, and OP also kept its accent value through a power-cycle without SAVE
PROJECT (core 0.3 saves track fields on stock's per-part saves). Relinking C3A4's core and
v1.2's eleven release objects on stock 1.74 gives C3A4's main OS byte for byte. Duration
was not recorded. See [the hardware report](evidence/hardware-testing.json).

On 2026-10-24 and 2026-10-25 the same unit ran SXH4, the released core-ar2 0.3 with the six
Analog Rytm MKII modules submitted together (Ctrl All, Env Reset Amp, Slice Loop, Main RMS,
Euclid Accents, Velocity Humanise) and a remote-control test layer that shares no site with
them. A scripted bench drove it over USB in a `~T` test project, took screenshots and recorded
every output over USB audio, then restored stock 1.74.

For this module: OP turned past SUB to the accent values (SUB\* with its mark). With BD grid
trigs on steps 1, 2, 4, 5, 7 and 10 and PL1 6 (hits on 1, 4, 7, 9, 12, 15), at XOR\* and at
SUB\* only the six grid trigs played, and those on hits (1, 4, 7) peaked 2.1 to 2.4 dB above
the others, measured on BD's output and checked in the pattern's memory. After a power cycle
without SAVE PROJECT, OP still showed SUB\*. The bake (FUNC + EUC off) was not repeated.

In a four-minute play with samples, delay and reverb sends and knob turns, nothing froze and
no output had a gap or level dip. Clicks flagged on the main mix also appear on a build with
the same core and test layer but none of the six modules, so they are not this module's. Results are in the
[hardware report](evidence/hardware-testing.json).

On 2026-10-25 the same unit ran EAH4: the released core-ar2 0.3 with this module as the only
module, plus the same remote-control test layer. The bench flashed the six solo builds one after
another from stock and restored stock 1.74 at the end; every flash finished without a stall.
OP reached SUB\*, AND\* and XOR\*. At XOR\* and at SUB\* only the grid trigs played (the
euclid-only steps held just the previous hit's decay), and grid trigs on euclid hits peaked
2.0 to 2.3 dB above the others, measured on BD's output. Persistence and the bake were not
repeated alone. No output froze or dropped out.

## Source build comparison

The module is a submission (`modules/_submissions/`) until the browser can build it. Modwerk's own validation and compiler path, run on this folder:

```sh
node scripts/machine-modules.mjs --drafts --base origin/main
MODWERK_CROSS=m68k-linux-gnu- node scripts/build-elemod-packages.mjs --output OUT --source-commit <commit> --drafts --module analog-rytm-mkii:euclid-accents
node scripts/verify-elemod-source-parity.mjs --packages OUT --oracle ORACLE --out RESULT --firmware analog-rytm-mkii:Analog-Rytm_MKII_OS1.74.syx
```

`ORACLE` held elekloader's `core-ar2-0.3.elemod` release (`core-ar2-v0.3`, 769d9aa,
`6b97dfb3…3e58`) and rytm2_mods v1.2's release `euclid-accents-1.1-os1.74.elemod` (`ddba6f8a…fd73`).
The materialised Modwerk package linked with that core gives main OS `acb72de4…3bb4`,
byte-identical to the core linked with the release object, and to EA74
([source-parity.json](evidence/source-parity.json)). `.run` is 1,448 bytes, thirteen sites, ten
relocations; it imports `core_store_get`, `core_store_set` and its storage field `euclid_accent`.
mod.json's `keep2` sites are written as `jsr` and `lea` sites; they produce the same bytes.

Compiler: Ubuntu 24.04 `m68k-linux-gnu` GCC 13.3.0 and binutils 2.42. Modwerk's pinned Docker
toolchain was not run here, and CI's `elemod-source` job compiles published folders only. The
firmware and the linked builds stayed on the owner's computer.

## Emulator

[rytm-emu](https://github.com/trigcondition/rytm-emu) `c5732f0`, headless `dtboot`, the same
input on EA74 and on stock 1.74 ([capture plan](media/capture.json)): BD's EUCLIDEAN page,
EUC and PL1 stepped, then twelve value steps on OP. Every frame is byte-identical until OP
passes SUB; then EA74 shows OR\* and AND\* while stock stays at SUB. The emulator's value
steps do not always move OP by exactly one value, so XOR\* and SUB\* were not framed. Playback,
the bake and persistence were not exercised in the emulator; the hardware run covers them.

## Load and memory

1,448 bytes in the shared DDR area, no `.bss`, no fast SRAM, and one bit of track storage.
Two detours run on each trig in the sequencer's trig fire; on an accent track the accent
arm reads the flag through `core_store_get`, which masks interrupts briefly. The rest run on
UI edits, drawing and the euclid bake. Static reading, not a measurement.

## Not tested

- Other modules beside it, except rytm2_mods' own ports.
- Kit and pattern transfer over SysEx, and loading a project saved with this module into a build without it.
