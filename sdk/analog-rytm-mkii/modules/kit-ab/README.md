# Kit A/B

## Overview

Kit A/B turns the single-kit reload into an A/B between the kit as edited and the kit as saved.

- The first NO + PLAY (or RELOAD in the KIT menu) keeps your edits in a stash and loads the saved kit, under stock's popup: KIT 1 RELOADED!.
- The next press copies the stash back and applies it as stock's reload applies a kit: EDITS RESTORED!.
- Editing while the original plays ends the A/B. The next press keeps those edits instead, drops the stashed ones and reloads as a first press does. The same happens after a change of kit or any other reload; the module notices by a checksum of the working kit taken after each press.
- A press on a kit with no edits is a plain reload and arms nothing.

Reloading every kit stays stock. The stash is one kit (0x9e3 bytes, about 2.5 KB) taken from the firmware's heap on the first press and kept; if that fails, the press is a plain reload.

Version **1.0.0** for Analog Rytm MKII OS **1.74**, with core-ar2 0.3 or later. It is
[rytm2_mods](https://github.com/Iced-Cream/rytm2_mods)' elemod port of MrScruff's
`0010-kit-ab` from [rytm-mods-src](https://github.com/Iced-Cream/rytm-mods-src),
with his code unchanged.

## Controls

| Control | Action |
| --- | --- |
| NO + PLAY, and KIT menu > RELOAD | First press: stash the edited kit and reload the saved one (KIT 1 RELOADED!). Next press: restore the stash (EDITS RESTORED!). A press on a kit with no edits is a plain reload. |

There are no other new controls, menus or settings. To get stock behaviour back, build without the module.

## Usage

NO + PLAY wherever stock reloads the single kit, or RELOAD in the KIT menu (FUNC + PLAY MODE).

### Quick tutorial

1. Use a build containing Kit A/B. Edit a sound on the loaded kit, for example BD DEC.
2. Press NO + PLAY: the screen shows KIT 1 RELOADED! and the saved value is back.
3. Press NO + PLAY again: EDITS RESTORED! and your edited value returns. The KIT menu's RELOAD (FUNC + PLAY MODE) does the same, with KIT RELOADED! in place of KIT 1 RELOADED!.

## Compatibility and limitations

Requires core-ar2 0.3 or later on OS 1.74. Use your own original stock OS 1.74 file.

- Built for OS 1.74 only.
- One set of edits is kept, in a stash of one kit taken from the firmware's heap on the first press.
- The restore applies the stash exactly as stock's reload applies the saved kit, including `kit_mark(working, 0)`, whose meaning is not established.
- Reloading every kit stays stock.

The module patches four sites, two in the key handler's NO + PLAY path and two in the KIT menu's reload path. Each is the call to stock's single-kit reload and the address of its popup text; another module patching those bytes cannot be combined with it.

| Address | Bytes | Op |
| --- | --- | --- |
| `0x400cd51a` | 6 | jsr `kit_ab_toggle` (NO + PLAY) |
| `0x400cd542` | 6 | pea `kit_ab_kab_msg` (NO + PLAY, "KIT %d RELOADED!") |
| `0x400dd64a` | 6 | jsr `kit_ab_toggle` (KIT menu RELOAD) |
| `0x400dd652` | 6 | pea `kit_ab_kab_msg` (KIT menu RELOAD, "KIT RELOADED!") |

## Tests and measurements

See [TESTING.md](TESTING.md). No run of this module on OS 1.74 hardware is recorded in this repository yet. In the emulator the KIT menu's RELOAD stashes and restores a BD DEC edit as described. Memory: 340 bytes of the shared mod area (the 1.74 package's `.run`), and the stash on the firmware's heap. There is no code in the audio, sequencer or tick paths.

## Authorship and licences

MrScruff: the original mod (rytm-mods `0010-kit-ab`), its design and code, published in rytm-mods-src with his permission. Iced-Cream: the elemod port in rytm2_mods and this module. irpina: Elekloader and core-ar2.

Code: [GPL-2.0-only](LICENSE), as rytm-mods-src. `src/kit-ab.s` (rytm2_mods' `kit-ab/os1.74/kit-ab.s`) and `include/ar2-1.74.inc` are rytm2_mods' files at `2b3561a`, unchanged; the include names firmware routines by address only. The upstream README, which documents the OS 1.73 addresses, is in [upstream/README.md](upstream/README.md). No Elektron firmware is included.

## Screens and audio

Emulator captures (analog-emu, headless `dtboot`) of KA74, core-ar2 0.3 with this module, built from stock OS 1.74; see [the capture record](media/capture.json). The KIT menu's RELOAD is used because NO + PLAY does not reach the reload handler in the emulator.

![KIT menu with RELOAD first](media/kit-menu.png)

FUNC + PLAY MODE opens the KIT menu with RELOAD first.

![BD DEC edited to 82](media/dec-edited.png)

An edit on the loaded kit: BD DEC turned down to 82.

![KIT RELOADED! popup](media/kit-reloaded.png)

First RELOAD: the edits go to the stash and the saved kit loads, under stock's KIT RELOADED!.

![EDITS RESTORED! popup](media/edits-restored.png)

Second RELOAD: EDITS RESTORED!. Stock shows KIT RELOADED! again here.

![DEC back at the edited value](media/dec-restored.png)

After the second RELOAD the DEC dial is back at the edited value.

There is no audio demonstration.
