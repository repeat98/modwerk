# Improved FLTR: testing

## Emulator (rytm-emu, not hardware evidence)

IF05 (sha256 2dc1a9fc: Modwerk dev base 7ee5867d + Improved FLTR + Filter Hz + Improved AMP), rig cases in the rig's `cases/improved-fltr/`, all pass:

- **if-band-words:** the frame's analog words on the BD voice, against values worked out by hand from `band.s` and the width table. FRQ 48, BND, RES 52: cutoff 0xf860, resonance 0x010d, switch code BP (0x02). FRQ 48, BND+, RES 72: 0xf800, 0x0165, BP. FRQ 48, PK, RES 0 (stock path): 0xe000, 0x0000.
- **if-link-tap:** BND+ (RES 72) tapped: BND, RES 0x3334 (the edge kept), and the engine words carry the new RES and TYP at once (no glide); one RES step up, tapped again: BND+, RES 0x4878. The header reads LP LINKED / LP FREE; RES shows the edge in hertz.
- **if-typ-turn:** TYP's knob from PK: BND, then BND+, then stays at BND+ (stock's turn and setter, the id table's maximum opened to 8); the switch code is BP.
- **if-screens, if-graph:** the band picture on TYP for 7 and 8; the graph draws both band types between their edges at four widths; stock BP unchanged.

Independent review (23 Nov 2026), its findings fixed: the text and the tap read the edited sound (not what a lock plays); the tap lands RES and TYP at once (stock glides both, so the old type briefly met the new RES); the tap opens only on a band type (a press and turn of RES on other types kept every detent); the cutoff stops at stock's top; hertz text rounding at 999.5 Hz and 9.995 kHz; the cases gained expects and the TYP turn. Its stock-path, register, overflow, glyph-timing and graph checks found nothing.

Not run in the emulator: sound (its analog model is not the unit's), MIDI CC 76 values 9..127, p-locks on TYP, a shared voice (RS/CP).

## Unit

Not run yet.
