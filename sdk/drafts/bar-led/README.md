# Bar LED

Version: 0.1.0-experimental · author: @nathangroth

**Draft: not in the configurator until qualified on a unit and reviewed by the owner.**

![Bar LED thumbnail: a pattern's beat flashes, the first of each pass green](presentation/thumbnail.svg)

## Overview

While the sequencer plays, the tempo LED flashes **green on the pattern's 1** and red on every other beat, as stock does. It is a visual downbeat for players who can't use the click track: when the cue outputs feed external effects, the click would go with them.

It reads the sequencer's own step, so the green follows the pattern's length and scale and a pattern change. Stopped, the LED is stock. There is nothing to set.

## Controls

None. No menu row, no knob and no effect slot.

## Usage

Install it, press [PLAY] and watch the tempo LED.

### Quick tutorial

1. Press [PLAY]: the first flash is green, then red until the pattern comes round again.
2. Set the pattern's length (FUNC + PAGE, PATTERN SCALE) to 12 or 20 steps: the green still lands on the pattern's first step.
3. Press [STOP]: the LED behaves as stock, and the next [PLAY] starts green again.

## How it works

Stock flashes the tempo LED from its clock-message loop: every 24 clock ticks (one beat) it calls `set_led(38, 3)`, which lights LED id 38, the red half of the tempo LED, for three 120 Hz ticks. The panel numbers each two-colour LED as a red id and the green id after it, as the trig and track LEDs do, so 39 is the green half.

Bar LED takes that one call (`0x40056f24`). While the transport plays it reads the sequencer's master step (`0x800065b4`, the step now playing, which wraps at the pattern's length). A flash that sees a lower step than the flash before is the first since the pattern came round: it passes 39 instead of 38. So does the first flash after [PLAY]. Then it calls stock's `set_led` with the same duration. Every other call, stopped included, reaches `set_led` unchanged.

It keeps no clock or count of its own ([sequencing](../../../docs/module-guides/sequencing.md)): the flash is stock's, so it follows the project tempo, external MIDI clock and tempo changes, and the step is the sequencer's.

## Compatibility and limitations

- OS 1.40C, MKI and MKII.
- The tempo LED only flashes on whole beats. When the pattern's 1 falls between beats (say 14 steps at 1x), the green comes on the first flash after it.
- Changing the stock flow: the tempo LED is green instead of red on the pattern's 1 while playing. That is the module's whole job; remove it to get the stock LED back.
- Not yet tested: per-track mode with a MASTER LENGTH (INF would leave only the green after [PLAY]), pausing with [PLAY] and continuing, and a pattern change while playing.
- Takes no key, screen or shared site: no other module or the base patches the beat-flash call.
- Stores nothing: projects, Parts and settings are untouched and load the same without it.

## Tests and measurements

See [TESTING.md](TESTING.md).

## Authorship and licences

Original module by @nathangroth, MIT ([LICENSE](LICENSE)). No firmware, extracted stock code or built images are included.

## Screens and audio

It draws nothing on the screen and makes no sound, so it has no screenshots; the tempo LED is the whole interface.
