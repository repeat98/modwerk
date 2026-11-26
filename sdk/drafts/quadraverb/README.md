# Quadraverb

Version 0.1.0-experimental (not built yet) · the Alesis Quadraverb (1989), from Modwerk's own reverse engineering of its DSP · an FX2 effect for the Octatrack MKI and MKII on the Modwerk base over USB.

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
- FX2 only. Each instance uses the first 15,870 words of its track's 16K FX2 buffer for its short delay lines, so it cannot share a core's FX2 memory with Analog BD. Its long lines take 4-160 KB of the ColdFire's memory an instance.
- DSP time: 207-316 chip cycles a sample an instance by the stall model in the DSP emulator, under the base's admission limit; not measured on a unit. Most programs move more data a frame than the stream channel has carried on a unit so far (160 halfwords each way, reads alone 256): 5 of the 22 stay within 160, the rooms and halls need 208-247 in, the plates up to 352 in and 144 out.
- Not like the original: 44.1 kHz instead of about 42 kHz, so reverb times, delays and sweeps are about 5 % shorter and faster; the input is the average of left and right; words are 24 bits in the DSP and 16 bits where they cross to the ColdFire. Nothing records the original's own width.
- The gated reverbs (03 and 23-27) are not in this release: their gate needs a signal detector the original has in hardware.
- Built from the owner's own Quadraverb 1.07 ROM image on the developer's computer; no Alesis program is in this repository.

## Tests and measurements

See [TESTING.md](TESTING.md): the engine against the integer model in the DSP emulator (89 of the 90 factory programs bit-exact, all 22 of this release among them), the development builds priced on the owner's Octatrack MKII, and what is not tested yet. How the engine works: [ENGINE.md](ENGINE.md). What was read from the firmware: [FIRMWARE.md](FIRMWARE.md).

## Authorship and licences

This module plays other people's work:

- **Alesis** made the Quadraverb (1989) and its factory programs. Its firmware credits software to Fast Forward Designs (Marcus Ryle, Michel Doidic, Carol Nakahara) and hardware to Keith Barr and Alan Zak. The build reads the programs from the owner's own ROM image, which is not in this repository, and compiles them into `gen/`, which Git ignores. Shipping them needs the repository owner's permission, as Midiverb I/II had.
- **Wavefront Semiconductor's** application notes for the AL3201 (AN3201-04, AN3201-06), a later Keith Barr design, gave the idea that a write scales the accumulator.

The 8051 emulator, the DSP model, the engine and the tools are Modwerk's own, under the MIT licence in [LICENSE](LICENSE); they copy nothing from the firmware. Not affiliated with or endorsed by Alesis or Elektron.

## Screens and audio

None yet: the release build does not exist, and the emulator cannot install a package on the base 0.8.3 twins (TESTING.md, "Captures"). The effect draws nothing of its own: FX2 SETUP lists QUADRAVERB, and its page shows PROG on A and MIX on F.
