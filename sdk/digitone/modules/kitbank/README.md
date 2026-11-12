# kitbank — Digitone

Modwerk module version: `0.1.0-experimental`.

## Overview

kitbank gives the original Digitone and Digitone Keys (OS 1.44) one kit per bank, like the Octatrack's parts. With **KIT PER BANK** ticked in SETTINGS, the 16 patterns of a bank play the kit of the bank's first pattern: A01 to A16 play A01's kit, B01 to B16 play B01's kit, and so on up to H.

- Change pattern inside a bank: the sounds stay, only the notes change.
- A sound edit made on any pattern of the bank goes to the bank's kit and is heard on all 16 patterns.
- Queued pattern changes during playback and chains take the bank's kit too.
- FUNC+YES / FUNC+NO, SAVE TO PROJ / RELOAD FROM PROJ and [T1–4]+[NO] act on the bank's kit from any pattern of the bank.
- Nothing is rewritten in the project. Every pattern keeps its own kit, untouched; untick KIT PER BANK and each pattern plays its own kit again. A project saved this way opens normally on the stock OS.
- Off at power-on, so existing projects sound as before until you tick it.

## Controls

| Control | What it does |
| --- | --- |
| KIT PER BANK | SETTINGS, last row. Ticked: the patterns of each bank share the kit of the bank's first pattern. Unticked: every pattern plays its own kit, as on the stock OS. Off at power-on and not saved with the project; a change applies from the next pattern change. |

## Usage

Use the access steps below after installing a compatible build. The tutorial gives a first practical pass through the module.

### Where to find it

Location: SETTINGS, last row: KIT PER BANK.

1. Press SETTINGS and scroll to the last row, KIT PER BANK.
2. Press YES (or RIGHT) to tick it; YES (or LEFT) unticks it.
3. Change pattern, or select the current pattern again: the setting applies from that pattern change.

These instructions assume the module is already installed in a compatible build. For selecting and building it in Modwerk, see the [Digitone guide](../../../machines/digitone/README.md).

### Quick tutorial: one kit for a whole bank

1. Open SETTINGS, scroll to the bottom and tick KIT PER BANK.
2. Select A01 again, set up a bass sound, then go to A02 and program different notes: same sound.
3. On A02, open the filter page and turn the cutoff; go back to A01: the cutoff moved there too.
4. Press FUNC+YES on A02 to save the bank's kit; FUNC+NO on any pattern of bank A reloads it.
5. Untick KIT PER BANK and change pattern: A02 plays its own kit again.

A practical layout: one bank per track (intro, verse, break... as 16 patterns sharing one set of sounds), eight tracks per project.

## Compatibility and limitations

- Original Digitone (Mk1) and Digitone Keys, OS 1.44, with core-dn1 2.0a for 1.44. Not ported to OS 1.43. The Keys runs the same OS file but has not been tried.
- The switch is off at power-on and is not saved with the project: core-dn1 2.0a for 1.44 has no project data. It can move to `core_projdata` when a 1.44 core provides it.
- kitbank patches seven stock OS sites itself (immediate pattern change, the kit lookup used by the screen and edits, two queued-change sites, kit save, kit reload, sound reload). The three save/reload sites are redirected only when called from the pattern menus, so the automatic saves after copy, paste and clear keep each pattern's own slot. A mod that patches the same bytes cannot be combined; if other mods need kit selection, these sites should become a core hook.
- While ticked, pasting a pattern into a bank's first pattern (A01, B01...) replaces the bank's kit with the copied pattern's own kit, because the stock OS replaces that pattern's kit.
- Toggling applies at the next pattern change, so the screen and the sound engine always switch together.
- Song mode was not tried. Queued changes during playback were.

## Tests and measurements

The Modwerk evidence tier is `none`. [TESTING.md](TESTING.md) records the emulator runs: stock behaviour when unticked, bank kits for immediate and queued pattern changes, edits, kit save and reload, unticking, and a full check against the stock OS. Memory: 552 B (548 B code, 4 B state), excluding the core. No audio-rate work.

The same redirections were first built as a standalone patch of the author's own unit (OS 1.44, always on) and run there; that build is not a Modwerk build and is not part of this module's evidence.

## Authorship and licences

- ZOGV — kitbank design and code
- irpina — the SETTINGS row pattern from digihealth (GPL-2.0-or-later), and the elekloader core it links with

The module is licensed under [GPL-3.0-or-later](LICENSE).

## Screens and audio

Firmware-rendered emulator captures on OS 1.44. The [capture record](media/capture.json) includes build identities, panel inputs, timestamps and PNG hashes; it also records that they were taken with a digiemu revision other than the reviewed one. [Capture rights](media/LICENSE.md) preserve the underlying interface rights. The [thumbnail](media/thumbnail.svg) is an illustration. No audio demonstration is claimed.

![SETTINGS: KIT PER BANK unticked (power-on state)](media/settings-off.png)

SETTINGS: KIT PER BANK unticked (power-on state).

![SETTINGS: KIT PER BANK ticked](media/settings-on.png)

SETTINGS: KIT PER BANK ticked.
