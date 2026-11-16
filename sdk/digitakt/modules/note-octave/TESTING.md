# Note Octave testing

## Hardware (Digitakt I, OS 1.54, 16 November 2026)

Version 0.1.0-experimental (NO08). draadpiraat flashed the builds on their own Digitakt I:

| Build | SysEx SHA-256 | Result |
| --- | --- | --- |
| NO03 (an octave a detent) | 620568df… | "NO03 works, but its way too fast, should be more of the same feel as the trig length steps when func is held." |
| NO08 (an octave every three detents), this release | ca7b5b1e… | "note octave seems good, publish it." |

The exported package linked with Core 2.1 gives NO08 byte for byte. The owner's statement covers the build as a whole; held-trig locks, MIDI chord notes and the range edge were not reported one by one.

## Emulator (digiemu, OS 1.54, 16 November 2026)

Builds NO03 and NO08 (Note Octave alone on core 2.1), driven headlessly; screenshots of the TRIG page after each step.

| Track | Steps | Result |
| --- | --- | --- |
| Audio, NOTE | 6 plain detents | +1 (stock's slow turn) |
| Audio, NOTE | FUNC + 1 detent right, twice | +13, +24 |
| Audio, NOTE | FUNC + 1 right at +13 (NO02 clamped to +24) | NO03: stays +13 |
| Audio, NOTE | FUNC + 1 left, then 3 left in one message | +1, -11 |
| Audio, VEL | FUNC + 1 right | jumps to 100, stock |
| MIDI, NOT1 | FUNC + 1 right twice, 1 left | 72, 84, 72 |
| MIDI, NOT2 | FUNC + 1 right, 1 left twice | +12, 0, -12 |
| Audio, NOTE (NO08) | FUNC held, 12 detents left, 150 ms apart | an octave every 3 detents: -12, -24, -36, -48 |
| Audio, NOTE (NO08) | then 12 detents right | -36, -24, -12, 0 (every 3) |
| Audio, LEN (stock) | FUNC held, 10 detents | a step every 3 or 4 detents: the pace NO08 matches |

Also in the owner's sets live60 (NO02) and live61 (NO08, with Note Accumulator's TRIG page knobs): the audio steps as above.

Screenshots (`media/capture.json`): audio NOTE at -12 and MIDI NOT1 at 72 after FUNC + three detents.

## Not tested

- Reported one by one on a unit: a held trig (the lock), several held trigs, a MIDI chord note at its range edge.
- OS 1.53.
