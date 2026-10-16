# digidice 0.1.0-experimental: emulator report

Measured on 16 October 2026 by todd-neale, with Claude Code. Emulator only: nothing here has run on a Digitakt.

## What was run

| | |
| --- | --- |
| Source | `src/digidice.c`, `src/engine.c`, `src/engine.h`; `cat src/digidice.c src/engine.c src/engine.h \| shasum -a 256` = `32466b301a6cd6c17e865642a214716ce7e58fda18504f74f3539c67cdc90a8c` |
| Stock OS | Digitakt mk1 OS 1.54, SHA-256 `f78ba80fa7b1da5fb0e1ff61ad61e9e71aafe79f4364fc49679f3651353e3cf6`, kept outside the repository |
| Build | elekloader `8972d70` SDK (`python -m elekloader.sdk.build`, `m68k-linux-gnu-gcc` 12.2, `-mcpu=54455 -O2`) and `elekloader.patch` with the vendored `core-2.1-os1.54.elemod` |
| Emulator | digiemu v0.4.1 (irpina/digiemu, tag `v0.4.1`, commit `f57c2f2`) from source, with its patched Unicorn 2.1.4; OS 1.54 is listed there as untested |
| Session | `emu.fwcheck` (boot, strict boot off, no timing) to a settled snapshot, then `emu.session.Session(..., ddr=128 MiB, hle=False, strict={'stop': False})`, the run stage's options, driven by key scripts |

The firmware, the builds, the emulator's cards and snapshots and the recorded audio stay on the developer's computer.

## Sizes

`digidice 0.4: .run 5935, .fast 0, .bss 676 bytes; 0 sites, 196 relocations; imports nothing` (0.4 is the local build number of this source). Linked with core 2.1 alone: RAM to `0x47be1f44`, 123,068 bytes spare.

## Results

1. **Container and boot.** `emu.fwcheck`: container, prepare, bootloader, boot and run pass. Stock 1.54 under the same check also passes.
2. **Opening and closing.** Two presses of TRIG 140 ms apart open the page. The key events read `19/1` then `19/5`: the second carries the double-press flag 4. Two presses 960 ms apart are two single presses. Stock OS 1.54 shows the TRIG page for both and does nothing else on a double press. A single TRIG press on the page is ignored; a double press or NO closes it and the OS page is drawn again.
3. **Writes.** The page's piano roll is drawn from the track's own data (flags at +0x000, NOTE at +0x280), so after each roll and knob turn it shows what the pattern holds. Rolls, DENSITY, NOTE VALUE, SCALE and RANGE changes, rhythm-only and note-only rolls each changed the track as expected. On MIDI track 9 three rolls wrote melodies and left track 1 unchanged.
4. **Audio.** A 0.35 s, 440 Hz test tone was put on the +Drive, loaded with SETTINGS > SAMPLES > incoming > SELECT ALL > LOAD TO PROJ (slot 1) and assigned to track 1. After a roll, PLAY and 4 s of recording at 98 BPM:

   | Onset | After the first | Pitch | Expected |
   | --- | --- | --- | --- |
   | 22.240 s | 0 | +11.86 semitones from 440 Hz | C an octave above the root: +12 |
   | 23.770 s | 1.530 s = 10 steps | +10.94 | B: +11 |
   | 24.070 s | 1.830 s = 12 steps | +6.95 | G: +7 |
   | 24.680 s | 2.440 s = 16 steps | +11.86 | the loop: +12 |

   The steps are those the page showed (3, 13, 15), the loop is the track's 16 steps at the project tempo, and the pitches are the rolled notes in C major (the analysis reads pitch by autocorrelation, hence the small offsets). Before PLAY the output is silent.
5. **Beside other mods.** digidice links with core 2.1 beside each of digihealth 1.0, DIGISLICER 2.1 and NEIGHBOR 0.6 for 1.54, and beside any two of them (4,164 bytes spare with DIGISLICER and NEIGHBOR). All four together need 1,532 bytes more than core 2.1's 128 KiB, and the linker refuses them. digidice + digihealth + DIGISLICER passes `emu.fwcheck` against stock 1.54; opening, rolling, a knob turn and closing work, and the screens after closing are identical to stock's under the same keys.

## Not shown

- Any behaviour on a unit, and the UI task's CPU time.
- Swing, track speeds other than 1x, tempo changes and pattern changes while the page is open. digidice keeps no clock: it writes ordinary trigs, which the sequencer then plays like any others.
- Saving a project with a rolled pattern and loading it again.
- 32- and 64-step tracks (the code handles up to 64; only 16 was run).

## The emulator's limit on OS 1.54

Under digiemu v0.4.1, stock OS 1.54 with no mods corrupts a heap block and stops its user interface after some key sequences: CLEAR PATTERN (FUNC+STOP) did so in `emu.fwcheck`'s own run. When it happens, the trig-key list the LED code reads is freed and the next LED refresh throws `std::out_of_range` from `bitset::set`. Early probes of digidice's step writes ran into the same stop. It was reproduced on stock under the same keys before any conclusion was drawn. The runs above did not hit it.
