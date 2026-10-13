# Tuner testing

## Commands and exact revision

- **Source:** `upstream/` = [timhastie/octatrick-modules](https://github.com/timhastie/octatrick-modules) tag `v2.12`, commit `ca13ed85547790f788ceaaada5df3cdd31508441`, `tuner/` (README.md and tuner.s byte-identical; manifest.py with its three stock `expect`s written as `stock_guard(site, length, sha256)`; per-file hashes in `sdk/imports/tuner-ca13ed8.json`). `tuner.s` and the manifest are unchanged since v2.8 (`237d40b`); since the v2.9 tag only one README line changed; the `tuner/` tree and `LICENSE` are identical at v2.11 (`5f3d745`) and v2.12 (git tree `1b52b94d…`), so the measurements below, made on the v2.11 pin, apply to this source unchanged. The conversion checked every guard against the local 1.40C MAIN OS (`164f3122…`) and against the SHA-256 of the author's literal: 3 guards, 0 mismatches.
- **Image:** Modwerk's exporter, this module alone with the stock effects (`--select tuner:true`), the vendored SDK, `--static-stock`, the user's own `OCTATRACK_OS1.40C.bin` (`34695b60…`):
  `python3 -B scripts/export-composition-proofs.py <staged sdk> <proofs> --app . --vendored-sdk --static-stock --modules tuner --select tuner:true --menus <menus> --image-dir <private dir> --stock-bin <OS 1.40C .bin> --verbose`
  MAIN OS `66489376d2cfbe36cb27b6e8b755a75aec2e7b3eab3583f7026f55cc7e877f94` (1,114,801 B); update file 448,024 B, `5f56dbcef519b5335e16260263f06617872fcf2f9b6c87571e9d11e32d78e6f2`, version `OCTAMOD79`. The exporter's recorded firmware identity, Modwerk's TypeScript packer (`src/engine/elek.ts`, `encodeFirmware`) and a decode of the packed file all give the same bytes. The same case rebuilt in a kept work tree gave the same MAIN OS, and octatrick-modules v2.12's `tools/align_check.py` on that tree: `ok -- 712 instruction rows (16 at a code symbol) in 1 linked objects, all even; 3 detour / symbol-ref / hook / poke targets even, every jmp / jsr into them on an instruction`.
- **Build log facts:** one DRAM unit `tuner` linked at `0x40a955e0` (`.text` 2,830 B; `.data` 19,500 B at `0x40a980f0`: `tu_win`…`tu_t0` 44 B, `tu_ring` 8,192 B, `tu_x` 8,192 B, `tu_y` 2,048 B, `tu_n` 740 B, `tu_lobes` 256 B, `tu_d` 28 B; the runtime spans `0x40a955e0..0x40a9cd1c`, 30,524 B, with 8,194 B of link alignment between the sections); detours `0x40059ef0` → `tu_tempo`, `0x4000d99a` → `tu_frame`, `0x40056c72` → `tu_tick` (6 B each, `jmp`); no poke, no ROM cave; append 2,241 B at `0x4010fdf0`; the platform takes 1,707 pages (`0x40a955e0..0x41495de0`, 10,487,808 B), 12,895 sample pages left (stock 14,602).
- **Emulator:** the pinned `ot_emu` (`9dc31d12…`), `--dsp --frame --interactive --main-level off --rtc host --mkii` (one session `--mki`), a disposable card built with `tools/emu/emu_card.py`: a project made from a blank one the OS created, with eight FLEX tracks (slot N on track N, LOOP on, one trig on step 1 of A01, stock effects as the blank project has them) and eight generated 2 s looping mono samples: seven sines at −12 dBFS, every one a whole number of periods long (T1 440 Hz, T2 82.5 Hz, T3 300 Hz, T4 1000 Hz, T5 110 Hz, T6 435 Hz, T7 1318.5 Hz), and silence on T8; and a second card with the trig on T1 only (one track playing). Cards, samples and the template stay local. Each session's first step dismisses the emulator's stock date prompt (YES, NO). Panel keys, `peek` of the tuner's state longs and watched PCs (`watch` / `hits`) over the line protocol; the same sessions on the stock MAIN OS for comparison.
- **Smoke:** `python3 -B verify.py --output <json> --emulator <ot_emu> --image <MAIN OS> --image-sha256 66489376… --sdk sdk/octabam --template <a blank project your OS made>` → 24/24 checks passed ([evidence/native-smoke.json](evidence/native-smoke.json)). Without `--template` it runs the key checks only.
- **Captures:** `python3 -B scripts/capture-module-ui.py --emulator <ot_emu> --image <MAIN OS> --image-sha256 66489376… --plan <plan> --output <new dir> --card <the tone card> --set-name TONE --project-name TUNE --key-ms 50` (this change adds the `TEMPO` key to the tool). The plan dismisses the date prompt (YES, NO), captures the page, selects T8 (silent), presses PLAY, opens the tuner (`--`), selects T6 (435 Hz) and T3 (300 Hz), presses STOP (HOLD) and closes it with TEMPO. Five PNGs are kept; the first capture (`ot-page-closed.png`, the page before opening) is not, because it shows the stock DISARM ALL message from that NO, so its hash is removed from `media/capture.json` and the page after closing (`ot-tuner-closed.png`) shows where the tuner is opened from.

## Native comparison and packages

- `npm run module:verify -- tuner --os <OS 1.40C>` with the native side on the host toolchain (no Docker here; the container command run by a local shim, the dsp56300 assembler built from the pinned commit with `sdk/octabam/tools/patches/dsp56300.patch`): **130 selections in the coverage set: 62 built images match native outside the platform writes, 68 refusals match, 0 mismatches.** Every refusal is between other modules in crowded selections (CC Map's page-2 cave, Mute Modes, the quantizer / synth cave, Output Matrix's DSP region, …); no selection is refused because of the tuner, and the tuner alone builds. Recorded in `sdk/native-comparisons/tuner.json`.
- The declaration scan of the same run: all 493,056 configurator-allowed selections that contain the tuner are clean. Recorded in `src/catalog/native-metadata.json` in a separate commit (it grows that file from 70 MB to 132 MB; see the pull request).
- Packages: `python3 -B scripts/build-module-packages.py --vendor <vendor> --output <new dir> --include-requested`, then `node scripts/import-module-build.mjs <dir> --development`: `requested-packages.json` gains the `tuner` object and its group (three detours, guards as in `stock-guards.json`); every other payload is unchanged outside the version and provenance fields (the common objects' order differs; their content is equal). On macOS the builder's POLY8 host test needs a gcc shim (GNU `--gc-sections` → Apple `-dead_strip`, built for x86_64 with a 4 KB `__PAGEZERO` so its fixed mapping works); it passes.
- Analog BD: `node scripts/verify-analog-bd-native.mjs <OS 1.40C> <proofs with the new moduleSourceTreeSha256>`: 162 native OS and bootloader comparisons, 50 matching refusals, 6 complete firmware round trips; then the hash was rebound.

## Hardware and audio quality

**Report** (timhastie, MKI, 2026-10-13, the Tuner 0.1.0 update file, MAIN OS `66489376…`): Every item of the test sheet for the Tuner 0.1.0 update file (MAIN OS 66489376...) worked: the unit boots and reads OCTAMOD79; TEMPO alone opens the stock TEMPO window, FUNC + TEMPO taps tempo and UP alone does what it always does; with a sample of known pitch playing, UP held + TEMPO opens the tuner window with the note, the needle on the side the cents say, the cents and the frequency; a pitch change on the track moves the reading; a track key switches the tuned track while the window is open; it read a live instrument through a Thru machine; after STOP the last reading stays with HOLD, and a fresh window on silence shows --; TEMPO, YES, NO and UP + TEMPO each close it and leave the page underneath as it was; TEMPO then UP opens the stock TEMPO window and steps its BPM; open while a busy pattern plays, the audio does not click or drop out and the readings keep updating; the PROJECT menu takes over from it and UP + TEMPO opens it again afterwards; after a power-cycle TEMPO is stock, UP + TEMPO opens the tuner and the project loads and plays as before.

Limitations:

- The report is that each item of the sheet worked; the figures the sheet asks to note down (the sample's pitch and its reading, the live input's reading and the reference tuner's) were not recorded.
- Play time, MIDI gear and track counts were not recorded.
- MKI only: no MKII has run this image.

History: the same `tuner.s` ran on the author's MKI in the Octatrick test build 3.0 b40 (29 September 2026: UP + TEMPO opens the window and tunes; readings not compared with a reference there), recorded in octabam as `HARDWARE` (sambanks/octabam#544). Audio quality: not applicable, the module makes and changes no audio. MKII: not run on hardware.

## Persistence and multiple instances

The owner's 8 October 2026 rules are for "stateful modules" (project saving and reload/reboot survival) and for "every instantiable FX, machine or similar module" (multiple simultaneous instances). The tuner is neither: it saves nothing (no Part, project, card file or battery-RAM byte; its state lives in DRAM, zero at every start-up) and there is exactly one window, not an instance per track or slot. So no persistence or instance matrix applies. What was checked instead: every session starts with the window closed and the reading empty; a fresh window reads `--`; the project loads with the module (`LOAD PROJECT handled`) and plays; a power-cycle is a row of the hardware test sheet.

## Stock flows

Compared on the emulator with the same panel input on the stock MAIN OS and on this image (the tone project):

| flow | result |
|---|---|
| TEMPO alone | the stock TEMPO window; the tuner stays closed (smoke, `tempo_alone_is_stock`) |
| FUNC + TEMPO | the tuner stays closed (smoke, `func_tempo_does_not_open_tuner`); not run on the stock image |
| UP held, then TEMPO | stock image: the stock TEMPO window (UP held does nothing to it); this image: the tuner window (the listed change) |
| TEMPO held, then UP | the stock TEMPO window on both images, and UP steps its BPM 120.0 → 120.1 on both |
| closing keys | TEMPO, YES, NO and UP + TEMPO each close the tuner, on the MKII and the MKI panel; the page underneath is back |
| track keys T1–T8 while open | the window follows the selected track; after closing, the page shows the last track selected |
| a menu over the window | the PROJECT menu (MENU) closes the tuner (its window handle returns to 0) and the menu works as stock; UP + TEMPO opens the tuner again afterwards |
| PLAY / STOP under the window | the transport runs as stock; STOP leaves the last reading with HOLD |
| the frame interrupt with the window closed | the stock work plus 4 instructions a block (mean 22,173.2 → 22,176.9 stopped, 29,912.6 → 29,917.0 playing, the same project) |
| Saving, Parts, scenes, recording, MIDI, USB | not run: the module hooks none of them and writes no state; the hardware sheet asks for a project load after a power-cycle |

The one deliberate change to a stock flow is the UP + TEMPO chord (README, Compatibility and limitations).

## Performance

`npm run perf:audit -- check sdk/octabam/modules/tuner/evidence/performance.json`:

```
✓ record          coldfire record for tuner@0.1.0-experimental
✓ cycles          worst event 486 of 95779 cycles (1%)
· stock benchmark under the same flood the longest frame interrupt grows by 1.9 us (0.5% of the 362.8 us frame) and idle time falls by 7.1 points vs stock; say what it costs
✗ stress          floodMessagesPerSecond must be at least 1000; clockBpm must be at least 240; seconds must be at least 60; stuckNotes must be 0 (after stop, Part change, bypass and channel change); hangs must be 0; dropped must be the number of messages lost
                  fix: flood the module with notes, CC and clock at the wire rate, stop mid-note and change Part, then count
1 check(s) failed. The limits are audit defaults (usableCycles 3120, share 0.5, ratioNote 1.5, ratioFail 3, frameUs 362.8, loadNote 0.05, loadFail 0.1, idleNote 5, idleFail 10, dspSeconds 30, midiSeconds 60, midiRate 1000, lfos 3, locks 12); say in TESTING.md what you changed and why.
```

- **Cycles.** The real-time event is one frame interrupt. Static: the longest path through `tu_frame` with the window open, by hand count from `tuner.s`: the detour `jmp`, the displaced `movel` with `tstl` / `beq`, 13 instructions of set-up, 16 frames × 11, 3 to close (`movel`, `addql`, `jmp`), less the one stock instruction it replaces = 195 instructions = 486 cycles. Measured: exactly 195 on every block with the window open, 4 with it closed (the hand count for that path), over about 1,100 blocks a window. At 2.49216 cycles an instruction, Modwerk's FM Synth convention (9.44 ns at 264 MHz), not chip wall-clock.
- **Stock benchmark.** Not `cfmeter.py` (no hardware capture yet): the same emulator session on the stock image and on this image, one track playing a 440 Hz tone, see the record's `load.method`. The longest interrupt grows by the copy loop (195 instructions, 1.9 us at 9.44 ns). Idle time falls by 7.1 points with the window open: that is what the tuner costs, the analysis (about 1.0 M instructions every 145 ms) in the UI task, and only while the window is open; closed, the emulated instruction rate is the stock one (69.41 vs 69.40 k per emulated ms). The audit notes it (above its 5-point note level, below its 10-point limit).
- **Stress.** Not run: the coldfire template's stress is a MIDI flood for MIDI modules, and the tuner reads no MIDI and has no note path. Its hardest use is the window open on a playing project; that ran for 60 emulated seconds (below). This row fails the audit; it is listed as open in the pull request.

## Resources

### Cycles (pinned ot_emu, watched PCs, 400 ms windows of about 1,100 blocks)

| session | stock interrupt (instructions) | tuner image interrupt | tuner frame-tail add | UI pass add | analysis passes (own / incl. nested interrupts) | emulated k instructions per ms, stock / tuner |
|---|---|---|---|---|---|---|
| 8 tracks playing, stopped, window closed | 22,138–22,218 | 22,142–22,222 | 4 (1,103 blocks) | 4 (43×) | – | 63.87 / 63.9 |
| 8 tracks playing, window closed | 28,292–43,324 | 28,304–43,328 | 4 (1,103 blocks) | 4 (43×) | – | 105.11 / 105.12 |
| 8 tracks playing, window open on T1 (440 Hz) | – | 30,983–33,431 | 195 (1,102 blocks) | 7 (42×) | 2 × 1,005,958–1,007,044 / 1,984,465 | – / 111.12 |
| stopped, window open (HOLD, below the gate) | – | 24,061–24,163 | 195 (1,102 blocks) | 7 (40×) | 3 × 46,827–46,827 / 70,984 | – / 69.9 |
| 8 tracks playing, window open on T2, after 60 s | – | 30,983–33,429 | 195 (1,103 blocks) | 7 (40×) | 3 × 1,005,529–1,006,640 / 1,968,741 | – / – |
| 1 track playing, window closed | 22,926–25,216 | 22,929–25,268 | 4 (1,103 blocks) | 4 (43×) | – | 69.4 / 69.41 |
| 1 track playing, window open on it | – | 23,416–23,771 | 195 (1,103 blocks) | 7 (40×) | 3 × 999,679–1,007,065 / 1,592,698 | – / 76.95 |

The frame-tail cost is `n(0x4000d9a0) − n(0x4000d99a) − 1` (the stock image: the one displaced `movel`, so 0); the whole interrupt is the `lea` at the vector target plus `0x4000aad4 .. rte 0x4000d9ae` inclusive; the UI pass is `n(0x40056c78) − n(0x40056c72) − 1` (stock: 0). An analysis pass spans many blocks, so the frame interrupts nested in it are subtracted for the tuner's own count; other interrupts inside it are not watched and stay in. Budget: the module's allowance of 10 % of the 362.8 us block (9,578 of 95,779 cycles at the conversion above; the perf audit's ColdFire limit), `maxConfiguration` = the tuner's own worst block (one window). The stock image's own peak with all eight tracks playing (43,324 instructions, the session in the table; an earlier, superseded session that left the emulator's date prompt open read 43,404) is above a block at that conversion, so the conversion overestimates chip time and the stock blocks are not summed into the record.

**The analysis.** About seven times a second with the window open (every 400 blocks), in the UI task: snapshot, peak gate, normalisation, decimation, the NSDF over 368 lags × 656 products, the lobes, the YIN refinement over 7 lags × 2,048 products, the note and cents, and the redraw through the stock text, line and box routines. On a tone: 999,679 to 1,007,065 instructions of its own in every pass counted (8 passes in three sessions, tones at 440 and 82.5 Hz, one and eight tracks playing), up to 1.98 M including the frame interrupts that run inside the pass. On silence the gate stops it after the snapshot: 46,827 instructions. Its wall time is not on any audio deadline: the frame interrupt preempts it, and every 400 ms window with analyses in it still counted 1,102 to 1,103 frame interrupts, as with the window closed. The author's static estimate in his README (about 1.0 M instructions an analysis) agrees.

### Memory

| region | space | bytes | scope |
|---|---|---|---|
| tuner state (`tu_win` … `tu_t0`, 11 longs) | sdram | 44 | instance (one) |
| sample ring (`tu_ring`, 4,096 × 16 bit) | sdram | 8,192 | instance (one) |
| analysis buffers (`tu_x` 8,192, `tu_y` 2,048, `tu_n` 740, `tu_lobes` 256, `tu_d` 28) | sdram | 11,264 | instance (one) |
| DRAM unit code, strings, tables, key layer (`.text`) | sdram | 2,830 | shared |
| link alignment between `.text` and `.data` | sdram | 8,194 | shared |
| hook sites (three detours) | cpu-flash | 18 | shared |
| appended platform loader and packed unit | cpu-flash | 2,241 | shared |
| platform reserve (1,707 pages, less the 30,524 B runtime) | sdram | 10,457,284 | shared |
| UI-task stack increment bound | sdram | 172 | shared |

Total 10,490,239 B (19,500 per instance × 1 + 10,470,739 shared). Stack: `tu_frame` runs in the frame interrupt's frame and uses no stack (the stock epilogue restores every register it touches); the UI path `tu_tick` (44 B of saves) → `bsr tu_draw` (4 + 92 B of locals and saves) → `bsr text` / `ctext` / `rtext` (4) → up to 24 B of arguments → `jsr` into a stock routine (4) = 172 B; the key path `tu_tempo` → `tu_open` (24 B of arguments + 4) → `tu_draw` stays below that; the stock drawing and window routines' own frames are not counted (the stock TEMPO window calls them the same way). No heap, battery RAM, card or DSP memory. Hardware canaries not measured.

### Readings (emulator, generated tones, the window open while playing)

| track | tone | true value | reading (the same in the smoke, the qualification session and the probe) |
|---|---|---|---|
| T1 | 440 Hz | A4 +0.0c | `A4 +0c 440.0Hz` |
| T2 | 82.5 Hz | E2 +2.0c | `E2 +2c 82.4Hz` |
| T3 | 300 Hz | D4 +37.0c | `D4 +37c 300.0Hz` |
| T4 | 1000 Hz | B5 +21.3c | `B5 +21c 1000.0Hz` |
| T5 | 110 Hz | A2 +0.0c | `A2 -1c 109.9Hz` |
| T6 | 435 Hz | A4 −19.8c | `A4 -20c 435.0Hz` |
| T7 | 1318.5 Hz | E6 −0.0c | `E6 +0c 1318.5Hz` |
| T8 | silence | – | the last reading with `HOLD` (a fresh window: `--`) |
| T1 after STOP | – | – | `A4 +0c 440.0Hz HOLD` |

Largest error 1 cent (110 Hz reads −1c, the 12-bit cents ratio's boundary) and a tenth of a hertz. The held reading after switching to a silent track can be the analysis of the ring's last 93 ms of the previous tone (one run held `1319.0Hz` for T7's 1318.5 Hz); the note and cents are the previous track's.

The author's own emulator measurements in his README (26 September 2026, a different rig and cards) read the same values at 300, 1,000, 110 and 1,318.51 Hz.

### Long run

The window open on the eight-track tone project, playing, for 60 emulated seconds: T1 read `A4 +0c 440.0Hz` at every 5 s sample for 30 s, then T2 `E2 +2c 82.4Hz` at every sample for 30 s; the frame tail added exactly 195 instructions on each of the 1,103 blocks of the last 400 ms window and the analysis passes there were 1,005,529–1,006,640 instructions of their own; no stall, the emulator answered every command. Not a hardware soak.
