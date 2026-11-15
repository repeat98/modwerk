# Filter Hz

## Overview

The FILTER page's FRQ value popup shows the cutoff frequency instead of 0 to 127:
13.8Hz at 0, 440Hz at 60, 1.11kHz at 76 and 21.1kHz at 127, to three significant
figures. The scale is one semitone a step,

    f = 440 × 2^((v − 60) / 12)

as MrScruff measured it on the self-oscillating LP2 filter (every fourth value from
16 to 116 within 0.01 semitone of the formula). Only the display changes: the filter,
its range, saved kits and every other parameter are untouched. When FRQ is locked on a
trig, the white box behind its value is 33 pixels instead of stock's 27, the same for every
value: a kHz value is up to 31 pixels wide.

Version **1.2.1** for Analog Rytm MKII OS **1.74**, with core-ar2 0.3. It is
[rytm2_mods](https://github.com/Iced-Cream/rytm2_mods)' elemod port of MrScruff's
`0008-filter-hz` from [rytm-mods-src](https://github.com/Iced-Cream/rytm-mods-src),
with his code unchanged; Modwerk's 1.2.1 adds the wider box. 1.2.0's hardware testing is recorded in the
[hardware report](evidence/hardware-testing.json), 1.2.1's in [its report](evidence/hardware-testing-1.2.1.json),
and both in [TESTING.md](TESTING.md).
1.2.0 drops the OS 1.73 release (core-ar2 0.1) that 1.0.0 and 1.1.0 had: Modwerk now
supports the Rytm on OS 1.74 only. 1.2.1 widens a locked FRQ's box: in 1.2.0
every kHz value stuck out of stock's 27-pixel box by one to four pixels in all.

## Controls

| Control | Action |
| --- | --- |
| Knob E — FRQ | Unchanged control. Its value popup shows the cutoff in Hz or kHz instead of the number. |

There are no new controls, menus or settings. To get the stock popup back, build
without the module.

## Usage

The popup appears whenever FRQ is turned, on any track and in any kit.

### Quick tutorial

1. Use a build containing Filter Hz. Select a track and press FILTER to open its FILTER page.
2. Turn FRQ (knob E). The value popup reads the cutoff in hertz instead of 0 to 127: 440Hz at the stock value 60, one semitone a step.
3. Turn FRQ fully right for 21.1kHz, the open filter, or fully left for 13.8Hz. RES and every other parameter still show their plain numbers.

| Stock value | Popup |
| --- | --- |
| 0 | 13.8Hz |
| 60 | 440Hz |
| 76 | 1.11kHz |
| 126 | 19.9kHz |
| 127 | 21.1kHz |

## Compatibility and limitations

Requires core-ar2 0.3 on OS 1.74. Use your own original stock OS 1.74 file.

- Built for OS 1.74 only.
- The scale was measured on the self-oscillating LP2 filter; the other filter types are assumed to share it.
- The popup shows the knob's value: envelope depth, LFO modulation and parameter locks applied elsewhere are not included.
- The 0 to 127 number is no longer shown for FRQ, so check the ends (13.8Hz, 21.1kHz) rather than a middle value when comparing with stock.

The module patches two sites: eight bytes in `param_value_text` at `0x400a86b4`,
the same site as the original mod, and since 1.2.1 twenty bytes at `0x40037bea` in
stock's knob value drawing, where it pushes a locked value's box. For FRQ the box
is 33 pixels, x−16..x+16, for every value: one pixel past the widest text on each side,
reaching the screen's left edge. Every other parameter keeps stock's box. Another
module patching either site cannot be combined with it.

## Tests and measurements

See [TESTING.md](TESTING.md) for the commands and results. In short: 1.2.0's popup
shows Hz on an Analog Rytm MKII in a build of the released core and Filter Hz alone,
and beside the other rytm2_mods ports. Modwerk's build of 1.2.0 gave a main OS
byte-identical to that tested build, the core linked with the rytm2_mods v1.2
release. In rytm-emu the popup reads 440Hz and 21.1kHz where stock reads
60 and 127, with every other pixel the same. Memory: 302 bytes (256 before 1.2.1)
of the 128 KiB shared mod area. There is no code in the audio, sequencer or tick
paths.

## Authorship and licences

MrScruff: the original mod (rytm-mods `0008-filter-hz`), its design, code and
frequency measurements, published in rytm-mods-src with his permission.
Iced-Cream: the elemod port in rytm2_mods and this module. irpina: Elekloader and
core-ar2.

Code: [GPL-2.0-only](LICENSE), as rytm-mods-src. `src/filter-hz.s` and
`include/ar2-1.74.inc` are rytm2_mods' `filter-hz/os1.74/filter-hz.s` and
`include/ar2-1.74.inc` at `afd461d` (v1.2), byte for byte, except that 1.2.1 adds
`filter_hz_box` and its two constants to the source. The source's site comment
still names the OS 1.73 address, as upstream's does. The include names firmware
routines by address only. The upstream README is in
[upstream/README.md](upstream/README.md). Screens show Elektron's interface solely
to document the modification. No Elektron firmware is included.

## Screens and audio

These captures are rytm-emu frames of the released core-ar2 0.3 and Filter Hz on stock
OS 1.74. The first three are the same files on FZ74 (1.2.0) and FZ78 (1.2.1); the locked
one is FZ78's. See [capture provenance](media/capture.json) for hashes and
inputs. The mod changes no sound, so there is no audio demonstration.

![FILTER page with ATK, DEC, SUS and REL above FRQ, RES, TYP and ENV.](media/filter-page.png)

Press FILTER on any track to open its FILTER page. FRQ is knob E, at the left of the lower row.

![FREQUENCY popup with the FRQ label reading 440Hz and the filter curve cut off in the middle.](media/frq-440hz.png)

Turn FRQ: the popup now reads the cutoff in hertz. At the stock value 60 it shows 440Hz; each step is one semitone.

![FREQUENCY popup with the FRQ label reading 21.1kHz and the filter curve fully open.](media/frq-open.png)

Turn FRQ fully right and the popup reads 21.1kHz, the open filter; fully left reads 13.8Hz.

![FREQUENCY screen with a locked FRQ reading 21.1kHz in a white inverted box under the filter curve.](media/frq-locked.png)

Lock FRQ on a trig (hold the trig, turn FRQ): the white box behind the value is wide enough for kHz values.
