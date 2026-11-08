# VECTOR tests and measurements

## SRC SETUP page 2 on VECTOR's own row (card builds, #1119; prepared as 0.2.6, released in 0.3.0)

Report #1119 (also #842/#843): on a card build with POLY8, a double tap on SRC on a VECTOR track showed the stock Flex/Static setup (TSTR AUTO) instead of SEED/SPAN. Beside POLY8, VECTOR is machine row 6 or 7; POLY8's shared SRC SETUP hooks replace VECTOR's and never asked VECTOR, and `st_setup_page` itself also wanted SRC SETUP's cursor (0x460d5c30) on row 5. 0.2.6 drops that test: its callers already ask on VECTOR's row (row 5 in `hooks.s` alone, the base's row over USB, POLY8's row with POLY8 0.3.3). The USB adapter dropped the same test since 0.2.5, so `vector_runtime.py` no longer rewrites it; the package's control unit source is byte-identical to 0.2.5's and the 0.2.5 USB package stays published (`lagsBehind`). The 0.2.5 hardware report above that run covers those bytes.

Emulator, 1 November 2026 (`ot_emu` built from upstream octabam, MKII panel, DSP on, empty scratch card; card images composed by the site's builder from packages built in the isolated toolchain; `scripts/capture-module-ui.py` with 50 ms keys: FUNC+SRC, DOWN to VECTOR, YES, YES on STATIC, NO, SRC, FUNC+SRC, encoder A +3, encoder E +2):

| Image | Result |
| --- | --- |
| main (VECTOR 0.2.5, POLY8 0.3.2) + FM Synth | reproduces the report: SRC shows SRC▸VECTOR with TYPE…ACNT, SRC SETUP shows LOOP SLIC LEN RATE TSTR(AUTO) TSNS |
| VECTOR 0.2.6 + POLY8 0.3.3 + FM Synth | SRC SETUP shows SEED 1, SPAN 12, OFST 0, ROT 0, RPT OFF, DIR FWD; encoder A gives SEED 4, encoder E RPT 2; cursor on POLY8 shows the stock setup |
| VECTOR 0.2.6 + POLY8 0.3.2 + FM Synth | not run; POLY8 0.3.2's shared hooks never call `st_setup_page`, so the stock setup stays as on main (code read) |
| VECTOR alone, 0.2.5 and 0.2.6 | all eight screens of the plan pixel-identical; page 2 on row 5, encoders A and E as above |

`verify_native.py` passes in the pinned toolchain (sanitizer tests, `control.s` reproduces). Not tested: a unit, MKI, saving and reloading, a power cycle, listening.

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

## MIDI generator on the unit

0.3.0 on the owner's MKII, 21 October 2026: development twins of the Modwerk base built from this branch (`build_core.py --dsp-loader --usb-midi --site-events --table-owners … --dev`), RAM-booted, VECTOR installed over USB as a runtime package (`try`), a disposable project (LIVE/PROJECT 261019), bank A, Part 1, MIDI track 1. Steps were sent with `scripts/device-send.py`; screens were read from `png:` captures; Part and pattern bytes with `mem:`. Not a card (non-USB) build on hardware: the card build was checked by octabam's native builder only (`module:verify`).

| What | Result |
|---|---|
| No generator installed, MIDI mode, double-tap TRACK | nothing happens, as stock |
| VECTOR installed, double-tap T1 or SRC | MIDI NOTE SETUP opens with OFF and VECTOR in its left half; CHAN, BANK, PROG and SBNK unchanged; UP/DOWN move the highlight |
| YES on VECTOR | the arp step mask reads `4d56` ('M', 'V'); the arp note bytes hold the twelve defaults (value - 64) and the mark; MODE OFF |
| ARP page, FUNC+AMP, NO | TYPE, DENS, ROOT, SCAL, GATE, ACNT with their values; FUNC+AMP SEED, SPAN, OFST, ROT, RPT, DIR; NO back |
| DENS +2, then YES | 13 notes in 16 steps with NOTE/VEL/LEN locks (C minor around C3, VEL 100/81); YES gives seed 2 and a new phrase |
| PLAY with CHAN 1, MIDI recorded over USB (`midimon`) | the phrase as note-ons and note-offs on channel 1, the 16-step phrase repeating every 2 s at 120 BPM, accents and lengths as written |
| VECTOR removed on its own page | stock's ARP page and ARP SETUP return, no crash; reinstalled, the VECTOR page returns |
| MODE turned on while VECTOR was away, then VECTOR installed | MODE back to OFF (and a MODE 6 left from before: OFF on install) |
| Crash record during all of the above | unchanged (record 12, older than this work) |

Layout A (the owner's choice of 24 October 2026: VECTOR on SRC and AMP, LFO, FX1 and FX2 stock's), on the owner's MKII, 24 October 2026: a development twin of the base built from this branch merged with `main` (base `4fd515ff…`), RAM-booted, VECTOR installed with `try`, the same disposable project (bank A, Part 1, pattern 16, MIDI track 1, CHAN 1, 132 BPM). MIDI recorded over USB with `midimon`.

| What | Result |
|---|---|
| No generator installed, double-tap T1 in MIDI mode | nothing happens, as stock |
| VECTOR installed on a track still holding 21 October's layout | SRC shows TYPE 11, DENS 11, ROOT C, SCAL MIN, OCT C3, SEED 2; OFF then VECTOR again puts the new defaults in the arp note bytes (mark `V`, PROB and HUMN 0, byte 4 unused), NOTE 48, VEL 100, LEN 6, NOT2-4 64 |
| SRC, AMP, FUNC+AMP, LFO, FX1 | SRC: TYPE DENS ROOT SCAL OCT SEED; AMP: VEL ACNT GATE SPAN OFST RPT; FUNC+AMP: ROT DIR PROB HUMN and two empty slots; LFO and FX1 stock's, and LFO's SPD1 turns stock's value (32, 33, 32) |
| OCT +1, ROOT +2 | NOTE 48 to 62 (D4); the phrase's NOTE locks move into D (step 1: 36 to 50) |
| PROB +5 | stock's label 91%; every note off the beat gets condition 25, the notes on the beat none |
| PROB 21 (1%), PLAY 12 s | 27 note-ons, all on steps 1, 5, 9 and 13 at VEL 100; none of the 46 notes off the beat played |
| HUMN 23, PLAY 8 s | the 11 notes of each bar move by their written offsets: all 50 note-ons within 1.0 ms (mean 0.3 ms) of grid + offset x 1/24 step; a negative offset on the first step does not sound before PLAY, as stock |
| YES; VEL -20; GATE +4 | SEED 1 to 2 and a new phrase; the track's VEL 100 to 80 and LEN 6 to 10; strong notes VEL 80, others 64, LEN locks 5 to 10 |
| Grid recording, hold TRIG 1 on SRC | stock's NOTE page with the step's locks (D4, 80, 7); turning NOTE locks D#4; letting go shows VECTOR's page again |
| OFF; VECTOR again; module removed | stock's NOTE (D4, 80, 10) and ARP (MODE OFF) pages, arp step mask `ffff`; VECTOR again: its defaults, NOTE to C4; removed: stock's pages, nothing installed |
| Crash record | unchanged (record 12) |

Cost with the 21 October method (pattern length 64, DENS 16, every step a note, PLAY, 40 turns of TYPE): 0.52 ms a turn on average, 0.69 ms the longest (0.51 and 0.66 ms on 21 October; the trig words for PROB and HUMN are new). The base's generator code took 10.5-11.9 µs a UI tick on VECTOR's page while playing. The MIDI notes kept their grid while turning: 59 note-ons 113.0-114.0 ms apart (113.6 ms at 132 BPM). The longest time between audio frames was 423-425 µs while turning and 422-424 µs playing without a turn, so this base's normal is a little higher than 21 October's (406-417 µs) and the turns add nothing measurable.

Cost, with the base's development profile (`modwerk_cost[24]`-`[27]`, DTIM3 at 132 MHz, read over `mem` 5 s apart; `cost.py` in the session's private tools):

