# MIDI Expression testing

Version 0.12.4-experimental, Digitakt I OS 1.54 (stock file SHA-256 f78ba80f…3cf6), Core 2.1.

## Evidence tier

`none` in Modwerk's terms: the author's own tests below, on the host, in the emulator (digiemu, pinned c1b5735) and on one unit. No independent report yet.

## How to run the tests

All commands from the source repository's root, with the build environment of its BUILDING.md.

| What | Command | Result (0.12.0) |
| --- | --- | --- |
| Host unit tests: expr.c, audio.c, page.c and store.c compiled for the computer, with stand-ins for the firmware and an in-memory +Drive | `cc -std=c11 -Wall -Wextra -DME_HOST_TEST -I tests/host tests/host/test_expr.c -o build/test_expr && build/test_expr` | about 2.44 million checks, 0 failures; the same under `-fsanitize=address,undefined` (`results/mod-0.11/host-unit-tests.txt`) |
| MIDI tracks on the firmware: odd combinations of live input, routes, merged CC numbers, the track's own sends and track changes, against a model of the sums | `scripts/emu-midi-whacky.py` | 330 checks, 0 failures |
| Saving through the firmware's own menus and +Drive code: SAVE PROJECT AS into slot 003, LOAD PROJECT of it and of one saved without the mod, the slot numbers the jobs give, and a power-on | `scripts/emu-store.py` | 11 checks, 0 failures (`emu-store.txt`) |
| Memory: the firmware's heap and its allocations while the mod writes and reads its files 80 times, against the same time idle | `scripts/emu-resources.py memory` | new and delete balance exactly; the heap's state words unchanged (`emu-resources-memory.txt`) |
| CPU: instructions in the module area per emulated second, idle and with every route of every track live under a flood at the wire rate | `scripts/emu-resources.py cpu` | 0.75 M/s idle (1.2 % of the emulator's 64 M/s), 1.1 M/s loaded (1.8 %) (`emu-resources-cpu.txt`) |
| Latency of live pitch bend through MIDI track A | `scripts/emu-latency.py` | on MIDI OUT within 1 ms, 20 of 20 |
| A track's own value from its parameters before it sends one | `scripts/emu-own-params.py` | MW 10 + wheel 50 = CC 1 60; PB 12288 + 128 |
| The preset menu on the firmware: a 1-second push of A, SAVE into slot 01 with a name, LOAD's list shows it | `scripts/emu-screens.py` | the screens in `docs/img/menu*.png` |
| Links with each other Modwerk Digitakt module | `scripts/compat-pairs.sh MODULE ...` | 0.10: every one but Digi Perform; 0.12 with Digi Slicer: links, 1,024 bytes of RAM left |
| BEND, the LEVEL knob in the preset lists and FUNC typing on the firmware | digiemu, by hand | FUNC + A: 2, 3, 4, 5, 6 semitones; BEND 2.50 drawn as 2.5; LEVEL one row a detent |
| On a unit: the full qualification (MIDI sums over DIN and USB, auto channel, sequencer, flood, saving and power cycles, audio tracks by ear, the page and presets by eye) | `scripts/hwqual.py` ([docs/HARDWARE-TESTS.md](../../docs/HARDWARE-TESTS.md)) | to be run on 0.12.0 |
| On a unit: expression, notes and floods into MIDI IN, everything from MIDI OUT recorded and checked | `scripts/hwping.py PORT`, then `scripts/hwstress.py --in PORT --out PORT` | 0.9.2: 25 of 25 (`results/hardware/stress-20261105-135203`) |

Emulator scripts take the image's settings from `toolchain/emu-NAME.env` (`scripts/emu-image.sh NAME` builds and sets one up): `set -a; . toolchain/emu-NAME.env; set +a; digiemu/.venv/bin/python scripts/SCRIPT.py`. Screens for the documentation: `scripts/emu-screens.py`.

## Files and safety (0.11)

Each file is written whole to `/cfw/expression/_temp/…`, then whole in its place; files have a fixed size (padding after `END`), so a rewrite in place never leaves old bytes. A file is used only if it starts with its header and has an `END` line; otherwise its `_temp` copy, otherwise the defaults. The host tests feed 3,000 files of random bytes (some with a valid header and `END`): every value ends up in range every time. The firmware's file calls are used as Digi Slicer uses them, one file open at a time, from the UI tick, only while the filesystem's mutex is free. In the emulator a 5 KB file takes about 0.12 s to write, holding the UI (and, measured, the MIDI tracks' task) for that long: the power-on file is written only once nothing has played for 2 seconds; project files are written while the firmware saves the project, presets when you save one.

## What the host tests cover

Routing (auto channel, TRACK CHANNEL, CHAN off, audio tracks); sums within the MIDI limits for THRU and every route; release on a track change; merging of values on one CC number (MW with a CC VAL slot on SEL 1, BC with SEL 2, two slots on one SEL, SEL changed while merged); a fuzz of 300 rounds of 60 random events with every message valid and everything back to stock at the end; only the MIDI tracks' task sends, one wake queued at most, the buffer never filled past its room; unchanged values not sent again, changes and forced sends always; the track's own value from its parameters until it sends one; velocity sensitivity for audio and MIDI tracks, recorded velocity untouched, VEL as a source; the audio render's routes and TUNE; the MIDI LFO routes in and out of the LFO's words; the page's keys, knobs, lists, FUNC jumps and drawing; the files: waits for the drive, current.txt a second after a change and only once nothing plays, saved and loaded by slot (a rename keeps them), defaults for a project without a file, power-on, a torn file (the _temp copy is read), both broken (the defaults), a hand-edited file (spacing, comments, CRLF, lower case, junk lines, out-of-range values, missing keys), presets saved, listed, loaded, RESET and DEFAULT (and a broken default preset: Factory), a failed write retried, every file closed, 3,000 random files; the preset menu: a 1-second push, SAVE with a name, LOAD with the LEVEL knob, RESET, DEFAULT, NO back, a short push opens nothing.

## On a unit

- **0.4–0.7, audio tracks** (internal sounds, by the author): bend, routes, the page and its knobs, velocity sensitivity, the LFO destinations of audio tracks.
- **0.8, MIDI tracks:** froze the unit. 0.8 sent MIDI itself from the MIDI input and UI tasks; on hardware that held everything back or let a second task into the DIN driver. 0.9 sends only through the MIDI tracks' own task.
- **0.9.0–0.9.2:** `hwping.py` showed each value once, as expected, after 0.9.1 stopped resending unchanged values. `hwstress.py` on 0.9.2: 25 of 25 (own values, THRU on 200 random PB/AT/MW/BC, MW and VAL1 merged on CC 1, release and return, wheel to CC 74, pressure to PB −64, velocity to BC before its note, V.SNS 50 % live and from the sequencer, an LFO on MW merged with the wheel, recording as played). Measured round trip through a USB MIDI interface: live notes 12 ms median, pitch bend 11 ms, CC 1 4 ms. The flood phase was left out (the interface hung under it).
- **0.10–0.12, everything** (by the author): every feature on audio and MIDI tracks, over DIN MIDI and USB MIDI, sequencing several synths at once; saving and loading projects, power-on, presets (LOAD, SAVE, RESET, DEFAULT, naming), the MIDI LFO destinations, fine BEND. The flood phase of `hwstress.py` was left out (the interface hung under it).
- **0.12.4, `hwqual.py`** (by the author, DIN and USB at once): all eight MIDI tracks exact against the model, notes and V.SNS, 3,000 random messages, latency (0.9 ms USB, 2.9 ms DIN round trip), the sequencer over MIDI, live input with external clock, a 20 s flood of 15,511 messages with the sequencer playing (over USB), saving and CREATE NEW, the page by eye. Losses over DIN came from the interface (it drops a message just after a clock byte, `loopback.py`) and a loose cable, not the mod. See [docs/HARDWARE-TESTS.md](../../docs/HARDWARE-TESTS.md).

## Measured resources

RAM: in a test image alone, 93.5 KB of the module area stay free (the page, the files' and the MIDI tracks' code are built for size); with Digi Slicer, 1,024 bytes. No memory is allocated at run time. CPU: see the table; the audio render skips a track at once unless a source with a destination is live on it.

## History

The research behind each version is in docs/RESEARCH-OS154.md; the changelog is module/changelog/digitakt-midi-expression.json; the results of earlier versions are in the repository's history.
