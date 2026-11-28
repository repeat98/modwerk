# Sample Layer

An Analog Rytm MKII mod by @chevyone. Version 0.1.0-experimental, for OS 1.74 on Modwerk's base.

## Overview

Sample Layer gives a track's sample an **engine**: a different way of playing it, chosen per sound. It works on the sample before its DAC, so the analog machine, the analog filter and the AMP envelope are left as they are, and AMP still shapes the whole sound. This version has two engines:

- **SAMPLER:** stock's sample playback, bit for bit. Every sound starts here.
- **TRANSIENT:** a drum processor for the sample alone: a punch or a soft attack, a decay, a band and a shift against the analog voice.

The engine and its settings are saved with the sound.

## Controls

| Control | Action |
| --- | --- |
| SMPL | Steps through the SAMPLE pages as stock does, then the ENGINE page: stock's knobs, stock's waveform, ENGINE. On TRANSIENT: TRANSIENT's page, then ENGINE. |
| ENGINE page | The engine list, a panel like SRC's machine list, with the cursor on the sound's engine. UP/DOWN or any knob moves the cursor, YES picks it, NO puts the cursor back. SMPL goes on to the first page. FUNC + SMPL is stock's sample list, as always. |

TRANSIENT's page:

| Knob | Control | Action |
| --- | --- | --- |
| A | PCH | Right of centre: a snap on the attack with a pitch blip of up to +2 semitones. Left: a fade-in of up to 40 ms that rises from up to 4 semitones low. 0 does neither. |
| B | DEC | The sample's decay from each trig, 4 ms to 3 s. INF (the top) is none. |
| C | BR | Stock's bit reduction. |
| D | SMP | Stock's sample slot. |
| E, F | BAS, WID | A band the sample passes through, drawn as one curve over E and F: BAS its base, WID how far it reaches above. |
| G | SHF | Delays the sample 0 to 30 ms after the analog voice. |
| H | LEV | Stock's sample level. |

## Usage

Choose the engine per sound, then shape the sample on TRANSIENT's page while a pattern plays.

### Quick tutorial

1. Put a sample on a BD track with an analog machine. Press SMPL until the ENGINE page (the third), pick TRANSIENT and press YES.
2. Turn PCH to the right while a pattern plays: the sample gets a sharper click on top of the analog body. Turn it to the left: the sample swells in softly.
3. Turn DEC down: the sample is only the attack of the hit while the analog part rings on.
4. Raise BAS and lower WID: the sample thins to a narrow band. Turn SHF up: the sample lands a little after the analog hit.
5. On the ENGINE page pick SAMPLER and press YES: the sound plays as stock's again.

## Compatibility and limitations

- OS 1.74 on Modwerk's base only: it follows the base's AMP record (`ev_amp_record`) to restart DEC at each trig.
- It patches stock's call of the voice mixer (0x4012129a), which no other module or the base patches, takes hidden parameter ids 447 to 456 and 458, and answers SMPL's pages 4 and 5 while TRANSIENT is chosen.
- It adds a third SAMPLE page (ENGINE) through the core's page list, leaving every stock gesture as it is, and draws TRANSIENT's band over knobs E and F. On TRANSIENT, SMPL steps from its page straight to ENGINE: TRANSIENT has no waveform page. Every drawing goes dark with the screen saver.
- The settings cannot be p-locked or reached over MIDI: they live outside the sound's parameters.
- A change reaches a voice that is playing within about 50 ms.
- TRANSIENT runs in the audio interrupt for each voice whose track uses it, about 1.6 % of the audio block a voice at peak; SAMPLER, or TRANSIENT with every control neutral, costs nothing. With TRANSIENT on 7 tracks of a busy pattern the load reached 93 % and the Rytm's screen and keys grew slow: keep it to the tracks that need it.

### Mod storage

| Field | Scope | Bits |
| --- | --- | --- |
| `sample_layer_eng` | sound | 20 |
| `sample_layer_flt` | sound | 14 |
| `sample_layer_gx` | sound | 6 |

That is 40 of the sound's 56 bits: beside Voice DAC (39) a set does not link.

## Tests and measurements

See [TESTING.md](TESTING.md): host tests of the render, and the author's unit for builds SL03 to SL20. The audio load was measured on the author's unit: about 1.6 % of the audio block a voice at peak. The tables in `src/tables.h` are written by `python3 tools/tables.py > src/tables.h`.

## Authorship and licences

Original work by @chevyone, with Claude Code: no code, samples or tables from any instrument. GPL-3.0-or-later ([LICENSE](LICENSE)). The screenshots are the author's captures of the Rytm's screen ([media/LICENSE.md](media/LICENSE.md)).

## Screens and audio

- [The engine list](media/engine-list.png): the ENGINE page, SAMPLER and TRANSIENT, the cursor's engine in the title bar.
- [TRANSIENT's page](media/transient-page.png): PCH, DEC, BR, SMP above the BAS/WID band, SHF and LEV.

No audio recordings yet.
