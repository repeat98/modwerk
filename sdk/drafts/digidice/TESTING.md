# digidice testing

Version `0.1.0-experimental`. Source SHA-256 `32466b301a6cd6c17e865642a214716ce7e58fda18504f74f3539c67cdc90a8c`:

```sh
cat src/digidice.c src/engine.c src/engine.h | shasum -a 256
```

Evidence tier: **emulator**. Nothing has run on a Digitakt yet.

## Engine host tests

```sh
cd tests
cc -std=c99 -Wall -Wextra -Werror -fsanitize=address,undefined ../src/engine.c test_engine.c -o test_engine && ./test_engine
```

Result: `4975802 checks, 0 failures` (Apple clang, macOS 26.6.2, 16 October 2026). [tests/test_engine.c](tests/test_engine.c) covers:
- determinism;
- every note inside its scale and range across 20,000 random settings;
- trigs only inside the track length;
- the DENSITY extremes and exact spacing;
- VARIATION giving both halves and doubles;
- DENSITY only ever adding notes;
- rhythm-only and note-only rolls keeping the other half;
- the LEGATO and VEL extremes;
- clamping and seed advance.

A mutation check found VARIATION's doubling untested; the VARIATION test now covers it.

## Emulator

Full report, with the commands, versions and measured values: [evidence/emulator.md](evidence/emulator.md). In short, on digiemu v0.4.1 with OS 1.54 and core 2.1:

| Check | Result |
| --- | --- |
| `emu.fwcheck` container, boot and run | pass; stock passes too |
| Double press on TRIG opens the page; a slow double press does not | pass (key flags `19/5` against `19/1`) |
| Stock OS 1.54 does nothing on a double press on TRIG | pass (TRIG page only) |
| A single TRIG press on the page is ignored; a double press or NO closes it and the OS page returns | pass |
| YES, LEFT and RIGHT rolls change the pattern as shown | pass |
| Knob changes; NOTE VALUE, ROOT and SCALE move one entry a click | pass |
| A MIDI track (M1) | pass; track 1 unchanged |
| Recorded audio with a 440 Hz test sample | the rolled notes at steps 3, 13, 15 and their pitches in C major; the loop repeats after 16 steps |
| Beside digihealth and DIGISLICER | pass; screens after closing are identical to stock's |
| All four of digidice, digihealth, DIGISLICER and NEIGHBOR | refused by the linker: 1,532 bytes over core 2.1's 128 KiB |

## Sequencing checklist ([sequencing.md](../../../docs/module-guides/sequencing.md))

- [x] No timer, counter or phase of its own advances with the music. digidice writes trigs; the sequencer plays them. Its only counter is the UI tick count used to debounce knob writes and seed the first roll.
- [x] Timing is in track steps: NOTE VALUE and LEGATO are steps and eighths of a step, and the LEN index maps to the TRIG page's own lengths.
- [x] Swing, track speed and tempo are the sequencer's, since the trigs are ordinary trigs. **Not yet tested** with swing set, a track speed other than 1x, a tempo change or a pattern change while the page is open.
- [x] Pattern length is read from the track (`EFFLEN`) at every write.
- [x] Nothing is modulated, and nothing runs while the page is closed except a tick counter.

## Not tested

- Any run on a unit (author-hardware), and CPU time in the UI task.
- Swing, track speeds, tempo changes, pattern changes while the page is open.
- Saving a rolled pattern in a project and loading it again.
- 32- and 64-step tracks.
- OS 1.53.

## Hardware test plan

1. Build stock 1.54 + core 2.1 + digidice and flash it, with the stock `.syx` and a 5-pin MIDI interface ready for recovery (sdk/machines/digitakt/README.md, "Flash and recover").
2. Open, roll, play and close on an audio and a MIDI track, with a project you have saved.
3. Try swing, a 2x track speed, a 32-step track and a tempo change while the page is open; save and reload the project.
4. Record the model, OS, date, duration and results here and in `evidence.hardware`, and raise the tier to `author-hardware`.
5. Publish the `.elemod` as a release, pin it with `npm run elekloader:update`, move the folder to `sdk/digitakt/modules/digidice` and run `npm run module:doctor -- digidice` until it is green.
