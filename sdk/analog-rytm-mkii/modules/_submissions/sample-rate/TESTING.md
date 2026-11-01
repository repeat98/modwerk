# Sample RATE — test report

Everything below was observed in rytm-emu on the named build. Nothing has run on a unit, and the emulator is not hardware evidence: the Hardware section is empty until the author reports from one.

- Source (0.1.0-experimental): fingerprint (`sha256` of `sha256sum build.json src/audio.s src/rate.c`) `dc07d5cd…3e07` (`evidence.sourceSha256`), which drops the block handler's put-back step from the source below.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, the owner's file. Core: elekloader core-ar2 0.7 as vendored.
- Build SR04 (core + Sample RATE, `--version SR04`): `.syx` `f8802bc146dacce2e7770ff700f4f1efb9cdc9d265d0faf262214568e7520347`.
- Build SP03 (core + Sample RATE + Pipo Loop 0.1.1-experimental from its local branch, commit `f48b95d9`; test image only): `.syx` `f2316e1bca4e513ec37f49e561e391897e850177327d218a07414ce399ab8c96`.
- Build SA03 (as SP03, with Silent Pad+Trig, Loop Sync and Filter Hz; test image only): `.syx` `ab4b96cae7ecfc17730aec36e78727606da1a75c399ac033b8ca2534f76f4f09`.
- Build SR05 (core + Sample RATE, this source): `.syx` `fcf216bba8ebf1f4db0a52dd01405616577bd8b37e75b84180ade3e2391b9393`.
- Build SP04 (as SR05, with Pipo Loop `b0ed4fe7`, which removes the same step from its own turn; test image only): `.syx` `c86d191ebffd3fb30c8e6376c1cae97189d3eb5c3b7059af6bb5aab6f5dc678d`.
- Build SA04 (as SP04, with Silent Pad+Trig, Loop Sync and Filter Hz; test image only): `.syx` `6c21772a988a637f92a002ddbbc905802a3f90bc3b43e1e598d9cff5068982e1`.
- A core-only image, same stock and core, for comparison.
- Emulator: rytm-emu `c5732f0`, headless `dtboot`, JIT on. One generated sample, RAMP, 23,777 frames (odd, so STA and END fall on no round multiple), on BD with LOP ON. Audio is dtboot's `--wav`. Voice words are read with `DTBOOT_PEEK`: step at rec + 12, position at rec + 4, effective FIN at 0x8000f7cc. A click means a sample-to-sample step over 40, or six times the median, on a ramp whose normal step is below 2; each run also flags the trig's own attack, which is not counted.

## Rerun on the current source

Stock rebuilds the effective array every block, so the handler's step that put its swap back had no work and could match by chance; it is gone. On SR05 the row-off comparison is again identical over 239,890 frames, and the speed and direction rows match. On SP04 the 22 PIPO speed runs, 11 flip and stop runs, 8 phase runs and the four sweeps that gave 12 jumps show no click past the trig's attack. On SA04 the 11 runs are clean. The tables below name the build each was first run on. The Hardware section is SP03, the source before this change, with Pipo Loop `f48b95d9`.

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

## Sound locks and two voices (SP03)

| Check | Result |
| --- | --- |
| BD at RATE 38, row on, T1 and T9 plain, T5 sound-locked to a pool sound with the row off, sequencer running | T5 at +1.000x from STA, T1 and T9 at -0.406x from END, for five passes: the setting follows the sound played and comes back on the next plain trig |
| The reverse: a pool sound with the row on, locked onto a track with the row off | not run in the emulator; reported on a unit, see Hardware |
| Row on, RATE 127, SOUND MANAGER, store to the empty slot A:162, LOAD TO TRACK on SD | SD reads RATE at 127: the setting travelled, which differs from the unit report. Replacing a slot that already holds a sound was not reached |
| BD at +1.0000x and SD at -0.4163x in the same blocks | each step exact for its own FIN and sign; SD's slot held a 248-frame built-in sample and its pad did not start in this run, so two ramps heard together were not shown |
| SD's RATE moving during a pattern | the step followed FIN in every report |
| Scene lock on RATE at about 53, on a sound at 127, scene toggled | effective RATE 127 and 53 by turn, the step followed, sign included |
| Performance lock on RATE, amount written to the engine's word (0, half, full) | effective RATE 127, 91, 55, the step followed, sign included; the amount was poked, not played from a pad or the QPER knob |

