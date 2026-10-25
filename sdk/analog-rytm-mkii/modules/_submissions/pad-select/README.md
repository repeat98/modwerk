# Pad Select

## Overview

Pad Select adds **PAD+TRIG SEL TRK** to GLOBAL > SEQUENCER CONFIG, a checkbox just after AUTO
TRK SWITCH. Checked, the pads and TRIG keys 1-12 make sound only in LIVE RECORDING. Stopped,
playing or in GRID RECORDING, a press selects its track and stays silent, with no MIDI note out.
Hold FUNC to play it instead, at the pad's own velocity. Unchecked, everything is stock.

| Input | Not recording, or GRID REC | LIVE REC, STEP REC |
| --- | --- | --- |
| Pad | selects its track, silent | stock |
| TRIG 1-12 | selects track n, silent (in GRID REC they place trigs, as stock) | stock |
| FUNC + pad | plays, at the pad's own velocity | stock |
| FUNC + TRIG 1-12 | plays, at the track's VEL | stock |
| RTRG + pad | selects, silent; FUNC + RTRG + pad rolls | stock |

A silent press sends no MIDI note and leaves no held note, so its release cuts nothing the
sequencer plays. CHROMATIC mode, MUTE, SCENE and PERF modes, TRK + pad, MIDI notes in, TRIG + YES,
the SOUND BROWSER's preview and the sequencer itself are as stock.

Version **0.2.0-experimental** for Analog Rytm MKII OS **1.74**, with core-ar2 0.3. It is
Iced-Cream's own mod, `pad-select` 0.2 in [rytm2_mods](https://github.com/Iced-Cream/rytm2_mods),
not a port of someone else's. **It has not run on a unit or in an emulator yet**, so it waits in
`_submissions/`.

## Controls

| Control | Action |
| --- | --- |
| PAD+TRIG SEL TRK | Checkbox in GLOBAL > SEQUENCER CONFIG, after AUTO TRK SWITCH. YES toggles it, RIGHT checks, LEFT unchecks. Unchecked by default. |
| FUNC + pad, FUNC + TRIG 1-12 | While the setting applies, plays the pressed track. |

The setting is kept per GLOBAL slot, in core-ar2's mod storage (one bit, `pad_select_on`), and is
saved with the project's globals. No knob, page or effect slot is added.

## Usage

Check the box once per GLOBAL slot you want it in. AUTO TRK SWITCH keeps its own setting: while
PAD+TRIG SEL TRK applies, a press always selects its track; otherwise AUTO TRK SWITCH decides, as
stock.

### Quick tutorial

1. Use a build containing Pad Select. Press SETTINGS, open GLOBAL > SEQUENCER CONFIG and check PAD+TRIG SEL TRK, just after AUTO TRK SWITCH, with YES or LEFT/RIGHT.
2. With the sequencer stopped, tap pad 3: it makes no sound and track 3 is selected. Hold FUNC and tap pad 3 to hear it, soft or hard. TRIG 5 selects track 5 the same way.
3. Press RECORD + PLAY for LIVE RECORDING: pads play and record as stock. Uncheck PAD+TRIG SEL TRK to get stock behaviour everywhere.

### Changes to stock flows

While PAD+TRIG SEL TRK is checked, and only then:

- **Pads and TRIG 1-12 outside LIVE and STEP RECORDING** select silently instead of playing. This
  is the module's purpose: picking a track to edit without hearing it. An own page or a new
  gesture would not change what a plain press does, which is the point. Uncheck the box for stock.
- **FUNC + pad** plays at the pad's own velocity. Stock's FUNC + pad plays at the TRIG page's VEL;
  with plain presses silent, FUNC + pad is the way to hear a pad, so it keeps the pad's dynamics.
- **FUNC + TRIG 1-12** plays the track. Stock ignores FUNC there.
- **RTRG + pad** selects silently; FUNC + RTRG + pad rolls.

Neighbouring flows to check on a unit (not yet run, see [TESTING.md](TESTING.md)): STEP and LIVE
RECORDING, GRID RECORDING's trig placement, CHROMATIC mode, MUTE/SCENE/PERF modes, TRK + pad, NO +
pad in LIVE RECORDING, MIDI notes in, MIDI out on a track, TRIG + YES and the SOUND BROWSER.

## Compatibility and limitations

Requires core-ar2 0.3 on OS 1.74. Use your own original stock OS 1.74 file.

- Built for OS 1.74 only.
- **Not yet run on a unit or in an emulator.**
- LIVE RECORDING counts only while the sequencer runs: paused in LIVE RECORDING, pads select
  silently.
- A GLOBAL slot saved without the setting, or received as Global SysEx, loads unchecked. A
  project saved with it checked loads on a build without the module with stock behaviour; the
  stored bit is not read there. Not tested.
- Takes the plain pad and TRIG 1-12 press, FUNC + pad, FUNC + TRIG 1-12 and a SEQUENCER CONFIG
  row (`platform.claims`). Another module that changes what those keys play would clash with it.

The module patches five sites, all in stock code no other library module or the core patches:
the play routine both key handlers share (`0x400c772e`), the pad and TRIG key handlers' AUTO TRK
SWITCH calls (`0x400c7a3e`, `0x400c7e90`), the pad handler's FUNC test (`0x400c7950`) and
the SEQUENCER CONFIG menu's constructor (`0x400ec184`). The core-ar2 0.3 interface has no event for
the pads, the TRIG keys or the SEQUENCER CONFIG menu.

## Tests and measurements

See [TESTING.md](TESTING.md). In short: Modwerk's compiler builds this folder, and Modwerk's
linker links it on the owner's stock OS 1.74 with core-ar2 0.3 alone and beside Filter Hz and
Loop Sync, with no overlaps and its storage bit placed. It has **not** run on a unit or in
rytm-emu. Memory: 764 bytes of the 128 KiB shared mod area, no `.bss`, no fast SRAM. Nothing runs
in the audio, sequencer or tick paths; each key press costs a few compares (static reading, not
a measurement).

## Authorship and licences

Iced-Cream: the mod, its design and code (rytm2_mods `pad-select`), and this module. MrScruff:
the globals-slot lookup, which follows his voice-dac (rytm-mods `0013-voice-dac`, as rytm2_mods
ports it). irpina: Elekloader and core-ar2, whose mod storage keeps the setting.

Code: [GPL-2.0-only](LICENSE), as rytm2_mods. `src/pad-select.s` is rytm2_mods'
`pad-select/os1.74/pad-select.s` at local commit `35ea2f0` (branch `claude/pad-select`, not yet
public), byte for byte, and `include/ar2-1.74.inc` its `include/ar2-1.74.inc`, the same file
Filter Hz carries. The source's header comment still names the OS 1.73 addresses, as upstream's
does. The include names firmware routines by address only. The upstream README is in
[upstream/README.md](upstream/README.md). No Elektron firmware is included.

## Screens and audio

No captures yet: rytm-emu was not available where this folder was made. The SEQUENCER CONFIG
screen with the PAD+TRIG SEL TRK row is still to capture (see TESTING.md). The module changes
which presses sound, not the sound itself, so there is no audio demonstration.
