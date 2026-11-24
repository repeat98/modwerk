# Improved FLTR: testing

**0.1.0-experimental** is the one-type build below: IF11 in the emulator, IFD2 and IFC5 on the unit, all from the source this package is built from (`src/` and `build.json` unchanged since 9ce6ed504). Its package linked alone on the plain base gives the screenshot image IFS2 byte for byte. Not run on this version: the package flashed from the site, a project save and load, a power cycle, the audio load.

Layouts: since IF10 there is one type, **BW** (TYP 7: FRQ the base, RES's knob reads WID and sets the width above it). IFC3 ran the two-type layout (BW = RES the cutoff, BWL = linked), the runs up to IFC2 the first layout, **BND** (TYP 7, linked) and **BND+** (TYP 8, RES the cutoff) with a tap of RES between them. Since IF07 the types are **BW** (TYP 7, RES the cutoff, as BND+ was) and **BWL** (TYP 8, linked, as BND was), the tap is gone, and the graph draws the band itself. The audio path is the same code with the two type values swapped.

## Emulator, current layout (one BW type)

IF11 (sha256 56772127; dev base 7ee5867d + Improved FLTR + Filter Hz + Improved AMP): if-band-words (BW, FRQ 48: RES 52 -> 0xf860 / 0x0133, RES 72 -> 0x01c0 / 0xf9ea, BP switch code), if-typ-turn (TYP's knob: PK, BW, stops), if-graph (five widths, references) and if-screens (the whole lower half: RES's knob reads WID on BD's BW, RES on SD's stock LP2, WID again back on BD, RES on stock BP; the band picture on TYP; references) pass. Review of the one-type change (23 Nov 2026), fixed: the TYP picture inside the screen check, the label following a held trig's TYP lock on the FILTER page, stale two-type text, the old unit run relabelled.

## Unit, current layout (one BW type)

**IFD2** (sha256 80447e8c: the private combo set FXCD on its dev base efcc7a07 + Improved FLTR 9ce6ed504 + the private filter-measuring machine), RAM-booted on Nathaniel Pavel's MKII (flash FXCD, same layout), 23 Nov 2026, by the rig: if-band-words (BW's analog words, FRQ 48 with RES 52 and 72, and stock PK) and if-typ-turn (TYP's knob stops at BW) pass. The edge measurement did not run: on this base the measuring machine's noise was silent on the unit (it plays in rytm-emu, and played on the unit on the earlier base), so its recordings hold no signal. BW's audio path and width table are the ones IFC3 measured on the unit as BWL (below): edges within 3..7 %.

**IFC5** (sha256 01cf6c15: the private combo set FXC8 on its dev base 47b00b14, where the measuring machine sounds on the unit, + Improved FLTR e7b240584's module, the same code as IFD2's + the measuring machine), RAM-booted the same day (flash FXCD, same layout): if-band-words, if-typ-turn and the edge check pass.

| setting | asked | measured -3 dB edges |
| --- | --- | --- |
| BW, FRQ 48, WID 51 (2 oct) | 220..875 Hz | 232..858 Hz |
| BW, FRQ 48, WID 102 (4 oct) | 220..3482 Hz | 247..3535 Hz |
| BW, FRQ 36, WID 127 (5 oct) | 110..3426 Hz | 130..3281 Hz |
| BW, FRQ 60, WID 13 (6 st) | 440..626 Hz | 446..624 Hz |
| BW, FRQ 60, WID 51 | 440..1750 Hz | 469..1759 Hz |
| BW, FRQ 72, WID 51 | 880..3501 Hz | 943..3599 Hz |

Top edges within about 3 %, bottom edges 2..18 % high (most for the widest band), as in the earlier runs.

## Emulator, two-type layout

IF09 (sha256 4f0e0ac4; dev base 7ee5867d + Improved FLTR + Filter Hz + Improved AMP): if-band-words (BWL RES 52 and BW RES 72 give the same analog words as before), if-typ-turn (TYP's knob: PK, BW, BWL, stops), if-screens and if-graph (the measured band drawn in the FILTER graph with its frame, 4 dB a row with +15 dB at the top, at five settings, and stock BP; each box against a reference recorded from screens checked by eye) pass. `sdk/tests/test_improved_fltr_table.py` keeps `src/width-table.h` in step with the calibration.

## Unit, two-type layout

**IFC3** (sha256 dafd5332: the private combo set FXC8 on a dev base + Improved FLTR d401815c0 + the private filter-measuring machine), RAM-booted on Nathaniel Pavel's MKII (flash FXCC, same layout), 23 Nov 2026, by the rig: if-band-words, if-typ-turn and the edge check pass.

| setting | asked | measured -3 dB edges |
| --- | --- | --- |
| BW, FRQ 48, RES 72 | 220..880 Hz | 232..861 Hz |
| BW, FRQ 48, RES 96 (4 oct) | 220..3520 Hz | 247..3577 Hz |
| BW, FRQ 36, RES 96 (5 oct) | 110..3520 Hz | 130..3374 Hz |
| BW, FRQ 60, RES 66 (6 st) | 440..622 Hz | 446..621 Hz |
| BWL, FRQ 60, RES 51 | 440..1750 Hz | 469..1759 Hz |
| BWL, FRQ 72, RES 51 | 880..3501 Hz | 880..3657 Hz |

The same edges as IFC2's runs of the same settings (then BND+ and BND) within about 1 %. The current BW's audio path is that layout's BWL (RES the width above FRQ), so the BWL rows carry over; its BW rows (RES the cutoff) do not. The one-type build has not run on the unit yet.

Code review (23 Nov 2026, the BW/BWL change), fixed: RES's text uses the page's noted FRQ and TYP only for the track they came from; the graph's top moved to +15 dB so a 4-semitone band's peak is drawn, narrower ones clip (listed); the memory figure measured (3,492 bytes); the graph cases compare against references; the width table has a test.

## Emulator (rytm-emu, not hardware evidence)

IF06 (sha256 a7e5523a: Modwerk dev base 7ee5867d + Improved FLTR + Filter Hz + Improved AMP), rig cases in the rig's `cases/improved-fltr/`, all pass:

- **if-band-words:** the frame's analog words on the BD voice, against values worked out by hand from `band.s` and the width table. FRQ 48, BND, RES 52: cutoff 0xf860, resonance 0x010d (0x0133 with the P2 table), switch code BP (0x02). FRQ 48, BND+, RES 72: 0xf800, 0x0165, BP. FRQ 48, PK, RES 0 (stock path): 0xe000, 0x0000.
- **if-link-tap:** BND+ (RES 72) tapped: BND, RES 0x3334 (the edge kept), and the engine words carry the new RES and TYP at once (no glide); one RES step up, tapped again: BND+, RES 0x4878. The header reads LP LINKED / LP FREE; RES shows the edge in hertz.
- **if-typ-turn:** TYP's knob from PK: BND, then BND+, then stays at BND+ (stock's turn and setter, the id table's maximum opened to 8); the switch code is BP.
- **if-screens, if-graph:** the band picture on TYP for 7 and 8; the graph draws both band types between their edges at four widths; stock BP unchanged.

Independent review (23 Nov 2026), its findings fixed: the text and the tap read the edited sound (not what a lock plays); the tap lands RES and TYP at once (stock glides both, so the old type briefly met the new RES); the tap opens only on a band type (a press and turn of RES on other types kept every detent); the cutoff stops at stock's top; hertz text rounding at 999.5 Hz and 9.995 kHz; the cases gained expects and the TYP turn. Its stock-path, register, overflow, glyph-timing and graph checks found nothing.

Code review (23 Nov 2026), fixed: RES's text takes FRQ and TYP as the page shows them (a held trig's locks; band.s's graph site notes them); the tap arms only when stock's FILTER graph drew in the same compose that asked for RES or TYP; the tap's snap sets target and glide state only, so modulation on RES is kept; one band routine serves the filter and the graph. Left as is and listed in the README: RES carrying over across a TYP change (the user's call), the tap's two setter writes (two CCs out).

Not run in the emulator: sound (its analog model is not the unit's), MIDI CC 76 values 9..127, p-locks on TYP, a shared voice (RS/CP).

## Unit

**IFC1** (sha256 870680c8: the private combo set FXC8 on a dev base + Improved FLTR bdaf2d8d4 + a private filter-measuring machine), RAM-booted on Nathaniel Pavel's MKII, 23 Nov 2026, by the rig (not by a person); the BD voice's USB channel recorded. All five cases passed: the band words, the link tap (stored values and glide land at once), the TYP turn to BND+ through stock's knob, and two measurements:

- **The band's edges** (noise through the filter, each setting fitted as a 2-pole band-pass against the open filter):

| setting | asked | measured -3 dB edges |
| --- | --- | --- |
| BND+, FRQ 48, RES 72 | 220..880 Hz | 223..854 Hz |
| BND+, FRQ 48, RES 96 (4 oct) | 220..3520 Hz | 235..3280 Hz |
| BND+, FRQ 36, RES 96 (5 oct) | 110..3520 Hz | 123..3166 Hz |
| BND+, FRQ 60, RES 66 (6 st) | 440..622 Hz | 436..615 Hz |
| BND, FRQ 60, RES 51 | 440..1750 Hz | 439..1777 Hz |
| BND, FRQ 72, RES 51 | 880..3501 Hz | 908..3613 Hz |

- **The resonance curve** between 0x2000 and 0xe000 in 0x0400 steps at 880 Hz and 440 Hz (Q 3.3 at 0x2000, 0.61 at 0x0000, 0.26 at 0xf000, 0.10 at 0xe000; the two frequencies agree). Folded into `tools/calibration.json`; the width table it gives places the widest bands about 6 % wider than the one measured above, which ran on the earlier table (wide bands came out up to 10 % narrow at each edge). 

**IFC2** (sha256 f32dc489: IFC1 with the P2 table, Improved FLTR 35806e604), RAM-booted the same day, the band words and edge cases again, both passed:

| setting | asked | measured -3 dB edges |
| --- | --- | --- |
| BND+, FRQ 48, RES 72 | 220..880 Hz | 233..862 Hz |
| BND+, FRQ 48, RES 96 (4 oct) | 220..3520 Hz | 247..3579 Hz |
| BND+, FRQ 36, RES 96 (5 oct) | 110..3520 Hz | 130..3374 Hz |
| BND+, FRQ 60, RES 66 (6 st) | 440..622 Hz | 446..621 Hz |
| BND, FRQ 60, RES 51 | 440..1750 Hz | 469..1755 Hz |
| BND, FRQ 72, RES 51 | 880..3501 Hz | 944..3596 Hz |

Settings whose resonance word hardly changed between the two tables moved 4..7 % between the runs (the analog filter's own spread from run to run), as much as the table's correction: the P2 table is the better measured one, and the edges land within about 7 %, the 5-octave band's low edge 12..18 % high.
