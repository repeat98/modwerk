# VECTOR tests and measurements

## 0.2.5 over USB on a MKII (SRC SETUP page 2, #972)

Version `0.2.5-experimental` changes only the USB package: its `ot_machines` record is a `struct modwerk_machine_setup` (SETUP_PAGE) naming the card build's own `st_setup_page` and `st_setup_knob`, and the package's source variant drops `st_setup_page`'s test for SRC SETUP's cursor on row 5. The card source and every result in the sections below are 0.2.4's.

Hardware, observed on the owner's Octatrack MKII by the coordinating session over USB with `device.mjs`, 27 October 2026:

- Base: a development twin of the release base, identity `e6e75d75546d10396cfbe5c01fc9c731d76463414dd02c3833d6f50181e7b4f4` (MAIN SHA-256 `a753ddf67b0fe64e3742b4c89ecf141071eb30757b170173215e92b1b4794d24`): the `b1b2ca58` beta-base build plus `--dev`, RAM-booted. It was the development twin of the release base, not `b1b2ca58` itself, and not the base this pull request commits.
- Packages: POLY8 0.3.1, Analog BD 0.1.5 rebuilt for the twin, and VECTOR 0.2.5 (package SHA-256 `45c962ca3a202ac697e3d33d97e4b3b94052706a390189e5baf923fa829de577`), all accepted. Inventory: POLY8, Analog BD, VECTOR.
- T1 (STATIC): FUNC+SRC opens SRC SETUP. The list scrolls to POLY8, ANALOG BD and VECTOR.
- Cursor on VECTOR without YES, the track still STATIC: the stock STATIC setup (LOOP SLIC LEN RATE TSTR TSNS) shows. Cursor on ANALOG BD shows Analog BD's page (ACCNT LPF LOW HIGH).
- YES on VECTOR opens MACHINE:VECTOR with 001 STATIC / 002 FLEX. YES on STATIC, then the slot list, then NO. The main SRC page shows SRC▸VECTOR with TYPE DENS ROOT SCAL GATE ACNT.
- FUNC+SRC again: VECTOR's page shows SEED 1, SPAN 12, OFST 0, ROT 0, RPT OFF, DIR FWD.
- Encoders A+3, B+2, C+1, D+1, E+2, F+1 give SEED 4, SPAN 12 (already at its maximum), OFST 1, ROT 1, RPT 2, DIR REV. Turning them back gives SEED 1, SPAN 10, OFST 0, ROT 0, RPT OFF, DIR FWD; B+2 then gives SPAN 12.
- T2 (STATIC): SRC SETUP shows the stock STATIC setup. T1 was set back to STATIC afterwards.
- Not tested: the FLEX, THRU and PICKUP setups; a POLY8 track's or an Analog BD track's SRC SETUP; VECTOR 0.2.4 on the new base; whether the SRC main page regenerates the phrase; saving and reloading; a power cycle with VECTOR kept; the non-dev base `b1b2ca58` itself; listening.

Emulator (ot_emu, MKII panel, the modules installed over emulated USB): on the release base, VECTOR 0.2.4 still shows the stock STATIC setup there and 0.2.5 shows its page 2; encoder A moves SEED and encoder E moves RPT. Emulator results only.

Version: `0.2.4-experimental`, 9 October 2026. Source SHA-256 `1255e99133cbd8d6d2587c95f93462ea80fccbd169462a2acb02aedbd346cbd3`; tested MAIN SHA-256 `cabcc2967a23a0ef719a38de444aec1b68662c12bb9057093d475b89424d0026`. Native build base is `d1e38bcde2d37ac62d45e60655c0e7137750bf97` plus the authored fix identified by that source fingerprint. Firmware and raw derived data stay private.

## Regression and persistence

[The sanitized report](../../../../docs/vector-reboot-2026-10-09.json) records the reproduced 0.2.3 whole-bank reset and stopped step counters, isolated packed-SPAN control and fixed exact-image result. Native Part validation interprets packed high-bit settings in unused NEIGHBOR slots as negative stock parameters. The adapter temporarily clears only those twelve bytes on valid S2/1 or S2/2 Flex/Static tracks, calls the actual stock validator, restores them and retains its return value and unrelated corrections.

The firmware-free ASan/UBSan regression covers all 256 marked-track masks, both formats/backing kinds, unsupported formats/machines, stock corrections/return values, selected-machine rejection and canaries. Run `python3 -B modules/vector/verify_native.py` inside the pinned isolated GCC 16.2.0 toolchain. The generator's 244,800 primary and 29,772 secondary cases and writer checks also pass; authored C/hooks reproduce control.s with only zero stock-replay placeholders. No firmware is a compiler input.

With T1/T5 at distinct TYPE/SEED settings, native Part save/reload and panel-driven MKII project SAVE/RELOAD restore saved settings after later edits. The saved card and 26 working/stored file pairs match. There were zero card-write errors over 43,556 written sectors. A fresh saved-card project load passes separately from an MKI battery-RAM-only restart that performs no explicit project load. Both instances and other tracks survive; PLAY advances steps 3/6/9. The same original failing battery state also passes with VECTOR alone. These are control-state emulator results with a stand-in DSP; physical reboot and audible playback remain unverified. Distinct sample audio and instance reset/replacement were not exercised.

## Current UI checks

`media/control-walk.txt` records the fresh native MKII panel walk. `media/capture.json` binds the emulator, source, image and actual LCD captures. All twelve SRC controls were edited; the other seven VECTOR records were preserved. YES generates, LEVEL accesses stock sample editing, double-tap SRC shows secondary controls and double-tap TRACK opens pool choice. Both stock pool lists were browsed without changing saved VECTOR settings, and transport advances. Each of the eight fresh monochrome captures was visually inspected. Older JSONL/core/pool records remain historical 0.2.3 evidence; stock file loading/sample confirmation was not rerun in this narrower walk.

