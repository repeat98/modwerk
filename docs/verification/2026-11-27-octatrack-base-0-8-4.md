# Octatrack base 0.8.4: on top of 0.8.3, with the Quadraverb base side, 27 November 2026

Source: `base/octatrack-next` after base 0.8.3, plus these commits, each its own:

- `233d8c37d`: a module machine pasted onto a track, or brought back by a Part reload, goes through the pick's frame-line check (`modwerk_status_pick_busy`).
- `41b3a7e66`: MODULES answers STOP PLAYBACK FIRST for a transport that is not rewound, and CARD BUSY: TRY AGAIN when the card gate is closed on a stopped unit, instead of BUSY: TRY AGAIN for both.
- `a960a7410`: the start's own late frame entries no longer make a LATE incident at second 0.
- `407f8beb5`: a DETAIL record follows each CPU or LATE record (which check refused a pick, and the kinds of late entries).
- `3abc84fa1`: comment only (the third stock USB DISK send spin, covered since 0.8.3).
- `739fd4e64`: the ELEK update name the resident bootloader shows while flashing is MODWERK (right-justified in its ten cells), in the base build and in every set the site builds.

Folded in from `base/octatrack-pool-raise` (owner, 27 November 2026: "fold it into #2333"), merged in `work/base-next-qv`:

- `cde00b7d9`, `270b4fe2e`, `e2169cad0`, `59774b0d0`: program areas (`ot_dsp_effects`, `dsp_programs.c`): an FX effect switches its DSP code between two frames. In the release base, through `--resident-on-demand`; the PROGRAM PROBE fixture is a development fixture, and the site syncs an effect that requires program areas only to a base that has them.
- `aa9709922`, `f35ec5c41`, `c8799c022`, `90c7807ec`: the module pool 2 MiB (was 768 KiB), a module's image 256 KiB and 512 KiB with its bss; the site checks a set against 2 MiB on this base and 768 KiB on earlier ones. Flex and recorder sample memory is 1.5 MB smaller.
- `bd835b9f3`: a refused restore's set record keeps the module pool past 1 MiB (dsp1 bits 8-15).
- `f57fd4afa`, `28cb5deb9`, `5ecfbd2f4`, `68289e35f`, `a2410014c`: the stream channel and STREAM FULL. Development twins only (`stream_probe.py --stream-channel`, with `--dev` and without `--usb-input`); not in this base.

## Builds

Regenerated with `npm run octatrack:base -- --stock OCTATRACK_OS1.40C.bin --beta --write`, then `node scripts/base-size.mjs --write` and `npm run octatrack:module-packages -- --base-only`:

- base 0.8.4 `fcbf5393be5d3cc82772daf63214268dec0a83075f46e4807f51604ab60301ba`; package `afac24ec…`, fills `f68f87d0…`. (Before the fold: `06d97b5b…`, never shipped.)
- browser `.bin` = `build_core.py` `.bin`: `7fd35fe0fa580979326ef9af19c21659699bd22b01d41ddf7770aeb36106f7c1` (843,588 bytes); bootloader copy identical, `.bin` and `.syx` carry the same OS, every change inside a declared site.
- 843,572 of 851,712 container bytes, 8,140 free (+5,680 since 0.8.3); MAIN 1,358,847 of 1,572,864.
- Relinked: USB Audio 0.4.2-experimental `c2597a32…` (unchanged; both reconstruction records re-pin `modwerk_events.h`, image and spans the same), Recorder Loop Fix 0.1.0 `48af2c34…` (the arena moved). Every other published package rebuilds identical (`octatrack-module-packages.py --check`).

## Tests

Not tested on a unit. The update name needs a look at the bootloader screen during a flash; the other changes need the base test procedure on this exact build, the 2 MiB pool and program areas included (neither has run on a unit).