| State | Base's MIDI generator code per UI tick (61 a second) |
|---|---|
| No generator installed | 2.2-2.4 µs |
| VECTOR installed, audio mode | 4.1-4.2 µs |
| MIDI mode: NOTE page, VECTOR page, NOTE SETUP with the list, playing | 7.3-10.2 µs |

A control turn rewrites the phrase on the UI task. Worst case measured: pattern length 64, DENS 16 (every step a note), PLAY running, 40 turns of TYPE and ACNT in 4 s, MIDI recorded throughout:

| Build | Mean | Longest |
|---|---|---|
| Stock's lock-index rebuild, record copied in and out | 3.92 ms | 4.24 ms |
| Own track's lock-index bit | 1.76 ms | 1.95 ms |
| Plus the scale's pitches once a phrase | 1.29 ms | 1.47 ms |
| Plus the record written in place (0.3.0) | 0.51 ms | 0.66 ms |

A temporary probe (not shipped) split the 1.3 ms build by stage: copying the record in 331 µs, the phrase 268 µs, writing it 178 µs, committing and mirroring 434 µs, saving and publishing 31 µs. The longest time between audio frames stayed 406-417 µs (normal 380-420) through every burst, and the recorded MIDI kept its grid: 96 note-ons 124-126 ms apart, every two-step span 249-251 ms. The audio track's `generate_track` got the same lock-index change; its other costs are as in 0.2.4. VECTOR's own audio UI tick reads the battery-backed Part and track numbers once a tick (it read them about 20 times): with VECTOR installed the machine tick fell from about 50 to 41 µs.

