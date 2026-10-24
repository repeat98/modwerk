# Filter Hz — test report

- Module: `filter-hz` 1.2.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.3. 1.2.0 drops the OS 1.73
  release (core-ar2 0.1) that 1.1.0 had; the 1.74 code is unchanged.
- Source: https://github.com/Iced-Cream/rytm2_mods at `afd461d4a8ef4306bb2a57d4c61ad35c362b3940` (tag `v1.2`).
  `src/filter-hz.s` (`9d248844…d5bb`) is its `filter-hz/os1.74/filter-hz.s` and `include/ar2-1.74.inc`
  (`c57431f7…874b`) its `include/ar2-1.74.inc`, byte for byte.
- Original: MrScruff's rytm-mods `0008-filter-hz`, in rytm-mods-src at `cf5ac006`, marked hardware-verified there.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`.
- Build FZ74 (OS 1.74, released core-ar2 0.3 + this module): `.syx` `62c256261d643752c9e8ffb357aada048af75a9b03c1f1aae649287e4bae7745`,
  main OS `2d8aead1932dd07003c75b233c4c93291d144c4eb5d6a8a11f1fecece1ea948d`. Tested on the unit 2026-10-22.
- Tested build C3A4 (OS 1.74, core-ar2 0.3 before #153 + all eleven rytm2_mods v1.2 ports): `.syx`
  `04d987ced36850eef5eb5cd1215d411edf621a5af94f980525ab561c9108f951`, main OS `fc871476…d529`.

## Hardware

On 2026-10-22 Iced-Cream flashed FZ74 (the released core-ar2 0.3 and Filter Hz alone) with
Transfer. It booted and played as stock. FRQ fully left read 13.8Hz, fully right 21.1kHz, one
step back 19.9kHz, and RES still showed a plain number. A minute of playback while turning FRQ,
with samples and delay and reverb sends on all tracks and heard over Overbridge, had no freezes
or dropouts. Stock 1.74 was restored afterwards.

Earlier, on the same unit, 2026-10-18, in R8T2 (core-ar2 0.1 ported to 1.74 and eight
ports, with rytm2_mods v1.1's Filter Hz): FRQ fully left read 13.8Hz, fully right 21.1kHz,
one step back 19.9kHz, and RES still showed a plain number. On 2026-10-20, in C3A4
(core-ar2 0.3 and all eleven v1.2 ports, including this module's v1.2 release object
`25055fc7…512a`), each mod's own test passed. Relinking C3A4's core and v1.2's eleven
release objects on stock 1.74 gives C3A4's main OS byte for byte. See
[the hardware report](evidence/hardware-testing.json).

The OS 1.73 release that 1.0.0 and 1.1.0 carried was tested on a unit as FZ01 (2026-10-13);
that report left with the release.

Duration and readings beyond those were not recorded.

## Source build comparison

Modwerk's own validation and compiler path, run on this folder:

```sh
node scripts/machine-modules.mjs --base origin/main
MODWERK_CROSS=m68k-linux-gnu- node scripts/build-elemod-packages.mjs --output OUT --source-commit <commit> --module analog-rytm-mkii:filter-hz
node scripts/verify-elemod-source-parity.mjs --packages OUT --oracle ORACLE --out RESULT \
  --firmware analog-rytm-mkii:Analog-Rytm_MKII_OS1.74.syx
```

`ORACLE` held elekloader's `core-ar2-0.3.elemod` release (`core-ar2-v0.3`, 769d9aa, `6b97dfb3…3e58`)
and rytm2_mods v1.2's release `filter-hz-1.0-os1.74.elemod` (`25055fc7…512a`). The materialised
Modwerk package, linked with that core, gives the same main OS as the core linked with the
release object, `2d8aead1…948d`, which is FZ74, the build tested on the unit
([source-parity.json](evidence/source-parity.json)). `.run` is 256 bytes, one site, no relocations.

Compiler: Ubuntu 24.04 `m68k-linux-gnu` GCC 13.3.0 and binutils 2.42. Modwerk's pinned Docker
toolchain (`m68k-elf` binutils 2.47) was not run here; CI's `elemod-source` job compiles this
folder with it and checks the committed export against that build. The firmware and the linked
builds stayed on the owner's computer.

The source-only export, `sdk/imports/packages/filter-hz/filter-hz-1.2.0-os1.74.elemod`
(`95e455cb…0446`), comes from that compiled recipe with `scripts/package-elemod-recipe.mjs`.
Elekloader kit 0.7.0, as vendored in Modwerk, builds it with the released core-ar2 0.3 on stock
1.74, with display version FZ74, into FZ74's .syx byte for byte (`62c25626…7745`), so the browser's build is the tested build.

## Emulator

[rytm-emu](https://github.com/trigcondition/rytm-emu), headless `dtboot`, the same input on the
module's build and on stock ([capture plan](media/capture.json)): `c5732f0` on FZ74 and stock 1.74.
The PNG files were first captured with `3c4c42c` on the OS 1.73 build FZ01; FZ74 gives them byte for byte.

| Screen | Stock | With Filter Hz |
| --- | --- | --- |
| FILTER page | FRQ label | identical |
| FRQ at 60 | `60` | `440Hz` |
| FRQ at 127 | `127` | `21.1kHz` |

Of the 104 screens of the run, 94 differ from stock 1.74 only in the FRQ label. Turns 60, 70
and 80 also differ in the filter curve, because the two runs had reached different FRQ values
mid-turn (622Hz against 68 at turn 60). The analog voices are stubbed in the emulator, so this
says nothing about sound, which the module does not touch.

## Load and memory

256 bytes in the shared DDR area, no `.bss`, no fast SRAM. The site is in
`param_value_text`, which formats a parameter's value for the screen; for any parameter but
FRQ the stub re-runs the two displaced instructions and returns. Nothing runs in the audio,
sequencer or tick paths. Static reading, not a measurement.

## Not tested

- Filter types other than LP2 against a measured cutoff (the scale is assumed to hold).
- Other modules beside it, except rytm2_mods' own ports.
- Long sessions, project save and reload, and a power cycle with this build were not recorded.