## Instruction and conditional cycle model

The same synthetic ColdFire probe was rebound to this image's generated symbols in a private harness and rerun over 3,840 generator/writer cases (128 seeds, TYPE endpoints, five scales and lengths 1/16/64). Maxima: generator 65,099 executed instructions / 968 stack bytes; writer 25,380 / 40; eight native commits peak at 472,500 / 1,048. All 256 Part-validation masks return and restore their settings; the maximum is 64,241 executed instructions including the real stock validator and 252 observed stack bytes. These are instruction counts, not chip timing or audio load measurements.

The retained generation envelope charges 100,000 instructions for generation (64 steps, 25 pitches, at most 2,016 shifts), 40,000 for writing (64 x 32 locks), 50,000 for staging/publication scans, 10,000 for adapters, 371,000 for stock global lock-index rebuilding, 100,000 for native publication and 10,000 for dirty/event bookkeeping: 681,000 rounded to 700,000 per commit. At the conditional 32 cycles/instruction allowance this is 22,400,000 cycles/event; eight commits plus 6,000,000 stock UI/scheduling reserve are 185,200,000 against 264,000,000 cycles for one full burst per second. This is not measured silicon timing, a sustained knob-rate guarantee or audio headroom.

The new validator adds two bounded 8-track x 12-byte loops, signature tests and one stock call. An 8,192-instruction adapter allowance bounds this added work (262,144 modeled cycles/Part at the same assumed price). Even eight complete validation calls at the observed all-track maximum are below the declared generation-burst envelope. Validation adds no per-sample DSP work. Memory stalls, interrupts and native/audio contention still require hardware measurement; chip wall-clock cycles remain null.

## Memory accounting

For the tested five-module profile, the complete shared arena is 10,586,112 bytes: 10,487,808 module arena plus 98,304 mandatory logger reserve. Its 90,780-byte linked runtime and packed staging fit within that arena and are counted once. VECTOR's authored allocated sections are 13,000 text + 398 rodata + 3,368 data = 16,766 bytes, no BSS or heap. The full tested-profile flash append is 18,153 bytes. Placement gaps and all companion/logger state lie inside the counted arena.

Maximum observed native commit stack is 1,048 bytes; validation is 252. The 1,216-byte added UI stack ceiling includes the existing 168-byte outer-call allowance and covers the smaller new adapter (96 saved bytes plus compiler/callee frames). There is no recursion. Borrowed native UI capacity is 2,132 bytes (56-byte window, 20-byte descriptor, two 1,024-byte rasters and 8-byte callback state), plus 128 lock-index bytes. Per track, sixteen 2,330-byte pattern records in live bank/SRAM are 74,560 bytes; twelve settings bytes across four Parts/two mirrors are 96: 74,656 per track, eight maximum. Exact total capacity accounting is 11,204,989 bytes, including the complete shared reserve and borrowed stock capacities. It is not incremental VECTOR RAM use. Hardware canaries remain unmeasured.

## Browser/native parity and packaging

The current 110-profile VECTOR coverage matrix has 46 matching module-owned builds outside existing platform/logger writes and 64 matching refusals, zero mismatches. The changed original OS is refused. The source-only package build and complete importer inventory pass; `sdk/native-comparisons/vector.json` binds the current native source. Private VECT349A01 ELUP packaging round-trips to the exact tested MAIN; update SHA-256 `a2bc9e1892c5bda40083c61abe19c73c9ff64fd73ff9b88d975a2c0f5b456130`. The standard common worker and deployed download are verified separately during release completion.

## Owner exception and remaining limits

On 9 October 2026 the owner stated: "Approve release and closure with hardware reboot/audio unverified" after receiving the exact 0.2.4 private image and source patch. `sdk/vector-build-approval.json` binds this separate current-build-hardware exception to the source/image above. `hardwareStatus` stays `untested`; no physical reboot, audible playback, chip timing, maximum audio stress or hardware canary pass is claimed. The 0.2.3 approval remains historical and is not reused. Already reset projects need a known-good backup. The issue closure must name these limits and explain how to reopen.

After main advanced to `32e27effdb32d5aaa49ee350daef95bc4c803003` (Analog BD 0.1.4), all non-VECTOR package payloads/recipes remain identical to that base. VECTOR native source is unchanged. The rebuilt reported-profile MAIN is `fc8c24c97ffd5ae7b613c8fcff10caf2f9ce62d03ca4014c2a9c14262f628125`; its common-worker saved update is 466764 bytes, SHA-256 `3e98ee1f5a1a71b674b682bef496b6fbe73e6df8a67d4b049ce07abfb3b7177a`. Both reported/solo images preserve the original failing battery state with advancing PLAY; the reported profile also restores the saved battery state. Global inventory/logger provenance changes the image identity, so this result is recorded separately from the qualified VECT349A01 private image.

Source and evidence links now name fix commit `16c04ae4d713376bd6bb119951899c33fa2e0ae9`. All eleven authored package payloads, including VECTOR, remain byte-identical after that metadata pin. The source-pinned worker saves 466756 bytes, SHA-256 `198f9a4a8b2529e43b60ba9f16fbc4ba9b84afcfc7ae53487c2009c2c234b88e`, MAIN `e2fa4176afe4d7f8b1cf0f5eed456d338d47acb212973e99d7bcc476c75f9ce3`. Global logger identity changes are kept separate from native qualification.
