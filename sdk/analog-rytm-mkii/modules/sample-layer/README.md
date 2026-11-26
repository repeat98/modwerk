# Sample Layer

An Analog Rytm MKII mod by @chevyone. Version 0.1.0-experimental, for OS 1.74 on Modwerk's base.

## Overview

Sample Layer gives a track's sample a filter and a decay of its own, so a sample layered on an analog drum can be shaped apart from it. It works on the sample before its DAC: the analog machine, the analog filter and the AMP envelope are left as they are, and AMP still shapes the whole sound.

- **Its own page.** SMPL pressed until SMPL LAYER shows, after the waveform: the waveform view stays where it was.
- **Filter.** FRQ, RES and TYP: OFF, LP, BP or HP, 12 dB per octave, on the sample alone.
- **Decay.** DEC, a decay for the sample from each trig, under the AMP envelope.
- **Stock when off.** TYP OFF and DEC INF leave the sample exactly as stock plays it.
- **Kept.** The settings are per sound and travel with it.

## Controls

| Control | Action |
| --- | --- |
| SMPL, pressed again after the waveform | Opens SMPL LAYER. |
| FRQ | The filter's frequency, 20 Hz to 18 kHz. Default 127. |
| RES | Resonance 0 to 15: Q 0.5 to 4, up to +12 dB at FRQ. Default 0. |
| TYP | OFF, LP, BP, HP. Default OFF. |
| DEC | The sample's decay from each trig: 0 is 4 ms, 126 is 3 s, 127 is INF (none). Default INF. |

### Quick tutorial

1. Put a sample on a BD track with an analog machine. Press SMPL until SMPL LAYER shows.
2. Set TYP to HP and turn FRQ up while a pattern plays: the sample thins to a click on top of the analog body.
3. Turn DEC down: the sample is only the attack of the hit while the analog part rings on.
4. Set TYP OFF and DEC to INF: the sound is stock's again.

## Compatibility and limitations

- OS 1.74 on Modwerk's base only: it follows the base's AMP record (`ev_amp_record`) to restart DEC at each trig.
- It patches stock's call of the voice mixer (0x4012129a), which no other module or the base patches, and takes hidden parameter ids 447 to 450 and page 14.
- The settings cannot be p-locked or reached over MIDI: they live outside the sound's parameters.
- A change reaches a voice that is playing within about 50 ms.
- The filter runs in the audio interrupt for each voice whose track uses it.

### Mod storage

| Field | Scope | Bits |
| --- | --- | --- |
| `sample_layer_cfg` | sound | 20 |

That is 20 of the sound's 56 bits: beside Voice DAC (39) a set does not link.

## Tests

See [TESTING.md](TESTING.md). The tables in `src/tables.h` are written by `python3 tools/tables.py > src/tables.h`.
