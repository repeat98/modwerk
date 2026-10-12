# Processor Load testing

## Commands and exact revision

- **Source:** `upstream/` = [timhastie/octatrick-modules](https://github.com/timhastie/octatrick-modules) tag `v2.12`, commit `ca13ed85547790f788ceaaada5df3cdd31508441`, `processor-load/` (unchanged since `v2.11` `5f3d745`: `git diff v2.11 v2.12 -- processor-load/ LICENSE` is empty; README.md, loadmeter.s, tempo_popup.png byte-identical; manifest.py with its five stock `expect`s written as `stock_guard(site, length, sha256)` and its `conflicts` moved to `octamod.module.json`; per-file hashes in `sdk/imports/processor-load-ca13ed8.json`). The conversion checked every guard against the local 1.40C MAIN OS (`164f3122…`) and against the SHA-256 of the author's literal: 5 guards, 0 mismatches.
- **Image:** Modwerk's exporter, this module alone with the stock effects (`--select processor-load:true`), the vendored SDK, `--static-stock`, the user's own `OCTATRACK_OS1.40C.bin` (`34695b60…`):
  `python3 -B scripts/export-composition-proofs.py <staged sdk> <proofs> --app . --vendored-sdk --static-stock --modules processor-load --select processor-load:true --menus <menus> --image-dir <private dir> --stock-bin <OS 1.40C .bin> --verbose`
  MAIN OS `f3ebd1c55f0c2ca9aeec1a9a934ecbd253ad6564784e860cbb2303435662a2b1` (1,113,490 B); update file (Modwerk's packer) 446,596 B, `9e1d72f51414b4cae4ea441d3327262f21affbb0be238f5dea809812da507cc3`, version `OCTAMOD79`. The exporter's recorded firmware identity, Modwerk's TypeScript packer (`src/engine/elek.ts`, `encodeFirmware`) and a decode of the packed file all give the same bytes. The same case rebuilt in a kept work tree gave the same MAIN OS, and octatrick-modules' `tools/align_check.py` (v2.12; the file is unchanged since v2.11) on that tree: `ok -- 233 instruction rows (17 at a code symbol) in 1 linked objects, all even; 4 detour / symbol-ref / hook / poke targets even`.
- **Build log facts:** one DRAM unit `procload` linked at `0x40a955e0` (`.text` 884 B: code 800 B, `pl_stats` 32 B at `0x40a95900`, `pl_state` 52 B at `0x40a95920`); detours `0x4001fbf8` (lea) → `pl_isr`, `0x4000d9a6` (10 B) → `pl_tail`, `0x40056c8a` (6 B) → `pl_ui`, `0x4004b528` (8 B) → `pl_tempo_draw`; poke `0x4004b5b4` `pea 0x25` → `pea 0x23`; append 930 B at `0x4010fdf0`; the platform takes 1,707 pages (`0x40a955e0..0x41495de0`, 10,487,808 B), 12,895 sample pages left (stock 14,602).
- **Emulator:** the pinned `ot_emu` (`9dc31d12…`), `--dsp --frame --interactive --main-level off --rtc host --mkii`, an empty scratch card made with `tools/emu/emu_card.py` (the project the OS creates), or a local copy of the author's own card with one of his projects loaded (`--mount --set … --project …`; the card stays local, its names are not recorded here). Panel keys, `peek` of the meter's state and watched PCs (`watch` / `hits`) over the line protocol. Each session also ran on the stock MAIN OS for comparison.
- **Smoke:** `python3 -B verify.py --output <json> --emulator <ot_emu> --image <MAIN OS> --image-sha256 f3ebd1c5… --sdk sdk/octabam` → 12/12 checks passed ([evidence/native-smoke.json](evidence/native-smoke.json)).
- **Captures:** `python3 -B scripts/capture-module-ui.py --emulator <ot_emu> --image <MAIN OS> --image-sha256 f3ebd1c5… --plan <plan> --output <new dir> --key-ms 20` (this change adds the `TEMPO` key to the tool). The plan opens the popup at once (`--%`), closes it, dismisses the emulator's date prompt (YES, NO), reopens it, holds FUNC, presses PLAY, turns LEVEL +5, STOP, closes the popup. Six PNGs, one per capture step; the emulator's date prompt is stock, so the plan dismisses it without capturing it.

## Native comparison and packages

On Modwerk main `3151975` (11 October 2026):

- `npm run module:verify -- processor-load --os <OS 1.40C>` with the native side on the host toolchain (no Docker here; the container command run by a local shim, the dsp56300 assembler built from the pinned commit with `sdk/octabam/tools/patches/dsp56300.patch`): 130 selections in the coverage set, 62 built images match native outside the platform writes, 68 refusals match, 0 mismatches. Recorded in [`sdk/native-comparisons/processor-load.json`](../../../native-comparisons/processor-load.json). Every refusal is between other modules in crowded selections; Processor Load places nothing in the clone window or the chooser lists.
- The declaration scan of the same run: all 493,056 configurator-allowed selections that contain processor-load are clean. Recorded in `src/catalog/native-metadata.json`, which that grows from 70,472,264 to 136,706,376 bytes, over GitHub's 100 MB file limit; the pull request says how it is delivered.
- Packages: `python3 -B scripts/build-module-packages.py --vendor <vendor> --output <new dir> --include-requested`, then `node scripts/import-module-build.mjs <dir> --development`: `requested-packages.json` gains the `procload` object and its group; the 37 existing objects and 12 groups are unchanged, and every other asset file only gains the module's version. On macOS the builder's POLY8 host test needs a gcc shim (GNU `--gc-sections` → Apple `-dead_strip`, built for x86_64 with a 4 KB `__PAGEZERO` so its fixed mapping at `0x400d3000` works); it passes.
- Analog BD: `node scripts/verify-analog-bd-native.mjs <OS 1.40C> <proofs with the new moduleSourceTreeSha256>`: 162 native OS and bootloader comparisons, 50 matching refusals, 6 firmware round trips; then the hash was rebound.
- The image rebuilt on this base is byte-identical to the tested one (MAIN OS `f3ebd1c5…`, update file `9e1d72f5…`), and `tools/align_check.py` gives the same result on it.

## Hardware and audio quality

**Report** (timhastie, MKI, 2026-10-10, Processor Load `0.1.0-experimental`, MAIN OS `f3ebd1c55f0c2ca9aeec1a9a934ecbd253ad6564784e860cbb2303435662a2b1`). Functional check: the author ran this exact image on his MKI and saw no issue with the meter; it worked as described.

Limitations:

- A functional check only: no readings, project, run length or power-cycle were recorded with the report.
- Not run on an MKII; a reading of 70 % or more (the !) was not reported.

Audio quality: not applicable, the module makes and changes no audio. MKII: not run.

## Persistence and multiple instances

The owner's 8 October 2026 rules are for "stateful modules" (project saving and reload/reboot survival) and for "every instantiable FX, machine or similar module" (multiple simultaneous instances). Processor Load is neither: it saves nothing (no Part, project, card file or battery-RAM byte) and there is exactly one meter, not an instance per track or slot. So no persistence or instance matrix applies. What was checked instead: the meter arms by itself after every start-up (fresh emulator boots: `--%` for the first windows, then a reading), after a project load (the author's project: reading from the first moment the panel answered), and a power-cycle is a row of the hardware test sheet.

## Stock flows

Compared on the emulator with the same panel input on the stock MAIN OS and on this image (empty project; then the author's project):

| flow | result |
|---|---|
| The PLAYBACK page before and after the popup | pixel-identical to stock |
| The TEMPO popup, stopped and playing | identical except the meter's 18 x 6 px band (x 3..20) and the header two pixels lower (the listed change) |
| The BPM: LEVEL +5 in the popup | 120.0 → 125.0 on both images; encoders A and F did not change it on either |
| TEMPO closes the popup; PLAY / STOP; FUNC in the popup | as stock (FUNC shows `W…` only in the meter's band) |
| A project load (the author's project) | loads (`LOAD PROJECT handled`) and plays on both |
| Saving, Parts, scenes, recording, MIDI, USB | not run: the module hooks none of them and writes no state; the hardware sheet asks for save / load and Parts |

The one deliberate change to a stock flow is the header's two pixels (README, Compatibility and limitations).

## Performance

`npm run perf:audit -- check sdk/octabam/modules/processor-load/evidence/performance.json`:

```
✓ record          coldfire record for processor-load@0.1.0-experimental
✓ cycles          worst event 78 of 95779 cycles (0%)
✓ stock benchmark under the same flood the longest frame interrupt grows by 0.4 us (0.1% of the 362.8 us frame) and idle time falls by 0.1 points vs stock
✗ stress          floodMessagesPerSecond must be at least 1000; clockBpm must be at least 240; seconds must be at least 60; stuckNotes must be 0 (after stop, Part change, bypass and channel change); hangs must be 0; dropped must be the number of messages lost
                  fix: flood the module with notes, CC and clock at the wire rate, stop mid-note and change Part, then count

1 check(s) failed. The limits are audit defaults (...); say in TESTING.md what you changed and why.
```

- **Cycles.** The event is one frame interrupt. Static: the longest path through `pl_isr` + `pl_tail` by hand count, 35 instructions (16 on the arming block + 19 on a new longest) = 88 cycles; measured: 31 (12 + 19) = 78 cycles; at 2.49216 cycles an instruction, Modwerk's FM Synth convention (9.44 ns at 264 MHz, the hardware CF METER calibration), not chip wall-clock.
- **Stock benchmark.** Not `cfmeter.py`: CF METER uses the same two interrupt sites and cannot be built beside this module, and no hardware capture exists yet. Instead, the same session on the stock image and on this image with the author's project playing: stock longest interrupt 33,309 instructions (314.4 us at 9.44 ns), module longest = that + the meter's static 35 (314.8 us; the module run itself peaked at 32,576, a different block); idle = 100 − the mean interrupt share (stock mean 25,623.2 instructions → 33.3 %, module +29 → 33.2 %), the UI task not separated. These use the hardware conversion; the meter's own emulator readings (35–40 %) run on the emulator's clock and are not comparable with them.
- **Stress.** Not run: the coldfire template's stress is a MIDI flood for MIDI modules, and Processor Load reads no MIDI and has no note path. Its whole interrupt path costs the same 12 + 17..19 instructions in every block, counted over about 4,400 blocks. This row fails the audit; it is listed as open in the pull request.

## Resources

### Cycles (pinned ot_emu, watched PCs, 400 ms windows of about 1,100 blocks)

| session | stock interrupt body (instructions) | meter entry | meter exit | UI tick |
|---|---|---|---|---|
| empty project, playing | 22,137–22,305 | 12 | 17–19 (mean 17.0) | 23 (22×), 607 (2×) |
| empty project, stopped | 22,167–22,221 | 12 | 17–19 | 23 (23×), 607 (1×) |
| author's project, playing | 24,627–32,542 | 12 | 17–19 | 23 (22×), 607 (2×) |
| author's project, stopped | 23,152–23,222 | 12 | 17–19 | 23 (23×), 607 (1×) |
| stock image, empty project, playing / stopped | whole interrupt 21,996–22,308 / 22,170–22,240 | – | – | – |
| stock image, author's project, playing / stopped | whole interrupt 25,431–33,309 / 23,252–23,310 | – | – | – |

The entry is counted by the gap from one block's `rte` to the next block's stock handler (minimum 13 = `rte` + 12, in every window; the emulator counts nothing while the CPU waits) and by hand (12; 16 once, on the block that arms the meter). The exit is counted from the detour's `jmp` at `0x4000d9a6` to `pl_tail`'s `rte`, less the three replayed stock instructions. The UI tick runs about 60 times a second (24 ticks in each 400 ms window, as on the stock image's UI loop); four a second take a reading and redraw. Budget: 362.8 us a block; `maxConfiguration` = the stock image's peak with the author's project (33,309) + 35 = 33,344 instructions = 83,099 cycles of 95,779 at the conversion above, `maxInstances` 1 (one meter).

### Memory

| region | space | bytes | scope |
|---|---|---|---|
| meter state (`pl_stats` 32 + `pl_state` 52) | sdram | 84 | instance (one) |
| DRAM unit code | sdram | 800 | shared |
| hook sites (four detours 30 B, one poke 4 B) | cpu-flash | 34 | shared |
| appended platform loader and packed unit | cpu-flash | 930 | shared |
| platform reserve (1,707 pages, less the unit) | sdram | 10,486,924 | shared |
| frame-interrupt stack increment | sdram | 8 | shared |
| UI-task stack increment bound | sdram | 104 | shared |

Total 10,488,884 B (84 per instance × 1 + 10,488,800 shared). Stack: `pl_isr` saves D0/A0 (8 B) and releases them before the stock handler; `pl_tail` runs in the stock handler's frame; the UI path `pl_ui` → `pl_tick` (4 + 44) → `pl_overlay` (4 + 24 + 24 B of BOX / TEXT arguments + 4) = 104 B, the stock BOX and TEXT routines' own frames not counted (the stock TEMPO draw calls them the same way); `pl_tempo_draw` → `pl_overlay` 52 B. No heap, battery RAM, card or DSP memory. Hardware canaries not measured.

### Readings (emulator percentages, not hardware ones)

| condition | reading |
|---|---|
| start-up, empty card | armed at the first panel answer (2 blocks counted at 194 ms emulated); `--%` to at least 434 ms; `35%` at 585 ms |
| empty project, stopped / playing | `35%` / `35%` (`34%`–`35%` in the captures), FUNC `W35` |
| author's project, stopped / playing | `35%`–`36%` / `39%`–`40%`; FUNC held `W47`; the longest-block value 47–55 across windows |
| tail's timer-reset limit forced to 0 (emulator RAM) | `20%` (the straddling window), then `--%` / `W--` from +500 ms; restored: `24%`, then `35%` |
| block count | 1,378 blocks in 500 ms (2,756 a second) |