## RATE sweeps with LOP PIPO (SP03, MIDI CC 25 as a stand-in for an LFO)

| Check | Result |
| --- | --- |
| Sweep around 96, loop of about 2,100 frames | no click |
| Sweep with a period of 2 s, loop of about 380 frames, four 45 s runs | 12 full-loop jumps, about 1 in 1,100 turns, all at END's edge, with RATE about 74 and no change of direction |
| Same, period 2.8 s | no click |
| Stock TUN and FIN sweeps with the row off | no click |

A diagnostic build (not kept) logged two of those jumps block by block. The voice lands on END's frame near 5 frames a block, which stock's pitch cannot reach (its floor is 8), turns, and a block later is back to going up: stock wraps it to STA, and Pipo Loop's next turn sends it back. The cause was the put-back step in Pipo Loop's turn: stock's rebuilt STA and END could match what it wrote a block earlier, and it swapped them again. Fixed in Pipo Loop `b0ed4fe7`, a module update of its own, with no change needed here for that fault.

## Playhead (SP03, SMPL WAVEFORM, LOP ON)

The line moves about 37 columns in 30 M at RATE 127, 19 at RATE 96, and stays put at RATE 64: it follows fixed RATE values. Not run with RATE moving.

## Not tested

Replacing a stored sound in the emulator, a project file round trip, Env Reset Amp beside it, MKI. CPU load on a unit: the figures in the manifest are a static estimate.

## Hardware

npp1993 flashed SP03 on an Analog Rytm MKII, OS 1.74, and reports the following. Reported by the author, not itemized measurements; no CPU reading was available.

| Check | Reported |
| --- | --- |
| Row OFF on a new sound, RIGHT turns it ON; the knob reads RATE on that track and FIN on others | pass |
| RATE 127 normal speed, slows to a stop at 64, runs backward below it | pass |
| A pad hit at 64 | a tiny pop, also with STA on a zero crossing; the author puts it down to the analog amp, as an empty channel does it too |
| Trig below 64 starts from END | pass |
| LOP OFF at RATE 20 | pass |
| RATE locked to 1 on one trig, a plain trig later | locked trig backward, plain trig forward |
| LOP PIPO at RATE 127, 66, 62 | no clicks at the turns, never sticks |
| Sweeps through 64 with LOP PIPO, near STA and END | no pops or jumps |
| Row on, kit not saved, power cycle | row and RATE came back |
| Kit saved with row off and FIN +0, row on unsaved, power cycle, NO + PLAY MODE | row OFF, FIN +0: the two stayed together |
| Row on, RATE 90, kit saved | row on, RATE 90 (whether the power cycle was run on this step was not stated) |
| Row on unsaved, NO + PLAY MODE | row OFF, FIN +0 |
| Row OFF at RATE 127 | FIN +0, normal pitch |
| Track copied, 1 to 11 | row on and RATE on the copy |
| LFO to the sample's Fine Tune, RATE about 96, LOP PIPO | pitch rises and falls, passes through a stop into reverse, with some minor clicks; the waveform's playhead looks linear, not following the LFO |
| Track sound stored to a pool slot | stored; it shows in SOUND MANAGER |
| That slot, LOAD TO TRACK on another track | a toast reading ERROR; cause not found |
| Many other stored sounds, LOAD TO TRACK | also ERROR, some loaded; cause not found |
| A new store over a sound, then LOAD TO TRACK on another track | loaded, with FIN AS RATE off: the setting did not travel |

On SP04 (this source, with Pipo Loop `b0ed4fe7`), as reported by npp1993:

| Check | Reported |
| --- | --- |
| LFO to the sample's Fine Tune with LOP PIPO, short loop | passes through the stop; test passed by the author's ear, with no clicks reported at turns; dropouts only while moving STA or END, which the author accepts |
| RATE by hand 127 to 0 and back, LOP PIPO | pass |
| Pad at RATE 20 | starts from END, backward |
| Row OFF and ON at raw 21 | reads FIN -43, then RATE 21 |
| Row-on sound locked onto a row-off track | the trig's knob reads FIN, as the label follows the selected track's sound; the knob sat where the source sound's did; by ear the locked trig played as that RATE value would |
| Waveform playhead with the LFO | looks linear, does not seem to follow the LFO |

Flashing note: on the first attempt the unit stopped on UPGRADE OS NOW? and answered no key after NO had been pressed during the transfer. A power cycle returned it to the earlier OS, and the second transfer, with nothing pressed until the prompt, went through.
