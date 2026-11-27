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
- `f57fd4afa`, `28cb5deb9`, `5ecfbd2f4`, `68289e35f`, `a2410014c`: the stream channel and STREAM FULL.

Then, on `work/base-stream-release` (owner, 27 November 2026: "ok to all"):

- `411b6fa4f`, `7c65910d6`: the stream channel is in this base, beside USB AUDIO IN (`build_core.py --stream-channel`, in `octatrack-base.mjs`'s beta set). State 7 sends USB AUDIO IN's block first, as before, then the channel's (`X:$x1be0`, up to 29 minor loops), then the loader's packet, each from the completion of the one before. The channel has no frame-head code: `P:$88` is USB AUDIO IN's receiver alone, the same words as without the channel. dsp.c's recovery gives USB AUDIO IN up for its own phases (3, 4) and the channel for its (5, 6). The probes stay development-only (`stream_probe.py`).
- `cbe1fb336`, `0e10eb676`: the runtime builder takes a DSP effect id up to 127, bounded by `elekloader/fx-ids.json`, the one file that sets the base's 128 effect ids (build_core.py reads it too). Card images (`build_bus.py`) keep stock's 32.

## Builds

Regenerated with `npm run octatrack:base -- --stock OCTATRACK_OS1.40C.bin --beta --write`, then `node scripts/base-size.mjs --write` and `npm run octatrack:module-packages -- --base-only`:

- base 0.8.4 `22db08216a16f6368c45b7b261d2793b33c307a77f83c2a563f462f768a05c6f`; package `ba3a66db…`, fills `384c4fce…`. (Before the stream channel: `fcbf5393…`; before the fold: `06d97b5b…`; neither shipped.)
- browser `.bin` = `build_core.py` `.bin`: `6427ee0a6d9c85cd491c047acc7896de4b984b389d9654b6733cb5a73712ce7f` (845,980 bytes); bootloader copy identical, `.bin` and `.syx` carry the same OS, every change inside a declared site.
- 845,964 of 851,712 container bytes, 5,748 free (+8,072 since 0.8.3; the channel 2,392); MAIN 1,360,924 of 1,572,864.
- Relinked: USB Audio 0.4.2-experimental `c2597a32…` (unchanged; both reconstruction records re-pin `modwerk_events.h`, image and spans the same), Recorder Loop Fix 0.1.0 `f55683b7…` (the arena moved again with the channel; `48af2c34…` before it). Every other published package rebuilds identical (`octatrack-module-packages.py --check`).

## Tests

Not tested on a unit. The update name needs a look at the bootloader screen during a flash; the other changes need the base test procedure on this exact build, the 2 MiB pool and program areas included (neither has run on a unit).

The stream channel beside USB AUDIO IN, host tests only (27 November 2026): `sdk/tests/test_stream_probe.py` runs the built state 7 on a small ColdFire model for USB AUDIO IN's 3 or 5 minor loops, the channel's 1 to 29 and the loader's packet: the order USB AUDIO IN, channel, packet; one ask of each a frame; core 0 only; d2-d7/a2-a6 and sp kept; at most 58 scheduler instructions a visit and one visit more a frame for the channel's block; with no lane open the same hardware writes as USB AUDIO IN's scheduler alone; the recovery's split give-up. `test_dsp_programs.py` and `test_usb_audio_input.py` pass unchanged. The model is not the chip: the frame time of USB AUDIO IN's 160 halfwords plus a plate's 352 plus a packet, and the late frame entries it may cause, show only on a unit. For that run: development twin `twin8-release-stream` (configuration `c715700e…`, MAIN.raw `8215cbb9…`, the beta flags without controller rows plus `--dev`), Quadraverb on a track 5-8 with USB AUDIO IN set to ABCD and a host streaming, then on a track 1-4 (core 1's lanes have not run beside USB AUDIO IN).
