# Micro Timing per track testing

## Publication package (0.1.1-experimental)

Catalogue USB package `public/octatrack-modules/micro-timing/0.1.1-experimental.mwrm`:
ABI 7, 2926 B, module `36200ffc`, sha256
`8958a66f2942e4e0c5692c0cf075bab3c07e4f3347d716ac57405b1792cb6c47`, title
**Micro Timing**. Keep Accept on 18 November 2026 used
`f5b9682175f295875dbecb66a18524c205ba526d88e9bd7dc9cdd7d270d01292`
(title `Micro Timing pe`). The two packages differ only in the 16-byte title
field; ColdFire image sha256
`08b92351ea2097a9b26578eeebe72968b22df25c650f2a60fbcdd816bc103fbc` and
module id match. Upstream no longer ships `npm run module:verify` (card
composer verify removed); this module is listed `usbOnly` like Butter Fingers
and Screen Off — USB package + native source accounting, not a card
`module-build.json` row.

## Commands and exact revision

Stock guards for the TRACK TRIG EDIT sites in `manifest.py` match original OS 1.40C (`section_3_MAIN_OS.bin` SHA-256 `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`) as hashed locally from the developer's own extract. Those bytes are not in this folder. `npm run module:verify` has not been run. A USB package of commit `dbc0652b4` was built on 18 November 2026 and is not in this folder.

## `npm run test:procedure -- micro-timing` (package `8958a66f…`)

Owner ask on #2193 (26 November 2026): run the published package
`8958a66f2942e4e0c5692c0cf075bab3c07e4f3347d716ac57405b1792cb6c47` on a
unit, check LEVEL on an audio track and on a MIDI track, and record whether
the development-twin rollback refusal returns with TRACK TRIG EDIT open and
with it closed.

**Ran 28 November 2026 (Europe/London), tip `f88922eff471`**, package
`8958a66f…`, MKII OS 1.40C. Steps 1–9 and rollbacks recorded first; LEVEL
rows below were **re-dug the same day** on tip after that tip (no PC; twin
stayed on `dce64a781f8581b4`). No Accept / `device_keep`.

| Step | Result |
| --- | --- |
| 1–4 software / compat / build / cost-model | **PASS** (`PYTHONUTF8=1` on Windows) |
| 5 emulator | not run (`--no-emulator`) |
| 6 unit-read | **PASS** (C02 Part 1, working = saved; empty inventory) |
| 7 `device:test` | **PASS** (Windows trial rollback via recover after SIGINT unsupported) |
| 8 soak 120 s | **PASS** |
| 9 `device:price` | **PASS** on twin `dce64a781f8581b4` (`--dev` + guard): at rest frame **+0**, cpu **+0**; wrote `evidence/cpu-price.json`. Staged via step base `4e9a87ea…` (RAM) then guard twin (MAIN 1338730 > prior twin’s 1.25 MiB stage) |
| 10 put-back | empty inventory after recover |
| Emulator / Keep / power cycle | not this pass |

Twin path for step 9: `npm run octatrack:base -- --stock OS.bin --step --out STEP` →
`device boot STEP` → `device boot` `dev-twin-base63-guard-2026-11-26`
(`dce64a781f8581b4`). No flash. Prior SPOS twin `cdfb0c2755afedfd` has no
guard; larger `--dev` twins would not stage from it.

### MICRO T row dig (same tip / package / twin)

Earlier LEVEL rows on this package were recorded **FAIL** (stock
TRIGS/SLIDE/SWING/REC.TRG only). Re-probe on `dce64a781f8581b4` with Keep-safe
trial of `8958a66f…`:

- Mid-trial MEM: list-length poke `0x4007c07a` = `48780005` (stock was
  `48780004`); names LEA `0x4007b7f2` rewritten off stock `47f9400b2e66…`.
- LCD: **MIDI TRIG EDIT** shows TRIGS / **MICRO T** / SWING;
  **TRACK TRIG EDIT** shows TRIGS / **MICRO T** / SLIDE / SWING (REC.TRG
  still scrolls under the four-row window).
- LEVEL on TRACK: footer `MT1:ON GRID` → `MT1:+23/384`
  (`evidence/media/hw-catalog-track-level-plus23-mop246.png`).
- LEVEL on MIDI: from +23, LEVEL −23 → `MT1:ON GRID`
  (`evidence/media/hw-catalog-midi-level-ongrid-mop246.png`).
