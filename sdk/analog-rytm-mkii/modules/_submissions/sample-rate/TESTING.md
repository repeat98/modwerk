# Sample RATE — test report

Everything below was observed in rytm-emu on the named build. Nothing has run on a unit, and the emulator is not hardware evidence: the Hardware section is empty until the author reports from one.

- Source (0.1.0-experimental): fingerprint (`sha256` of `sha256sum build.json src/audio.s src/rate.c`) `b5a98ac2…3c13` (`evidence.sourceSha256`).
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, the owner's file. Core: elekloader core-ar2 0.7 as vendored.
- Build SR04 (core + Sample RATE, `--version SR04`): `.syx` `f8802bc146dacce2e7770ff700f4f1efb9cdc9d265d0faf262214568e7520347`.
- Build SP03 (core + Sample RATE + Pipo Loop 0.1.1-experimental from its local branch, commit `f48b95d9`; test image only): `.syx` `f2316e1bca4e513ec37f49e561e391897e850177327d218a07414ce399ab8c96`.
- Build SA03 (as SP03, with Silent Pad+Trig, Loop Sync and Filter Hz; test image only): `.syx` `ab4b96cae7ecfc17730aec36e78727606da1a75c399ac033b8ca2534f76f4f09`.
- A core-only image, same stock and core, for comparison.
- Emulator: rytm-emu `c5732f0`, headless `dtboot`, JIT on. One generated sample, RAMP, 23,777 frames (odd, so STA and END fall on no round multiple), on BD with LOP ON. Audio is dtboot's `--wav`. Voice words are read with `DTBOOT_PEEK`: step at rec + 12, position at rec + 4, effective FIN at 0x8000f7cc. A click means a sample-to-sample step over 40, or six times the median, on a ramp whose normal step is below 2; each run also flags the trig's own attack, which is not counted.

## Row and display (SR04)

| Check | Result |
| --- | --- |
| FUNC + MUTE, SOUND SETTINGS, DOWN to the end | FIN AS RATE is the last row, after LEGACY FX SEND; the list scrolls; reads OFF on a new sound |
| RIGHT, LEFT, YES on the row | ON, OFF, turned over; the menu stays open and the rows above do not change |
| Row ON from FIN +0 | FIN goes to raw 127 |
| Row OFF from RATE 127 | FIN goes back to raw 64 |
| SAMPLE page, both views, row ON | label RATE; header RATE while turning; value 0 to 127 |
| Another track (SD) while BD is on | label FIN: the setting is per sound |
| Power off (power-fail save), cold boot, row not saved first | label RATE, FIN 127, step exactly 1x |
| Stock kit reload (NO + PLAY MODE), row switched on unsaved | FIN 64, step 1x: back to the saved sound with RATE off |
| Power off, cold boot, then kit reload | FIN 127, step 1x |

## Speed (SR02, SR03, same engine code)

| FIN (raw) | Step word | Expected |
| --- | --- | --- |
| 127 | 0x08000000, 1.0000x | 1x |
| 111 | 0x05e00000, 0.7344x | 47/64 |
| 95 | 0x03e00000, 0.4844x | 31/64 |
| 72 | 0x01000000, 0.1250x | 8/64 |
| 65 | 0x00200000, 0.0156x | 1/64, half a frame a block |
| 64 | 0 | stop |
| 57 | -0.1094x | -7/64 |
| 34 | -0.4688x | -30/64 |

## Direction

| Check | Result |
| --- | --- |
| Trig at raw 58, 29, 8, 4 with LOP ON | starts at END (position 23,555 at raw 58 on the first report), loops downward |
| Trig at raw 64 | starts at STA and holds |
| LOP OFF, about -0.52x | plays once, 0.93 s (23,777 frames predicts 0.95 s), then silence; no wrap in the audio |
| LOP OFF, then RATE to 127 after it played out | stays silent until a trig |
| FIN locked to raw 1 on T1, T9 plain, sequencer running | T1 at -0.984x from END (position 23,336 after the first report), T9 at 1.000x from STA; alternates over six passes |
| MIDI CC 25 | sets RATE, and it holds across a trig, as stock's FIN on the core-only image |

## Row OFF against the core alone

Same steps on SR03 and on the core-only image: FIN +12, two BD hits. Effective FIN and the step word match, and the audio is identical, sample for sample, over 239,890 frames from the first onset.

## With Pipo Loop (SP03, LOP PIPO, loops of about 380 and about 2,100 frames)

| Check | Result |
| --- | --- |
| Effective RATE 127, 96, 73, 67, 66, 65, 64, 58, 35 and 5 on both loops (22 runs) | no click; turning points scale with speed; at raw 65, half a frame a block, the voice turns at both edges and does not stall; raw 64 holds |
| Slow reverse, raw 63, 62, 60 | no click; at raw 63 the voice turns at both edges |
| Flips 127 to 1 every 193 M and 137 M, 100 to 28 every 61 M, 96 to 32 every 211 M and 223 M, 72 to 56 every 173 M | no click |
| Stop at 64, resume, reverse, stop, reverse | no click |
| 100 to 28 every 61 M, four start offsets, two report intervals (8 runs) | no click |

An earlier build (SP01) clicked here: flips that landed the voice at an edge at near zero speed sent it back past the edge, where Pipo Loop's turn leaves it for a moment, and stock wrapped it by a whole loop. One run of 40 flips showed 12 and one of 16 showed 1, only at offsets that locked the flips to the loop. The change of direction now waits until the voice is 32 frames clear of both edges.

## Built beside other modules

| Check | Result |
| --- | --- |
| Link with Pipo Loop | no shared sites |
| Link with Pipo Loop, Silent Pad+Trig, Loop Sync and Filter Hz | no shared sites |
| SA03, the slow reverse, flip, stop and CC cases above (11 runs) | no click |

## Not tested

Sound locks (a trig playing a pool sound), scene and performance locks on RATE, an LFO on RATE, sound browser load, sound copy and paste, a project file round trip, more than one voice in RATE at once, Env Reset Amp beside it, MKI. CPU load on a unit: the figures in the manifest are a static estimate.

## Hardware

Not tested.
