# Octatrack base 0.8.4: on top of 0.8.3, with the Quadraverb base side and the open base work, 27-28 November 2026

Source: `base/octatrack-next` after base 0.8.3, plus these commits, each its own:

- `233d8c37d`: a module machine pasted onto a track, or brought back by a Part reload, goes through the pick's frame-line check (`modwerk_status_pick_busy`).
- `41b3a7e66`: MODULES answers STOP PLAYBACK FIRST for a transport that is not rewound, and CARD BUSY: TRY AGAIN when the card gate is closed on a stopped unit, instead of BUSY: TRY AGAIN for both.
- `a960a7410`: the start's own late frame entries no longer make a LATE incident at second 0.
- `407f8beb5`: a DETAIL record follows each CPU or LATE record (which check refused a pick, and the kinds of late entries).
- `3abc84fa1`: comment only (the third stock USB DISK send spin, covered since 0.8.3).
- `020662873`: the base and its packages build with Modwerk's own Python builder (`sdk/firmware_builder`). The base's code is unchanged byte for byte; its identity changes because its build inputs name the builder's files.
- `739fd4e64`: the ELEK update name the resident bootloader shows while flashing is MODWERK (right-justified in its ten cells), in the base build and in every set the site builds.
- `5d93a3710` (owner, 28 November 2026): the base build's name is MW and its released version, MW 0.8.4, from `base-versions.json` (`build_core.py update_name`, `octatrack-base.ts bootName`; MODWERK for a base without a released version). It sits in the file's header, outside the base's identity. Module sets the site builds keep MODWERK (`FIRMWARE_VERSION`).

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

## Rebuilt with Modwerk's builder, 28 November 2026

- base 0.8.4 `fe4e7623ee2dde7a6486f4699e5ecfe7ac4c7f43419abe80ba7de5ca2776d8a6`; package `f250ddf6…`, fills `86d01ea6…` (unchanged). Against `06d97b5b` the package differs only in `identity.c`'s hash and the identity string in `.run`.
- browser `.bin` = `build_core.py` `.bin`: `6aac87ccf481b1d55ac442a381f0a296865033e8d02b4d42a83d55dec459dd84` (838,984 bytes); 838,968 of 851,712 container bytes, 12,744 free.
- USB Audio 0.4.2-experimental relinked to the same `c2597a32…`.

## The core's sources in the repository, 28 November 2026