- Rolled back; inventory empty. No Accept.

**Root cause of the earlier FAIL:** not a package or site defect — sites
apply and MICRO T is present. The first LEVEL pass mis-read a stock-looking
page (wrong open / timing). No source fix required.

### Edge cases

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| LEVEL while playing | LEVEL rewrites every step through the stock writer while transport runs | Keep-safe trial; LEVEL with transport not required for owner row | **not run** this pass (LEVEL at rest **PASS**) |
| Part change | remembered row is module bss; Part change must not leave a stale row or hang | `device:test` Part switches inside step 7 | **PASS** (scripted; no hang) |
| MIDI button | MIDI on/off selects which track LEVEL writes | Keep-safe trial; MIDI toggle between TRACK and MIDI TRIG EDIT | **PASS** (both pages show MICRO T; LEVEL moves shared footer) |
| USB removal while TRACK TRIG EDIT open | earlier Keep remove was refused (RUNTIME_UI_OPEN) with that key layer up | not this pass | **not run** |
| Power cycle | remembered row must clear; trig offsets must stay | not this pass (no Accept) | **not run** |
| Beside other TRACK TRIG EDIT / key-layer modules | shared gesture and screen claim | compat step 2 | **PASS** (0 conflicts); hardware beside others not run |
| LEVEL audio track | owner-required: confirm LEVEL on audio with this package | Keep-safe trial on `dce64a78…`; TRACK TRIG EDIT · MICRO T; LEVEL | **PASS** — MICRO T present; footer `MT1:ON GRID` → `MT1:+23/384` |
| LEVEL MIDI track | owner-required: confirm LEVEL on MIDI with this package | same trial; MIDI TRIG EDIT · MICRO T; LEVEL −23 | **PASS** — MICRO T present; footer returns `MT1:ON GRID` |
| Rollback with TRACK TRIG EDIT open | prior twin trial rollback refused (needs-recovery) | Keep-safe Undo with TRACK TRIG EDIT / MIDI TRIG EDIT open | **PASS** (rolled back; inventory `[]`) on both twins |
| Rollback with TRACK TRIG EDIT closed | compare open vs closed key layer | Keep-safe Undo after NO closed the key layer | **PASS** (rolled back; inventory `[]`) |

## What was reported

The behaviour in `microtiming.s` is the private card image MICRO T9 (ELEK `MICRO T9`, SHA-256 `be88f1993be56e07af1f6528e85cff831a998f26cd7ed2bad4bd7a8f3b662f12`), reported by the author on a unit. That image is not this module package, and it is not in the repository.

Reported for that card:

1. FUNC+BANK TRACK TRIG EDIT shows MICRO T under TRIGS and above SLIDE.
2. The window stays four rows. Scrolling past SWING reveals REC.TRG and moves TRIGS off the top.
3. LEVEL sets every step of the selected track to the row's value as the pot turns. There is no YES to apply.
4. MIDI button off writes the audio field only. MIDI button on writes the MIDI field only. The other side stays as it was.
5. The footer shows the stock fraction (`MTn:+1/384` or `MTn:ON GRID`). The lane is dashes, a centre 0, and a cursor that sits on that 0 when the value is on grid.

Earlier private cards failed as the author reported them: a crash from a stub in the trailing pad, no visible row, both list counts at five so REC.TRG sat outside the border, LEVEL dead on audio, the cursor one step off grid, and a pot turn that wrote both audio and MIDI. Do not treat those cards as a pass. MICRO T9 is the reported pass. This module package has not been flashed.

## Trial on the development twin

19 November 2026, MKII, OS 1.40C. Development twin `878307834ad3c23a` was RAM-booted and not flashed. Package `f5b9682175f295875dbecb66a18524c205ba526d88e9bd7dc9cdd7d270d01292` ran as a trial for about 180 seconds and was not accepted. The diagnostic value stayed `0x0`. One refusal appeared near the end. The verdict was no crash, stall, freeze or skipped track. Rollback was refused with needs-recovery, and the USB cable was unplugged. This is not a LEVEL pass on this package. Afterwards the unit was back on the flashed base `c889442d9b119d5f`, generation 0, with the same 24 kept modules and neither this module nor Screen Off.

## Stock flows

