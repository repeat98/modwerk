# Wavefolder

A send effect for the Analog Rytm MKII by @stigmagit, for the Modwerk base. Version 0.1.0-experimental. A new design by its author.

## Overview

WAVEFOLDER is one effect in the Modwerk base's send-effect list, a new design by its author. Each track sends to it from its SEND page, and it returns in stereo to the mix. Past full level the sound is folded back in instead of clipped, and the harder it is pushed (DRV, FOLD) the more it folds: bright, moving harmonics, with no filter around them. DYN makes the folds follow the sound's strength, so a loud hit folds more than a ghost note. SHPE goes from a sine fold to a triangle one, SYMM moves the fold's centre, WDTH folds the sides a little differently, TONE tilts the result and BLND mixes it with the send.

## Controls

The knobs A to H of the SEND FX page, while WAVEFOLDER is chosen. Values are 0 to 127 unless stated.

| Knob | Default | What it does |
| --- | --- | --- |
| FOLD | 48 | How far it folds: the gain into the fold, 1x to 8x. |
| SYMM | +0 | The fold's centre, -64 to +63: even harmonics off centre. |
| SHPE | 0 | The fold's shape: sine (soft) to triangle (hard). |
| DYN | 64 | How much the folds follow the sound's strength. |
| DRV | 0 | Gain before, 0 to +18 dB. |
| TONE | +0 | Tilts the result around 1 kHz, -64 to +63. |
| WDTH | 0 | The sides folded about slightly different centres. |
| BLND | 127 | The folded sound against the send. |

## Usage

- A tom or a kick with FOLD up: the hits bloom into harmonics.
- DYN up on a hi-hat pattern: accents fold, ghost notes stay round.
- SYMM off centre for a hollower, even-harmonic sound.

### Quick tutorial

1. Install the module with the Modwerk base; the base carries the send bus, its pages and the effect list.
2. On a sound track, press AMP twice to open SEND and turn A to send the track.
3. Select the FX track and press DELAY twice to open SEND FX; hold FUNC and turn A to choose WAVEFOLDER.
4. Turn A to H to shape it, hold FUNC and turn E for the return level LEV, and hold FUNC to read the CPU.

## How it works

The module is one record in the base's send-effect list (`mw_fx`, `modwerk/fx.h`): its id (4), its name, its eight controls with their defaults, and two functions. The base calls `reset` when the effect is chosen or a project loads, and `render` once per audio block with the sum of the sends and the eight values after locks. Everything else (the sends, the return, the pages, the chooser, LEV, the CPU reading, locks and the kit's storage) is the base's.

At 24 kHz the send is multiplied by DRV, FOLD and DYN's follower (the block's peak, fast up, slower down) and folded: a triangle fold (period 4) and a sine one, mixed by SHPE. The fold is anti-aliased through its antiderivative (first-order, Parker, Zavalishin and Le Bivic, DAFx 2016; Esqueda et al. applied it to wavefolders, DAFx 2017): each output is the antiderivative's difference over the input's, with a divide, or the fold at the midpoint when two inputs are close. A DC blocker follows. WDTH adds and takes away the fold's slope times the centres' gap, the first-order difference between two folds. The level after is the gain into the fold to the -0.5.

## Changes to stock flows

None from the module. The base's SEND and SEND FX pages sit behind AMP and DELAY; see the base's guide.

## Compatibility and limitations

- Needs the Modwerk Analog Rytm MKII base with the send bus (the FX list mw_fx); the library offers it only once the site builds with that base.
- One send effect plays at a time: the one chosen on SEND FX.
- A project that chose this effect plays no return and shows MISSING when the effect is not installed, and keeps its values.
- Hard folds of tones above about 2 kHz alias: the fold runs at 24 kHz to stay near CHORUS's CPU.

## Tests and measurements

See [TESTING.md](TESTING.md).

## Screens and audio

No captures yet: rytm-emu does not reach the SEND FX page. Host renders of the module's own source are in the pull request.

## Authorship and licences

Written by stigmagit, a new design, under GPL-3.0-or-later ([LICENSE](LICENSE)).
