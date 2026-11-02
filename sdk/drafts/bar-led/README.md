# Bar LED

Version: 0.1.0-experimental · author: @nathangroth

**Draft: not in the configurator until qualified on a unit and reviewed by the owner.**

![Bar LED thumbnail: four beat flashes, the first green](presentation/thumbnail.svg)

## Overview

While the sequencer plays, the tempo LED flashes **green on the 1 of every bar** and red on beats 2, 3 and 4, as stock does. It is a visual downbeat for players who can't use the click track: when the cue outputs feed external effects, the click would go with them.

A bar is four beats, counted from [PLAY]. Stopped, the LED is stock. There is nothing to set.

## Controls

None. No menu row, no knob and no effect slot.

## Usage

Install it, press [PLAY] and watch the tempo LED.

### Quick tutorial

1. Press [PLAY]: the first flash is green, then three red flashes, then green again on the next bar.
2. Change the tempo or follow external MIDI clock: the green stays on every fourth beat.
3. Press [STOP]: the LED behaves as stock, and the next [PLAY] starts on the 1 again.

## How it works

Stock flashes the tempo LED from its clock-message loop: every 24 clock ticks (one beat) it calls `set_led(38, 3)`, which lights LED id 38, the red half of the tempo LED, for three 120 Hz ticks. The panel numbers each two-colour LED as a red id and the green id after it, as the trig and track LEDs do, so 39 is the green half.

Bar LED takes that one call (`0x40056f24`). While the transport plays, it counts the calls from [PLAY] and passes 39 instead of 38 on every fourth, then calls stock's `set_led` with the same duration. Everything else, stopped included, reaches `set_led` unchanged.

It counts stock's own beat flash, so it follows the project tempo, external MIDI clock and tempo changes, with no clock of its own ([sequencing](../../../docs/module-guides/sequencing.md)). Track speed, track scale and swing do not move the tempo LED in stock, and do not here.

## Compatibility and limitations

- OS 1.40C, MKI and MKII.
- The bar is four beats from [PLAY], not the pattern's length. A pattern that is not a whole number of four-beat bars (say 12 steps at 1x) wraps out of step with the green flash.
- Changing the stock flow: the tempo LED is green instead of red on the 1 while playing. That is the module's whole job; remove it to get the stock LED back.
- Pausing with [PLAY] and continuing are not yet tested: the count may restart on the continue.
- Takes no key, screen or shared site: no other module or the base patches the beat-flash call.
- Stores nothing: projects, Parts and settings are untouched and load the same without it.

## Tests and measurements

See [TESTING.md](TESTING.md).

## Authorship and licences

Original module by @nathangroth, MIT ([LICENSE](LICENSE)). No firmware, extracted stock code or built images are included.

## Screens and audio

It draws nothing on the screen and makes no sound, so it has no screenshots; the tempo LED is the whole interface.
