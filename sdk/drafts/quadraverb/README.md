# Quadraverb

Version 0.1.0-experimental (built, not yet run on a unit) · the Alesis Quadraverb (1989), from Modwerk's own reverse engineering of its DSP · an FX2 effect for the Octatrack MKI and MKII on the Modwerk base over USB.

## Overview

The reverbs of the Alesis Quadraverb on FX2: rooms, halls, chambers and plates. Each is the original's factory program, the 96-step DSP program its firmware builds, compiled to DSP code when you pick it and run step for step at 44.1 kHz. Its sweeps move as the original's do. Its long delay lines live in the Octatrack's main memory, and the base moves them to and from the DSP every 16 samples. 22 programs are in this release.

Nobody has compared it with a real Quadraverb: there was none to hand. Every claim here is about the original's firmware, run in an emulator, and the engine's arithmetic, which is an assumption where the firmware does not say (FIRMWARE.md, ENGINE.md).

## Controls

| Knob | Name | Range | Default | What it does |
| --- | --- | --- | --- | --- |
| A | PROG | 01-81 (22 programs) | 10 | The factory program, by its number on the original: 01 and 02 reverbs with EQ, 10-12 rooms, 13-16 halls, 17-19 plates, 20-22 chambers, 52 and 53 the snare reverbs, 66 HOLMES' Plate, 78-81 the velocity and tube reverbs. |
| F | MIX | 0-127 | 40 | Dry and wet: 0 is exactly dry, 127 wet only. |

Both are ordinary FX2 knobs, so parameter locks, LFOs and scenes reach them as any effect's (not tried on a unit). A new program starts from silence; the dry signal keeps playing at its MIX level meanwhile.

## Usage

1. Select a track and press **FX2**, then **FUNC + FX2** for FX2 SETUP.
2. Turn **LEVEL** to QUADRAVERB and press **YES**, then press **FX2** for the main page.
3. Turn **A** for the program and **F** for the mix.

## Quick tutorial

1. Load a drum loop on track 1, press FX2, then FUNC + FX2, scroll to QUADRAVERB with LEVEL, press YES, then FX2: the page shows PROG and MIX.
2. Play the pattern and turn A slowly: 10 is a small room, 15 a concert hall, 19 a large vocal plate.
3. Turn F (MIX) up to hear more of the reverb. Turn it to 0 to get the dry loop back.

## Compatibility and limitations

- USB only: it needs the Modwerk base's program areas and stream channel (the package requires `programs`, loader ABI 9). They are in the base 0.8.3 draft, on development twins only so far.
- FX2 only. Each instance uses the first 15,870 words of its track's 16K FX2 buffer for its short delay lines, so it cannot share a core's FX2 memory with Analog BD. Its long lines live in a 136 KiB ring pool on the ColdFire: one plate, or two chambers, or a chamber and a room at once; a slot without room stays dry.
- One instance a DSP core at most: the base keeps two copies of a program's code a slot (up to 1,168 words each) in the about 4,700 words a core has for effect code, beside a Part's stock effects.
- DSP time: 272-342 chip cycles a sample an instance by the stall model on traces in the DSP emulator, 353 while a pick fades it, under the base's admission limit; not measured on a unit. Most programs move more data a frame than the stream channel has carried on a unit so far (160 halfwords each way, reads alone 256): 5 of the 22 stay within 160, the rooms and halls need 208-247 in, the plates up to 352 in and 144 out.
- Not like the original: 44.1 kHz instead of about 42 kHz, so reverb times, delays and sweeps are about 5 % shorter and faster; the input is the average of left and right; words are 24 bits in the DSP and 16 bits where they cross to the ColdFire. Nothing records the original's own width.
- The gated reverbs (03 and 23-27) are not in this release: their gate needs a signal detector the original has in hardware.
- A new program fades the old one's wet out over 256 samples and starts from silence; unlike the original, the old tail does not run on into the new program (TESTING.md, "The fade at a pick").
- Built from the owner's own Quadraverb 1.07 ROM image on the developer's computer; no Alesis program is in this repository.

## Tests and measurements

See [TESTING.md](TESTING.md): the engine against the integer model in the DSP emulator (89 of the 90 factory programs bit-exact, all 22 of this release among them), the development builds priced on the owner's Octatrack MKII, and what is not tested yet. How the engine works: [ENGINE.md](ENGINE.md). What was read from the firmware: [FIRMWARE.md](FIRMWARE.md).

## Authorship and licences

This module plays other people's work:

- **Alesis** made the Quadraverb (1989) and its factory programs. Its firmware credits software to Fast Forward Designs (Marcus Ryle, Michel Doidic, Carol Nakahara) and hardware to Keith Barr and Alan Zak. The build reads the programs from the owner's own ROM image, which is not in this repository, and compiles them into `gen/`, which Git ignores. Shipping them needs the repository owner's permission, as Midiverb I/II had.
- **Wavefront Semiconductor's** application notes for the AL3201 (AN3201-04, AN3201-06), a later Keith Barr design, gave the idea that a write scales the accumulator.

The 8051 emulator, the DSP model, the engine and the tools are Modwerk's own, under the MIT licence in [LICENSE](LICENSE); they copy nothing from the firmware. Not affiliated with or endorsed by Alesis or Elektron.

## Screens and audio

Emulator captures, not hardware ones: the emulated Octatrack MKII's LCD on the base 0.8.3 development twin, with this
release's package installed (media/capture.json). Nothing was heard: that emulator runs no DSP.

![Octatrack FX2 SETUP: the effect list from COMPRESSOR to QUADRAVERB, the cursor on QUADRAVERB.](media/quadraverb-chooser.png)

Select an audio track, hold FUNC and press FX2. Turn LEVEL down the list to QUADRAVERB and press YES to put it on FX2.

![Octatrack FX2 page of Quadraverb: knobs PROG and MIX.](media/quadraverb-page.png)

Press FX2 for its page: PROG (A) picks the program, MIX (F) sets dry and wet.

![The FX2 page with PROG showing 10.](media/quadraverb-prog.png)

Turn PROG: the dial shows the program by its number on the original Quadraverb, here 10, SMALL ROOM.

![The FX2 page with MIX at 70.](media/quadraverb-mix.png)

Turn MIX up to hear more of the reverb: 0 is exactly dry, 127 wet only.
