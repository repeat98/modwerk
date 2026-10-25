# Pad Select — test report

- Module: `pad-select` 0.2.0-experimental, for Analog Rytm MKII OS 1.74 on core-ar2 0.3.
- Source: rytm2_mods (`Iced-Cream/rytm2_mods`), `pad-select` 0.2, local commit
  `35ea2f0` on branch `claude/pad-select`, **not yet pushed**, so `source.revision` is left out of
  the manifest until a public commit exists. `src/pad-select.s` (`93d95e91…3863`) is its
  `pad-select/os1.74/pad-select.s` and `include/ar2-1.74.inc` (`c57431f7…874b`) its
  `include/ar2-1.74.inc`, byte for byte. Source fingerprint (`sha256` of
  `sha256sum include/ar2-1.74.inc src/pad-select.s`): `10bc355d…aecd`.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`, the owner's file.
- Core: elekloader core-ar2 0.3 (`core-ar2-v0.3`, `core-ar2-0.3.elemod` `6b97dfb3…3e58`, as vendored).

## Sites

Five sites, read from stock OS 1.74; each one's stock bytes match rytm2_mods' `mod.json`, and
each is recorded here as an address, a length and the SHA-256 of those bytes.

| Address | Length | Op | Target | What |
| --- | --- | --- | --- | --- |
| `0x400c772e` | 6 | jmp | `pad_select_play_gate` | the play routine both key handlers call |
| `0x400c7a3e` | 6 | jsr | `pad_select_autotrk` | the pad handler's AUTO TRK SWITCH call |
| `0x400c7e90` | 6 | jsr | `pad_select_autotrk` | the TRIG key handler's AUTO TRK SWITCH call |
| `0x400c7950` | 6 | jmp | `pad_select_func_gate` | the pad handler's FUNC test |
| `0x400ec184` | 8 | jmp | `pad_select_menu_add` | the SEQUENCER CONFIG menu's constructor (jmp + nop) |

rytm2_mods declares the two AUTO TRK SWITCH sites as `keep2`. The stock instruction there is an
absolute `jsr`, so `keep2` and `jsr` write the same six bytes; this folder uses `jsr`, which
Modwerk's source-only export accepts (it refuses `keep2`).

## Source build and link (2026-10-24)

```sh
node scripts/machine-modules.mjs --drafts
MODWERK_CROSS=m68k-elf- node scripts/build-elemod-packages.mjs --output OUT \
  --source-commit <commit> --drafts --module analog-rytm-mkii:pad-select
node scripts/package-elemod-recipe.mjs OUT/analog-rytm-mkii/pad-select/1.74.json pad.elemod
```

Compiler: Homebrew `m68k-elf` binutils/GCC on macOS, Node 24.21.0. Modwerk's pinned Docker
toolchain was not run here.

The compiled recipe has a 764-byte `.run`, 5 sites, 5 relocations, no `.bss` and one storage
field, the same sizes elekloader's build of rytm2_mods 0.2 reports. Materialised against the
owner's stock OS 1.74 and linked with Modwerk's linker (`linkMods`, no lockfile):

| Selection | Result | Main OS sha256 |
| --- | --- | --- |
| core-ar2 0.3 + Pad Select | links; `pad_select_on` global bit 0 | `7ea05528…033f` |
| core-ar2 0.3 + Filter Hz 1.2.0 + Loop Sync 0.2.0-experimental + Pad Select | links, no overlaps; `pad_select_on` global bit 0, beside Loop Sync's sound and project fields | `970dad34…06e5` |

The source-only export (`pad.elemod`, not committed) linked with the core gives the same main
OS as the local materialisation, `7ea05528…033f`. The builds stayed on the owner's computer.

Not compared byte for byte with an elekloader build on core-ar2 0.3: the elekloader build kept
in rytm2_mods is on core-ar2 0.4, and no elekloader checkout was available here.

## Hardware

**Not tested.** Pad Select has not run on a unit. To do, on the exact build above (DESIGN.md's
12 steps in rytm2_mods, in short):

1. GLOBAL > SEQUENCER CONFIG: PAD+TRIG SEL TRK after AUTO TRK SWITCH; YES and LEFT/RIGHT toggle
   it. Save, power-cycle, reload: kept. Another GLOBAL slot keeps its own setting.
2. Stopped and playing: pads and TRIG 1-12 select silently; FUNC + pad plays, soft and hard;
   FUNC + TRIG plays. Holding a pad on a sounding track does not cut its note on release.
3. GRID REC: TRIG keys place trigs; pads select silently; FUNC + pad plays.
4. LIVE REC (RECORD + PLAY) and STEP REC (RECORD + STOP): as stock; NO + pad erases in LIVE REC.
5. CHROMATIC mode, MIDI notes in, TRIG + YES, the SOUND BROWSER: as stock. A track with MIDI
   out: a silent press sends nothing, FUNC + pad sends a note.
6. RTRG + pad: silent and selects; FUNC + RTRG + pad rolls.
7. MUTE, SCENE, PERF modes and TRK + pad: unchanged.
8. Unchecked: everything stock, AUTO TRK SWITCH as set.
9. A project saved with it checked, loaded on stock 1.74 and on a build without the module.

## Emulator

**Not tested.** rytm-emu was not available on this computer. The capture still open: the
SEQUENCER CONFIG screen with the PAD+TRIG SEL TRK row after AUTO TRK SWITCH, checked and
unchecked, with its panel-input plan in `media/capture.json`.

## Load and memory

764 bytes in the shared DDR area, no `.bss`, no fast SRAM. The sites are in the pad and TRIG key
handlers and their play routine, and in the SEQUENCER CONFIG menu's constructor. Each press reads
one storage bit through `core_store_get` and the record state; nothing runs in the audio,
sequencer or tick paths. Static reading, not a measurement.

## Not tested

Everything on a unit and in an emulator: behaviour, persistence, power cycle, MIDI out, other
modules beside it at run time, and loading a project saved with it on a build without it.
