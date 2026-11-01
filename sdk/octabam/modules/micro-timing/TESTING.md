# Micro Timing per track testing

## Commands and exact revision

Stock guards for the TRACK TRIG EDIT sites in `manifest.py` match original OS 1.40C (`section_3_MAIN_OS.bin` SHA-256 `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`) as hashed locally from the developer's own extract. Those bytes are not in this folder. `npm run module:verify` and `ot_emu` have not been run. No USB package has been built.

## What was reported

The behaviour in `microtiming.s` is the private card image MICRO T9 (ELEK `MICRO T9`, SHA-256 `be88f1993be56e07af1f6528e85cff831a998f26cd7ed2bad4bd7a8f3b662f12`), reported by the author on a unit. That image is not this module package, and it is not in the repository.

Reported for that card:

1. FUNC+BANK TRACK TRIG EDIT shows MICRO T under TRIGS and above SLIDE.
2. The window stays four rows. Scrolling past SWING reveals REC.TRG and moves TRIGS off the top.
3. LEVEL sets every step of the selected track to the row's value as the pot turns. There is no YES to apply.
4. MIDI button off writes the audio field only. MIDI button on writes the MIDI field only. The other side stays as it was.
5. The footer shows the stock fraction (`MTn:+1/384` or `MTn:ON GRID`). The lane is dashes, a centre 0, and a cursor that sits on that 0 when the value is on grid.

Earlier private cards failed as the author reported them: a crash from a stub in the trailing pad, no visible row, both list counts at five so REC.TRG sat outside the border, LEVEL dead on audio, the cursor one step off grid, and a pot turn that wrote both audio and MIDI. Do not treat those cards as a pass. MICRO T9 is the reported pass. This module package has not been flashed.

## Stock flows

Not tested on a module build. Intended checks once a package or card of this source exists:

1. With the row at 0, existing trig micro timing is unchanged until LEVEL moves.
2. Turn LEVEL on an audio track: the MICRO TIMING page for that track's steps shows the same fraction. MIDI tracks are unchanged.
3. Turn the MIDI button on and turn LEVEL: the MIDI track's micro timing follows. The audio track is unchanged.
4. Individual trig edits do not change the row. The next LEVEL turn sets all 64 steps to the new absolute value.
5. Power off: the remembered row number is gone. Trig values already written stay in the pattern.

## Performance

Not run. There is no `evidence/performance.json`. New-module performance evidence remains open.

## Resources

Unmeasured. One ColdFire unit, thirteen detours, one LEVEL pointer and the row-index pokes. No DSP memory.

## Hardware

Reported on the private MICRO T9 card only, as above. USB Keep/Undo, `ot_emu`, and LCD captures of this module are untested.

## OT UI capture evidence

Pending: TRACK TRIG EDIT with MICRO T selected, on grid and offset, audio and MIDI. Never commit firmware, dumps or cards.
