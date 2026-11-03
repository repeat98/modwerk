# Velocity Humanise — test report

- Module: `velocity-humanise` 1.1.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.3.
- Source: https://github.com/Iced-Cream/rytm2_mods at `afd461d4a8ef4306bb2a57d4c61ad35c362b3940` (tag `v1.2`), `velocity-humanise`.
  `src/velocity-humanise.s` (`06ed7012…57bd`, rytm2_mods' `velocity-humanise/os1.74/velocity-humanise.s`),
  `include/ar2-1.74.inc` (`c57431f7…874b`), `shared/live-track.s` (`53814de9…82ba`) and `shared/shared.s`
  (`8cc89465…62d6`) are byte-identical to it.
- Original: MrScruff's rytm-mods `0003-velocity-humanise`.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`.
- Tested build C3A4 (OS 1.74, core-ar2 0.3 before #153 + all eleven rytm2_mods v1.2 ports): `.syx`
  `04d987ced36850eef5eb5cd1215d411edf621a5af94f980525ab561c9108f951`, main OS `fc871476…d529`.
- Tested build SXH4 (OS 1.74, released core-ar2 0.3 `6b97dfb3…3e58` + the six rytm2_mods v1.2
  objects submitted to Modwerk + a remote-control test layer that shares no site with them): `.syx`
  `e4d01a6aec250bd2af7743c9f8b0e9c560d805b52564932dddc41d872e1c5000`, main OS `0ef422bf…8fb8`.
  Without the test layer the same inputs give SX74, `.syx` `2a352718…4371`.
- Tested build VHH4 (OS 1.74, released core-ar2 0.3 `6b97dfb3…3e58` + this module alone + the same
  remote-control test layer): `.syx` `4bebbd5d7ba1860f168ee34c35212f58e67b525628a91b6f7d76fd5e5a101ca8`, main OS `ae1c680f…20aa`.
- Tested build C3N4 (C3A4 without euclid-accents): `.syx` `a74435c28591ec0f2d143b0629a4fd5b6f37ab85e0b3e4618b000698dd5ea9f5`.
- Build VH74 (OS 1.74, released core-ar2 0.3 + this module): `.syx` `f4f01cf1003a5e9e5aa401cca1e49e289a2f99007f8f140f36db0846bdbe8b1b`,
  main OS `2ef50b8c4ceea0869ea7bc6ff95cd7d86a789d0527a37c07b9b4520a9b242ee0`. Emulator only.

## Hardware

On an Analog Rytm MKII with OS 1.74, 2026-10-20, Iced-Cream flashed C3A4 (core-ar2 0.3
and all eleven v1.2 ports, including this module's release object `545cf2ec…e0d9`) and
C3N4 as part of the core-ar2 0.3 unit test, ran the module's test steps and restored
stock 1.74:

1. TRIG page, hold FUNC, turn VEL: the label reads RND, the popup 0..64.
2. N = 32, playing a track of equal-velocity trigs: the hits vary in level. N = 0: all equal.
3. Save, power-cycle, reload: N is kept.
4. Without euclid-accents in the build (C3N4): 1 to 3 the same, and euclid on/off unaffected by N.

Steps 1 to 3 passed on C3A4, and N was also kept through a power-cycle without SAVE
PROJECT (core 0.3 saves track fields on stock's per-part saves). Step 4 passed on C3N4.
Relinking C3A4's core and v1.2's eleven release objects on stock 1.74 gives C3A4's main OS
byte for byte. Duration was not recorded. See [the hardware report](evidence/hardware-testing.json).

On 2026-10-24 and 2026-10-25 the same unit ran SXH4, the released core-ar2 0.3 with the six
Analog Rytm MKII modules submitted together (Ctrl All, Env Reset Amp, Slice Loop, Main RMS,
Euclid Accents, Velocity Humanise) and a remote-control test layer that shares no site with
them. A scripted bench drove it over USB in a `~T` test project, took screenshots and recorded
every output over USB audio, then restored stock 1.74.

For this module: FUNC + VEL on the TRIG page reads RND. On CP with 16 equal-velocity trigs,
N 10 gave a bar-to-bar spread of 0.63 dB per step against 0.35 dB at N 0, the measurement
floor, as a velocity spread of about 10 should. The remote turn landed on N 10, so a larger N
was not measured. N set fully right was kept through a power cycle without SAVE PROJECT
(the dial position matched; that view shows no number).

In a four-minute play with samples, delay and reverb sends and knob turns, nothing froze and
no output had a gap or level dip. Clicks flagged on the main mix also appear on a build with
the same core and test layer but none of the six modules, so they are not this module's. Results are in the
[hardware report](evidence/hardware-testing.json).

On 2026-10-25 the same unit ran VHH4: the released core-ar2 0.3 with this module as the only
module, plus the same remote-control test layer. The bench flashed the six solo builds one after
another from stock and restored stock 1.74 at the end; every flash finished without a stall.
FUNC + VEL on the TRIG page read RND and N 64 was kept after release. On CP with equal-velocity
trigs, N 64 gave a bar-to-bar spread of 2.99 dB per step against 0.36 dB at N 0, the
measurement floor. Persistence was not repeated alone. No output froze or dropped out.

## Source build comparison

The module is a submission (`modules/_submissions/`) until the browser can build it. Modwerk's own validation and compiler path, run on this folder:

```sh
node scripts/machine-modules.mjs --drafts --base origin/main
MODWERK_CROSS=m68k-linux-gnu- node scripts/build-elemod-packages.mjs --output OUT --source-commit <commit> --drafts --module analog-rytm-mkii:velocity-humanise
node scripts/verify-elemod-source-parity.mjs --packages OUT --oracle ORACLE --out RESULT --firmware analog-rytm-mkii:Analog-Rytm_MKII_OS1.74.syx
```

`ORACLE` held elekloader's `core-ar2-0.3.elemod` release (`core-ar2-v0.3`, 769d9aa,
`6b97dfb3…3e58`) and rytm2_mods v1.2's release `velocity-humanise-1.1-os1.74.elemod` (`545cf2ec…e0d9`).
The materialised Modwerk package linked with that core gives main OS `2ef50b8c…2ee0`,
byte-identical to the core linked with the release object, and to VH74
([source-parity.json](evidence/source-parity.json)). `.run` is 828 bytes, five sites, eight
relocations; it imports `core_store_get`, `core_store_set` and its storage field `vel_rnd`.
mod.json's `keep2` site is written as a `jsr` site; it produces the same bytes.

Compiler: Ubuntu 24.04 `m68k-linux-gnu` GCC 13.3.0 and binutils 2.42. Modwerk's pinned Docker
toolchain was not run here, and CI's `elemod-source` job compiles published folders only. The
firmware and the linked builds stayed on the owner's computer.

## Emulator

[rytm-emu](https://github.com/trigcondition/rytm-emu) `c5732f0`, headless `dtboot`, the same
input on VH74 and on stock 1.74 ([capture plan](media/capture.json)): BD's TRIG page, FUNC
held while VEL turns up. Frames are byte-identical until FUNC is held; from then on stock
shows VEL and the trig velocity (100), VH74 shows RND and N. After FUNC is released both
show VEL with the same value. Playback and persistence were not exercised in the emulator;
the hardware runs cover them.

## Load and memory

828 bytes in the shared DDR area, no `.bss`, no fast SRAM, and four bits of track storage.
One detour runs on each trig: it reads N through `core_store_get`, which masks interrupts
briefly, then draws a random offset and clamps the velocity. The others run on UI edits and
drawing. Static reading, not a measurement.

## Not tested

- Other modules beside it, except rytm2_mods' own ports.
- Kit and pattern transfer over SysEx, and loading a project saved with this module into a build without it.
