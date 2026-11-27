# Quadraverb

Version 0.1.0-experimental (built, not yet run on a unit) · the Alesis Quadraverb (1989), from Modwerk's own reverse engineering of its DSP · an FX2 effect for the Octatrack MKI and MKII on the Modwerk base over USB.

## Overview

The factory programs of the Alesis Quadraverb on FX2: rooms, halls, chambers and plates, choruses, echoes, and the guitar, string and vocal programs that combine them. Each is the original's factory program, the 96-step DSP program its firmware builds, compiled to DSP code when you pick it and run step for step at 44.1 kHz. Its sweeps move as the original's do. Its long delay lines live in the Octatrack's main memory, and the base moves them to and from the DSP every 16 samples. 74 of its 90 programs are in this release; Compatibility and limitations says which are not, and why.

Nobody has compared it with a real Quadraverb: there was none to hand. Every claim here is about the original's firmware, run in an emulator, and the engine's arithmetic, which is an assumption where the firmware does not say (FIRMWARE.md, ENGINE.md).

## Controls

| Knob | Name | Range | Default | What it does |
| --- | --- | --- | --- | --- |
| A | PROG | 00-89 (74 programs) | 10 | The factory program, by its number on the original: for example 10-12 rooms, 13-16 halls, 17-19 plates, 20-22 chambers, 04 and 33 choruses, 05 and 30 flanges, 34-36 chorus with room, reverb or delay, 40-43 delays, 44-48 echoes, 07 and 37 pitch shifts, 08, 38 and 39 Leslies, 66 HOLMES' Plate. Programs not in this release are skipped. When it turns, a message box shows the program's number and name for about a second, for example 15 CONCERT HALL 1. |
| B | LEN | -64 to +63 | 0 | DECAY on a reverb program, FEEDBACK on a delay-led one (L and R together). 0 is the factory value, the ends are the ends of the original's range (DECAY 0-99, FEEDBACK 0-99 %). |
| C | TIME | -64 to +63 | 0 | PRE-DELAY (1-140 ms) on a reverb program, DELAY TIME on a delay-led one, where R keeps its ratio to L. A jump may click, as on the original. |
| D | SPD | -64 to +63 | 0 | The sweep's SPEED (0-98): the chorus, the flange, the reverbs' own slow sweep. |
| E | DEP | -64 to +63 | 0 | The sweep's DEPTH (0-98). |
| F | MIX | 0-127 | 40 | Dry and wet: 0 is exactly dry, 127 wet only. |

"Delay-led": a program with no reverb, or with its delay mixed louder than its reverb. At 0 each of B-E plays the factory program exactly; turned, it moves the words the original's own edit page would move for that value, in place, with no clear or fade. When B-E turn, the message box says what the turn sets on this program, for example DECAY 45, PRE 30 MS, DELAY 320/160 MS, FBK 60 %, SPEED 12 or DEPTH 40, or that it has none: NO DECAY ON REVERSE (the reverse programs keep their decay and pre-delay), NO PRE-DELAY HERE (a pre-delay the program does not send anywhere), NO DELAY HERE, NO SWEEP HERE (pitch shifts, Leslies, the static delays and MEDIUM HALL).

All are ordinary FX2 knobs, so parameter locks, LFOs and scenes reach them as any effect's (not tried on a unit). A new program starts from silence; the dry signal keeps playing at its MIX level meanwhile.

## Usage

1. Select a track and press **FX2**, then **FUNC + FX2** for FX2 SETUP.
2. Turn **LEVEL** to QUADRAVERB and press **YES**, then press **FX2** for the main page.
3. Turn **A** for the program and **F** for the mix; **B**-**E** move its decay or feedback, pre-delay or delay time, and its sweep from the factory value.

## Quick tutorial

1. Load a drum loop on track 1, press FX2, then FUNC + FX2, scroll to QUADRAVERB with LEVEL, press YES, then FX2: the page shows PROG and MIX.
2. Play the pattern and turn A slowly: 10 is a small room, 15 a concert hall, 19 a large vocal plate.
3. Turn F (MIX) up to hear more of the reverb. Turn it to 0 to get the dry loop back.

## Compatibility and limitations

- USB only: it needs the Modwerk base's program areas and stream channel (the package requires `programs`, loader ABI 9). They are in the base 0.8.3 draft, on development twins only so far.
- FX2 only. Each instance uses the first 15,870 words of its track's 16K FX2 buffer for its short delay lines, so it cannot share a core's FX2 memory with Analog BD. Its long lines live in a 176 KiB ring pool on the ColdFire, sized for every value TIME can take: two chambers, or a plate beside a small program, at once; 44 ECHO 2the LEFT only alone; a slot without room stays dry.
- One instance a DSP core at most: the base keeps two copies of a program's code a slot (1,876 words each, the longest program's, 59: 3,752 words at every pick) in the about 4,700 words a core has for effect code, beside a Part's stock effects. A busy Part on that core can leave too little room, and the slot then stays dry.
- DSP time: up to 354 chip cycles a sample an instance by the stall model on traces in the DSP emulator (53 BALLAD SNARE 2 with TIME at 1 ms), 366 while a pick fades it, under the base's admission limit; not measured on a unit. Many programs move more data a frame than the stream channel has carried on a unit so far (160 halfwords each way, reads alone 256): 49 of the 74 stay within 160, the rooms and halls need 212-251 in, the plates up to 352 in and 144 out.
- Not like the original: 44.1 kHz instead of about 42 kHz, so reverb times, delays and sweeps are about 5 % shorter and faster; the input is the average of left and right; words are 24 bits in the DSP and 16 bits where they cross to the ColdFire. Nothing records the original's own width.
- Not in this release: the gated programs and the sweeps a signal onset restarts (03, 23-29, 31, 32, 86-88), whose gate needs a signal detector the original has in hardware, and 73 VERB SHIFTER; and the pitch shifts 51 AMAZING BASS and 60 CONCERT GUITAR, the longest programs, which would raise the code every slot claims at a pick further.
- A new program fades the old one's wet out over 256 samples and starts from silence; unlike the original, the old tail does not run on into the new program (TESTING.md, "The fade at a pick").
- MIDI modulation of sweep rate and depth, which the original takes, is not taken; SPD and DEP set them instead. The Leslies' speed and the pitch shifts' detune are not on a knob.
- Built from the owner's own Quadraverb 1.07 ROM image on the developer's computer. The program sources compiled from it (`gen/`) are in this repository under the owner's waiver of 27 November 2026; the ROM is not.

## Tests and measurements

See [TESTING.md](TESTING.md): the engine against the integer model in the DSP emulator (89 of the 90 factory programs bit-exact in the open form, and the 74 of this release in the form it ships, knobs turned), the development builds priced on the owner's Octatrack MKII, and what is not tested yet. How the engine works: [ENGINE.md](ENGINE.md). What was read from the firmware: [FIRMWARE.md](FIRMWARE.md).

## Authorship and licences

This module plays other people's work:

- **Alesis** made the Quadraverb (1989) and its factory programs. Its firmware credits software to Fast Forward Designs (Marcus Ryle, Michel Doidic, Carol Nakahara) and hardware to Keith Barr and Alan Zak. The build reads the programs from the owner's own ROM image, which is not in this repository, and compiles them into `gen/`, which is. The repository owner waived the firmware rule for these programs and their sources on 27 November 2026, as he did for Midiverb I/II, and allowed the non-reverb programs in this one module (a one-effect waiver like Midiverb's).
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
