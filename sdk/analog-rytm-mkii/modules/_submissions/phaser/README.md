# Phaser

A send effect for the Analog Rytm MKII by @stigmagit, for the Modwerk base. Version 0.1.0-experimental.

## Overview

PHASER is one effect in the Modwerk base's send-effect list. Each track sends to it from its SEND page, and it returns in stereo to the mix. Two to eight first-order all-pass stages per side are swept around FREQ by an LFO (SPD, DEP); SHP squares the LFO, LAG slows its moves, and the right side runs WDTH out of phase. FDBK feeds the output back, positive or negative. It runs at 24 kHz. The DSP is Send FX's PHASER, unchanged.

## Controls

The knobs A to H of the SEND FX page, while PHASER is chosen. Values are 0 to 127 unless stated.

| Knob | Default | What it does |
| --- | --- | --- |
| SPD | 50 | LFO speed, 0.01 to 5 Hz. |
| DEP | 80 | Sweep range around FREQ. |
| SHP | 0 | Squares the LFO, up to 8 times, towards a square wave. |
| LAG | 0 | Slows the LFO's moves. |
| FREQ | 80 | Centre frequency of the stages, up to 10 kHz. |
| FDBK | +32 | Feedback, -64 to +63: negative or positive. |
| STG | 50 | All-pass stages per side: 2, 4, 6 or 8. |
| WDTH | 64 | Phase of the right side's LFO: 0 sweeps both sides together, 127 in opposition. |

## Usage

- Send a hi-hat and a snare a little, leave the kick dry.
- Lock SPD on a few steps of the FX track for movement in time with the pattern.
- Keep the return low with LEV and raise the sends for a wider sound.

### Quick tutorial

1. Install the module with the Modwerk base; the base carries the send bus, its pages and the effect list.
2. On a sound track, press AMP twice to open SEND and turn A to send the track.
3. Select the FX track and press DELAY twice to open SEND FX; hold FUNC and turn A to choose PHASER.
4. Turn A to H to shape it, hold FUNC and turn E for the return level LEV, and hold FUNC to read the CPU.

## How it works

The module is one record in the base's send-effect list (`mw_fx`, `modwerk/fx.h`): its id (3), its name, its eight controls with their defaults, and two functions. The base calls `reset` when the effect is chosen or a project loads, and `render` once per audio block with the sum of the sends, the eight values after locks, and a work area lent from its shared pool. Everything else (the sends, the return, the pages, the chooser, LEV, the CPU reading, locks and the kit's storage) is the base's.

## Changes to stock flows

None from the module. The base's SEND and SEND FX pages sit behind AMP and DELAY; see the base's guide.

## Compatibility and limitations

- Needs the Modwerk Analog Rytm MKII base with the send bus (the FX list mw_fx); the library offers it only once the site builds with that base.
- One send effect plays at a time: the one chosen on SEND FX.
- The kit keeps the chosen effect and its eight values; Send FX settings saved under MD07 builds are not read.
- A project that chose this effect plays no return and shows MISSING when the effect is not installed, and keeps its values.

## Tests and measurements

See [TESTING.md](TESTING.md).

## Screens and audio

No captures yet: rytm-emu does not reach the SEND FX page.

## Authorship and licences

Written by stigmagit, taken from Send FX by the same author, under GPL-3.0-or-later ([LICENSE](LICENSE)).