Not tested on a module build, except the power-off footer in Keep and power cycle. Intended checks:

1. With the row at 0, existing trig micro timing is unchanged until LEVEL moves.
2. Turn LEVEL on an audio track: the MICRO TIMING page for that track's steps shows the same fraction. MIDI tracks are unchanged.
3. Turn the MIDI button on and turn LEVEL: the MIDI track's micro timing follows. The audio track is unchanged.
4. Individual trig edits do not change the row. The next LEVEL turn sets all 64 steps to the new absolute value.
5. Power off: the remembered row number is gone, because it lives in this module's unit and a power cycle drops that unit. Trig values already written stay in the pattern.

## Performance

19 November 2026. ot_emu with the DSP cores, development twin `878307834ad3c23a`, set OCTABAM, project ONEAUX, pattern 0. Package `f5b9682175f295875dbecb66a18524c205ba526d88e9bd7dc9cdd7d270d01292`. The trial was not kept.

A watch on every halfword of the 1076-byte image counts only this module's instructions. The stock writer at `0x4002d640` is not in the number. With MICRO T selected and the transport playing, one LEVEL step on the audio side was 787 instructions from `mt_level` to its jump back to stock. The same step with the MIDI button on was 788. `evidence/performance.json` records 788.

The same run then sent twenty LEVEL steps with the MIDI button on, ten while playing, STOP, a Part change from 1 to 2, the page opened again, and ten more while playing. The remembered byte moved from `0x02` to `0x0c`, then to `0x16`. The second ten entered `mt_level` ten times. The diagnostic log at `0x100fc000` stayed at 3 incidents (start, base, set), with no crash, stall or freeze. The stress fields record 20 presses, playing, and no hang.

| row | result |
|---|---|
| cycles | worst event 788 of 26600000, this module's instructions only |
| stock benchmark | none for a key-press record |
| stress | 20 LEVEL steps while playing, no hang |

## CPU price

19 November 2026, MKII, OS 1.40C. A development twin, identity `878307834ad3c23a9f87eea71250a7f104db7fdd5c32592cba6ddd816e61f718`, was RAM-booted and not flashed. `npm run device:price` measured package `f5b9682175f295875dbecb66a18524c205ba526d88e9bd7dc9cdd7d270d01292` for 8 seconds, at rest, with LEVEL not turning. The pattern was whatever the unit came up on. The frame interrupt's share did not change (`resources.cpuPrice` 0.0). The CPU meter read +0.9 points; that is not the price. No frames were skipped. The price command was stopped before it printed a rollback, `recover` found the trial and rolled it back, and the inventory was empty. Nothing was kept.

## Memory

19 November 2026. Package `f5b9682175f295875dbecb66a18524c205ba526d88e9bd7dc9cdd7d270d01292`, 2,926 bytes, ABI 7. Its header says the linked image is 1,076 bytes and the bss is 2,048. The image's own SHA-256 is `08b92351ea2097a9b26578eeebe72968b22df25c650f2a60fbcdd816bc103fbc`. Disassembled with `m68k-elf-objdump -D -b binary -m m68k`, the image is 1,030 bytes of code ending at the `rts` before the label, then `MICRO T` and its zero (8 bytes), the 16-byte footer buffer, the centre `0` and its zero (2 bytes), and the 20-byte name table. 1,030 + 8 + 16 + 2 + 20 = 1,076. The 2,048 bss bytes are `mt_table`. The image length is a multiple of 4, so the table's alignment adds nothing. Nothing else is allocated: no heap, no DSP memory.

The dearest stack use is a LEVEL rewrite. `lea %sp@(-44),%sp` at image `0x14` holds the saved registers, `mt_rewrite` pushes 4 bytes across its call into `mt_steps`, and `mt_steps` pushes 16 bytes across the jump to the stock writer at `0x4002d640`. That is 64 bytes of this module, on the UI task's stack. The footer path pushes 36, and the lane path pushes 24. The stock routines under those jumps are not measured. No hardware canary was set.

| region | bytes |
|---|---|
| ColdFire code | 1030 |
| `MICRO T` label | 8 |
| footer buffer | 16 |
| centre `0` | 2 |
| name table | 20 |
| remembered row (`mt_table`, bss) | 2048 |
| LEVEL rewrite on the UI stack | 64 |
| total, one instance | 3188 |

## Resources

