# Micro Timing per track testing

## Commands and exact revision

Stock guards for the TRACK TRIG EDIT sites in `manifest.py` match original OS 1.40C (`section_3_MAIN_OS.bin` SHA-256 `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`) as hashed locally from the developer's own extract. Those bytes are not in this folder. `npm run module:verify` has not been run. No USB package has been built.

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

Reported on the private MICRO T9 card only, as above. USB Keep/Undo of this package is untested. The LCD captures below are emulator frames, not a hardware result.

## OT UI capture evidence

Headless `ot_emu` (SHA-256 `54cc5664b893b68dd12fc52678d8cd8b0c11dea7ca907b804b606b89842e46f0`), MKII panel, `--dsp --frame`, empty scratch card, stopped transport, 3 November 2026. Private MAIN OS SHA-256 `2388ec30162fa38aae071704c6f65f6312b96c879e3175003a1ba17276b884cf`, file written `2026-11-03T00:21:03Z`, before commit `13d33940` (the signed lower clamp). That image is not in this folder.

Plan, recorded in `media/capture.json`: dismiss the date prompt, press REC, FUNC+BANK, DOWN onto MICRO T, capture `media/ot-micro-t.png`, then three DOWN presses and capture `media/ot-rec-trg.png`. Key interval 150 ms. Palette on 240, off 24, scaled by 6.

Observed on those frames: MICRO T is highlighted under TRIGS, the lane cursor sits on the centre mark, and the footer reads `MT1:ON GRID`. After the scroll, TRIGS is off the top and REC.TRG is the bottom row.

Not captured: a LEVEL turn (offset fraction), the MIDI button, audio and MIDI trig pages, and any frame of the source at `13d33940`. Never commit firmware, dumps or cards.
