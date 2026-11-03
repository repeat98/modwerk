# Play Start

Unlisted development draft under `sdk/drafts/play-start`; not a published or
installable Modwerk module. Source is preserved while the qualification work
in TESTING.md remains pending. Draft release notes are in CHANGELOG.json.

Version: `0.1.0-experimental` · author: [@jonathanwardle1992-beep](https://github.com/jonathanwardle1992-beep)

A global sequencer setting: **[PLAY] always starts from the beginning and never pauses.** Turn it on or off in PERSONALIZE. Default **OFF** is stock play/pause, so installing the module changes nothing until you enable it.

**Experimental.** Source is written against original OS 1.40C guards. It has not been run on a unit or in the emulator yet.

## Overview

On the stock OS, [PLAY] starts, pauses, or continues. With PLAY START **ON**, a press of [PLAY] that would have paused or continued instead starts the sequencer from the beginning of the current pattern. [STOP] is still [STOP]. MIDI START / CONTINUE / STOP are unchanged (they do not go through the panel [PLAY] handler). [REC] + [PLAY] still starts live recording.

No effect slot and no extra project bytes. The setting is PERSONALIZE (battery SRAM), not a Part or project field, so a saved project reloads unchanged on stock firmware.

## Controls

| Control | Default | Values |
|---|---|---|
| PLAY START | OFF | OFF = stock play/pause; ON = [PLAY] always starts from the beginning |

No knob. In PERSONALIZE, LEFT/RIGHT clamp; YES wraps.

## Usage

### Quick tutorial: start from the beginning every time

1. Press [PROJ], open SYSTEM, then PERSONALIZE, and scroll to PLAY START.
2. Turn LEVEL (or YES) to ON. Close the menu.
3. Press [STOP], then [PLAY]: the sequencer starts. Press [PLAY] again while it runs: it starts from the beginning instead of pausing. [STOP] still stops.

To restore stock play/pause, set PLAY START back to OFF, or leave the module out of the build.

### What changes in a stock flow

- **What changes and for whom.** While PLAY START is ON, [PLAY] never pauses and never continues from a pause point. Everyone with the module in the build can turn that off in PERSONALIZE.
- **Why.** A live global restart on the same key. A new page would cost more presses than PERSONALIZE.
- **What you see and do differently.** With ON, a second [PLAY] restarts; [STOP] is the only pause/stop. With OFF, [PLAY] behaves as on stock.
- **Turning it off.** PERSONALIZE → PLAY START → OFF, or omit the module. OFF is the default.
- **Neighbouring flows.** [REC] + [PLAY] is left to stock (and to Quant Live Rec if that module is also installed). MIDI transport is not taken. Mute Modes cannot be chosen together: both grow the PERSONALIZE tables.

## Compatibility and limitations

- OS 1.40C, MKI and MKII panel paths share this handler. Hardware: not tested.
- **Conflicts with Mute Modes** (`mute-modes`): both relocate the PERSONALIZE label/getter/setter arrays and poke the ANDY restore length. The configurator will not offer both until a base-owned PERSONALIZE table exists (that would be a separate owner-reviewed change, not this module).
- Quant Live Rec can sit beside it: that module detours [PLAY] at `0x40061778`; this one detours `0x40061822` after the [REC]-held branch.
- MIDI START does not follow PLAY START. Not tested: pickup machines, chained patterns, live recording while PLAY START is ON, an MKI panel, USB Keep/Undo.
- An OS upgrade resets PERSONALIZE, including this row.

## Tests and measurements

See [TESTING.md](TESTING.md). No emulator or hardware results yet.

## Authorship and licences

jonathanwardle1992-beep: behaviour, ColdFire source, PERSONALIZE row and documentation. MIT, [LICENSE](LICENSE). No firmware, stock code, built image or card is included.

## Screens and audio

Captures of PROJECT > SYSTEM > PERSONALIZE > PLAY START are not made yet. They must be real black-and-white LCD pixels (emulator framebuffer or hardware). The module makes no sound of its own.