The byte total is the Memory section. One ColdFire unit, the menu detours, one LEVEL pointer and the row-index pokes. No DSP memory.

## Remembered row

From 0.1.1 the 2048 remembered bytes are `mt_table` in this unit. The loader clears that table when the module loads. A power cycle drops the unit, so the row starts on grid again. It is not battery RAM. The battery ledger no longer names this draft.

Host assemble, 18 November 2026, WSL `m68k-elf-as -mcpu=5475` of this `microtiming.s`: text 1076, data 0, bss 2048. `mt_table` is a bss symbol. That is the object file only.

Development package of commit `dbc0652b4`, built 18 November 2026 with WSL `python3 -B scripts/module-dev-package.py micro-timing` and `m68k-elf` binutils, written outside the checkout: 2,926 bytes, SHA-256 `f5b9682175f295875dbecb66a18524c205ba526d88e9bd7dc9cdd7d270d01292`, module `36200ffc`, 1,076 bytes of code and data, 2,048 of bss, 2 relocations, 39 stock-code sites. The bss size is the remembered table. The image split is in Memory. The emulator runs are in Performance and OT UI capture evidence.

## Keep and power cycle

18 November 2026, MKII, OCTATRACK 1.40C, flashed base `931a91bd7e571216`, the package above. `set` with `--accept` added it beside the 22 modules already on the card. The trial `12584fe66e3d7ba1` ran 5 seconds, tick word `0x10000`, slot running, refusals 0, verdict clean, and was kept. Generation 4, active `12584fe66e3d7ba1`.

The person set MICRO T off grid. The fraction they stopped on was not reported. They powered the unit off and on. The unit came back normal, generation 0, active `931a91bd7e571216`, ticks 6047, and the inventory still listed Micro Timing (`36200ffc`) with those 22 modules. They reported the footer `MT1:ON GRID`, as expected. A step's own MICRO TIMING page was not reported.

Removing the module while TRACK TRIG EDIT's key layer was still up was refused, loader refusal 11 `RUNTIME_UI_OPEN`, including after the list had been left for the grid. A second power cycle with the menus left closed, then `remove` of this package with `--accept`: trial `3e59fbf8c133ef4f`, 5 seconds, tick word `0x10000`, refusals 0, verdict clean, kept. Generation 1, active `3e59fbf8c133ef4f`. The inventory was the same 22 modules and no Micro Timing.

## Hardware

Reported on the private MICRO T9 card, as above, and for this package the power-cycle footer in Keep and power cycle. The development-twin trial above is not a LEVEL pass. USB removal needs that key layer closed. The LCD captures below are emulator frames, not a hardware result.

## OT UI capture evidence

19 November 2026. Headless `ot_emu` (SHA-256 `6920f2385726304a11a699d709d0565afcae8e0a8d5a5ef88546b805d28f1aa7`), MKII panel, `--dsp --dsp-rt --frame`, stopped transport. Development twin `MAIN.raw`, SHA-256 `5e359bf64919555125f0225744b5bb886a5661bed0e00279065b7ea38f99597b`. Package `f5b9682175f295875dbecb66a18524c205ba526d88e9bd7dc9cdd7d270d01292` installed over the emulator USB link. The trial was not kept. A local card was mounted and is not in this folder. Palette on 240, off 24, scaled by 6. The earlier pictures, from a private image built before commit `13d33940`, are replaced.

Plan, recorded in `media/capture.json`: YES, REC, FUNC+BANK, DOWN onto MICRO T, capture `media/ot-micro-t.png`, one LEVEL +1, capture `media/ot-micro-t-step.png`, MIDI, capture `media/ot-micro-t-midi.png`, MIDI again, three DOWN presses, capture `media/ot-rec-trg.png`.

Observed on those frames: MICRO T is highlighted under TRIGS, the cursor sits on the centre mark, and the footer reads `MT1:ON GRID`. After one LEVEL step the cursor is one mark to the right and the footer reads `MT1:+1/384`. The remembered byte moved from 0 to 1. MIDI changes the title to MIDI TRIG EDIT and hides SLIDE; LEVEL was not turned again, so the footer stays `MT1:+1/384`. After the scroll, TRIGS is off the top and REC.TRG is the bottom row.

Not captured: the audio or MIDI trig pages, and any frame on the unit. This is not a hardware result. Never commit firmware, dumps or cards.