The Octatrack core's boot copier, hook bus and gate (`sdk/machines/octatrack/elekloader/core-ot/`: `core-ot.s`, `bus.s`, `gate.s` and their `mod.json`) are now the base's own files, and no build reads an upstream checkout. Rebuilt: base 0.8.4 `35af17c249b60a7f6c4888deb4f0b43bf17de7216c221a477a96d443dbabc007`, package `36eb5648…`; against `fe4e7623` only the identity differs (`identity.c`'s hash and the identity string in `.run`). Browser `.bin` = `build_core.py` `.bin`: `41827d72a3d0504c15411458ea004db9d0e13e2929d9e03d2d43ffa79dfa2fa1` (838,976 bytes); 838,960 of 851,712 container bytes, 12,752 free. USB Audio 0.4.2 unchanged (`c2597a32…`).

## The open base work, folded 28 November 2026

Owner, 28 November 2026: "merge everything that is still open for the base in the cumulative draft". Each branch merged with its authors' commits, in the owner's order of 27 November 2026 (#2261 at 63, 64 kept for #2271, `ot_dsp_effects` at 65):

- #2261, jonathanwardle1992-beep: the `ot_lfo_pmtr_dest` table at hook index 63 (`lfo_pmtr_dest.c`/`.s`): contributed audio LFO PMTR destinations past stock's 30. It owns the PMTR formatter, the count word, the SETUP encoder's beq and the destination store; the destination `lea` stays unclaimed while FM Synth patches beside it. No module contributes yet (unused-hooks.json).
- Index 64: the placeholder table `ot_reserved_64` (no sites, no reader, unused-hooks.json). #2271 (jonathanwardle1992-beep, `ev_audio_step` at `0x400a2d6a`) was merged and reverted (`c07f68d23`, owner, 28 November 2026): the published Play Modes 0.2.1 patches that site, so a base owning it refuses Play Modes, and three `test_runtime_loader` cases failed. It comes in a later base with a Play Modes release its author agrees to, and replaces the placeholder in place.
- The Quadraverb base side (`work/base-stream-release`, repeat98): everything above from `base/octatrack-pool-raise` and `work/base-stream-release`; `ot_dsp_effects` moves from 63 to 65.
- #2286, repeat98: the Part budget charges a machine its measured price (`cpu_price()`, `PRICE_BIT`), written against 0.8.3 and never in the draft before. Ran on the owner's MKII on a development twin of its branch (`145bb375`), not on this build.
- #2359, offtheheezystudio: nonpersistent settings action rows (ABI 4 in `ot_settings`, `SETTINGS_ACTIONS.md`). No module contributes one yet.

Re-pinned for the new inputs, each image unchanged: USB Audio's two reconstruction records (`modwerk_events.h`), the candidate recipes (`sdk/runtime/loader/build.py`).

Rebuilt after the revert, a merge of `main` (#2346, Modwerk's own browser builder), the MW 0.8.4 boot name and Modwerk's own core: base 0.8.4 `d4f4f8a19ba067289d78bc53314483ee6d9d2b9a049c13e51d7153194df182b4`, package `b34ac7bd…`, fills `9c79d54b…`. Browser `.bin` = `build_core.py` `.bin`: `22884562be84baba10bf1f62dbc3e74e7a1af49bba63fed20dde2fe4b8f03141` (846,964 bytes, named MW 0.8.4); bootloader copy identical, `.bin` and `.syx` carry the same OS, every change inside a declared site. 846,948 of 851,712 container bytes, 4,764 free (+9,056 since 0.8.3); MAIN 1,361,779 of 1,572,864. (`3a28f754…`, `9e2002f1…` and `40f10d4e…` on the way did not ship.) The base-bound packages (Sidechain, Output Matrix, CC Map, Recorder Loop Fix, Analog BD) keep `ab3387d60`'s bytes and USB Audio 0.4.2 its `c2597a32…`; only their `requiredBase` moves.

## Modwerk's own core, merged 28 November 2026

`ab3387d60` on `base/octatrack-next` replaces the vendored `elekloader/core-ot/` with Modwerk's own core, `elekloader/core/` (`core.s`, `bus.s`, `drawgate.s`, `mod.json`), whose MW_* switches `build_core.py` sets instead of patching its text; the build's `VERSION` is `1.0.0-modwerk-dev.1`. Merged into the fold, which keeps the stream channel, `fx-ids.json`, the 2 MiB pool and the MW 0.8.4 name. Analog BD's recipe is `ab3387d60`'s (`0b8421fe…`) and applies to the fold's base unchanged.

## Tests

Not tested on a unit. The update name (MW 0.8.4 for the base, MODWERK for a set) needs a look at the bootloader screen during a flash; the other changes need the base test procedure on this exact build, the 2 MiB pool and program areas included (neither has run on a unit).

The stream channel beside USB AUDIO IN, host tests only (27 November 2026): `sdk/tests/test_stream_probe.py` runs the built state 7 on a small ColdFire model for USB AUDIO IN's 3 or 5 minor loops, the channel's 1 to 29 and the loader's packet: the order USB AUDIO IN, channel, packet; one ask of each a frame; core 0 only; d2-d7/a2-a6 and sp kept; at most 58 scheduler instructions a visit and one visit more a frame for the channel's block; with no lane open the same hardware writes as USB AUDIO IN's scheduler alone; the recovery's split give-up. `test_dsp_programs.py` and `test_usb_audio_input.py` pass unchanged. The model is not the chip: the frame time of USB AUDIO IN's 160 halfwords plus a plate's 352 plus a packet, and the late frame entries it may cause, show only on a unit. For that run: development twin `twin8-release-stream` (configuration `c715700e…`, MAIN.raw `8215cbb9…`, the beta flags without controller rows plus `--dev`), Quadraverb on a track 5-8 with USB AUDIO IN set to ABCD and a host streaming, then on a track 1-4 (core 1's lanes have not run beside USB AUDIO IN).

The fold, host tests only (28 November 2026): `test_machine_events.py` (the LFO PMTR reader and `cpu_price()` on the host, the ports' glue), `test_hook_coverage.py`, `test_runtime_loader.py`, `test_settings.py` and #2359's `sdk/tests/settings_actions/check_actions.py`, `test_dsp_programs.py`, `test_stream_probe.py`, `test_base_bound.py`, `test_usb_audio_input.py`, `test_standalone_recipe_pins.py`, `test_upstream_tools.py`, and the site's `set-package`, `module-set`, `module-set-memory`, `octatrack-link`, `BasePage` and `resource-indicators` tests. For the unit run: development twin `twin9-0.8.4-fold` (the beta flags without controller rows plus `--dev`; its identity is in `twin9-0.8.4-fold.log` beside it).
