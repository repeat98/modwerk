# Flanger

A send effect for the Analog Rytm MKII by @stigmagit, for the Modwerk base. Version 0.1.0-experimental.

## Overview

FLANGER is one effect in the Modwerk base's send-effect list. Each track sends to it from its SEND page, and it returns in stereo to the mix. Two taps glide the same way through a short delay, half a cycle apart, each faded in and out, so the sweep rises or falls without end; the right side crosses the fades, so its sweep runs against the left's. SPD sets the speed and the direction, FDBK the resonance, positive or negative. It runs at 48 kHz. The DSP is Send FX's FLANGER, unchanged.

## Controls

The knobs A to E of the SEND FX page, while FLANGER is chosen. Values are 0 to 127 unless stated.

| Knob | Default | What it does |
| --- | --- | --- |
| SPD | +26 | Speed and direction of the sweep, -64 to +63: up to 5 Hz either way, 0 stops it. |
| DEP | 64 | Span of the sweep, up to 10.6 ms. |
| TUNE | 16 | Shortest delay, 0.1 to 5.4 ms. |
| FDBK | +32 | Feedback, -64 to +63: negative or positive resonance, up to 86 %. |
| LPF | 127 | One-pole low-pass on the wet sound; 127 is open. |

## Usage

- Send a hi-hat and a snare a little, leave the kick dry.
- Lock SPD on a few steps of the FX track for movement in time with the pattern.
- Keep the return low with LEV and raise the sends for a wider sound.

### Quick tutorial

1. Install the module with the Modwerk base; the base carries the send bus, its pages and the effect list.
2. On a sound track, press AMP twice to open SEND and turn A to send the track.
3. Select the FX track and press DELAY twice to open SEND FX; hold FUNC and turn A to choose FLANGER.
4. Turn A to E to shape it, hold FUNC and turn E for the return level LEV, and hold FUNC to read the CPU.

## How it works

The module is one record in the base's send-effect list (`mw_fx`, `modwerk/fx.h`): its id (2), its name, its eight controls with their defaults, and two functions. The base calls `reset` when the effect is chosen or a project loads, and `render` once per audio block with the sum of the sends, the eight values after locks, and a work area lent from its shared pool. Everything else (the sends, the return, the pages, the chooser, LEV, the CPU reading, locks and the kit's storage) is the base's.

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