The hoisted scale lookup in `engine.c` gives the same phrases as 0.2.4 over 18,144,000 parameter sets (a throwaway host comparison of both engines), and `test_engine.c` passes. `sdk/tests/test_machine_events.py` checks the base's registry on the host (`test_midi_generators.c`), the package glue and the port's sources.

Card builds and .bss, 8 November 2026 (found by `machine_composition_tests`, not on a unit): the base's generator registry, which a card build links into VECTOR, has statics without an initialiser, and the compiler put them (144 bytes) in .bss. A card unit's .bss is never loaded or zeroed (`tools/remix/platform_build.py`), so on a card `mg_active` and the list's cursor would have started as whatever the boot left. `prepare.py` now puts them in .data as zeros and stops if any .bss is left; the code is unchanged (22,314 text bytes), .data grows by 144. Over USB the package was not affected (the loader zeroes a package's .bss, `sdk/runtime/loader/loader.c`), so the October unit runs stand.

Not tested: a card build on the unit (layout A included); a physical power cycle with a VECTOR MIDI track (RAM boots kept it: the battery-backed bank restore and the Part validator pass); a project save and reload; scenes and LFOs on a VECTOR MIDI track; MKI. Two RAM boots of development twins out of about fifteen did not come back on USB (one stall record: frames stopped 41 s after a boot with no module installed); a power cycle recovered both, and the next boot of the same image worked. It matches the RAM-boot trap of 19 October 2026 and was not reproduced.

## Owner exception and remaining limits

On 9 October 2026 the owner stated: "Approve release and closure with hardware reboot/audio unverified" after receiving the exact 0.2.4 private image and source patch. `sdk/vector-build-approval.json` binds this separate current-build-hardware exception to the source/image above. `hardwareStatus` stays `untested`; no physical reboot, audible playback, chip timing, maximum audio stress or hardware canary pass is claimed. The 0.2.3 approval remains historical and is not reused. Already reset projects need a known-good backup. The issue closure must name these limits and explain how to reopen.

After main advanced to `32e27effdb32d5aaa49ee350daef95bc4c803003` (Analog BD 0.1.4), all non-VECTOR package payloads/recipes remain identical to that base. VECTOR native source is unchanged. The rebuilt reported-profile MAIN is `fc8c24c97ffd5ae7b613c8fcff10caf2f9ce62d03ca4014c2a9c14262f628125`; its common-worker saved update is 466764 bytes, SHA-256 `3e98ee1f5a1a71b674b682bef496b6fbe73e6df8a67d4b049ce07abfb3b7177a`. Both reported/solo images preserve the original failing battery state with advancing PLAY; the reported profile also restores the saved battery state. Global inventory/logger provenance changes the image identity, so this result is recorded separately from the qualified VECT349A01 private image.

Source and evidence links now name fix commit `16c04ae4d713376bd6bb119951899c33fa2e0ae9`. All eleven authored package payloads, including VECTOR, remain byte-identical after that metadata pin. The source-pinned worker saves 466756 bytes, SHA-256 `198f9a4a8b2529e43b60ba9f16fbc4ba9b84afcfc7ae53487c2009c2c234b88e`, MAIN `e2fa4176afe4d7f8b1cf0f5eed456d338d47acb212973e99d7bcc476c75f9ce3`. Global logger identity changes are kept separate from native qualification.
