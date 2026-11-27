# Octatrack base 0.8.4: five changes on top of 0.8.3, 27 November 2026

Source: `base/octatrack-next` after base 0.8.3, plus these commits, each its own:

- `233d8c37d`: a module machine pasted onto a track, or brought back by a Part reload, goes through the pick's frame-line check (`modwerk_status_pick_busy`).
- `41b3a7e66`: MODULES answers STOP PLAYBACK FIRST for a transport that is not rewound, and CARD BUSY: TRY AGAIN when the card gate is closed on a stopped unit, instead of BUSY: TRY AGAIN for both.
- `a960a7410`: the start's own late frame entries no longer make a LATE incident at second 0.
- `407f8beb5`: a DETAIL record follows each CPU or LATE record (which check refused a pick, and the kinds of late entries).
- `3abc84fa1`: comment only (the third stock USB DISK send spin, covered since 0.8.3).
- `739fd4e64`: the ELEK update name the resident bootloader shows while flashing is MODWERK (right-justified in its ten cells), in the base build and in every set the site builds.

## Builds

Regenerated with `npm run octatrack:base -- --stock OCTATRACK_OS1.40C.bin --beta --write`; the identities follow in the regeneration commit.

## Tests

Not tested on a unit. The update name needs a look at the bootloader screen during a flash; the other changes need the base test procedure on this exact build.
