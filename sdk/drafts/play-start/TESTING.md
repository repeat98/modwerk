# Play Start testing

## Commands and exact revision

No native image, `module:verify`, or `ot_emu` run has been recorded yet. Stock guards at `0x40061822` (transport state load), PERSONALIZE count `0x40068fb2`, and the three ANDY `pea 0x64` sites match original OS 1.40C (`section_3_MAIN_OS.bin` SHA-256 `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`) as hashed locally; those bytes are not in this folder.

## Hardware and audio quality

Not tested. The author will flash a card build on an Octatrack (no USB link yet). Record tester, date, MKI/MKII, local image SHA-256, and only results they actually report.

Intended card checks (do not mark pass until reported):

1. PLAY START OFF: [PLAY] still pauses and continues, as on stock.
2. PLAY START ON: [PLAY] from stop starts; [PLAY] while running starts from the beginning; [PLAY] from pause starts from the beginning; [STOP] still stops.
3. [REC] + [PLAY] still starts live recording.
4. Save a project with OFF, reload it: the project is unchanged. PERSONALIZE ON/OFF is global, not in the project.
5. Power cycle with ON: the row should still read ON on a card build (ANDY restore). USB install restore is `ps_restore` on `module_tick` and is untested.

## Stock flows

Not run. Deliberate change: [PLAY] pause/continue while PLAY START is ON, documented in the README. MIDI transport, scenes, sampling, and menus this module does not own: not tested.

## Performance

Not run. `evidence/performance.json` is not filled with measurements. New-module `perf:audit` remains open.

## Resources

Unmeasured. Authored ROM is one ColdFire unit (PERSONALIZE strings, getter/setter, [PLAY] gate) plus one six-byte detour, three four-byte ANDY pokes, a two-byte row-count poke, and relocated PERSONALIZE pointer arrays. No DSP memory.

## Hardware

Untested.

## OT UI capture evidence

Pending: PERSONALIZE with PLAY START selected, OFF and ON. Never commit firmware, dumps or cards.
