# Octatrack base 0.8.4: five changes on top of 0.8.3, 27 November 2026

Source: `base/octatrack-next` after base 0.8.3, plus these commits, each its own:

- `233d8c37d`: a module machine pasted onto a track, or brought back by a Part reload, goes through the pick's frame-line check (`modwerk_status_pick_busy`).
- `41b3a7e66`: MODULES answers STOP PLAYBACK FIRST for a transport that is not rewound, and CARD BUSY: TRY AGAIN when the card gate is closed on a stopped unit, instead of BUSY: TRY AGAIN for both.
- `a960a7410`: the start's own late frame entries no longer make a LATE incident at second 0.
- `407f8beb5`: a DETAIL record follows each CPU or LATE record (which check refused a pick, and the kinds of late entries).
- `3abc84fa1`: comment only (the third stock USB DISK send spin, covered since 0.8.3).
- `020662873`: the base and its packages build with Modwerk's own Python builder (`sdk/firmware_builder`). The base's code is unchanged byte for byte; its identity changes because its build inputs name the builder's files.
- `739fd4e64`: the ELEK update name the resident bootloader shows while flashing is MODWERK (right-justified in its ten cells), in the base build and in every set the site builds.

## Builds

Regenerated with `npm run octatrack:base -- --stock OCTATRACK_OS1.40C.bin --beta --write`, then `node scripts/base-size.mjs --write` and `npm run octatrack:module-packages -- --base-only`:

- base 0.8.4 `06d97b5bf43811066afc89d289a9a626ee821df15c67f9e9803727005bf3a46d`; package `ef22105b…`, fills `86d01ea6…`.
- browser `.bin` = `build_core.py` `.bin`: `e67245fbc838111b365ddc954fafc4b5a31e791740f39cc27c9767223249a179` (838,976 bytes); bootloader copy identical, `.bin` and `.syx` carry the same OS, every change inside a declared site.
- 838,960 of 851,712 container bytes, 12,752 free (+1,068 since 0.8.3); MAIN 1,354,732 of 1,572,864.
- Relinked: USB Audio 0.4.2-experimental `c2597a32…`.

## Rebuilt with Modwerk's builder, 28 November 2026

- base 0.8.4 `fe4e7623ee2dde7a6486f4699e5ecfe7ac4c7f43419abe80ba7de5ca2776d8a6`; package `f250ddf6…`, fills `86d01ea6…` (unchanged). Against `06d97b5b` the package differs only in `identity.c`'s hash and the identity string in `.run`.
- browser `.bin` = `build_core.py` `.bin`: `6aac87ccf481b1d55ac442a381f0a296865033e8d02b4d42a83d55dec459dd84` (838,984 bytes); 838,968 of 851,712 container bytes, 12,744 free.
- USB Audio 0.4.2-experimental relinked to the same `c2597a32…`.

## Tests

Not tested on a unit. The update name needs a look at the bootloader screen during a flash; the other changes need the base test procedure on this exact build.
