# Improved Compressor

## Overview

The Rytm's compressor is analog, and stock shows its threshold and makeup as bare knob values. Improved Compressor shows them in dB.

**THR** reads the level where the compressor starts to turn the signal down. It follows the ratio: on this compressor RAT moves where the reduction starts more than how far it ends up, so the same THR starts 8 dB later at 1:8, 15 dB later at 1:4 and 18 dB later at 1:2 than at MAX. Change RAT and THR's number moves with it. **MUP** reads the makeup gain.

The numbers come from measurements on a unit, with a sine sent through the compressor and with its own drum voices. Nothing else on the page changes. The module draws nothing of its own, runs nothing on a timer or in the audio, and takes no key or knob.

## Controls

| Control | Where | What it shows |
| --- | --- | --- |
| THR | COMPRESSOR page, knob A | Where the compressor starts, in dBFS: about 0.97 dB a step, -36dB at THR 96 with RAT MAX, and 8, 15 and 18 dB later at 1:8, 1:4 and 1:2. The level is that of one centred voice on its own channel. |
| MUP | COMPRESSOR page, knob D | The makeup gain over MUP 0, 0.645 dB a step: +20.6dB at MUP 32. |

The knobs, their ranges, parameter locks, scenes, performances and the LFO are stock's. Only the text shown while a knob is turned changes.

## Usage

Select the FX track and press AMP for the COMPRESSOR page. Turn THR or MUP: its value reads in dB.

### Quick tutorial

1. Use a build containing Improved Compressor. Select the FX track and press AMP: the COMPRESSOR page.
2. Set RAT to MAX and turn THR to 96: it reads -36dB. A voice peaking above that level is being compressed.
3. Set RAT to 1:2 and nudge THR: the same position now reads -18dB, because at 1:2 the compressor starts 18 dB later.
4. Turn MUP to 32: it reads +20.6dB, the gain added after the compressor.
5. To go back to stock's numbers, build without the module. Nothing is saved, so projects are unchanged.

## How it works

One record in the core's parameter-text table answers for THR and MUP on the FX track; everything else passes to stock. THR's text is a line measured on a unit at RAT MAX, moved by a fixed amount for each ratio, read from the ratio as it is set now. MUP's text is a line measured to MUP 48.

## Changes to stock flows

- **THR and MUP read in dB instead of 0 to 127** on the COMPRESSOR page. This is what the module is for; there is no setting, and a build without the module shows stock's numbers. Considered instead: a page of its own, which would put the numbers away from the knobs they describe. A musician sees a dB value while turning either knob. Checked beside it: the page's other six values, the header, parameter locks, scene and performance mode (where the two texts stay stock's, because stock hands the text a lock's offset there, not the knob's value).

Nothing else changes.

## Compatibility and limitations

- OS 1.74 only, on Modwerk's Rytm base.
- The laws were measured on one unit; another may differ by a dB or so.
- THR's number is where the compressor starts with SEQ OFF. SEQ's filters were not measured.
- Below THR 64 the compressor already turns down the bus's own hiss, so the number there is the measured line extended, not a start you can hear.
- At 1:2, 1:4 and 1:8 a THR step measured 0.89 to 0.94 dB against the text's 0.97, so the number can be about 1.5 dB off 20 steps away from THR 90.
- THR's number uses the ratio as it is now: a RAT lock on a trig is not followed while that trig is held.
- The text shows the knob's value. With a scene, performance or lock holding THR or MUP elsewhere, the compressor follows that, not the number.
- MUP was measured to MUP 48. From about MUP 56 the measured gain stopped near +40 dB with the main output near its ceiling, so above that the number is the gain asked for.
- In scene and performance mode THR and MUP read as stock.

## Tests and measurements

[TESTING.md](TESTING.md) has every run. In short: the texts were checked on the author's Analog Rytm MKII and in rytm-emu (THR 96 reads -36dB at MAX and -18dB at 1:2, MUP 32 +20.6dB, stock's text in scene mode). The laws come from the compressor measured on that unit: its drum voices against the main output for THR and MUP, and a sine through AUDIO IN for the ratios.

## Authorship and licences

Nathaniel Pavel wrote it; the core is irpina's Elekloader core-ar2. GPL-3.0-or-later, see [LICENSE](LICENSE). No firmware, extracted routines or tables are included: the source names firmware addresses only.

## Screens and audio

These captures are from rytm-emu running Modwerk's base for core-ar2 0.7 and Improved Compressor alone, from stock OS 1.74 ([capture provenance](media/capture.json)). The emulator's analog side is stubbed, so the screens show the texts, not the sound.

