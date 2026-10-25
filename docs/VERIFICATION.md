# Verification record

Frozen on 25 October 2026, with the entries up to then. A module's results now go in its own `TESTING.md`, and any other record (a base, kit, core or builder change) in its own file, `docs/verification/<YYYY-MM-DD>-<topic>.md` ([index](README.md)). `npm run check` refuses new entries here.

## Deja Vu 0.1.0-experimental — 24 October 2026

New Octatrack module, Jan Kolkmeier's draft (#869) released: three audio-track LFO waves, DJV, DJQ and DJC, sharing a loop of remembered random values per LFO. ColdFire only: one 2,784-byte DRAM unit with 2,784 bytes of state, three dispatch slots of the waveform table, the WAVE count, the label clamp, the icon bound and the two grown WAVE tables (StockCopy in the USB package, TableGrow in card builds, chosen by the loader's `octabam_<name>` run name). No chooser row and no base input, so the published beta base stays as it is.
- **Host gate (`verify.py`):** 17 of 17: loops, replay chance, the step modes against the measured step counter, DJQ through the engine's EMAC arithmetic, DJC glides, set-up from garbage memory, the unit generated from its sources.
- **Native/browser (`module:verify dejavu`):** 154 selections, 62 matching images (all outside the platform writes), 92 matching refusals, 0 mismatches. Native pairs: 30 modules, 435 pairs in 3 contexts, none refused with Deja Vu. `--check` matches with the chooser-metadata row left out.
- **USB package:** `95079643…` (ABI 7, nine guarded sites, six hash-guarded stock copies of at most 32 bytes); both strict stock-free scans pass with no shared run.
- **Hardware (owner's MKII, 24 October 2026, agent-driven over USB):** on the flashed beta base `b5fae2ae`, install and Keep, self-test, restore after a power cycle, self-test and removal; on the RAM-booted development twin `7889c57a`, the WAVE list, a locked one-slot loop holding its value, SPD 0 renewing every step, a two-slot loop alternating, DJQ on PTCH giving only −5, 0, +7 and +12 semitones, and the stock sites back after removal. The module's `evidence/hardware.md`.
- **Load (ot_emu, 62 s under a MIDI flood, all 24 LFOs on DJQ at its dearest against stock RND):** longest frame interrupt 178.6 vs 145.7 µs (+9.1 % of a frame, in the frames where all 24 change together), idle 1.5 points lower, every MIDI message reached its handler. The frame where all 24 first set up their state took 202.9 µs, once, during the project load.
- **Not tested:** on hardware the HOLD, TRIG, ONE and HALF modes, p-locks and scenes on SPD or DEP, trig conditions, a project with WAVE 19-21 opened without the module, listening, the card build and an MKI.

## Direct Jump 0.1.0-experimental — 24 October 2026

New Octatrack module: Zac Kyoti's clock-locked DIRECT JUMP from octabam `b725fb1a` (author's repository `329b801c`), toggled with [PTN] + [YES]; a cued pattern takes over on the next step at the position it would hold had it played since START. ColdFire only: one 2,016-byte DRAM unit, `jsr` detours at the tick handler's landing countdown read and its MIDI START gate, a `jmp` at the [PTN] release, and the [PTN] layer's empty YES press slot. The upstream `requires=BATCH_BUGFIXES` is not carried: the author measured the two as independent, and the source reads an out-of-range scale byte as the master's.
- **Emulator gate (`verify.py`, ColdFire port, module-alone native image `9af03715…`):** 32 of 32. OFF runs through the same 260 sequencer states as the original OS through a stock pattern change; three jumps (16 steps; 7 steps on Part 2; PER TRACK lengths and scales) equal a reference run of the incoming pattern since START on every tick after the landing (the author's reference-lock vector).
- **Native/browser (`module:verify direct-jump-kyoti`, on `3b197849`):** 150 selections, 62 matching images (all outside the platform writes), 88 matching refusals, 0 mismatches. Native pairs: 29 modules, 406 pairs in 3 contexts, none refused with Direct Jump. `--check` matches with the chooser-metadata row left out: a module without an effect id needs none, and the beta base hashes that file.
- **USB package:** `c277d24f…` (ABI 7, four guarded sites, 18 relocations), strict stock-free scans pass after re-encoding the landing's three kernel posts (longest shared run 10 counted bytes). No base input changes, so the published beta base stays as it is.
- **Hardware (owner's MKII, 24 October 2026, agent-driven over USB):** on the flashed beta base `b5fae2ae`, install and Keep, self-test, restore after a power cycle, self-test and removal; on a RAM-booted development twin, the toggle, jumps between a 64- and a 16-step pattern at the clock-locked position (A16 came back at step 48), three cues in one gesture, OFF waiting for the pattern end, and the sites stock after each rollback. The module's `evidence/hardware.md`.
- **Load (ot_emu, 62 s, same input on both images):** the longest frame interrupt the original OS's (29,434 vs 29,442 instructions, 167.3 µs in the port's time) and idle 0.36 points lower under a MIDI flood with clock at about 250 BPM and a jump every second; every message reached its handler. The tick hook runs at interrupt level 3, below the frame interrupt: at most 2,946 authored instructions on a landing tick (static bound 5,700).
- **Not tested:** on hardware a jump into another Part, START SILENT, trig conditions, PER TRACK scales, external MIDI, the arranger and chains, listening, the card build and an MKI; Play Modes as a running pair (each jump passes the transport-start path it watches).

## Analog Rytm MKII: Loop Sync in the library — 24 October 2026

Loop Sync 0.2.0-experimental (stigmagit, #853) leaves `_submissions` on the owner's release approval and is the Rytm's first library module with mod storage (a 3-bit sound field and 31 project fields). Downloads stay off (`DIGI_DOWNLOADS_ENABLED`).
- **Package:** compiled in the pinned toolchain image (`build-elemod-isolated.sh`, m68k-elf GCC 16.2.0, binutils 2.47) with the shared SDK's `analog-rytm-mk2/store.h` (#858), exported by `scripts/package-elemod-recipe.mjs` as `sdk/imports/packages/loop-sync/loop-sync-0.2.0-experimental-os1.74.elemod` (`2dd3d671…c196`) and pinned for the browser in `sdk/imports/elekloader-loop-sync-2026-10-24.json`; the overlay sync vendors it. Two compiles gave the same bytes, and `verify-elemod-release-exports.mjs` reproduces it with the other 23 exports. `digi-build.test.ts` plans core-ar2 0.3 with it on OS 1.74.
- **Not tested:** the package is not byte-identical to the author's emulator-tested LS18 build (GCC 12.2) and has not run in the emulator or on a unit. No browser build from a stock OS file ran here (no stock OS on this computer), so the storage lockfile round trip with a real storage module is still unexercised. On a unit: persistence across saves and reboots, external MIDI clock and CPU (the module's TESTING.md).

## Mod-storage lockfile per configuration — 23 October 2026

A machine configuration now keeps the mod-storage lockfile its last build returned, and the next build passes it back to the kit (`store` in the bridge's `build` call; `buildWithLock` in `src/engine/elekloader/machine-build.ts`), so a rebuild keeps every storage field in place. Before this, each build started from a new layout. This only matters for a core that keeps mod storage (core-ar2 on the Analog Rytm MKII); every other core returns no lockfile, so nothing is saved for it. The kit is unchanged: its client's `build` has no `store` argument, so Modwerk sends the same call through the client's `call`.
- **Where it lives:** `storageLock` on the saved configuration (IndexedDB), saved for the configuration the build started from, even if another one is open by the time it finishes. A build that returns the same lockfile writes nothing. The JSON backup carries it as `storage`; an import checks it with the kit's `checkLock` for that machine and refuses the backup if the kit would refuse the lockfile.
- **Tests:** `useDigiBuild.test.ts` (the lockfile given to the build, saved only when it changes, nothing for a failed build or a core without storage), `digi-selection.test.ts` (backup round trip and refusals) and `workspace.test.ts` (saved shape).
- **Not tested:** no browser build from a stock OS file ran here, so the round trip through the real worker (build, save, rebuild from the saved lockfile) is covered only by the kit's own `store` handling, in the vendored kit 0.7.0. No library module declares storage yet, so no saved configuration holds a lockfile until Euclid Accents or Velocity Humanise enter the library.

## Analog Rytm MKII: Filter Hz in the library — 23 October 2026

Filter Hz 1.2.0 leaves `_submissions` and is the Rytm's first library module, so the machine moves from research to preview with every step done. The configuration page now builds the core with library modules instead of the core alone; downloads stay off (`DIGI_DOWNLOADS_ENABLED`).
- **Package:** `scripts/package-elemod-recipe.mjs` exports the compiled recipe as `sdk/imports/packages/filter-hz/filter-hz-1.2.0-os1.74.elemod` (`95e455cb…0446`), pinned for the browser in `sdk/imports/elekloader-filter-hz-2026-10-23.json`.
- **Kit parity:** on the owner's stock 1.74, the vendored kit 0.7.0 builds the released core-ar2 0.3 and that package, with display version FZ74, into `62c25626…7745`, the .syx tested on a unit (FZ74). Modwerk's linker gives the same main OS, `2d8aead1…948d` (the module's `source-parity.json`).
- **Not tested:** the export was compiled with Ubuntu's `m68k-linux-gnu` binutils 2.42, not the pinned `m68k-elf` 2.47 toolchain; CI's `elemod-source` job checks it against that toolchain. No browser build from a stock OS file ran here. The browser does not keep a storage lockfile per configuration yet; no library module declares storage, so nothing is lost, and a storage module needs it before it enters the library.

## Analog Rytm MKII core build preview — 22 October 2026

The Rytm's page gets the Digitakt II's local core build preview: its configuration page reads the owner's stock OS, then checks and builds core-ar2 0.3 alone with the vendored kit 0.7.0. Downloads stay off (`DIGI_DOWNLOADS_ENABLED`), the machine stays in research and no Rytm module is in the library (the submissions stay in `_submissions`). The core is pinned in its own record, `sdk/imports/elekloader-core-ar2-v0.3.json`, from irpina's [core-ar2-v0.3](https://github.com/irpina/elekloader/releases/tag/core-ar2-v0.3) pre-release (`core-ar2-0.3.elemod`, sha256 `6b97dfb3…3e58`, as kit 0.7.0's web catalog pins it), fetched with `npm run elekloader:update -- --overlay`.
- **Wiring:** the kit device key `analog-rytm-mk2` maps to `analog-rytm-mkii` in the updater's `DEVICES`, `MACHINE_DEVICE` and the builder's machine types; the Digitakt II's preview checks become `isCoreBuildPreview` for both machines. Preview builds stay out of usage and download counts. The Digi recovery FAQ answer adds the Rytm's startup-menu route (FUNC at power-on, OS UPGRADE, MIDI DIN only).
- **Checks (Node 24.21, Linux):** `npm run pr:ready`; the builder plans core-ar2 0.3 for OS 1.74 and no core for 1.73; the page renders in Chromium (dev server) with the core build preview, core 0.3 and its 7.4 KiB of 128 KiB.
- **Not tested:** a browser build from a stock OS file (none here). The kit's linker and Modwerk's link core-ar2 0.3 alone on the owner's stock 1.74 byte for byte (#801's parity run). OS 1.73 is still listed as a stock release; its build stops at the missing core.

## Card firmware: PURGE SAMPLES froze the unit (#707) — 22 October 2026

Every card build moved the arena base literal at all 23 of its uses; the 23rd (`cmpa.l #0x40a955e0,%a2` at `0x400254f8`) ends PURGE SAMPLES' walk over the 16 banks, so the walk ran off the end of RAM. Upstream octabam a49a38de (#753) ported into the vendored `arena.py`.
- **Platform writes:** `platform-writes.json`'s arena rows and partial-OS cases regenerated with `export-platform-writes.py`'s logic against the vendored SDK; the same run with the old `arena.py` reproduces the committed rows, cases and `arenaSourceSha256` exactly. With the fix, only the `0x400254fa` row goes (27 words), each case one write fewer.
- **Browser card builds from the stock 1.40C OS:** FM Synth + Sidechain + Play Modes + Apply Scene, Mute Modes + USB Audio Out, and no modules: on main PURGE's compare held the moved base (`b5fc414adde0`); now the stock bytes (`b5fc40a955e0`), with the arena still moved.
- **Packages:** compiled in the isolated toolchain image and imported (code unchanged, provenance only); `octatrack:module-packages -- --check` with the toolchain: 23 identical, Play Modes held (#764). Tape Echo, Euclid, Play Modes, CC Map and Mute Modes recipes re-pinned (`arena.py`, and the rebuilt asset JSONs for Tape Echo and Euclid).
- **Analog BD companion proofs:** re-exported natively (`export-composition-proofs.py --suite analog-bd --static-stock --vendored-sdk`, 8 shards, menus precomputed with `defaultChoosers`): 212 proofs, the 162 accepted ones change only `sha256`/`osSha256` (the native image no longer moves the operand), every `maskedOsSha256` and all 50 refusals identical, `moduleSourceTreeSha256` moves. `verify-analog-bd-native.mjs` passes: 162 native OS and GNU bootloader comparisons, 50 matching refusals, 6 firmware round trips.
- **Already stale on main, unchanged:** `verify-static-composition-native.mjs` and `verify-coldfire-runtime-native.mjs` predate the core logger and fail for every profile on main.
- **Not tested:** PURGE SAMPLES on a unit with a rebuilt card image.

## elekloader kit 0.7.0 — 22 October 2026

The vendored kit moved from 0.6.0 (`7b5b5b8`) to 0.7.0 (`3b31ef3`), elekloader's [kit-v0.7.0](https://github.com/irpina/elekloader/releases/tag/kit-v0.7.0) pre-release, with `npm run elekloader:update -- elekloader-kit-0.7.0.zip --sha256 <the release's>`. The catalog is unchanged (`e18e59d`; upstream `0da420d`): the release's `elekloader-catalog.json` would move seven Digitakt and Digitone mods and their cores, which is a separate update.
- **The zip:** `elekloader-kit-0.7.0.zip`, sha256 `50c581b15bea8df121dc3a1ca34181681e7a135e85a8c3dbcf634dcee194a002`, the release's own. Rebuilt from `3b31ef3` with `packaging/build_kit.py`, every file is the same; only `kit.json`'s `node` differs (the release was built with Node 24.19, the rebuild with 24.21).
- **What changed:** 9 of 33 vendored files (`bridge.ts`, `devices.ts`, `link.ts`, `model.ts`, `patch.ts`, `version.ts`, the new `store.ts`, `kit.json`, `README.md`). The kit's worker, client, build steps and protocol (1) are unchanged. The engine gains mod storage for a core that keeps it (core-ar2 0.2 and later, Analog Rytm MKII): `link` allocates the mods' storage fields from a lockfile, fills the core's ID table and appends the lockfile after the image; `build` takes the previous lockfile (`store`) and returns the new one. Every one of these steps runs only when the core imports `__store_gen`, which no Digitakt, Digitone or Octatrack core does, or when a mod declares storage, which no library mod does. `devices.ts` also gains an Analog Four MKII profile, which no module uses. The codec is unchanged, so the Octatrack base's packer pin stays.
- **Checks (Node 24.21, Linux):** `npm run check` passes: `elekloader:check`, `licenses:check`, `machines:check`, `modules:check`, `modules:compat`, `modules:pairs`, the generators (no changes), `typecheck`, `lint`, the bundle build, the SDK checks and Vitest (321 files, 2,506 tests). Not run: the library build matrix against kit 0.6.0 (no Digitakt or Digitone stock file here), browser builds, firmware, DSP or hardware tests.

## RINGMOD SC 0.2.0-experimental — 22 October 2026

New Octatrack effect by Nathaniel Pavel (@npp1993): an insert whose gain follows another track's audio, read from the base's key bus (USB only, loader ABI 9, `requires keybus`). DUCK pulls the gain down with the key's peak; RING multiplies the audio by the key, with S&H, RECT and SLEW shaping the carrier. Effect ID 6, FX1 and FX2. Hardware (module's `evidence/hardware.md`): on 22 October the author's MKII ran this source's USB package `2ba32a49…` on a RAM-booted development twin (`53ddaf60…`, main's base with the module select step and key bus reader admission fixes): DUCK, plain RING, RECT, SLEW through 0 and S&H turned down by ear; two instances on both cores and slots; Part and project reload; every install and removal order beside Sidechain Compressor; two base self-tests passed. Parameter locks and LFOs, scenes, eight instances a core and a power cycle were not run on a unit.
- **Render gate (`verify.py`, 35 checks):** the model runs the key's low-pass, RECT and SLEW's level in exact integers and matches the DSP within 1.78e-07 of full scale over 576 settings (limit 4e-07); SLEW across 0 steps the output by at most 0.106 of the input (the build before: 1.798); S&H 127 → 0 equals S&H 0's output from the change on. DUCK, and RING with S&H, RECT and SLEW at 0, equal the unpublished 0.1.0 sample for sample.
- **Cost:** 63 cycles/sample in each mode loop (`cycle_count.py`); `perf.py` bench worst 80.56 executed instructions/sample (DUCK, trig split), RING 79.19, COMPRESSOR 72.06, SPRING REV 314.19; the base's key bus tap, charged to the module while installed, adds 72 a core. Stress: sixteen instances for 32 s under `-guard -guard-shared -dirty`, no clobber, per-core peaks 638.1 / 636.8.
- **Native/browser (`module:verify ring-sc`, on main `daffbbab`):** 142 selections, 56 matching images (24 identical outright, 32 outside the platform writes), 86 matching refusals, 0 mismatches.
- **Packages:** compiled in the isolated toolchain image and imported; the USB package (2,416 bytes, state 22) was built alone through `module_packages.build` and is stock-free. It installs on any key-bus base; it is not base-bound.
- **Beta base:** regenerated with RINGMOD SC's chooser row and main's flags (`--module-sets`, the six USB Audio variants, no `--cached-modules`) on main `a3c5fd52` (which carries #782's MISSING popup fix): `67ab0fae`. The five base-bound packages rebuild byte-identical, only `requiredBase` moves; Analog BD's recipe is unchanged.
- **Analog BD companion proofs:** re-exported natively in the toolchain image (`export-composition-proofs.py --suite analog-bd`, 8 shards, menus precomputed with `defaultChoosers`): all 212 proofs identical, only `moduleSourceTreeSha256` moves. `verify-analog-bd-native.mjs` passes: 162 native OS and GNU bootloader comparisons, 50 matching refusals, 6 firmware round trips.
- **Not tested:** on a unit, parameter locks and LFOs, scenes, eight instances a core, a power cycle and MKI; `fx:audit`. The key latency is carried from the 21 October key bus re-check, not re-measured through this module.

## FX Track 0.1.0-experimental — 22 October 2026

New Digitakt I module by draadpiraat for OS 1.54 on Core 2.1: SETTINGS > FX TRACK keeps the control changes a MIDI track sends on FX CONTROL CH for the delay, reverb, compressor and External Mixer inside the Digitakt, so parameter locks and the MIDI track's LFO play the effects. The source-only package from commit `f2de4341` (`fx-track-0.1.0-experimental-os1.54.elemod`, sha256 `41bf2191…b0a68fc5`) is pinned through `npm run elekloader:update -- --overlay sdk/imports/elekloader-fx-track-2026-10-22.json`; kit 0.6.0 is unchanged and the catalogue now holds 41 mods.
- **Package:** built in the pinned Docker toolchain (`build-elemod-isolated.sh`) from `34d55c7d`; linked with Core 2.1 it reproduces both emulator-tested SysEx files byte for byte (`a2ba6e80…` alone, `de7fb751…` with Input Pre-Fader Sends, Digi Health and Digi EQ).
- **Emulator (pinned digiemu `c1b5735`):** every CC on FX CONTROL CH read against the render's effects words gives the 33-number allow-list; MIDI track parameter locks on CC 24 set reverb PRE per step with the row ticked and leave by MIDI OUT unticked, alone and in the combined build. Load +66 mean, +74 worst cycles of 166,666 per block idle; no worst-case change while playing.
- **Hardware:** not yet tested; the PR stays a draft until the author's results are in.
- **Checks:** `npm run check` and `npm run pr:ready` on macOS. Firmware, linked images and emulator state stayed local.

## Input Pre-Fader Sends 0.2.0-experimental — 21 October 2026

Digitakt I module update by draadpiraat for OS 1.54 on Core 2.1: SETTINGS > KEEP FX AWAKE releases the stock delay/reverb hold (project load, double STOP) once its fade-out has finished, so external inputs reach the effects with no track playing. The source-only package from commit `bc9f90685cfa0204b43ebe83337197e328745926` (`input-prefader-0.2.0-experimental-os1.54.elemod`, sha256 `3ac8c4f9…fed82b26`) replaces 0.1.0's pin through `npm run elekloader:update -- --overlay sdk/imports/elekloader-input-prefader-2026-10-21.json`; kit 0.6.0 is unchanged and the catalogue still holds 40 mods.
- **Package:** built in the pinned Docker toolchain (`build-elemod-isolated.sh`) from `08ab54e6`; linked with Core 2.1 it reproduces both SysEx files the author flashed, byte for byte (`ddf836a3…` alone, `a60b869f…` with Digi Health and Digi EQ).
- **Emulator (pinned digiemu `c1b5735`, a tone fed into IN L/R):** a double STOP silences the input effects' tail; ticked, the hold releases within 1.5 s and the tail returns at full level, also with Digi Health and Digi EQ; unticked it stays held. Load +410 mean, +485 worst cycles of 166,666 per block (about 0.2% and 0.3%).
- **Hardware:** the author reports all seven steps passing on their Digitakt I, OS 1.54 (2026-10-20), alone and with Digi Health and Digi EQ; with those two the input effects were awake at power-on, which a control build without this module also showed. Pattern changes and sampling from the inputs not tested. Details: [TESTING.md](../sdk/digitakt/modules/input-prefader/TESTING.md).
- **Checks:** `npm run check` and `npm run pr:ready` on macOS. Firmware, linked images and emulator state stayed local.

## LOFI2 0.1.1-experimental — 21 October 2026

Update: Bryan T's octabam pull request 843 (`7795adf0`), the fix for [octabam issue 825](https://github.com/sambanks/octabam/issues/825): SHIFT's feedback cap 0.45 to 0.40, so the top of FDBK no longer sustains a tone after the input stops. One DSP data word changes.
- **P memory:** LOFI2's 1,354-word DSP package differs from 0.1.0's in one word, P+0x244 (`0x39999a` to `0x333333`); words, init, proc and relocations are identical. The USB package `a2ab2732…` differs from 0.1.0's `4f794ebc…` in those three bytes and keeps the hardware-timed 637. `cycle_count.py` (416), the bench (430.06 worst) and the 32 s stress run repeat 0.1.0's figures.
- **Render gate:** upstream's `verify_lofi2.py`, 73 checks, passes; the three new FDBK 127 tail checks read -69.2, -71.7 and -84.5 dBFS (0.1.0's source fails exactly those three, at about -4 dBFS). A 232-setting feedback scan finds no tail louder than -68.4 dBFS.
- **Native/browser (`module:verify lofi2`):** 138 selections, 48 matching images (20 identical outright, 28 outside the platform writes), 90 matching refusals, 0 mismatches.
- **Analog BD companion proofs:** re-exported natively (`export-composition-proofs.py --suite analog-bd --static-stock --vendored-sdk`, toolchain image, 8 shards merged in the committed order): all 212 proofs identical, only `moduleSourceTreeSha256` moves (`1c0b50fe…`).
- **Hardware:** the contributor's MKII, 22 October 2026, USB package `a2ab2732…` on a RAM-booted development twin of the beta base (`53ddaf60…`, MAIN.raw `712666cb…`), one instance on FX2 beside RINGMOD SC 0.2: the issue 825 repro (DOWN, RNGE HIGH, FREQ 64, MIX 127, FDBK 127) died away and the other functions passed, by ear.
- **Not tested:** with 0.1.1, more than one instance, FX1, reloads and a power cycle. Upstream reports, on the author's MKII and his own build, that four LOFI2 in SHIFT on one core with FILTER on FX1 lock the unit, on upstream `main` too ([octabam issue 850](https://github.com/sambanks/octabam/issues/850), open); disclosed as a limitation, not tried here.

## LOFI2 0.1.0-experimental — 20 October 2026

New Octatrack effect: Bryan T's LOFI2 from octabam `8250be0c` (ring modulator or stereo frequency shifter, then sample-rate and bit reduction and a shelf), effect ID 9, FX1 and FX2. Re-pinned the same day from `21f6de90` for the author's SHIFT fix `153063d8` (Hilbert coefficients squared). Hardware (module's `evidence/hardware.md`): on 20 October the contributor's MKII ran this source's USB package `4f794ebc…` on flashed beta base `6650236a` beside five other modules for about 15 minutes (every mode, the fixed SHIFT by ear, two instances on one core and a third refused DSP FULL); the base's self-test failed on ColdFire CPU, 98.8 % with the six modules on the uncached base, cause not confirmed. The previous source ran as card image LOFI2T03 and as USB package `7ee9277f…` on `acf91e0a`, with reloads and power cycles.
- **Re-pin, P memory:** LOFI2's 1,354-word DSP package differs from the previous source's in exactly the 16 immediate words of its `move #>imm,y1` instructions; words, init, proc and relocations are identical, and so is the ColdFire side of the native image. `cycle_count.py` (416), the executed-instruction bench (430.06 worst) and the 32 s stress run repeat the previous figures exactly, so the USB package (`4f794ebc…`) keeps the hardware-timed 637.
- **Render gate:** upstream's `verify_lofi2.py`, 70 checks, passes; the unwanted SHIFT sideband is -45.7 to -56.2 dB (previous source -18.7 to -30.7, failing 21 of the new checks).
- **Finding (`dsp_host`, both sources):** at FDBK 124-127 SHIFT's feedback sustains itself near full scale after the input stops at particular shift frequencies (now RNGE HIGH FREQ 60-76, before RNGE LOW FREQ 127). Disclosed in the module's README. Reproduced on the contributor's MKII with this source (UP, RNGE HIGH, FREQ 64, MIX 127, FDBK 127: a tone kept sounding after the input ended; FDBK 120 let it die away); DOWN, other FREQ values and the level were not checked there. It may not be intended (the code caps the feedback at 0.45 and expects the loop to settle inside the rail); asked upstream as a question in [octabam issue 825](https://github.com/sambanks/octabam/issues/825).
- **Native/browser (`module:verify lofi2`, on main `25d9d739` with Quant Live Rec in the pool):** 134 selections, 48 matching images (22 identical outright, 26 outside the platform writes), 86 matching refusals, 0 mismatches.
- **Packages:** compiled in the isolated toolchain image and imported. The USB package was built alone through `module_packages.build`, because the full run stops on the standalone recipes (as for Mini Verb 0.2.3).
- **Beta base:** main's `e68be568` (at `25d9d739`) and its six USB Audio layout variants rebuild byte-identical with the beta flags and `--usb-audio-variants`, without `--cached-modules`, Elekloader at kit pin `7b5b5b8`; with LOFI2's chooser row the same flags give `42326894` (.bin `3ba0b408…`), every variant passing the script's proofs. Lease symbols, arena and trust rows unchanged; the five base-bound packages and Quant Live Rec rebuild byte-identical, only `requiredBase` moves.
- **Analog BD companion proofs:** re-exported natively (`export-composition-proofs.py --suite analog-bd`, 8 shards, menus precomputed with `defaultChoosers`): all 212 proofs identical, only `moduleSourceTreeSha256` moves. `verify-analog-bd-native.mjs` passes: 162 native OS and GNU bootloader comparisons, 50 matching refusals, 6 firmware round trips.
- **Not tested:** on this source, BRR and LPF individually, the feedback case beyond UP at FREQ 64, reloads and a power cycle on a unit (previous source only); LOFI2 on `42326894` on a unit; eight instances and scenes on a unit.

## Mini Verb 0.2.3-experimental — 20 October 2026

Mini Verb's ring now wraps at 15,870 words (`m4 = m5 = $3dfd`), so on T3 and T7 it no longer writes the last 514 words of its FX2 slot, Sidechain Compressor's cross-core key window. Start-up keeps 128 dry calls; the last 124 clear inside the ring. Owner-approved update without hardware testing, bound to native source `6ccdb685…` (`sdk/miniverb-build-approval.json`).
- **DSP (verify.py, 76 checks):** run with this checkout's pinned dsp56300 and `dsp_host` (`27257a3e…`) on the owner's original MAIN OS. Output is bit-identical to published 0.2.2 from the first block: eight moving instances, every trigger split on both cores, hot input at TONE 0, 64 and 127. `-guard 15870 -guard-shared` sees no stray write in the eight-instance, dirty-memory and 30-second renders; the same guard reports 770 stray write regions per instance on 0.2.2. The guard gates had matched the text `0 stray write regions`, which `770 stray write regions` contains; they now match the whole number. Executed instructions equal 0.2.2's (23,488 per core per block, eight moving instances).
- **Native/browser (`module:verify miniverb`):** 126 selections, 48 matching images (18 identical outright, 30 outside the platform writes), 78 matching refusals, 0 mismatches. Its chooser-metadata reorder (POLY8 only, no entry changed) was dropped.
- **Packages:** compiled in the isolated toolchain image and imported; the USB package (2,770 bytes, buffer 15,870) is stock-free. It was built alone through `module_packages.build`, because the full `octatrack:module-packages` run stops on Tape Echo's, Euclid's and Play Modes' standalone recipes, which on main still name the Elekloader files from before kit 0.6.0.
- **Analog BD companion proofs:** re-exported natively in the toolchain image (`export-composition-proofs.py --suite analog-bd`, 8 shards merged in the committed order): the 76 selections with Mini Verb change, the other 136 are identical, no refusal flips, and only `moduleSourceTreeSha256` moves in the header. `verify-analog-bd-native.mjs` passes: 162 native OS and GNU bootloader comparisons, 50 matching refusals, 6 complete firmware round trips.
- **Not tested:** any hardware, Mini Verb beside Sidechain Compressor on one unit, chip timing, persistence and reboot. Over USB the base still keeps every custom FX2 effect off T3 and T7 while Sidechain is installed (its buffer policy table is empty).

## Input Pre-Fader Sends 0.1.0-experimental — 20 October 2026

New Digitakt I module by draadpiraat for OS 1.54 on Core 2.1: SETTINGS > INPUT SENDS PRE takes IN L and IN R's delay and reverb sends before their External Mixer LEV. The source-only package from commit `56dcead65f658a063d59ad53a44223b6dc20785a` (`input-prefader-0.1.0-experimental-os1.54.elemod`, sha256 `a30dc255…f28f54f`) is pinned through `npm run elekloader:update -- --overlay sdk/imports/elekloader-input-prefader-2026-10-19.json`; kit 0.6.0 is unchanged and the catalogue now holds 40 mods.
- **Package:** built in the pinned Docker toolchain (`build-elemod-isolated.sh`), byte for byte the package built with GCC 16.2 on the author's Mac and flashed for the hardware tests.
- **Links:** the vendored kit's `link()` and `linkMods` give the same MAIN image alone and with Digi Health and Digi EQ; `modules:check` finds no overlap with any Digitakt module.
- **Emulator (pinned digiemu `c1b5735`):** both mixer sites equal stock in every register over 20,000 random states when unticked; in running firmware the inputs' sends are 0 at LEV 0 unticked and full ticked, also from Digi Health's FAST AUDIO SRAM copy. Load +392 mean, +469 worst cycles of 166,666 per block (about 0.2% and 0.3%).
- **Hardware:** the author reports both builds working on their Digitakt I, OS 1.54, about 5 minutes each (2026-10-19); project save/load and sampling from the inputs not tested. Details: [TESTING.md](../sdk/digitakt/modules/input-prefader/TESTING.md).
- **Checks:** `npm run pr:ready` Ready on macOS (one unrelated test fixture needed Apple clang's `-Wnewline-eof` silenced; fixed separately in #716). Firmware, linked images and emulator state stayed local.

## elekloader kit 0.6.0 — 19 October 2026

The vendored kit moved from 0.5.0 (`3acac10`) to 0.6.0 (`7b5b5b8`), elekloader's [kit-v0.6.0](https://github.com/irpina/elekloader/releases/tag/kit-v0.6.0) pre-release, with `npm run elekloader:update -- elekloader-kit-0.6.0.zip --sha256 <the release's>`. The catalog is unchanged (`a46e75f`; upstream `0da420d`).
- **The zip:** `elekloader-kit-0.6.0.zip`, sha256 `1317770d150f409d137da46dc00fec47718cf9ec0c10723c43c0c29c7635673d`, the release's own, built by elekloader's kit-build workflow from `7b5b5b8` with Node 24.19 (rebuilt locally from that commit: the same bytes).
- **What changed:** 16 of 32 vendored files. The kit's worker, client, build steps, build log and protocol (1) are unchanged. `prepare` and `planBuild` now take the newest core whose RAM holds the selection (`Mod` gains the optional `ram_bound` and `ram_area`); with this catalog's cores (Digitakt 2.1, Digitone 2.0a and 2.2) that is the core taken before, for every OS. The engine also gained the 4.0 cores' RAM areas, the Digitone's sound-slot claims and Model:Cycles, Model:Samples and Analog Rytm MKII device profiles, which no module of the library uses. The lock, the elekloader licence entry and both notices name `7b5b5b8`. The kit's worker bundle is 95.95 kB (92.0 kB with 0.5.0).
- **Every Digitakt and Digitone file's bytes change** ([elekloader#88](https://github.com/irpina/elekloader/pull/88), for [elekloader#59](https://github.com/irpina/elekloader/issues/59)): the packed main OS is now stored padded to 4 bytes, as Elektron's own files are, and the packer's matches stop at 2048 bytes (were 4096), as Elektron's streams do. The Octatrack's ELEK main OS stays unpadded, so `formats.packMain` now takes the device: `octatrack-base.ts` passes it, and the Octatrack base's bytes can change only where its packed `.run` repeats more than 2048 bytes.
- **The packer pin moved.** `run-pack.test.ts` and `sdk/tests/test_run_pack.py` pin `5b6b45e7…f52951eb3` in place of `1b161af6…6786f515`: the kit and elekloader's Python at `7b5b5b8` (the checkout `npm run upstream:tools` takes for this kit) give that digest for the same stream, so the browser and native Octatrack builds stay equal. `python -B -m unittest sdk/tests/test_run_pack.py` passes 8 tests against that checkout. The vendor README's update steps now say to move both pins together.
- **Builds:** every selection of the library, each module alone and every pair, on Digitakt 1.53 (18 modules) and 1.54 (17) and Digitone 1.43 (2) (327; Digitone 1.44 has none), planned and built in Node through the kit's own client, `prepare` and build, by the 0.5.0 kit and by the 0.6.0 kit on this catalog: for all 327 the same core and mods; 51 refusals with the same text; 276 builds, every one with other bytes, as above. Each of the 276 0.6.0 files is byte for byte the one elekloader's Python at `7b5b5b8` (`patch.build`) makes from the same stock file and mods.
- **Browser** (local dev server with a stand-in community API, run on request): Digitakt 1.53, digihealth + NEIGHBOR + DIGISLICER built `b7649466…b43d7879` with core 2.1. That is the Python CLI's file for the same mods, and the file identity names elekloader `7b5b5b8`. Adding SOPHIE is refused, its sites overlapping NEIGHBOR's and DIGISLICER's. Digitone 1.43, digihealth + digitables built `6759a8d3…8442da6` with core-dn1 2.2, the matrix's and the Python CLI's file.
- **Checks (Node 24, Windows 11):** `elekloader:check`, `licenses:check`, `modules:check`, `machines:check`, `lint` on the changed files, `typecheck` and the production build pass; `licenses:generate`, `machines:generate` and `modules:generate` change nothing. Vitest: the same 44 fail as on main `a59677e` on this PC (local API, MCP device, page generator, python3 and module-source tests) and everything else passes, the moved packer pin included; `author-update-git.test.mjs` timed out once in a full run and passes alone (15 tests). Not run: `modules:pairs` (no python3 here), firmware, DSP or hardware tests. Stock files and builds stayed local and temporary.

## Syntakt boot probe on OS 1.40 and 1.42 — 16 October 2026

Source: `sdk/syntakt/core`, `src/engine/elektron/syntakt.ts`, `src/engine/elektron/stock-writes.ts`, from the static research in [SYNTAKT_OS_RESEARCH.md](SYNTAKT_OS_RESEARCH.md). Nothing below ran on a unit or in an emulator.

**Firmware-free (CI).** `src/engine/elektron/stock-writes.test.ts` proves the checker on synthetic NOP images: declared code change accepted, change outside a site refused, bad or missing guard refused, overlapping sites refused, protected range refused, tail over budget or without its hook refused, partial-instruction and PC-relative code sites refused, every problem reported at once. `src/engine/elektron/syntakt.test.ts` proves the profile: both releases bound by hash, no SDRAM area, protected map consistent with the probe site, the boot stub decodes as eight whole ColdFire instructions ending in the continuation jump (Ghidra 12.1.4's Coldfire decoder agreed locally), the probe links against a stand-in image with the `jmp`/`nop` site and relocated continuation, and any mod with `.run`, `.bss` or `.fast` is refused.

**Local (owner's files, `node scripts/verify-syntakt-core-probe.mjs`).** For each stock file the probe linked with one site (0x400004b2, 8 bytes) and a 48-byte tail, the stock-write checker reported exactly that change, and the rebuilt container passed `verifyEle3Build` (sections other than 3 byte-identical, 16-aligned layout, checksums, version `MW01`):

| Release | Stock `.syx` | Build `.syx` | Linked image | Stored main | Container | In-place margin (stock → build) |
| --- | --- | --- | --- | --- | --- | --- |
| 1.42 | `ded3c59f…37c1` | `f8493da70c09706337b20be1911eb8c77ca584f00d314e8d9052ec84d49f059f` | `041903b65fedbf885195c94f71e58dbb4371e84966b80f552507028e6bb095f6` | 1,363,181 B (stock 1,442,812) | 1,949,760 B (stock 2,029,392) | 96,357 → 16,679 B |
| 1.40 | `77812459…88ebf` | `5c7a5ac2714462f434b717188d223f924164634cae06613fbdbd07b326218c08` | `e46d4a52870eb44fdec3db7f281dc90f6f61f33e022ecf5fdc0c662aea2d44b6` | 1,332,261 B (stock 1,409,140) | 1,815,408 B (stock 1,892,288) | 160,989 → 84,063 B |

The repository's packer stores section 3 about 80 KB more densely than Elektron's, which narrows the in-place depack margin; the tail budget is 16 KB and every build is checked exactly.

**Not verified.** That the unit's bootstrap accepts a recompressed section 3 rests on public reports (Synthack-OS builds on 1.41 and 1.42); that the hook runs and the OS reaches the live UI; the SRAM signature; persistence; the FUNC + TRIG 4 recovery path on the owner's unit. The hardware steps are in the report's §10.

## Six Digitakt mods by sumedho on Core 2.1 — 14 October 2026

Source: `sdk/digitakt/dependencies/{machine-pages,dt-support}` and
`sdk/digitakt/modules/{midi-retrig,cc-names,euclidean,ram-machines,note-accumulator,sample-tools}`,
also published at [sumedho/digirequests](https://github.com/sumedho/digirequests)
`8eba613dc3e0b1698797609256fd4081923b4ef2`.

**Core.** The mods run on the catalogue's Core 2.1, so no core is added.
Machine Pages 1.2 is irpina's 1.1 adapted to Core 2.1:
- it reads a machine descriptor's UI tail itself instead of calling Core
  3.0's `core_machine_ui`;
- three firmware locations come from per-OS `cflags` and `defsym`.

`scripts/elemod-dependencies.mjs` leaves `core` to the machine's interface.
`scripts/verify-elemod-matrix.mjs` links the catalogue's pinned Core 2.1.

**Compilation and exports.** `scripts/build-elemod-packages.mjs` compiles the
eight objects for OS 1.53 and 1.54 with local m68k-elf GCC 16.2.0; no Docker
runtime was available. `scripts/package-elemod-recipe.mjs` exports the 16
packages under `sdk/imports/packages/`.

**Native parity.** `scripts/verify-elemod-matrix.mjs` compares the compiled
objects with the author's native Elekloader build of the same sources.
- Every object matches semantically. The only differences allowed are the
  non-executable `DT_OS154` selector and Sample Tools' added DIGISLICER
  conflict.
- All 63 feature selections per OS, 126 in total, link with Core 2.1 to the
  native MAIN byte for byte, through Modwerk's linker and the vendored kit.
- The all-mods MAIN is `ce2c0bd0…` on 1.53 and `14469be1…` on 1.54.

**Browser catalogue.** Machine Pages, DT Support and the six mods are pinned
through `--overlay` files in `sdk/imports/elekloader-*-2026-10-14.json`. Each
pin names the Modwerk commit that adds its package.

**Emulator and load.** The 13 regression cases of the author's 1.54
integration pass on both OSes: 26 runs, 0 failures. Render-load comparisons
with stock are in each module's `TESTING.md`. The worst audio block with all
six mods is 73% of the budget, against 62% for stock.

**Test change.** `src/community/service.test.ts` likes and rates every Digi
module as one member, and 18 modules exceed the 30-per-hour community limit.
The test now clears `rate_limits` per module; the limit itself is unchanged.

## Digi EQ 1.0.2-experimental — 11 October 2026

For issue [#185](https://github.com/repeat98/modwerk/issues/185), the native page-clear callback now resets all sixteen EQ band parameters; the EQ box aligns with the pattern header at x=13. Filter DSP and stored EQ layout are unchanged. Source-only packages from commit `1107d484c8d7ad84cfff14917b34acdcb83a53e6` replace the two 1.0b pins through `npm run elekloader:update`; kit 0.5.0 remains unchanged and the catalogue revision is `94516877d374af1e7c14a69c6c7602773590e8045fd8f3b8c1fcaa47e155f6fc`.

Native panel regressions on OS 1.53 and 1.54 reset all band parameters and preserve EQ-unowned bytes across all eight sound records. Repeat Clear, pressed Q mode, FUNC+PLAY and Internal Mixer Clear isolation pass. Current native screenshots show complete EQ/Q-type pages. Exported packages, private recipe materialization and final pinned builds save the same D185 images. Static module memory is 9,146 B before shared dependencies/alignment. [The source-bound evidence](../sdk/digitakt/modules/digieq/evidence/clear-1.0.2.json) and [physical test steps](../sdk/digitakt/modules/digieq/TESTING.md) state exact images and unverified hardware, audio, DSP timing, complete runtime memory bounds, persistence, physical reboot, stress and clipboard/undo coverage. Owner repeat98 approved this exact version/source and both D185 images for experimental publication and #185 closure after saved live-download verification, with those limits disclosed. The literal statement and exact scope are in the evidence JSON; this records no hardware pass.

**Owner-approved logger release (3 October 2026):** the owner explicitly lifted the logger addition’s qualification restrictions, authorized local firmware/DSP checks, approved the current module versions and logger for release, and waived hardware testing. Downloads are enabled with the logger included. This exception does not claim measured chip timing, complete stress qualification or new hardware evidence. Existing firmware isolation, original-source provenance, compatibility checks, stock fingerprint guards and packaging integrity remain in force. MIDI Scenes keeps its pinned standalone code and 12-page reservation; the logger occupies the top 16 pages of the arena, and a one-page guard separates it from the sample arena; guarded arena updates reserve all 29 pages. Mixed MIDI Scenes configurations remain incompatible. The earlier full-image proofs below predate logger integration; local verification of this change is recorded separately. See [logger evidence and limitations](../sdk/runtime/logging/TESTING.md).

## Digi Mono 0.13.3-experimental — 11 October 2026

For issue [#182](https://github.com/repeat98/modwerk/issues/182), the PULSE page moves descriptors so SUB1/SUB2 use G/H as on SAW. Stored slots and synthesis sources are unchanged. Two source-only packages from commit `20ce6bcc910741ab2bc49fd288ee57dd13d7900f` replace the 0.13.2 download pins through `npm run elekloader:update`; the kit remains 0.5.0 and catalogue revision is `55fb4937fc92338acce5b2ef73cb783488d0acfd00f65e9d8c0bbf0311792825`. The precise generated revision and package hashes are authoritative in [the encoder evidence](../sdk/digitakt/modules/digimono/evidence/encoder-layout-0.13.3.json).

Native panel encoder regressions pass on OS 1.53 and 1.54. Exported packages match private materialized recipes byte for byte. Static memory is 32,417 B before shared dependencies/alignment. The current gallery has a complete SAW/PULSE view and documents common-region omissions on NOISE/ENS. Node 24 checks pass: 1,698 app tests, 88 SDK tests, lint, type checks, catalogue/licence/capture checks and production bundle. The owner approved this exact source and both D182 images for experimental release/#182 closure after live-download verification, with all qualification and NOISE/ENS capture limits disclosed. This records no hardware pass; [TESTING.md](../sdk/digitakt/modules/digimono/TESTING.md) records exact D182 images, required physical steps and all limits.

## Sidechain Compressor 0.1.2 — 10 October 2026

0.1.2 adds `sc_norm` (ColdFire unit 134 → 338 B) and two guarded `jsr` detours over the page-2 copiers' first instruction, so a COMPRESSOR saved on stock firmware (page-2 slots `0x7f/0/0/0`) comes up with KEY OFF, KFLT and KGN centred and MON OFF. DSP source and tables are unchanged. Source: octabam `9228782`, author pin `329b801`. [TESTING.md](../sdk/octabam/modules/sidechain-compressor/TESTING.md) has the details.

**Native and browser.** `npm run module:verify -- sidechain-compressor` built all 122 coverage selections natively and compared the composer against them. The two native suites were regenerated with `export-composition-proofs.py`: the original eight modules build 200 of 512 and the nine visible modules 786 of 1,024. 16 original-suite selections built in the 0.1.1 record now refuse for core A DSP space; all hold Spectrum or Character, and unchanged `main` refuses the same 16 with the same word counts. 12 visible-suite selections that `main` builds are refused by 0.1.2's larger unit, for ColdFire cave space; every selection of one or two other modules still builds. The Analog BD suite (22 refusals, stock effects only) is unchanged and was not regenerated.

**Packages.** Rebuilt in the pinned image with `scripts/build-modules-isolated.sh`; only the sidechain ROM unit's bytes change, the DSP package's code words are identical and the other packages move only their version labels.

**Hardware.** The author flashed the module-alone native image (MAIN OS `2816f0bc…`) on an MKI and reported a functional pass: a stock-saved compressor reset, two instances across both cores, MON, Part/project reload and a power cycle. No stress, timing or maximum-load test.

## Output Matrix 0.1.0 and hooked DSP without a menu entry — 9 October 2026

Output Matrix is the first module whose DSP code is reached only through stock-code hooks, with no FX menu entry, beside a ColdFire unit. The packager compiles it as a requested ColdFire module and as a hooked DSP module; a hooked package without a menu entry carries no effect id or stock key. The browser's static placer puts hooked code only on the payloads its packages name, as native `build_bus.py` does (core 0 here), and the loader path refuses the module. Native octabam needed no change.

- **Other modules unchanged.** Every compiled package is byte-identical outside provenance labels; the only additions are Output Matrix's DSP package, ColdFire object and patch group. `npm run module:verify -- --all --check` gives the same results for every other module on this branch as on untouched main.
- **Native comparison.** 126 selections: 44 builds match native outside the platform writes, 82 refusals match, 0 mismatches. The first run differed in seven stock pointers to the module's constant AUDIO page tables, which were in `.data`, where the browser runtime's logger moves them; the tables moved into `.text`.
- **Gate and hardware.** The module's `verify.py` passes 117 checks on the native image of the final source, which the author also ran on an MKII (OUTMTX13; [TESTING.md](../sdk/octabam/modules/output-matrix/TESTING.md)). `dsp_host -guard -dirty` runs dispatched effects, not the mixdown these hooks are in, so the stress run is the whole image under `ot_emu` with the stress project playing A01–A04 for 32.65 s: no hang, no late DSP read-back. `perf-audit` accepts such a run (`stress.harness: "ot_emu"`, `guard`/`dirty` null) only for code reached through stock hooks, and `module:doctor` only for a module without an effect id.

## elekloader kit 0.5.0 — 9 October 2026

The vendored kit moved from 0.4.0 (`a1be3ce`) to 0.5.0 (`3acac10`), elekloader's [kit-v0.5.0](https://github.com/irpina/elekloader/releases/tag/kit-v0.5.0) pre-release, with `npm run elekloader:update -- elekloader-kit-0.5.0.zip --sha256 <the release's>`. The catalog is unchanged (`a1be3ce`).
- **The zip:** `elekloader-kit-0.5.0.zip`, sha256 `f630b0fc9e03fb3a8fc729937e8aafa4849492d438359451d89515bb1e2344ad`, the release's own, built by elekloader's kit-build workflow from `3acac10` with Node 24.19.
- **What changed:** 10 of 32 vendored files: `README.md`, `kit.json`, the engine's `devices.ts`, `elemod.ts`, `link.ts`, `model.ts` and `version.ts`, the new `dsp.ts`, `kit/catalog.ts` and `tools/kit.ts`. The kit's worker, client, `prepare`, build steps, build log and protocol (1) are unchanged, so `digi-build.ts` is too. The engine gained the Octatrack's DSP linking, its sized RAM reserve and the Digitone's `bulk` area, which no module of the library uses. `planBuild` now takes the newest core of the oldest major line a selection allows; with this catalog's cores that is the core it took before, for every OS. The lock, the elekloader licence entry and both notices name `3acac10`. The kit's worker bundle grows from 84.1 kB to 92.0 kB.
- **Builds:** every selection of the library, each module alone and every pair, on Digitakt 1.53 and 1.54 and Digitone 1.43 and 1.44 (116), planned and built by the 0.4.0 kit and by the 0.5.0 kit on this catalog: for all 116 the same core and mods, and the same file or the same refusal, byte for byte.
- **Browser:** Digitakt 1.53, digihealth + NEIGHBOR + DIGISLICER built `5031993c…eebe6b`, the identity recorded for 0.4.0, and the file identity names elekloader `3acac10`. Adding SOPHIE is still refused for its conflicts with NEIGHBOR and DIGISLICER.
- **Checks (Node 24, Windows 11):** `elekloader:check`, `licenses:check`, `modules:check`, `machines:check`, `lint`, `typecheck` and the production build pass. Vitest: 1,490 pass, and the same 7 fail as on main `335f38d` on this PC (the forum, module and site page generators, the module-source fingerprint, publication and scaffold tests). `sdk:check` fails on main too: `test_requested_imports` for `sdk/octabam/modules/analog-bassdrum/README.md`, which #367 changed without its import record. Not run: no firmware, DSP or hardware test. Stock files and builds stayed local and temporary.
- **The catalog stays at `a1be3ce`.** elekloader's 0.5.0 catalog brings DIGISLICER 2.2 and core-dn1 2.3: taking it changes 20 Digitakt selections (DIGISLICER) and the three buildable Digitone 1.43 ones (the Mod Menu becomes a grid), and DIGISLICER's module (its imported 2.1 source, captures and memory) has to be updated first. That is a change of its own. It must not land before this kit: the 0.4.0 kit's core rule would take core 3.0, which that catalog lists, for every Digitakt build.

## Analog BD 0.1.4 — 9 October 2026

The owner accepted actual AB014REF05 firmware-emulator audio, then explicitly
waived fresh physical hardware/persistence, worst-case chip timing and complete
memory bounds for this exact source. Current hardware remains untested. The
909 body, Tune endpoints and direct-out Attack response follow Skee Mask's
private recordings more closely; transient-shape variation remains smaller than
the reference and intermediate knob positions are an interpolation.

Native and browser composition agree across 112 configurations: 36 matching
builds outside existing shared platform writes, 76 matching refusals and zero
mismatches. Both-core DSP gates cover all 128 values of ten controls, moving
controls, all 16 trigger offsets, distinct interleaved voices and exact-image
source/stock AMP output. Matched 909 executed instructions increase by 6.22%
on average, with unchanged 808 output/cost and unchanged memory allocation.
Counts are not measured chip timing. Fresh DSP-enabled control/assignment
captures were opened and reviewed. The required Node 24 check passes 1,402
app tests in 200 files and 86 SDK tests, catalogue/licences, lint, types and the
production bundle. Firmware and reference audio remain private.
See [the exact-source approval](../sdk/analog-bassdrum-build-approval.json) and
[the testing record](../sdk/octabam/modules/analog-bassdrum/TESTING.md).

## Digitakt II browser-builder preview — 10 October 2026

This work adds a local, non-downloadable Modwerk preview for the Digitakt II;
it does not mark the machine available or publish its mods. The profile stays
`research`, the `mods` step stays `open`, and the device-specific download gate
is false. The exact stock file remains local and no output firmware was saved
by the browser test.

The pinned source is elekloader kit 0.5.0 (`3acac10`) plus the stock-free
site-owned overlay `sdk/imports/elekloader-digitakt2-perform-v1.0.json`, from
toonst's v1.0 release. `npm run elekloader:update -- --overlay
sdk/imports/elekloader-digitakt2-perform-v1.0.json` fetched the three release
assets by their source pins, checked SHA-256, updated the generated catalog and
lock transactionally, and passed the Elekloader vendor and licence checks.
Catalog revision is `49b6059bec17c74170e1a09467b776ab3d556d0c8e9a6ee3f32905463f81e307`
(six cores, 23 mods); all pre-existing package pins remain present.

Modwerk's adapter maps `digitakt-ii` to `digitakt-mk2`; the catalogue importer
retains that device, and the Elekloader planner selects only OS 1.17's DTII
core/mod packages. Modwerk's local ELE3 reader recognizes the exact stock
file/hash and uses a separate browser-storage key. Its legacy, unsealed ELE3
writer and verifier explicitly refuse HMAC-sealed device profiles. The app
offers a research-stage core preview, while the `DigiBuildPanel` test confirms
there is no DTII download action. Existing mk1 download approvals are unchanged.

The real stock OS 1.17 file was selected through the local page and identified
as Digitakt II 1.17 by full-file hash. In the same browser, Modwerk's
`createDigiBuilder`/`prepareBuild` worker path built `core-1.0`,
`perform-direct-1.0` and `perform-levels-1.0` as `PB10`; SHA-256
`9b86f3f5208d96e359cb226eed6e2e9d3df4ebb14be7e0e21213456f4cec6566`,
2,184,480 bytes. This exactly matches the independent Elekloader build. Its
log reports 261,380 bytes of DDR spare and 3,840 bytes of fast SRAM spare;
sections 2, 4, 5, 7 and 8 are unchanged, with 2,303,048 bytes minimum
in-place depack gap and 1,422,112 bytes flash headroom. The browser engine
verified the output in memory. The app's visible build button still requires
sign-in; this check invoked the same worker API directly in the browser.

Focused checks passed: Elekloader DTII suite 18/18 without skips, required
Elekloader unit suite 17/17, Modwerk builder/planner, profile, reader, writer
refusal, storage isolation, catalog overlay, library-preview and download-gate
tests (90 tests total). On current main `b51143f`, Modwerk typecheck and
production bundle pass; lint has no errors and six warnings in existing
community/bootstrap files. `machines:check` validates 17 profiles, including
four SDKs, and `elekloader:check` verifies the 0.5.0 kit and 49b6059 catalog.

The full app run reports 1,680 passed and 11 failed tests across seven files.
The failures concern the current MIDI Scenes 0.2.5 qualification/source
records, utility release fingerprints, module changelog checks and checks that
cascade from those records; none names DTII. `npm run check -- --base
origin/main` and `modules:generate` stop at `modules:check` because MIDI Scenes
0.2.5 lacks the current required worst-case cycle, exact-memory and hardware
qualification record. With Python 3.12, `sdk:check` reports 87 passed and one
failure: `test_catalog_and_author_dependencies_remain_exact` still expects
MIDI Scenes 0.2.4 while the current catalog pins 0.2.5. No MIDI Scenes or
utility-release files were changed here.

Remaining before public module availability: import reviewed Modwerk module
folders with complete tutorials/screenshots and exact source provenance; add
them to the SDK catalog only after qualification; test the exact combined
source on a DTII unit (the author does not report the current pair tested
together); receive owner review. No hardware was flashed, and no firmware
download was enabled or produced.

## Digitakt II integration preparation - 9 October 2026

This is upstream package/build verification, not approval to enable Digitakt II
downloads in Modwerk. The machine remains `research`, without a Modwerk SDK or
module listing. No unit was flashed and no new emulator run was made.

Inputs: elekloader `3acac10` (0.5.0), digitakt2-perform source
`09688a6ca194dd8a9f07130a30545c6ec3816d11`, and the owner's stock OS 1.17,
SHA-256 `26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5`.
The source build used `m68k-elf-*` and Python 3.9.6 on macOS.

The packages downloaded from [toonst's v1.0 release](https://github.com/toonst/digitakt2-perform/releases/tag/v1.0)
passed elekloader's shop loader checks for hashes, device identity, format and
redistributable licence:

| Package | SHA-256 |
| --- | --- |
| core-1.0.elemod | `95303655a9358f581b485acb68b884b394a577f5d0b373f0a3e5957c8d0ca72c` |
| perform-direct-1.0.elemod | `601b187f5af3025234c83e8c077b1e8f4ac755a8f1a8c929ab03aff331f30732` |
| perform-levels-1.0.elemod | `bb100389f2800401495ca3fa3a52d5974bb00434a8a70fd6f89978ec6b25d9e6` |

Both mod packages reproduced byte-for-byte from source. The locally built core
had SHA-256 `4bfb84c9f553edede11846d08eabcca815977b7fe6c4305eeacd895b9cc9854d`;
its parsed package differed from the released core only in the `build` metadata.
The three locally built packages linted together at 764/262144 bytes RAM and
0/3840 bytes fast SRAM. The output checks below used the released core and mods,
not a substituted local core.

| Selection, always including core | Version | Verified SysEx SHA-256 |
| --- | --- | --- |
| perform-direct | PD10 | `d9a7d90d2f9750c04942d99238aeba9134d1739ab9cbc834102c169365690db1` |
| perform-levels | PL10 | `72748884eab12062031ae1a830db067e1702d4f2216b122cfb3d293702cb92eb` |
| Both mods | PB10 | `9b86f3f5208d96e359cb226eed6e2e9d3df4ebb14be7e0e21213456f4cec6566` |

Each in-memory build passed elekloader's output verification and preserved
stored sections 5, 2, 4, 7 and 8 exactly; only MAIN changed. The required
`tests/test_units.py` passed 17 tests. With `ELEKLOADER_CROSS=m68k-elf-` and
`ELEKLOADER_DT2_SYX` set to the owner's stock file, `tests/test_digitakt2.py`
passed all 18 tests without skips, including the byte-exact stock writer check.

Reproduce package creation with digitakt2-perform's `build.sh`, then use
`python -m elekloader.patch` with the released core, each selection above,
the corresponding `--version`, and the owner's `--stock` file. Keep all
packages and output firmware outside tracked source.

The author reports individual hardware results, with perform-direct's report
covering an earlier version with a PERSONALIZE row. The pair is not reported
tested on a unit. No historical hardware waiver elsewhere in this document
applies to DTII. This initial record predates the catalog, reader and
browser-builder preview documented above. Reviewed module records, screenshots,
exact-version hardware qualification or an explicit owner waiver, and owner
review remain outstanding before Modwerk can offer downloads.

## USB Audio 0.2 / Outbox 8 — 8 October 2026

Version `0.2.0-experimental` adds six selectable USB output layouts and an
Outbox routing-plan configurator to the existing module page. The owner
approved release without hardware testing; hardware behavior, real-chip
cycles, complete stack / DMA bounds and canaries remain unmeasured. The
source-bound approval is in
`sdk/usb-audio-out-tracks-main-cue-build-approval.json`. No inherited result
is presented as current hardware qualification.

The shared stock-free pipeline built and imported all source-only packages
in the isolated toolchain container. Descriptor MSC spans and the post-LEVEL
curve remain zero placeholders in distributed artifacts. All six layouts
passed complete GNU runtime byte/symbol comparison alone, with Quantizer,
and with Tape Echo + Euclid (18 cases). Every case passed guarded hooks,
combined-ISR checks, immutable stock and full packaging round trips. Public
composition matched each case; the public worker inspected the original and
produced complete packaged firmware for all six standalone layouts. Altered
stock was refused. Only hashes/linked-section data are committed in
[sanitized layout evidence](../sdk/octabam/modules/usb-audio-out-tracks-main-cue/evidence/layouts.json).

Configurations without USB settings retain the classic source path. Its
current native comparison covers 110 selections: 50 builds matching outside
the shared platform writes, 60 matching refusals, zero mismatches. The
existing Analog BD interaction matrix was regenerated: all 136 native
identities/refusals equal the earlier outputs. Its browser/GNU bootstrap
verification passed 130 builds, six refusals and five complete packaging
round trips. No firmware or stock-derived binary was committed.

The GUI keeps the existing page structure, distinguishes physical Outbox
outputs from USB source pairs, explains estimated CPU tiers and requires an
explicit setup before adding USB Audio. Source integrity, backup/share
persistence, configure-first navigation, routing feedback and compact
responsive layout were checked. See the module's
[testing record](../sdk/octabam/modules/usb-audio-out-tracks-main-cue/TESTING.md)
for scope and the preserved historical evidence.

The required full check passed 1,169 tests in 177 files, 49 SDK tests,
licence/catalog/source checks, lint, type checks and the production bundle.
The broader `module:verify -- --all --check` still reports old companion
records for Euclid (8), Mute Modes (2), Playmodes (2), Recorder Loop Fix (4)
and Sidechain Compressor (10). A clean archive of main at `11fa6d5` produces
exactly the same failures, relating to the earlier Synth / Analog BD updates;
this release introduces none. The updated USB record also removes main's
four stale Synth companion comparisons. Those unrelated records were not
relabelled as passing or refreshed as part of this USB release.

## One command for the native comparison — 5 October 2026

`npm run module:verify -- <id> --os <your 1.40C update>` replaces the per-module suites and verifier scripts for new modules (owner decision in [DECISIONS.md](DECISIONS.md#5-october-2026--a-faster-module-workflow)).

**What it runs.**
- Native octabam runs in the pinned toolchain image: no network, the checkout mounted read-only, the extracted MAIN OS kept in a private work directory outside the repository.
- It builds the module's coverage set from `scripts/module-coverage.mjs`, in parallel. The set is the module alone, beside each other offered module, every module together, every module together but one, and a fixed sample of 24 selections in between. Each runs with and without the stock FX2 effects.
- Each native result is cached by the SDK sources, the exporter, the image, the original OS and the menus.
- The browser side is the same comparison as before, now in `scripts/native-comparison.mjs`.
- The record, `sdk/native-comparisons/<id>.json`, holds fingerprints and refusal messages only.

**Checked on Sidechain Compressor 0.1.1-experimental** with the owner's original 1.40C (MAIN OS `164f3122…`):

| Check | Result |
| --- | --- |
| Coverage set | 90 selections: 62 built, all matching native (20 identical outright, 42 identical outside the platform writes); 28 matching refusals; 0 mismatches |
| Same native builder as before | All 90 native results, run in the image, are identical to the host-built results in the three Sidechain suites above: image sizes, full and masked SHA-256 and refusals |
| Speed | First run 60 s with eight jobs; a rerun from the cache 13 s, writing a byte-identical record; `--all --check` 12 s |
| It catches a real difference | With today's stale-FX1-row fix in `src/engine/choosers.ts` undone, `--check` reports 62 mismatches and exits nonzero |
| No new declaration records or chooser entry needed | All 1,024 declaration checks for the module were already recorded, and the native chooser metadata matched the committed file |

`src/catalog/native-comparisons.test.ts` requires a record that matches the current code of every offered module. The modules compared by the earlier exhaustive suites are exempt only while their code fingerprint is unchanged.

## Sidechain Compressor on the shared builder — 5 October 2026

Sidechain Compressor 0.1.1-experimental takes stock COMPRESSOR's row on both effect menus, keeps its dispatch and carries its code in three guarded hooks per core. It is built by the same composer as every other module. The owner waived fresh hardware evidence only; software, composition and documentation gates are unchanged. [Its testing report](../sdk/octabam/modules/sidechain-compressor/TESTING.md) and [evidence record](../sdk/octabam/modules/sidechain-compressor/evidence/common-builder.json) carry the details.

**Composition against native octabam.** Native octabam (the pinned SDK) and the browser composer built every selection containing the module: the eight original modules (512 selections), the nine visible modules other than Analog BD (1,024) and Analog BD alone, beside each other module and beside all of them (22), each with and without the stock FX2 effects. Native built 1,014 and refused 544. The composer refused all 544 for the same class of reason, and for all 1,014 its module-owned writes (chooser, descriptors, ROM units, DSP payloads) equal native's image byte for byte outside the platform writes, 124 of them identical outright. The platform writes (arena sizes, the boot call and Tape Echo/Euclid detours) differ because the browser always links the core logger, which native cannot, so they are compared with their spans reset to the original bytes; none overlaps a byte a module owns. `node scripts/verify-sidechain-native.mjs` repeats this against the owner's own 1.40C file, and the committed fingerprints hold hashes only.

Among the nine visible modules other than Analog BD, the module builds beside every other module and every pair; 798 of the 882 selections that build without it still build with it. The 84 it newly refuses hold Euclid or Scale Quantizer with at least two more modules and run out of effect-menu cave space. No selection refused without it builds with it. Among the eight original modules it newly refuses 48 selections, all containing Spectrum, Modulation or Character, which the site does not offer. Analog BD is refused beside every custom DSP module, as in native.

**What the comparison fixed.** The first full comparison found four differences, all in the composer and all fixed: native also takes over the replaced effect's row in the stock FX1 list; while stock FX2 stays, native places the replacing module's descriptor and ROM units first, and the composer now follows; and the composer built Analog BD beside it where native refuses.

**Existing modules.** The native output for all 512 selections of the original eight modules is identical with and without the shared-builder SDK changes. The committed `static-composition-proofs.json` does not reproduce under the unmodified SDK for 144 of its TapeHead selections (every selection without TapeHead reproduces), so those fingerprints already predated the current TapeHead; that is not caused by this change.

**Against the author's image.** The module's own bytes in the shared-builder image equal those in the image octabam f80ecfe builds from its sidechain profile (MAIN SHA-256 `b5aa8cee7787a3dc0ea53007fe31358ba14d155421ebec9c7f98948de740675f`). The two images differ in 56 bytes: the FX1 chooser list the shared builder relocates, its three references, and six stock DSP words that newer octabam applies to every build (stock's cross-core mailbox moves from Y:0x38000 to 0x37F00 and payload B's boot zero loop widens to cover it). None lies on a word the module claims. The cycle and memory measurements, taken on the author's image, therefore describe the module's own contribution in both.

**Resource ledger.** `tools/remix/ledger.py` now checks declared DSP data ranges (`Claims.dsp_ranges`), every module's absolute x:/y: literals against those ranges (with a bus client's `$9xx` reads taken where XBUS relocates them) and stock's own shared-window tenants. Sidechain is clean beside every module and all of them together; without XBUS, Character's `$990/$991` reads fall inside its keybus and are refused. The 1,024 declaration checks for visible-module selections that contain it are recorded by `scripts/export-native-checks.py`, which first re-checked all 4,719 existing ledger-composed records.

**Emulator.** The headless emulator boots the native image and the complete composed image, with its runtime and the core logger, on an empty card; KEY, KFLT, KGN and MON draw correctly and the three captured frames are pixel-identical between them. These frames show the UI only. No audio, ducking, cross-core timing or mixed-image stress run was made, and no cycle bound is summed with another module's.

## MIDI Scenes logger boundary fix — 3 October 2026

The logger-enabled image from the download restoration below passed byte parity but failed project loading in the emulator: its first four logger code bytes at `0x4600dde0` became zero, and execution stopped at `0x4600dde4`. The author image loaded the same project successfully. This failure reproduced with both the pinned prebuilt emulator and a CLI freshly linked from the reviewed native inputs.

Reserve one extra 6,144-byte guard page below the logger, keeping the author’s bottom 12 pages, its base operands and the logger’s top 16 pages intact. The sample arena now ends at `0x4600c5e0`; its trailing free-list word lands in the guard instead of logger code. Total reserved sample/recorder memory is 178,176 bytes (29 pages), an additional 6 KB. The build rejects a plan without this protected gap. All original FX1 and FX2 effects remain available for standalone MIDI Scenes; mixed selections still refuse.

Independent native reconstruction of the complete MAIN image matched the browser composer. GNU logger bytes and symbols, populated configuration/replay, the complete native bootstrap append, native ELEK/ELUP packaging and round-trip checks passed. The actual browser worker passed both stock-menu settings, all thirteen companion refusals, altered/truncated input rejection, stale-base clearing and input preservation. The updated private worker check is `scripts/verify-midi-scenes-worker.html`.

| Fixed MIDI Scenes identity | Value |
| --- | --- |
| Module version | `0.2.4-experimental` |
| MAIN SHA-256 | `a5af848dfcb3d4b9e060e8385666330cb2f1e5b0dcbb0531e555b6417b7e7805` |
| ELEK SHA-256 | `7e2a6d15fcbd821d21fb6213b1d496bd5ecdafe2bf5de7ad577dc75a7656dcc7` |
| ELUP SHA-256 | `62da520eb0a22f8b3bf8edcdf97cc99c0647566d59df0dc53dc44fbeee17e002` |
| Update bytes | 454,808 |
| Logger runtime bytes | 60,572 |

The exact fixed MAIN image passed the reviewed `scripts/midi-scenes-emulator/panel.py` eight-track scenario with a fresh fixture: 795 commands, project load, eight active FLEX tracks, 24 audio LFOs, four dense/lock patterns, crossfader and MIDI input, 401,316 captured frames, nonzero stems on all eight tracks, zero dropped capture frames and 103 MIDI UART output bytes. The sample/card fixture and native inputs match the existing reviewed runner pins. Both audio FX slots were NONE; this is not maximum stock FX load. `npm run check` passed 347 application/domain tests, 31 SDK tests, lint, types and the production build; module checks against main passed. Hardware tests were waived by the owner. Firmware, cards, raw captures and stock-derived intermediates remained private and temporary; only identities and aggregate observations are recorded here.

## Logger download restoration — 3 October 2026

The production browser worker was exercised locally with the owner's verified 1.40C file. Each of the eleven visible modules passed validation, composition, full-file packaging and an independent SHA-256 check as a standalone selection: MiniVerb, Tape Echo, Euclid, Repitch, Tapehead, Analog BD, MIDI Scenes, USB Audio, Scale Quantizer, Preview Volume and CC Map. Incompatible MIDI Scenes/Repitch and Analog BD/Tapehead selections were refused. An altered original was refused, invalid inspection cleared the prior usable base, and the original input remained unchanged.

The actual configurator built MIDI Scenes with its logger, offered `Download .bin`, and saved a 454,808-byte file. The downloaded file's SHA-256 matched the worker result: `bef108339c186dbb7b8298a523a1ae40598383cc0ad8310d4199be22e8879c0e`. Its total arena reservation is 172,032 bytes (12 author pages plus 16 logger pages).

Native GNU linking matched the browser linker for twelve logger runtime inventories; this checks linking and symbols, not every public composition. The relocated MIDI Scenes logger separately matched GNU bytes/symbols, and its complete packed loader append matched independent native packing and GNU assembly. Existing logger host tests passed. `npm run check` passed 347 application/domain tests, 31 SDK tests, lint, types, licence/module integrity and the production build. No physical-hardware test or new timing measurement was performed, as explicitly waived by the owner. All stock-derived outputs stayed local and outside the repository.

## Browser firmware flow — 1 October 2026

Verified in the actual local frontend using the browser worker and a locally saved original OS 1.40C file. Stock and output bytes stayed local; this record contains identities only.

| Configuration | Stock FX2 | Download bytes | SHA-256 |
| --- | --- | ---: | --- |
| Mini Verb, Tape Echo, Euclid, Repitch | retained | 582260 | `91331100c6035b9961fa55c9757b6132eebb0c5b773c1d918052f08b558a78b0` |
| Spectrum, Modulation, Character, Mini Verb, Tape Echo, Euclid, Repitch | compact | 590072 | `1f5050c1ef1f0bc632bd354410be18d151828312f0d80cdafe2a21c4a02feb0d` |

Both identities equal the unchanged native builder plus the same-input native ELEK/ELUP packaging oracle at source revision `b8deefc88b2c3e5f3c6158e364eb741df1924e1d`. See `src/engine/assets/composition-proofs.json`; eight native profiles have OS, container and full-file fingerprints. All seven modules with all stock FX2 effects are rejected for formatter-cave overflow by both composers. The browser reports how to reduce that selection and offers no download.

Risk acknowledgement gates the build. Changing chooser settings invalidates the completed result and acknowledgement. Canceling a real compact build returns to the valid selection; the next build completes with the native identity above. The enabled Download .bin control was clicked in the actual browser. The downloaded file was independently read from the host Downloads folder: 590072 bytes with SHA-256 `1f5050c1ef1f0bc632bd354410be18d151828312f0d80cdafe2a21c4a02feb0d`, matching both the browser result and native oracle. Changing chooser settings afterwards removed the old download and acknowledgement; the overflowing selection remained blocked. Restoring the workspace reverifies the locally saved base. No native emulator, stress or audio-render checks were run for this verification.

Local parity and container round-trip checks do **not** qualify this catalog on hardware. Current module-specific limitations remain visible. Download is enabled for the supported fixed catalog and chooser profiles; arbitrary custom choosers and unapproved third-party packages remain unsupported.

## Application checks

`npm run check` passed lint, 113 tests in 26 files, TypeScript app/server checks and the static production build on 1 October 2026, before the SDK import. Further changes require a new check.

### Check performance — 2 October 2026

In a clean checkout of main at `b324b50`, the original full `npm run check` passed in 16.68 seconds on Node 24.21.0. The updated check passed in 5.91 seconds with empty ESLint/TypeScript caches and 3.74 seconds warm. These are local measurements, not CI timing guarantees. All 274 original Vitest tests retained the same passing results; five additional runner tests brought the total to 279. The four separate licence-notice tests and 18 synthetic SDK tests still run. Lint, all three TypeScript projects and the static production build passed. `npm run modules:check -- --base origin/main` and standalone `npm run build` also passed.

Runner fixtures prove licence/catalog freshness failures prevent generation, all independent checks remain mandatory, failures reach the command exit status, and type errors prevent bundling. Cached lint rejected a new error despite unchanged file size and timestamp; incremental TypeScript rejected a new server type error. Both temporary probes were removed and type checking passed again. No firmware, native DSP, emulator or hardware tests ran.

After rebasing onto main at `979842c`, the full check passed again in 5.55 seconds with 285 Vitest tests, including six additional tests from main.

## Still required before completion

first-time base selection and rejection in the browser; project-path frontend and separate-origin guest API and administrator access verification; responsive and keyboard coverage across routes; a clean SDK developer setup; approved source-to-package publication; actual licensed screenshots/audio where available; production service configuration. No public deployment has occurred.


## Source-folder catalog and versions — 1 October 2026

The frontend now reads strict versioned manifests beside the seven imported source modules. `npm run check` passed 115 tests in 27 files, lint, TypeScript and static build after version pins were added. An independent disposable Git fixture proved that a README update without a version increase is rejected, and a greater semantic version plus exact catalog pin is accepted. The SDK scaffolder successfully created a disposable DSP module; the source skeleton is explicitly untested. Local community migrations 0004–0006 applied successfully. Source-to-package release automation and portable developer setup remain incomplete; the platform migration now has the separate parity evidence below.

Guest comment posting and the ownership-only Remove control were exercised in the actual browser against the local bearer-session Worker; the verification comment was removed afterwards. Existing guest rating/like state was retained. Worker dry-run bundling passed (77.69 KiB, 19.19 KiB gzip) without deployment.

## Trimmed SDK composition — 1 October 2026

The public SDK registry contains exactly the seven frontend modules. Two stock-loader declarations are isolated under `sdk/octabam/platform/`, with their controller dependencies outside the catalog. The stock null routine is absent from the source tree: the assembler reserves its nine-word tail and fills it from locally fingerprinted original firmware, with the loop end relocated. Stock detour/DSP-hook expectations likewise use guarded local reads.

In a disposable SDK copy using the same patched assembler/linker, Mini Verb + Tape Echo + Euclid + Repitch with stock FX2 produced 1,245,104 bytes, SHA-256 `1dbef0e5646ae3814224b88ca6ebda7fb911840a8ca2aa2af810ed5ef5e0cdac`. All seven modules with the compact FX2 chooser produced 1,250,126 bytes, SHA-256 `5162680d8bc342deb623cef00307f2a343f539a90f0bfcef59b59ceb4c60bb83`. Both complete native-image identities equal the unchanged upstream-source oracle. All seven with stock FX2 rejected with the same `wide dial hook (116 B) does not fit` error. Raw composed image sizes differ from the compressed downloadable upgrade sizes recorded above.

Temporary stock-containing inputs and outputs were removed. No emulator, stress or render checks ran. Reproduce with `scripts/verify-sdk-native.py`; hashes and scope are recorded in `sdk/verification.json`. Native setup portability, remaining source/provenance audit and reviewed source-to-package release automation remain required.

The full lightweight application check passed 116 tests in 28 files, lint, TypeScript and static build. Three additional synthetic SDK tests passed missing/altered-input rejection, bounds/fingerprint validation and native DSP record recovery without proprietary fixtures. Both DSP and ColdFire scaffolds were created and checked; they retain author attribution and a deliberate failing qualification gate until actual behavior checks are implemented.

## Guest-only community and separate administration — 1 October 2026

Website GitHub sign-in was removed: no OAuth routes, grants, callback cookies, GitHub identity in the session contract, or frontend sign-in code remain. Former `/api/auth/github`, `/callback` and `/complete` return 410 without redirects or cookies. Account-bound cloud configuration copies are retired (410); configurations stay on the device and move by export. Migration 0007 drops the one-use grant table and adds administrator sessions.

Administration is separate from guest identity. The backend owner configures `ADMIN_KEY_SHA256`; the administrator exchanges the key for an eight-hour, tab-scoped session sent in `X-Octamod-Admin`. Every `/api/admin/` route checks it on the server. Without a valid configured digest, access fails closed. Key attempts are throttled, sign-out revokes the session and rotating the key revokes all sessions. Comment moderation, history and the issue inbox (log downloads, GitHub retries) are only under `/api/admin/`; reporters see their own reports through `/api/issues/mine`. Public issue reports become GitHub issues carrying only their public details when `GITHUB_TOKEN` is configured; private reports and logs are never published. The status and comment webhook accepts only HMAC-signed deliveries for the configured repository and ignores redeliveries and bot comments (`src/community/service.test.ts`).

`npm run check` passed 125 tests in 30 files (including the four owner-merge approval tests and new administrator/guest isolation tests), the four synthetic SDK tests, lint, app/server TypeScript and the static build. Against the actual local Worker runtime (workerd) the retired routes returned 410, admin routes 403 and an unconfigured key 503. A disposable second Worker with its own D1 state and a temporary key accepted the correct key, refused a wrong one, kept a guest out of the admin inbox, showed the reporter only their own report and refused the revoked session. The temporary key and state were deleted. The new pages were not yet exercised in a browser.

## Source-built packages v4 — 1 October 2026

Native parity found a regression in the v3 source build. v3 bound the receiver's static null dispatch entries to its local stub copy (`dlstubinit`) instead of stock's null stub (`P:0x7c8` A / `P:0x588` B), so the patched OS extent no longer matched the native oracle. The SDK's dynamic-load notes state that static placement keeps the stock entries and only the running receiver redirects ids. A controlled A/B run showed v2 assets and v3 with only those two values restored both pass full parity.

The compiler now takes the static entries from the declared stock-copy source address, and `--verify-existing` compares the complete receiver record (placement, frame, dispatch bindings, stock-copy record and code), not only code bytes. The importer independently refuses receivers that rebind static null entries. v4 was compiled stock-free with the read-only native toolchain against the parity-proven v2 baseline. Its resident receiver file is byte-identical to v2; the ROM file differs from v2 only in the shared-dial guard source fingerprint. Source tree `d7a156941589e867236a470adc5fccb6c03a513d98bd7ae092ea3df17097c213`, compiler `36265406504e8e1d4bcaac1534ff5ecf3f639a6f854cebbfc044a167f1785bf5`, development build (no source commit or approval).

The import rejection proof accepted v4 and refused corrupt, stale-version, stale-source, incomplete-inventory, stock-read, non-zero stock-tail and null-rebinding artifacts without changing frontend assets; v3 is now refused because its compiler differs. After importing v4, `scripts/verify-composition-native.mjs` with the user's own original 1.40C matched all eight native OS, container and update identities, including 590072 B (all seven, compact) and 582260 B (four modules, stock FX2), plus the crowded-selection, wrong-slot, unsupported-chooser and modified-firmware rejections. No firmware was written. No emulator, stress or render checks ran.

## Release pipeline review — 1 October 2026

The repository is now public at `repeat98/octamod`. The first push ran `pages.yml` and failed closed at the owner-merge step because `MODULE_APPROVER_GITHUB_ID` is not configured; nothing was built or deployed and Pages is not enabled. That run also showed the release scripts load their TypeScript helpers on the runner's Node 24 before `npm ci`. GitHub's REST API lists `2026-03-10` as a supported version, so the approval client's version header is valid.

Changes from the review: the six workflow actions are pinned to the commit SHAs of their current releases (checkout 7.0.1, setup-node 7.0.0, upload-artifact 7.0.1, download-artifact 8.0.1, upload-pages-artifact 5.0.0, deploy-pages 5.0.1; all Node 24 or composite, with the inputs used verified at those commits). Runners are pinned to `ubuntu-24.04`, and the toolchain image to the `ubuntu:24.04` index digest. The ineffective second `.dockerignore` was removed; `Dockerfile.dockerignore` is the one Docker applies. Release-mode import now also requires the CI build to reproduce the committed, locally parity-verified packages, with the commit stamp as the only permitted difference. Before this, CI-compiled bytes replaced the committed ones without any parity evidence.

A disposable clone with these changes committed exercised the real `build-modules-isolated.sh` with a stand-in for `docker run` (no daemon was available). It refused a mutable image tag, an existing output directory and a dirty checkout. The staged mount contained exactly the commit's tracked tree, one commit object and no history. Planted ignored files (`firmware/fake.bin`, `.dev.vars`) were absent. The compiler's release-mode Git checks passed on the read-only staged copy. With GitHub's API mocked, the production importer refused a merge by another account, a non-matching merge commit and a committed package that the build did not reproduce. It accepted the owner-merged, reproducible build and recorded the PR approval. The eight published packages differ from the committed v4 packages only in `sourceCommit`.

Still unverified: the Docker image build and real container isolation (network, capabilities, read-only root); whether the container's Ubuntu `binutils-m68k-linux-gnu` and its dsp56300 build reproduce the local packages (the reproduction gate fails closed if not); and a real owner-merged PR run on GitHub with Pages enabled.

The first owner-merged PR (#1, merge commit `3f68473`) showed that GitHub omits `merge_commit_sha` from the single-PR endpoint for read-only tokens. The release check therefore refused a genuine owner merge, twice, and published nothing. Approval now requires GitHub's own `merged` issue event to name this exact commit and the owner as the merging account, keeps every other PR check, and still compares `merge_commit_sha` whenever GitHub returns it. Because a push can start the check seconds before GitHub links the merge commit to its PR, the lookup retries for about 90 seconds. Against the live API without a token, the check approved `3f68473` as PR #1 merged by the owner and refused the PR's head commit.

The first release run past the approval check (merge of #2) built the image and compiled the DSP packages, then failed on ColdFire assembly. Ubuntu 24.04's `binutils-m68k-linux-gnu` is older than the local GNU binutils 2.47 (`m68k-elf`) that produced the committed packages and lacks the `.base64` directive. Nothing was published. The image now builds binutils 2.47 for `m68k-elf` from `binutils-2.47.tar.xz`, pinned by SHA-256 `154ab23b60070e8f27013c22977f1129425d67d1e8acd6e13010e617811e4cff`. The tarball was verified locally as signed by the chief binutils maintainer's key in GNU's official keyring.

With Docker running locally (linux/arm64; GitHub's runners are x86-64), the image built and the real `build-modules-isolated.sh` compiled a clean clone of main (`83c2ee9`) in the container. All eight packages are identical to the committed, parity-verified packages apart from `sourceCommit`. The production importer, with GitHub's API mocked and `merge_commit_sha` withheld, accepted them. With the script's flags, the container had no network route, a read-only root filesystem, a non-root user and only `/tmp` writable.

## Production deployment — 1 October 2026

The merge of #3 ran the complete release workflow: owner merge verified, isolated container compile, reproduction gate, app check and Pages deployment. https://octamod.app serves the site over HTTPS with a GitHub-issued certificate. `www.octamod.app` and `repeat98.github.io/octamod` redirect to it. The live firmware worker carries the approval record for PR #3 (commit `c2f5c5b`, merged by the owner) with the qualification note "assembly and relocation only".

The community Worker runs at `https://octamod-community.octamod.workers.dev` with a new D1 database (Western Europe) and migrations 0001–0007. It has no R2 binding. Against the live API: the session route answered for `https://octamod.app`, another origin was refused (403), the preflight from `https://octamod.app` was allowed, module data was readable, admin routes were refused (403), admin login reported "not configured" (503) before the key was set, and the retired sign-in routes returned 410.

## Firmware downloads paused — 1 October 2026

After the site went live, the owner loaded a downloaded image (Mini Verb, Tape Echo, Euclid and Repitch) in octemu, and selecting an FX showed "DSP LOAD FAILED". With stock FX2 kept, that selection is a native parity profile: the browser output is byte-identical to native octabam at the pinned revision `b8deefc`. Upstream recorded the same message on 30 September, after that revision, as an open failure on branch `build/abd-packages` (commit `7b055186`). On a tester's real unit, an image with the dynamic DSP loader, Tape Echo, Mini Verb and Euclid showed DSP LOAD FAILED on every FX, played no audio and stayed on step 1; the same image without the loader played. Upstream's conclusion is that the loader must not ship in a flashable image until its transport is proven on a chip. Every image Octamod composes contains that loader, so downloads are paused: building still checks a configuration, but no file is offered. Re-enable only after a fix is verified on hardware and brought in through a new pinned revision with renewed parity proofs.

## Frontend-only releases — 1 October 2026

The release workflow now rebuilds module packages only when module source, the compiler, the release scripts or the committed packages changed since the last successful release. It compares against the last success, not the previous commit, so a failed module build cannot be skipped by a later merge. Otherwise `scripts/stamp-module-build.mjs` checks the committed packages against their record, the module source fingerprint and the compiler hash, then records the owner-merge approval for the commit. Under bash, the change check chose a full rebuild for this change (it touches the release scripts) and the fast path for `main`. In a fresh clone, with GitHub mocked, the stamp refused changed module source, a changed package and a changed compiler, and accepted the unchanged tree.

This exposed that local builds counted macOS `.DS_Store` files as module source, so the committed record's fingerprint did not match the Git tree. The compiler and the shared inventory now ignore them. The rebuilt packages (v5) are byte-identical to v4, so native parity is unchanged, and the committed fingerprint `994e2a69…` now equals the one the CI build recorded on the live site.


## Loader-free composition and browser verification — 1 October 2026

The active browser engine now uses native static-stock placement with `DSP_LOADER = false`. The dynamic-loader implementation remains available to developers but is excluded from visitor builds. With stock FX2 retained, only Repitch fits. With stock FX2 off, original FX1 effects remain available and selected DSP modules use the three omitted reverb regions (2,724 words per core). Overruns are refused. Tape Echo and Euclid alone require the appended ColdFire runtime and its sample-memory reservation; configurations containing neither leave sample memory unchanged.

The unmodified native builder at `b8deefc88b2c3e5f3c6158e364eb741df1924e1d` exported every subset of the seven pinned modules with both stock-FX2 settings. The JavaScript composer matched all 74 successful complete OS images and all 182 refusals, with zero mismatches across 256 profiles. The exporter also captured native ELEK container and ELUP upgrade identities for all 74 accepted profiles from the same original card file. No composition identities changed when packaging facts were added.

The representative JavaScript packaging pass matched native container and full upgrade lengths and hashes, and round-tripped back to the composed OS for four profiles: Repitch with stock FX2; Mini Verb with stock FX2 off; Character + Mini Verb + Tape Echo with stock FX2 off; and Mini Verb + Tape Echo + Euclid + Repitch with stock FX2 off. The complete original file and decoded OS remained unchanged. Modified-OS, wrong-slot and unsupported-chooser refusals passed. `scripts/verify-static-composition-native.mjs` fails closed on absent, duplicate or missing profiles and absent packaging identities. Its default checks full packaging for all 74 accepted cases; `--packing=representative` checks the four profiles while still checking all 256 OS/refusal cases. The exhaustive JavaScript packing mode was not run in this session.

Two actual production-bundle browser-worker builds matched the same-input native full-file identities:

| Configuration | Stock FX2 | Finished bytes | SHA-256 |
| --- | --- | ---: | --- |
| Mini Verb | off | 445580 | `612b4e6c441e787421d69f42d7da65927dd5d2485396f40923a35d0c6bdb00e1` |
| Mini Verb, Tape Echo, Euclid, Repitch | off | 560904 | `7fe1016a56cbb853c44c947d08b857fe31e8e3bcd614cad0266a08846b0f7dc5` |

The browser rejected a wrong-size base before accepting the owner's original 1.40C locally. Keeping stock FX2 blocked the four-module selection and explained the effect trade; turning it off enabled validation. Adding Spectrum and Modulation refused the overrun and disabled Build. Acknowledgement was required before building. Cancel/rebuild recovered the worker and completed with the native identity. Changing stock-FX2 settings removed the finished identity and reset acknowledgement. Reload restored and reverified the saved base. A 390-pixel mobile viewport showed no horizontal overflow, including the full fingerprint. Downloads stayed disabled, so clicking and independently hashing a downloaded loader-free file remain required after owner approval.

`npm run check` passed 143 tests in 32 files, four synthetic SDK guard tests, lint, app/server TypeScript and the static production build with Node 24. Synthetic static-placement tests cover both core regions, native stable priority order, split-run first fit, overrun/no-space refusals, overwritten donor entries, NONE and omitted custom module IDs while preserving listed stock dispatch entries. The historical dynamic-loader verifier now explicitly opts into that path; renewed loader-mode parity remains required before ever re-enabling it.

Stock input and generated firmware stayed local; only hashes, layout facts and authored module code are tracked. No firmware, emulator, stress or audio-render suite ran. These checks did not establish hardware qualification; see the later approval and integration records for release status.

## Combined site release — 1 October 2026

Combined the loader-free engine with the parallel changes: four attributed source imports (Analog BD, MIDI Scenes, USB Audio tracks + MAIN/CUE and Scale Quantizer), their exact upstream dependencies, public author names, social preview and compact responsive layout. Spectrum, Modulation and Character are temporarily hidden from the library and refused by the browser session; saved configurations keep their entries. The eight visible modules include four imports whose firmware build status remains pending. Their pages and configurations are available, but mixed or single pending selections are refused before composition.

The isolated stock-free compiler rebuilt the original seven modules at their current versions from source commit `98190bbe4f514899c9f7b2ad49ca5cb1df9f85b2`. All eight compiled packages have identical code and composition facts to the previously parity-verified packages; only version/source metadata changed. The record binds the full SDK inventory, including pending sources, to fingerprint `435b0363eb3f3869a6352f48ffdce2dd8c2ac5518290b1b95146f84ea250eff1`. Pending Python declarations are excluded from the disposable compilation tree and never evaluated. Import and frontend-only stamping independently require the same verified seven-module scope and exact pins.

After integration, native comparison again passed all 256 profiles: 74 byte-identical OS images, 182 matching refusals and zero mismatches. Four representative configurations also matched the native complete container/upgrade and round-tripped. Modified firmware, unsupported chooser and wrong-slot rejections passed. Stock input remained unchanged and no firmware was written. In the combined production bundle's actual browser worker, Mini Verb `0.1.1-experimental` with stock FX2 off again produced 445580 bytes with SHA-256 `612b4e6c441e787421d69f42d7da65927dd5d2485396f40923a35d0c6bdb00e1`.

Browser checks confirmed the new Analog BD detail page and attribution, refusal of a pending Analog BD + Mini Verb selection after local base verification, explicit adoption of updated versions for an older saved configuration, and successful loader-free composition afterwards. The sidebar stayed at viewport height on long module and configuration pages. At 390 pixels the finished identity had no horizontal overflow. The disposable local origin's saved base was removed after checking. Downloads and the dynamic DSP loader remain disabled.

The final Node 24 `npm run check` passed lint, 153 tests in 35 files, seven synthetic SDK guard/import tests, app/server TypeScript and the static production build. Release automation must reproduce these committed packages from the exact owner-merged commit before publishing. This record documents pre-release checks; it does not claim hardware qualification or a completed deployment.

## Owner-approved loader-free downloads — 1 October 2026

The owner explicitly approved enabling downloads for verified loader-free selections after reviewing the parity results. `DOWNLOADS_ENABLED` is enabled; `DSP_LOADER` remains false. Pending imports and the three temporarily paused modules retain their existing build refusals. This supersedes the earlier download-pause records without claiming hardware qualification.

The approved production bundle was exercised in the actual browser with Mini Verb `0.1.1-experimental`, stock FX2 off and the locally verified original 1.40C. The Download .bin control saved a complete 445580-byte upgrade. Independently reading that new host download produced SHA-256 `612b4e6c441e787421d69f42d7da65927dd5d2485396f40923a35d0c6bdb00e1`, identical to the browser and native oracle. The installation guide correctly said this configuration leaves sample memory unchanged. Changing the chooser removed the completed download and reset the risk acknowledgement. The new test download and the disposable origin's saved base were removed; the original input and prior downloads were left untouched. Node 24 `npm run check` again passed 153 tests in 35 files, seven SDK tests, lint, TypeScript and production build.

The preceding combined site release passed the complete owner-merge, isolated compilation, reproducibility, frontend and Pages workflow for PR #7, merge commit `d1136ce4c65ea7e1a00c4516cd4aa41c4b0c0d56`. The actual HTTPS site showed all eight intended modules, their public author credits and the new social-preview metadata. Download enablement is published through a separate checked owner-merged PR.

## Owner-requested local hardware test images — 1 October 2026

The native remixer built two private images from the exact SDK sources in application commit `119fb2c0aecb67be87281038235d36bf2968cfe4`, using the owner's original OS 1.40C locally. Neither image nor any firmware-derived output is committed or published.

| Native status tag | Modules | Update bytes | Update SHA-256 |
| --- | --- | --- | --- |
| OCTABAM80 (container OCTAMOD80) | Mini Verb, Tape Echo, Repitch, MIDI Scenes, USB Audio tracks + MAIN/CUE, Scale Quantizer | 566156 | `04e4d8f6201a5e1c5d17d0d996ddbd061721b808342eb1dee442297a0d5fdd6d` |
| OCTABAM81 (container OCTAMOD81) | Analog BD, Repitch, MIDI Scenes, USB Audio tracks + MAIN/CUE, Scale Quantizer | 576756 | `37f7c56c50c6614e25bce2b1fbef894a75ed38c8b39643183c395dca245a6e9c` |

Source versions: Mini Verb, Tape Echo and Repitch `0.1.1-experimental`; the four requested imports `0.1.0-experimental`. A network-disabled local container ran native resource/patch guards, assembly and disassembly checks, runtime linking and packaging. Native ELUP round trips passed. The independent TypeScript decoder also verified each full composed OS byte-for-byte against the native output, the original container tail and seed, and the final version. No firmware, DSP, audio-render, stress or emulator test suites ran.

The owner reported “The test firmwares worked” for both files. This is owner-reported hardware smoke evidence for these exact combinations; the model, detailed feature coverage and long-duration audio behavior were not reported. The new imports remain pending in the browser engine until its composition passes native byte parity and rejection checks.

All eight modules are refused by the native Analog BD admission rule: Analog BD currently composes with stock DSP effects only, excluding Mini Verb, Tape Echo and Euclid. The seven-module profile without Analog BD also failed menu placement at Euclid slot 10 (254 bytes required). Removing Euclid produced the six-module image above. The frontend presents these known conflicts before base firmware is selected and offers explicit compatible choices. While dynamic DSP loading is disabled, it hides the stock FX2 checkbox and builds/exports with stock FX2 disabled, including configurations saved with the older option; original FX1 remains available. The saved preference is retained for a future verified dynamic-loader release.

## Requested modules: native and actual-browser parity — 1 October 2026

Analog BD, MIDI Scenes, USB Audio tracks + MAIN/CUE and Scale Quantizer are now `0.1.1-experimental` with source pins and original authorship retained. Their loader-free browser recipes assemble authored ColdFire/DSP packages; inherited USB descriptor spans are zero placeholders, and shared stock DSP helpers and table entries are recovered only from the fingerprinted local original 1.40C. The isolated source compiler cannot read firmware. Download enablement follows the owner's existing approval and the completed native and actual-browser checks below.

The pinned native SDK declarations (`b8deefc` baseline plus the reviewed `363861e` imports) exported all 256 subsets of the eight visible modules with stock FX2 off, plus all 32 subsets of Repitch and the four imports with stock FX2 retained. `scripts/verify-requested-native.mjs` requires every unique profile and matched 156 complete OS byte identities and 132 refusals with zero mismatches. Fifty-six incompatible Analog BD profiles were refused by the exact native admission predicate; the remaining native profiles ran composition, placement and linking. A private compression cache reused the unchanged native packer only for identical payload input and parameters. The four altered-original-OS rejections passed and the original remained unchanged. These checks perform composition and packaging only, never DSP execution or a stress/emulator suite.

Fifteen stock-free GNU ColdFire link fixtures cover every nonempty subset of the four requested runtime groups, including internal USB MIDI where needed. Browser linking matched every byte length, SHA-256 and authored global export. Additional tests reject absent or changed local inherited USB spans and verify that all four bundled spans contain zeros. The original seven-module matrix retained 74 byte identities, 182 refusals and four representative native-complete container/update identities.

The actual production-bundle browser worker built these configurations through the normal UI using the owner's locally selected original file. Full update SHA-256 identities matched native ELEK/ELUP packaging with `OCTAMOD79`:

| Configuration | Update bytes | SHA-256 |
| --- | ---: | --- |
| Mini Verb, Tape Echo, Repitch, MIDI Scenes, USB Audio, Scale Quantizer | 566156 | `2dcf0af580f6db05a26f501dc4d4c58730efeba20e4bc39734113a91a0d600d8` |
| Analog BD, Repitch, MIDI Scenes, USB Audio, Scale Quantizer | 576756 | `961f82df19aa3b29f14dcba3e2184161dff59a340185013d6166206263f5f9d9` |

The browser refused an altered same-size original before validation, disabled Build, removed the completed identity and reset acknowledgement. Adding Analog BD to the six-module selection showed the explicit conflict card; choosing to keep Analog BD removed only Mini Verb and Tape Echo, retained all five compatible modules and passed placement. Downloads were held off during these checks and restored only after both full-file matches and the browser rejection passed. Public proof files contain identities and refusal/layout facts; all input, composed firmware and extracted content remained private and local.

The selection matrix also found the minimal menu conflict: Mini Verb + Tape Echo + Euclid + Repitch + Scale Quantizer. MIDI Scenes and USB Audio do not affect that collision. The UI now explains this five-module conflict and offers removing Euclid, retaining the most modules. The native Analog BD admission rule remains enforced, and the dynamic DSP loader remains disabled. Configurations start empty and the stock-FX2 checkbox remains hidden until a verified dynamic-loader release.

The owner's two earlier combined native test images were reported working. This is limited hardware smoke evidence for those combinations, not complete feature coverage, device-model qualification or sustained eight-voice audio qualification. Historical upstream hardware limits remain visible. Publishing still requires an owner-merged PR and source-package reproduction in release automation.

Final release checks passed with Node 24: 175 tests in 37 files, seven synthetic SDK guard/import tests, lint, app/server TypeScript and production build. The final isolated compiler reproduced all nine source-package artifacts and the importer checked the full source inventory, current module pins and all-zero inherited USB placeholders. Clicking the enabled browser Download control saved the Analog BD five-module update; an independent host read confirmed 576756 bytes and SHA-256 `961f82df19aa3b29f14dcba3e2184161dff59a340185013d6166206263f5f9d9`, identical to native. No firmware was committed or uploaded.

## Recovery wording and component notices — 1 October 2026

The SDK flashing guide no longer promises successful recovery, safe retries or preservation of project data. The README and app visibly identify Octamod as independent and unofficial, with no Elektron affiliation, endorsement or support. Configuration, module and installation notices now include possible warranty and future-update effects, unsuccessful recovery and the prohibition on sharing firmware images.

Full component copyright notices and terms were checked against pinned upstream notice files. Modulation declares `MIT AND ISC AND BSD-3-Clause`; Spectrum and Character retain MIT with the additional authors' full notices. Their documentation/licence versions are now `0.1.1-experimental`. The notice-source pins identify the files used for licence verification and do not change the original module source provenance or historical test evidence. A generated notice bundle is retained in the SDK and public assets; compilation includes it with a fingerprinted artifact record, and the importer rejects missing, corrupt or stale notices. A network-disabled, isolated source-only compiler regenerated all nine package artifacts from the reviewed source with the new version pins. Independent comparison confirmed that executable payloads and composition facts are unchanged; only version metadata differs. The accompanying source artifact records `stockRead: false` and the full notice bundle, and the development import passed its provenance and notice checks. These local artifacts do not constitute release approval; publication still requires an owner-merged PR and reproducible source compilation.

Node 24 checks passed: 82 catalog/community/configuration/release/hosting tests, four notice rejection/HTML-escaping tests, seven synthetic SDK guard/import tests, lint, module/version validation, TypeScript and the production build. Source, public, built and compiled-artifact plain-text notices were byte-identical; the HTML viewer matched its generated source. The actual browser displayed the independence notice and expanded flashing warning, opened the licence viewer and retained keyboard access at a 390-pixel mobile viewport without horizontal overflow. No firmware composition, DSP, emulator, stress or hardware checks ran for this update. The current loader-free release keeps `DSP_LOADER = false` and the owner-approved `DOWNLOADS_ENABLED = true`; the older dynamic-loader failure does not disable this static build.

The focused release branch was rebased onto `3207fe39be49628f889938a44f82ea0410c6431b`, preserving the merged privacy page, private usage statistics, compact mobile header and module popularity/download tracking. Its diff leaves the statistics services, backend, database, workspace hooks and download/loader flags unchanged. The frontend release job now installs dependencies before artifact import so licence validation can verify the installed React runtime terms on a clean runner.

## Actual OT UI screenshots and publication requirements — 1 October 2026

Twenty-one actual headless-emulator LCD images document Mini Verb, Tape Echo,
Euclid, Repitch, Analog BD, MIDI Scenes and Scale Quantizer. They show selection
and enable locations, effect controls, the Analog BD 808/909 pages, MIDI CC
setup/scene editing, all three quantizer rows, and both Repitch access routes.
Each module has exact access steps, captions, rights declarations, image/build
hashes and reproducible panel plans. USB Audio documents the narrow no-OT-UI
exception. Suspended Spectrum, Modulation and Character have no successful
retained captures; failed-load screens were discarded.

Captures used local 1.40C and a stopped MKII headless panel. The three source
imports were compiled for UI capture under explicit owner authorization in a
restricted temporary macOS sandbox. No audio/stress/hardware/firmware-parity
qualification gates ran. Temporary firmware, LCD/RAM planes, sample/card
fixtures and private logs were removed.

For publication on current main, documentation/media revisions advance to
0.1.2-experimental and MIDI Scenes to 0.2.1-experimental. Every native module
source file is byte-identical to its captured source; records preserve the
original captured draft versions and bind those pixels to the updated metadata.
The MIDI capture shows the existing 8.2-derived native UI, not standalone
MIDISC2.0 qualification; MIDI Scenes remains pending. Other support and hardware
statuses retain current main's decisions.

The manifest and PR checks require version-matched location/control captures
and access instructions for new/changed module folders and new catalog entries.
Unchanged legacy versions remain readable. Source-import fingerprints preserve
original upstream identities alongside updated local README hashes.

The final publication uses main's pending-module release fix merged in PR #22
at `f5cd9386c92475b2259eb7529f92049e86493454`; the screenshot PR does not change
that compiler. Its ten-module release scope excludes pending MIDI Scenes source
from discovery/compilation and retains the previous inactive objects verbatim.
The captured native source fingerprints were independently compared with main
and remain identical. Both pending build guards and prior object metadata are
preserved. A network-disabled, read-only source container regenerates only
stock-free packages at the new publication versions. Every executable byte,
source fingerprint, relocation proof and composition recipe matches main; only
publication versions and build provenance differ.

The browser loaded all three Repitch PNGs at their original 768×384 dimensions
and displayed both access routes in the existing How to use it disclosure.
No firmware, raw LCD/RAM dumps, cards or local audio fixtures entered this PR,
and no firmware/DSP/stress/audio qualification tests ran.

Final Node 24 checks on this base passed: 223 tests in 43 files, seven synthetic
SDK checks, four licence checks, lint, app/server TypeScript and production
build. Exact-base publication validation passed. All 21 PNG SHA-256 values and
their complete native-source capture bindings were rechecked. The final isolated
compilation and development import passed with main's unchanged release compiler.

## Module qualification and documentation gates — 2 October 2026

New modules and updates now require current source/version/build identities,
worst-case cycle counts under modulation and maximum load, exact memory totals,
and passed real-hardware stress-project records. Release validation also requires
complete README sections, a synchronized short tutorial, real access captures
and black-and-white PNG documentation screenshots. The frozen folder baseline
retains all eleven existing modules without changing their sources, versions,
media or recorded test/availability statuses.

Node 24 validation passed: 234 tests in 45 files, four licence checks, seven
synthetic SDK checks, lint, app/server TypeScript and the production build.
Exact-base module validation passed against main. Synthetic rejection fixtures
cover missing evidence, budget overruns, inconsistent memory, incomplete/failed
hardware records, stale source hashes, altered legacy folders, missing README
sections/tutorial steps and colored or malformed screenshots. No submitted
native source was executed.

The local browser confirmed that “Are the mods stable?” appears in FAQ search
and explains the gates without guaranteeing stability. It explicitly asks users
to test their own configuration before relying on it. No firmware, DSP,
emulator, audio or physical hardware qualification tests ran for this policy PR;
it adds enforcement and documentation, rather than new module qualification
claims. No firmware, project/card dumps or raw captures were added.

## Only the needed stock FX2 effects — 2 October 2026

Loader-free builds no longer drop every stock FX2 effect. A visitor build keeps all fourteen and omits only the FX2-only reverbs whose code the selected modules take (Spring first, then Plate, then Dark; the fewest that fit). Repitch, USB Audio, Scale Quantizer and other selections without module DSP code keep every stock FX2 effect. Analog BD omits only SPRING REV. Tape Echo, Mini Verb or Euclid alone omit SPRING REV; Mini Verb + Tape Echo + Euclid (+ Repitch) omit DARK REV. FX1 is unchanged. If the longer FX2 list leaves the module menus too little room, the build uses the compact FX2 menu, as before. Composing all 1,040 subsets of the eleven modules (except Analog BD with custom DSP effects) both ways locally, this happened only for Modulation + Euclid + Repitch + Scale Quantizer (with or without USB Audio); Modulation is currently hidden. No other selection changed between building and refusing.

Two stock reverbs call routines inside another reverb's code: DARK REV calls 35 words at SPRING REV+820, and PLATE REV calls 93 words at DARK REV+974 (both cores). This was found from the native relocation recipes and confirmed by an independent scan of every absolute and relative jump in the user's original DSP payloads. No other effect calls into another. The native placer does not check this, so the site only gives up a reverb alone when the placed code stops before a routine that a kept reverb calls. `composeStaticDsp` refuses any profile that would overwrite one.

The unmodified native builder at `b8deefc` re-exported all 256 seven-module profiles with the site's own menus. All 128 compact-menu proofs reproduced the previous identities exactly; chooser metadata was unchanged. Stock-retaining profiles now build 72 selections (previously 2), the same set the compact menu accepts. `scripts/verify-static-composition-native.mjs` matched all 144 OS images and 112 refusals with zero mismatches. Its representative packaging pass now also covers Tape Echo and Mini Verb + Tape Echo + Euclid + Repitch with the stock-retaining menus, and all six complete ELEK containers and ELUP updates were identical. A full `--packing=all` pass then matched the complete container and update of all 144 accepted profiles. The 32 stock-retaining requested-module profiles were re-exported locally with the same toolchain: the 16 without Analog BD reproduced their previous identities, and the 16 with Analog BD, previously refused because SPRING REV was listed, now build. `scripts/verify-requested-native.mjs` matched 86 builds and 58 refusals with zero mismatches; it now skips the 144 profiles containing the build-pending MIDI Scenes, which the browser refuses before composing.

The browser worker's engine session built flashable updates for Tape Echo; Mini Verb + Tape Echo + Euclid + Repitch; Repitch; Analog BD; and USB Audio + Scale Quantizer. The first three updates equal native's complete ELEK/ELUP identities, and all five decoded OS images equal native's OS identities. Each decoded OS booted in the headless `ot_emu` (MKII, DSP running, emulator `93484e4b…`). The actual LCD showed the expected FX2 chooser (only the omitted reverbs missing). Every kept reverb, Tape Echo, Mini Verb, Euclid, Analog BD, Repitch's SRC SETUP and Scale Quantizer's SCALE setting loaded with their own controls and no error popup. A DSP render gate adapted from octabam's `verify_analog_bd_reverbs.py` rendered every kept reverb in five images on both cores, with fixed and moving controls. Every one is bit-identical to stock. A negative control that zeroes DARK REV's routine inside SPRING REV changed DARK REV's output.

Firmware, decoded OS images, DSP memory dumps and LCD captures stayed local and temporary and were deleted. Only hashes and this record were kept. This is emulator and render evidence, not hardware qualification.


## CC Map and Preview Vol frontend release — 2 October 2026

Both utilities are visible, selectable and buildable at `0.1.2-experimental`.
Their complete tutorials, original thumbnails and thirteen reviewed monochrome
MKII LCD screenshots retain original capture versions/builds and bind the
unchanged native source to this release. Attribution and import provenance are
preserved. The owner's explicit two-version waiver records physical hardware
stress as untested and real-chip worst-case cycles as unmeasured. It does not
expand the frozen eleven-module baseline or relax future submission gates.

The native oracle ran in a network-disabled, read-only source-tools container
with no credentials, dropped capabilities, an unprivileged UID/GID and bounded
resources. Across every subset of the nine currently buildable frontend modules,
with compact and current stock-retaining FX2 menus, all 1,024 profiles agree:
522 complete MAIN OS identities and 502 compatibility/space refusals. Eight
complete native ELEK containers and ELUP upgrades match byte for byte. These
cover each utility, both together and both with Repitch, USB Audio/MIDI and Scale
Quantizer, under each menu profile. Changed/truncated base and unknown-module
rejections pass; original inputs remain unchanged. Only hash proofs are retained.
The explicit private verifier is `scripts/verify-utility-native.mjs`; it is
never part of application checks or visitor builds.

The actual browser worker built both utilities under both menu profiles. Its
compact upgrade hash was `9919f5fee7160ce0d77696ffba3f8e1de19f7749b439d0741a9828a08afd7ee7`;
its stock-retaining upgrade hash was `5800f3c4e1b20e748d84db604ba192a5c659db28dce0fd4e681541311259e285`.
Both match native output. Saved selections and base restore/revalidation passed.
Cards and tutorials fit a 390px viewport without horizontal overflow, all
thirteen LCD images load, and keyboard disclosure toggling works. Firmware,
private cards, samples and LCD/RAM dumps stay local; no hardware/audio/stress
qualification is claimed.

Final Node 24 validation passed: 269 domain tests in 50 files, 18 synthetic SDK
checks, four licence checks, lint, application/server type checks and the static
production build. Exact-base module validation and `git diff --check` pass.
A clean-commit source-only container build reproduces all ten parity-verified
authored package artifacts; only source-commit provenance differs.


## TapeHead 0.1.2 release integration — 5 October 2026

TapeHead 0.1.2-experimental, the input-level update merged as a draft in PR #53, moves into `sdk/octabam/modules/tapehead/`. Only `tapehead.asm` changes at runtime (`JSFX(4x)/4`, 422 words, 295 cycles/sample); the manifest, descriptor, ID and chooser rows are unchanged. The source-only compiler rebuilt the TapeHead DSP package (`c54070fc…`, matching native fresh assembly at four origins); every other package recompiled byte for byte or was carried over unchanged with new version pins. With the owner's local 1.40C fingerprint, the browser composer's TapeHead selection matched the native `tapehead-spring` build's complete DSP payloads on both cores word for word, and the 16 native TapeHead profiles buildable without the m68k-elf toolchain built or refused as with 0.1.1. The committed full-image proof files remain the 0.1.1, pre-logger record; see `sdk/octabam/modules/tapehead/evidence/parity.md`. Hardware: the author's MKII, about three minutes on seven tracks with parameter locks and scene changes, reported working; not a stress run.

## TapeHead release integration — 2 October 2026

TapeHead 0.1.1-experimental moves from PR #42's draft into native discovery,
the approved-source compiler and the visible, buildable catalog. JClones' MIT
TapeHead JSFX (the contributor-identified VladG clone) is pinned at
88a1503d668c378ced4c166e772378272f3b72ea; the original MIT/NOTICE, devilfish707's
port credit and Sam Banks' SDK credit are preserved. The corrected DSP and
manifest are unchanged from c53daa9. Three fresh actual monochrome MKII LCD
captures show FX2 assignment, defaults and COLOR MED, with a full tutorial.
The premature chooser capture was rejected because it still showed DELAY.

The isolated reference render passes (maximum float-reference error 4.68e-4),
stereo isolation, silence, COLOR and signed-multiply checks. A full 2,048-block
both-core benchmark covers moving parameters, extremes and all sixteen trigger
splits, including stock Spring Reverb comparison. The static code-cycle model
charges 6,000 per instance per block, 48,000 at eight inserts per core against a
49,920 usable-work budget; this is not hardware wall-clock timing. The exact
logical allocation is 2,972 shared bytes plus 93 per instance, 4,460 at sixteen
inserts, with no additional X-slot reservation or Y/buffer/heap allocation.
Source/code-cycle and memory reports describe bounds, overhead and limitations.

The owner removed the mandatory 60-minute/eight-track hardware stress test and
accepted the supplied author report: working audio and parameter locks without
reported overloads, with perceived CPU similar to Spring Reverb. Hardware status
is `reported`; model, duration and tested maximum load remain unknown. The
locally reproduced test MAIN OS identity is bb700652540fc42068d1f92791960fb3c86b672932d113f538776c2b1441a0f7.
The frozen eleven-module baseline and exact utility waivers are unchanged.

All 512 original-module/TapeHead profiles match the native oracle: 264 complete
MAIN OS images and 248 placement refusals; nine representative native containers
and upgrades match. The 224 TapeHead/Analog BD/USB/Quantizer profiles match: 80
complete images, 144 refusals, 22 complete native packages. TapeHead + Analog BD
is rejected with an explanation because Analog BD requires stock DSP effects.
All 48 TapeHead/approved-utility images match native, with six complete
packages identical. Native export preserves canonical catalog order for ROM
placement; an initial fixture using a different order was corrected and rerun. The original seven-module proof set is unchanged. The
source-only compiler preserves all existing authored runtime/ROM/USB/utility
code byte for byte; 4,096 new TapeHead declaration combinations are recorded.

The real browser worker builds and verifies TapeHead, with complete upgrade
SHA-256 247ec72998252f364908c2be7a2702425d83e8f8f1c2cd75963a29428056bdc3
(445,548 bytes), identical to native. The desktop page shows the original
creator, source licences, three actual LCD screenshots, controls and tutorial.
No firmware download was saved; the disposable local browser's stored base was
removed using its Remove from device control. Firmware, private cards, raw
LCD/DSP/RAM dumps and composed images remain private and temporary.

Reproduce using `scripts/export-composition-menus.mjs`, the reviewed vendored-SDK
mode in `scripts/export-composition-proofs.py`, and the explicit private
`verify-static-composition-native.mjs` / `verify-tapehead-native.mjs` commands.
The native toolchain runs in a network-disabled container; developer verifiers
read firmware only in memory. These checks never run in ordinary app tests,
source-build CI or visitor flows.

Final Node 24 validation passed 280 domain tests in 52 files, licence/SDK
checks, lint, app/server type checks and the production build. Exact-base
module validation and `git diff origin/main --check` pass. The source-only
compiler's `--verify-existing` pass reproduces every authored package and
receiver against the locally parity-verified baseline. No firmware is involved.

## Digitakt and Digitone container engine — 4 October 2026

Modwerk's TypeScript engine (`src/engine/elektron/`) reads and writes the Digitakt and Digitone mk1 OS file: the ELE3 container, its SysEx transport and the packed main OS. Checked locally with the owner's own stock files, kept outside the repository (`scripts/verify-elektron-container.mjs`):

| Stock file | SHA-256 | Writer identity | Repacked main OS (version MW01) |
| --- | --- | --- | --- |
| Digitakt OS 1.53 | `9bdd44bb…29bcc92` | byte for byte | passes every container check; in-place gap 531,097 |
| Digitakt OS 1.54 | `f78ba80f…53e3cf6` | byte for byte | passes; in-place gap 527,627 |
| Digitone / Keys OS 1.44 | `d4f200d0…3c9659` | byte for byte | passes; in-place gap 337,594 |

**Writer identity:** rebuilding each file from its own main OS reproduces it byte for byte, which also confirms the message and content checksums.

**The repacked Digitakt 1.53 build in digiemu:** it was checked against stock with digiemu's `emu.fwcheck` (irpina's mk1 emulator, run locally with its patched Unicorn).

- The device's own updater accepted the build, it booted to a live user interface and it ran.
- Nine screens and 7.9 seconds of audio are identical to stock (`--no-boot-strict`; stock against itself reports the same emulator bus-error quirk in strict mode).

This proves the container layer only. No mods or core were linked, and no hardware was involved. Packing the main OS currently takes about 45 seconds in Node.

## Source-only elemod compilation — 4 October 2026

The pinned GCC 16.2.0 / m68k-elf / binutils 2.47 / Node 24.21.0 container compiled all eight currently declared module/release recipes without any firmware mounted. Two runs from the same tracked source produced byte-identical recipes and inventory. ELF rejection tests and synthetic local-materialization tests run in the ordinary application checks; the real-stock comparisons below run only through the separate local evidence tool.

`node scripts/verify-elemod-source-parity.mjs --packages DIR --oracle DIR --out LOCAL_DIR --firmware machine:stock.syx ...` materializes each recipe from the owner's verified main image and compares the linked image with the corresponding author release, using the same reference core. It writes only identities, hashes, section sizes and status, never image bytes.

| Module | OS | Source-built `.run` | Author `.run` | Linked image comparison |
| --- | --- | ---: | ---: | --- |
| digihealth (Digitakt) | 1.53, 1.54 | 2,988 B | 2,988 B | byte exact on both releases |
| SOPHIE | 1.53 | 7,998 B | 7,998 B | byte exact |
| NEIGHBOR | 1.53, 1.54 | 3,744 B | 3,772 B | differs; not accepted as native parity |
| DIGISLICER | 1.53, 1.54 | 16,346 B | 16,414 B | differs; not accepted as native parity |
| digihealth (Digitone) | 1.43 | 1,952 B | 1,952 B | byte exact |

The owner supplied Digitone 1.43 during this continuation. Its complete SysEx SHA-256 matches the machine profile (`c5a54cc0…95bf9aa`). The reference `core-dn1-2.0a.elemod` was obtained from elekloader v0.4.0 and checked against GitHub's asset digest (`c6d9dbed…6b54f`); it is used only as a local oracle. The source-built and author-built digihealth images both hash to `460e86b85ed7a7d638ec4a0c5606aa484c4108a286cd33bb2f54ec715746f031`. The new stock and oracle files remain outside the repository.

The native-parity tool exits unsuccessfully when a case differs or lacks its stock/oracle input. The initial FAST AUDIO stubs were shortened by assembler relaxation; explicitly requiring absolute address operands restored both Digitakt digihealth comparisons. The remaining C objects use the exact pinned author source (every recorded input hash matches), but their compiled code differs. An independent GNU/Linux GCC 13.3 / binutils 2.42 comparison also differs; it is not a replacement production toolchain. Recovering the original C compiler/settings or qualifying the newly compiled implementations remains required. No timing, emulator behaviour or hardware evidence is inferred from these comparisons.

The source PR provides reproducible compilation, stock-free review artifacts and local recipe materialization. It does not finish source-release parity, provide Modwerk's pending cores, publish a package to the app or enable Digitakt/Digitone downloads. The existing approved Octatrack implementation and frozen qualification records are unchanged.

## Original core boot foundation — 4 October 2026

Modwerk's `sdk/elemod/core/` implements its own boot copier and event-table dispatcher from the public ABI documentation. It does not copy elekloader's core assembly. The emitted recipes explicitly declare `stage: boot-probe` and `providesInterface: false`: only the boot call is installed; the event adapters and complete per-machine facilities remain pending.

Two isolated source builds reproduced all eight module recipes, four core probes and both inventories. Firmware-free host tests exercise ordered dispatch, empty tables, argument delivery and nonzero input/hold consumption on both machine variants. Cross-compilation asserts every public descriptor's 32-bit layout. Compiled-code CPU checks cover normal, no-BSS, no-run and entirely empty sections with three different status-register patterns on each machine (24 cases): copying, clearing, bounds, all general registers, status, stack, return address and original-call handoff pass.

The separate local verifier checked stock identities, guarded original-call bindings, linkage and the complete packed container for each release. Boot probes built from `581ae078d417cf72e9d7196361404fcf87f0a8a7` were checked in digiemu `c1b5735835923e328f8b4950d6ba927875e5b669` using `emu.fwcheck --baseline STOCK --no-timing --no-boot-strict`:

| Machine / OS | Probe stages | Captured screens | Audio comparison | Probe DDR + BSS |
| --- | --- | --- | --- | ---: |
| Digitakt 1.53 | all pass | 9, identical | 7.882 s, identical | 420 B |
| Digitakt 1.54 | all pass | 9, identical | 7.883 s, identical | 420 B |
| Digitone 1.43 | all pass | 10, identical | 8.284 s, identical | 576 B |
| Digitone 1.44 | all pass | 10, identical | 8.283 s, identical | 576 B |

Both Digitone **stock baselines**, unlike the probes, report a runtime read at `0x0000012a` in unconfigured FlexBus space. Captured screen/audio comparisons are identical; that emulator baseline limitation is retained, not suppressed or treated as hardware proof. digiemu also reports that it did not check container checksums: Modwerk's separate `verifyEle3Build` checked the SysEx/content checksums and in-place unpacking before these runs.

The complete local build hashes are `b2871db6664ee9f367ea6b7b35823ecc9136469cd04b51ab3167cbc222a039c4` (DT 1.53), `313ecf70991c6d3a529762547e4eb056a65e6c2a054538a58811edb4a4e4f455` (DT 1.54), `c11660e9e6d024af782b5aa3888c736f649d1ae01315ec02570f231fee503e31` (DN 1.43) and `76a13c0fae2b77ce8f7e54a43a9a3a8a076bfbe9bc8a5b0aaa94d13e57d7bab0` (DN 1.44). Final recipes from `1e49baf` have the same compiled ELF hashes for every release; subsequent changes added documentation and the synthetic CPU verifier, not runtime code.

These checks qualify the boot development probe only. The event dispatcher has not been exercised through actual firmware hooks; no imported module was attached to these probes. Timer setup, SETTINGS integration, Digitakt SRC machines and Digitone voice/hold hooks, parameters, pages, project storage and Mod Menu must still be implemented and checked. Timing and real-hardware stress evidence were not collected. Downloads remain disabled.

### 4 October 2026 — local Digitakt / Digitone import

The local reader accepted the owner's original Digitakt 1.53 / 1.54 and Digitone 1.43 / 1.44 downloads, checking complete-file SHA-256, ELE3 parsing, unpacked main image length and SHA-256. The newly supplied Digitone 1.43 download matches `c5a54cc05b921f2e4bd814834c5365c2a5aa01d7772a9a2961fac1c3095bf9aa`. Only metadata returns from the worker. This inspection does not build or qualify a modded image.

Synthetic tests cover full file and main image identity refusals, wrong-machine files, size bounds, worker transfer/disposal, per-machine persistence with the legacy Octatrack slot, restore revalidation, corrupt-file removal, storage failure, out-of-order checks and deletion after a pending save or navigation. Firmware storage uses the existing IndexedDB database and separate machine keys; no upload endpoint is involved. The Browser checks rejected a three-byte synthetic `.syx` and a synthetic ZIP through the actual file picker. Switching machines cleared the previous reader's state. Valid owner files were checked locally outside the browser automation; no stock bytes were served or uploaded. Downloads remain disabled while the complete cores are pending.

## Original core UI adapters — 4 October 2026

`ui-hooks.s` implements the documented tick, draw, key and encoder event contracts, from public ABI documentation and inspection of the owner's local call sites. No elekloader core assembly was read or copied. The source-only job emits a separate `core-ui-build.json` and four `ui-cores/` recipes, each declaring `stage: ui-hook-probe` and `providesInterface: false`. The boot and four UI calls are installed with full six-byte stock guards and verified original destinations. Their event tables remain empty; imported modules are not installed.

Two isolated builds from `2ac1e332e69a53b380fff53bace668c79803c163` reproduced all eight module recipes, four boot probes, four UI probes and three inventories byte for byte. `verify-elemod-ui-cpu.mjs` executed the compiled adapters and C dispatcher in synthetic ColdFire memory: 144 cases pass across all four OS profiles. They cover empty and observing tables, input consumed by the first or second handler, callback arguments and order, redraw signalling, original outputs, all general registers, status, caller arguments, stack bounds and return address. These callbacks are synthetic substitutes; this is ABI evidence, not module or hardware behaviour evidence.

The local container verifier checked complete stock identity, original-call bindings, linkage, SysEx/content checksums and in-place unpacking before digiemu `c1b5735835923e328f8b4950d6ba927875e5b669` checked each packed probe against stock (`--no-timing --no-boot-strict`). The results are:

| Machine / OS | Probe stages | Named screen captures | Exact audio comparison | First frame-stream difference |
| --- | --- | --- | --- | --- |
| Digitakt 1.53 | all pass | 9, identical | differs: one final 100 ms window, reported RMS zero; 7.882 / 7.883 s | 1,238.402 ms |
| Digitakt 1.54 | all pass | 9, identical | differs: one final 100 ms window, reported RMS zero; both rounded to 7.883 s | 1,138 ms |
| Digitone 1.43 | all pass | 10, identical | differs: 34 windows, starting at 4,500 ms; both rounded to 8.284 s | 1,005.024 ms |
| Digitone 1.44 | all pass | 10, identical | differs: 34 windows, starting at 4,600 ms; 8.283 / 8.281 s | 1,537.333 ms |

The full build hashes are `8c858cb5dcb352e316072138d6f906e8975697dfb21a9652447122939b307e72` (DT 1.53), `ec27a8c9b68acac333402bd1de758365c4db750d0367336d45302f78f1d6e432` (DT 1.54), `70aa09ca5393ccb0c4a5e6bc68db082bd852c62ecd49c6ae0c44476a25e0cc52` (DN 1.43) and `69a8c2b736f58d53e6b9e4939ad93af23b60b514a342aa064a4ac41a8d2c483b` (DN 1.44).

**These probes do not establish stock equivalence.** digiemu's passing build verdict is separate from its comparison result: all four complete comparisons report differences. A repeated DN 1.43 run reproduced its audio mismatch. Local PCM/event-time inspection found slightly different delivered input times (up to one 0.667 ms audio block), but shifting selected audio windows did not make them byte-identical. The audio difference remains unresolved; it is not dismissed as a harmless phase offset. Both Digitone stock baselines fail on the previously recorded unconfigured FlexBus read at `0x0000012a`; the UI probes also report that inherited violation, marked `in_stock: true` and excluded by digiemu from their build verdict. No cycle timing or hardware evidence was collected.

The boot-only probe evidence above remains separate. SETTINGS/render/timer facilities, Digitakt machine integration and Digitone voice/hold/parameter/page/project/menu facilities are still pending. UI ABI tests and matching named screen captures cannot qualify a complete core, imported modules or public firmware downloads. Ordinary Node 24 `npm run check` passes all 464 domain tests, lint, type checking and the production build; it does not run any of these emulator/CPU checks.

## Original SETTINGS/render adapters — frozen, 4 October 2026

**Status: frozen by the owner.** On 4 October the owner paused Modwerk's own Digitakt/Digitone builder at this stage and chose to vendor elekloader's builder for the launch. Work on the original core resumes later; its completion criterion is a builder that matches elekloader's online builder. This section records the state at the freeze.

Original `event-hooks.s` and `settings-api.c` add SETTINGS dispatch, render entry/exit dispatch and `core_additem`. The render adapters preserve all four EMAC accumulators, extensions, mask and arithmetic mode; render-out runs before stock EMAC restoration. State access follows NXP's [MCF54418 reference manual](https://www.nxp.com/docs/en/reference-manual/MCF54418RM.pdf), section 5.3.1.2. No reference core assembly was read or copied. Source-only artifacts declare `stage: event-hook-probe` and `providesInterface: false`; three inline resumes contain zero placeholders filled only from verified local stock. Four stock menu helper bindings carry address, length and SHA-256 guards. No imported module patches within 64 bytes of any core site.

**Reproducibility.** Two isolated builds of `17ef30ed83c581b4a8fc2660596abb56573ccd35` (image `sha256:6711f0abb3c30dcfda4e9a8a812555f8bbceb37a0fc988918b5d624b603d4a6a`) produced 25 byte-identical files: eight module recipes, twelve development probes and their inventories. All twelve probe ELF hashes equal those of runtime commit `0ca62324e823cd810279f7992a90ddbd0aa52ab5`; only the test script and README source fingerprints differ. `verify-elemod-events-cpu.mjs` passes **276 synthetic cases** on the final build. They cover ordered dispatch, arguments, inline instruction effects, register/status/stack preservation, EMAC preservation across four arithmetic modes, callback record layout and construction order, allocation failure and null inputs. They do not prove the actual stock helpers or imported module behaviour.

**Emulator checks.** The final recipes materialize, link and pack into the same four builds as the runtime commit. digiemu `c1b5735835923e328f8b4950d6ba927875e5b669` checked each against stock (`--no-timing --no-boot-strict`):

| Profile | Build SHA-256 | Stages | Named screens | Audio against stock | Frame streams first differ |
| --- | --- | --- | --- | --- | --- |
| Digitakt 1.53 | `4ce9edb075f2092e246e5fe48b9750cc3a8b07de1596aaace26d7e519d3b6181` | all pass, no violations | 9, identical | identical, 7.882 s | 1,238.402 ms |
| Digitakt 1.54 | `8e442663d1579acac591989a4a6f199f72fbe735738c6b7e144e6d1ed8bf9594` | all pass, no violations | 9, identical | one final 100 ms window, RMS zero in both; 7.883 / 7.884 s | 1,138 ms |
| Digitone 1.43 | `a1f01bc4f5ed7e3da33dc3165f681beff65e959f0775e71097d590d8e494fb91` | all pass | 10, identical | 35 windows from 4,500 ms | 1,005.024 ms |
| Digitone 1.44 | `c3c99f5a0249e71c77e7e7f49aa4f497d1bbc7f37e46ab9a4d58691414172aeb` | all pass | 10, identical | 33 windows from 4,600 ms | 1,005.067 ms |

Both Digitone runs report only the stock baseline's own FlexBus read at `0x0000012a` (`in_stock: true`). Default tours on the Digitakt play silence (no samples on the emulated card), so its audio comparison says nothing about sounding playback. The Digitone audio windows are numerically identical to those of the UI-only probes, so the SETTINGS/render adapters added no audio difference of their own.

**The Digitone audio difference is shared with elekloader's core.** elekloader's Digitone 1.43 core alone (reference object `core-dn1-2.0a.elemod`, SHA-256 `c6d9dbed28965bce4a827c292f499c8f5309187bf136ffb52e237bd01186b54f`, linked by Modwerk's linker into build `5f84fa66e7ff68286b67b5c0246158ee1c0b38bd3125bfe86a30f7bfe77bd9fe`) differs from stock in the same 35 windows from 4,500 ms, with the same RMS values. Compared directly with that reference build, the Modwerk 1.43 probe matches all 10 named screens; its audio differs in 34 windows with a maximum RMS difference of 3.8 (16-bit scale). elekloader's own documentation attributes its core's difference to the core's extra cycles moving where scripted key presses land. A local stock-only control did not reproduce the difference by shifting every key press 0.3 ms or 0.667 ms from one snapshot (identical audio apart from one silent final window). Separately booted builds start from different settled snapshots, and their DSP voice-parameter streams already differ in the first render. The exact mechanism therefore remains open; parity with the reference core is the relevant result. The Digitone 1.44 reference comparison was stopped at the freeze.

**Attached module.** Source-built Digitone 1.43 digihealth linked with the probe (with a local-only `core_zero` alias for its two weak imports, because the probe does not export `core_zero`; build `8d6f9948ca39add6a4298242e3fb867a4c719020a0ddb3e7acec9ef0da705d44`) and with the reference core (build `472031cf58e782f8d5515bf82b60bb2c8f3cfbafac9593df59cb432159572343`). A key tour opened SETTINGS and navigated it identically on both: 18 of 18 named screens match, and audio differs only after PLAY. The tour stopped on CONTROL, before the SYSTEM INFO row, so **the row's insertion, select, change and draw callbacks were not exercised**. Resume by extending the tour further down the list. DTIM0 setup and `core_zero` remain unimplemented.

Node 24 `npm run check` passes the application tests, lint, type checking and the production build at this commit; it runs none of these firmware, CPU or emulator checks. Digitakt SRC machines, Digitone extended facilities, DTIM0, `core_zero` and real module evidence remain outstanding for the original core. Downloads from the original core remain disabled; nothing has been merged or deployed. Firmware, builds, PCM, LCD captures and reports stayed local and temporary.

## Vendored elekloader builder — 4 October 2026

Digitakt/Digitone builds now run elekloader's builder (commit `e4d8ba84841900db78144030a991e1d69816b6a4`, release v0.4.0 cores, the five shop mods' author release files) under Pyodide 314.0.7 in a browser worker. `npm run elekloader:check` verifies every vendored file against `vendor/elekloader/UPSTREAM.json`. The npm Pyodide runtime files are byte-identical to the `pyodide-core-314.0.7.tar.bz2` that elekloader pins (SHA-256 `2abdcc2e35208af406e07724cffa85bc582ced97e9028383ecf5462541393f95`).

Every vendored file matches the SHA-256 in elekloader's catalog and release checksums. No `.elemod` file contains Elektron code. Compared with each owner stock image, the only matching runs of 8 bytes or more are zero or `0xFF` filler, plus the text "\0Source " in NEIGHBOR's own strings. Stock instructions are referenced by address and copied from the owner's file during the build.

**Parity with elekloader.** The vendored files were loaded into Pyodide under Node exactly as the worker loads them. They built every module subset for each of the owner's four stock files (Digitakt 1.53: 16, 1.54: 8, Digitone 1.43: 2, 1.44: core alone), all with OS version `2.0a`. Each result was compared with elekloader's own command line (`python3 -m elekloader.patch`) run natively from the same commit:

- **27 of 27 cases match.** Every successful build is byte-identical. Every set elekloader refuses is refused, for example any set with both NEIGHBOR and SOPHIE, whose patch sites overlap.
- Sample identities: Digitakt 1.53 core alone `7286aed303da0538a582e23473d246941f8d0f443f5621fb8724af4b4d10a521`, Digitakt 1.53 DIGISLICER `01be49ea937b40822097005ed13a17e7df360b15d50b8d399d0a6314c6bc7711`, Digitone 1.43 digihealth `09f43f1b1dd179789f2198c5f2b8d190046e229bd4a8821c6d17871a3a92117a`, Digitone 1.44 core alone `c9bcd105b5e5f3cdfd6cb7b8ea99a582fc98f0f4393af80b85256fcbf6fa4cf2`.

**Browser.** In headless Chromium against the development server, the real configuration page went through the whole flow:
- It verified the owner's Digitakt 1.53 file through the file picker, then checked DIGISLICER (2.9 s) and built it (10.9 s).
- The page showed SHA-256 `01be49ea…6c7711`, identical to native elekloader.
- NEIGHBOR + SOPHIE was refused with elekloader's overlap report.
- At 390 px there was no horizontal overflow, and no request left the site.
- The same flow passed against the production build (`vite preview`, CSP meta tag with `'wasm-unsafe-eval'`).
- After a reload, the saved Digitone 1.44 file was restored and verified again, and the core alone built as `c9bcd105…6881`, identical to native elekloader.

Downloads stay off (`DIGI_DOWNLOADS_ENABLED = false`) pending the owner's approval. No emulator or hardware check of these outputs was repeated here; elekloader documents its own checks. Stock files and builds stayed local and temporary.


## Combined release account follow-up — 4 October 2026

PR #91 consolidates #64 and #68–#90 and is the only branch for further Modwerk release fixes. All 24 recorded source heads are in its ancestry; the superseded PRs are closed and their branches retained. The approved Octatrack folders, eleven-module qualification baseline and pinned Digi builder are unchanged.

Owner-authorized live local Google/GitHub/Discord signup and returning login passed with real provider apps, callback URLs and credentials. Separate local databases avoided linking the owner’s same-email identities; each created only its chosen public username, private verified email and unchecked news preference. Google’s external app remains in Testing. Six private credentials are staged in an undeployed Worker version; production code/schema/registration are unchanged. [SINGLE_SIGN_ON.md](SINGLE_SIGN_ON.md) records the version and production gates.

The existing server OAuth flow now uses locally served official provider artwork in native buttons. Signup consent labels stay beside their checkboxes with normal wrapping. Desktop/375-pixel visual review and a fresh Node 24 `npm run check` passed: 569 application tests, 31 firmware-free SDK/source checks, lint, types, licence/catalog/vendor verification and the production build. No firmware/DSP/hardware tests were rerun and no stock file entered these login tests.


## Release builder and live mail follow-up — 4 October 2026

The owner approved Digitakt/Digitone downloads on the condition that the builder matches elekloader. The exact vendored engine, cores, modules and Pyodide pins remain unchanged from #85; `npm run elekloader:check` verified the pinned files again. The recorded 27/27 native byte-parity and refusal cases above remain the qualification evidence. `DIGI_DOWNLOADS_ENABLED` is now true; the earlier paused-download record is historical. No firmware/DSP/hardware test was repeated for these application changes, and Modwerk's separate original core remains frozen.

The Digi configuration page now follows the OT page's order: compatibility status, verified base firmware, selected modules, resources and risk acknowledgement/build/export. It adds a firmware-free, machine/catalog/version-validated JSON backup/import. Build/download acknowledgement is tied to the current device, verified base identity, selection and OS version; cancelling disposes the active browser worker. Stock and outputs remain local.

Account messages now include a table-based Modwerk HTML layout and the existing plain-text fallback, with a direct action button, fallback link, expiry and support contact. There are no remote images, fonts, tracking pixels or scripts. A sending-only temporary key restricted to `modwerk.app` sent exactly one verification and one recovery message to the owner-approved inbox from an isolated local Worker/database. Resend recorded both as delivered; the owner confirmed inbox arrival and SPF, DKIM and DMARC PASS. Verification, verified login, reset, one-use replay rejection, old-password rejection and new-password login passed. Recovery revoked the previous session (local session count 1 to 0). The real journey exposed and fixed signed-in recovery/resend routes incorrectly showing the profile; two regression cases cover these forms. A consumed verification URL appeared in tool output during browser inspection; replay was rejected and no password or API key was printed.

The temporary sending key was revoked. Production account links and origin remain pending the approved domain/backend rollout. Node 24 `npm run check` passed 579 application tests in 93 files, 31 synthetic SDK/source checks, lint, TypeScript, licence/schema checks and the static production build. The Worker dry-run passed (417.86 KiB gzip).


### Production rollout preparation

With explicit owner approval, a temporary database-free, mail-free Worker ran two synthetic Better Auth hash/verify requests using the pinned password implementation. Both returned success; private tail aggregates recorded 164/241 ms CPU and 165/243 ms wall time. `Date.now()` inside a Worker did not advance during CPU-only work, so the endpoint's zero-ms fields are not the measurement. Those costs exceed the Free plan's stated 10 ms budget despite the runtime's occasional allowance. The owner purchased Workers Paid and the dashboard confirmed Paid as the current plan; hashing parameters are unchanged. The temporary Worker was deleted. This proves the tested operations complete, not arbitrary concurrent load.

Before any production migration, the production D1 export was encrypted with a separate private key and restored only into a fresh local database. All 23 application/internal SQLite tables and complete row-value identities match the encrypted source, integrity is `ok`, and there are no foreign-key violations. A private Time Travel bookmark and existing deployment record are kept with the rollout evidence. No firmware, provider credential or database rows enter this evidence file.

## Digi library parity follow-up — 4 October 2026

Digitakt and Digitone now use the Octatrack library toolbar, with working type filtering, sorting, comparison checkboxes and their own Build firmware links. The shared comparison dialog accepts machine-qualified Digi IDs, preserves the three-module limit and updates the correct machine configuration. Missing Digi popularity, addition dates and processing measurements remain explicit. Local browser checks exercised Sampling/Name sorting, comparison and adding a module, plus JSON configuration import/export without firmware. Node 24 `npm run check` passed 582 application tests and 31 SDK/source checks, lint, TypeScript and the production build. No firmware/DSP/hardware tests ran and builder/vendor code was unchanged.

## Toolchain image caching — 5 October 2026

Adding GCC 16.2.0 to `sdk/build/Dockerfile` made `source-packages` take about 16 minutes, of which 12.5 were the `make -j2 all-gcc` layer and 4 seconds the module compilation. Both `pages.yml` and `module-pr.yml` now build the image with `docker/setup-buildx-action` 4.4.1 and `docker/build-push-action` 7.4.0, pinned to their release commit SHAs (Node 24; `context`, `file`, `tags`, `load`, `provenance`, `sbom`, `cache-from` and `cache-to` verified at those commits), and share layers through the GitHub Actions cache under scope `source-tools`. Every layer input is pinned by digest or archive checksum, so a cached layer is the layer a fresh build would produce. GitHub scopes caches by ref: pull-request runs can read main's cache but write only their own, so the release workflow restores only layers built on main. GCC, binutils and dsp56300 now build with all runner cores; the parallelism does not change the compiler's configuration. The isolated compilation step, its image-ID check and the reproduction gate are unchanged. Not run locally: no Docker daemon was available, so the first CI run after merge is the first real image build with these settings.

## elekloader's TypeScript engine — 5 October 2026

Digitakt/Digitone builds now run elekloader's TypeScript engine: `js/src` at commit `28c5469676c9c4807a500bd4b317c15a8af50cfb`, GPL-3.0-or-later, vendored unchanged in `vendor/elekloader/engine` and bundled into the builder worker. It replaces the Python package and web bridge from commit `e4d8ba8`, which ran in Pyodide 314.0.7. The cores and mods are unchanged. `npm run elekloader:check` verifies every vendored file, the engine's included, against `UPSTREAM.json` (schema 2).

**Old against new.** Both builders were driven through the calls the worker makes, in the order `prepareBuild` and the build make them:
- **the old one:** the vendored Python package and `bridge.py`, unchanged, natively under CPython 3.14;
- **the new one:** the vendored engine under Node 24.

There were 35 cases on the owner's four stock files:
- **27 module subsets**, the cases of the 4 October record: Digitakt 1.53: 16, 1.54: 8, Digitone 1.43: 2, 1.44: the core alone.
- **8 more:**
  - the Digitakt 1.53 zip as downloaded;
  - an Octatrack OS, for which the site has no core;
  - a core in place of a stock file;
  - a 1.53 mod on 1.54;
  - a mod whose SHA-256 is not the pinned one;
  - three version fields: too long, non-ASCII, and empty.

Every reply was compared:
- the stock result, each added mod and tick, the mod list;
- the check and the version field;
- the build result: each output file's SHA-256 and size, the facts, and the log without its times.

Results:
- **34 of 35 cases are identical.** All 22 builds are byte-identical. The 13 other cases end the same way, word for word: 12 refusals, and the Octatrack OS, which no core on the site fits. Two of the builds, as recorded on 4 October: Digitakt 1.53 DIGISLICER `01be49ea…6c7711` and Digitone 1.43 digihealth `09f43f1b…92117a`.
- **The one difference:** a file that is not a stock OS is refused with a "Supported:" list that now also names Digitakt II 1.17, which the newer engine knows. Modwerk does not offer Digitakt II.
- **Median build:** 3.9 s for the Python natively, 0.42 s for the engine.

elekloader checks the engine against its Python with its own tools (`js/tools`), on the owner's files.

**Browser.** In Chromium, against the production build (`vite preview`, CSP meta tag without `'wasm-unsafe-eval'`), the built builder worker was driven with the client's messages:
- the engine loaded with the four cores in 30 ms;
- each build took about 0.4 s and matched the runs above, and every file matched its reported SHA-256:
  - Digitakt 1.53 NEIGHBOR + DIGISLICER: `624481b9…`;
  - Digitakt 1.54 DIGISLICER: `10e61410…`;
  - Digitone 1.43 digihealth: `09f43f1b…`;
- NEIGHBOR + SOPHIE was refused with elekloader's conflict report, and so was an off-site base URL;
- no request left the site.

The configuration page itself was not exercised: it needs a signed-in member and the local Worker. Its calls and their replies are unchanged.

**The build page's log.** While it builds, the Digitakt/Digitone panel now shows the Octatrack page's three steps, driven by the engine's log: the "linked" line ends Build modules, and "packed" ends Prepare file. The status line follows each log line. The whole log, with each line's time, stays under the result, or under the error if a build fails, with a Download build log button. The text file gives:
- the device and OS;
- the builder's commit and catalog revision;
- the mods and the OS version shown;
- each output's size and SHA-256;
- every log line.

It holds no stock file name and no firmware. This was checked in the development server, with a local stand-in for the community API that answers as a signed-in member:
- DIGISLICER on Digitakt 1.53 went through the three steps live and built `01be49ea…`;
- the log and its downloaded file read as above;
- at 375 px there was no horizontal overflow.

**Checks (Node 24, Windows 11).**
- **Pass:** `elekloader:check`, `licenses:check`, `typecheck`, `lint` and the production build.
- **Vitest:** 646 tests pass (on main at `217ee59`, with the build log's three).
  - Two fail as they do without this change on this machine: `scaffold.test.ts` needs `python3`, and `module-publication.test.ts`.
  - `src/tooling/check.test.ts` was left out because on Windows it starts itself again and again.
- **Not run:** no firmware, DSP or hardware test.

Stock files and builds stayed local and temporary.

## elekloader's kit — 5 October 2026

The Digitakt/Digitone builder now runs elekloader's kit:
- **The kit:** `elekloader-kit-0.4.0.zip`, from elekloader commit `aca353742b2eb05a67e102d81098e77204c8248f`, protocol 1. It is vendored unchanged in `vendor/elekloader/kit`.
- **The catalog:** the same 4 cores and 8 mods as before, in the kit's format, with revision `e4d8ba8`. It was made by the kit's own `feed` from the previous pins: each file read by the engine, and each sha256 checked against its pin.
- **The lock:** `vendor/elekloader/elekloader.lock.json`, written by the kit's `lock`. Both the kit's `verify --lock` and `npm run elekloader:check` pass against it.

**Tests:**
- `engine.test.ts` drives the kit's worker logic with the vendored catalog, served as the site serves it:
  - the 4 cores load;
  - every mod adds for its release;
  - a core or mod that is not the pinned file is refused;
  - a file that is not a stock OS is refused.
- `digi-build.test.ts` covers the adapter: plan, prepare, the build steps and the build log.

**Browser.** The development server ran with a local stand-in for the community API, answering as a signed-in member. On the real configuration page with Digitakt 1.53, digihealth + DIGISLICER:
- the kit's worker was the one started (`vendor/elekloader/kit/src/kit/worker.ts`);
- the check passed, and the three steps ran live;
- the build verified in 0.39 s as `3c9fe6fc…729633`, the same identity as in the parity record above;
- the downloaded build log named kit 0.4.0, its commit and the catalog revision.

**Checks (Node 24, Windows 11).**
- **Pass:** `elekloader:check`, `licenses:check`, `typecheck`, `lint` and the production build. The worker is 84 KB, and `elekloader/catalog.json` is emitted with its files.
- **Vitest:** 643 tests pass. Two fail as they do without this change on this machine: `scaffold.test.ts` needs `python3`, and `module-publication.test.ts`.
- **Not run:** no firmware, DSP or hardware test. Stock files and builds stayed local and temporary.

## The update command and backups across catalogs — 5 October 2026

**Tests.**
- `src/tooling/elekloader-update.test.ts`:
  - `KIT_PROTOCOL` is the vendored kit's, and `DEVICES` matches `digi-build.ts`;
  - a kit zip yields exactly the files Modwerk vendors;
  - a changed, missing or extra file, protocol 2, a mismatched folder, two folders and a path outside the folder are refused;
  - catalog changes and the follow-ups: a module file to update, one to remove, a mod not in the library, a licence path that is gone.
- `digi-selection.test.ts`: an older-catalog backup imports, with notes for a module left out and a version changed; one whose modules are all gone is refused; a current-catalog backup has no notes; an empty or missing revision is refused.

**Runs** (each reverted after):
- The kit zip built by `packaging/build_kit.py` from elekloader main `a1be3ce` (sha256 `576b7d44…bf70ad`), with the dev server running:
  - 2 of 31 vendored files changed (`README.md`, `kit.json`), since the engine is the same as `aca3537`'s;
  - the lock, the licence entry and both notices moved to `a1be3ce`, and the vendor check passed.
- The current catalog fed back in: nothing downloaded, no file changed.
- The catalog without SOPHIE, under a new revision:
  - `digisophie-1.1.13.elemod` removed and the lock rewritten;
  - it listed `sdk/digitakt/modules/digisophie/modwerk.module.json` and the `digisophie` licence entry as left to do.

**Browser.** A Digitakt backup naming another revision, with digihealth 0.9.0, DIGISLICER 2.1.0 and a module that no longer exists, imported with digihealth and DIGISLICER. The page said the retired module was left out and that digihealth is 1.0.1 now.

**Checks (Node 24, Windows 11).** `typecheck`, `lint`, `elekloader:check`, `licenses:check` and the production build pass. Vitest, on main `5897804`: 709 pass, and the same two fail as above.
- **Note:** run Vitest without npm's environment, for example `node node_modules/vitest/vitest.mjs run`. Under `npx vitest` on Windows, `check.test.ts` starts the real `npm run test`, which runs the suite again and again.

## elekloader kit at a1be3ce — 5 October 2026

The vendored kit moved from `aca3537` (the kit branch) to `a1be3ce`, elekloader main after the kit was merged (#48), with `npm run elekloader:update`:
- **The zip:** `elekloader-kit-0.4.0.zip`, built by `packaging/build_kit.py` from a clean checkout of `a1be3ce`, sha256 `576b7d44639d4abeb1351a7771b4e3a1ef91f0b7cbcc69f64db9bb5255bf70ad`. elekloader's [kit-v0.4.0](https://github.com/irpina/elekloader/releases/tag/kit-v0.4.0) pre-release attaches the same zip, by that sha256, and `npm run elekloader:update` on the release's download changes no file.
- **What changed:** 2 of 31 vendored files, `README.md` (the merged integration guide) and `kit.json` (the commit). Every engine and kit source is byte for byte the same, so builds are too. The lock, the elekloader licence entry and both notices name `a1be3ce`. The catalog is unchanged (`e4d8ba8`).
- **Browser:** Digitakt 1.53, digihealth + NEIGHBOR + DIGISLICER built `5031993c…eebe6b`, the identity from before the move, and again after the rebase onto main `5897804`, with digihealth + DIGISLICER at the parity record's `3c9fe6fc…729633`. The file identity names elekloader `a1be3ce`. digihealth + NEIGHBOR + DIGISLICER + SOPHIE is still refused for its conflicts.
- **Checks (Node 24, Windows 11):**
  - `elekloader:check`, `licenses:check`, `typecheck`, `lint` and the production build pass;
  - Vitest, on main `5897804`: 709 pass, and the same two fail as above;
  - not run: no firmware, DSP or hardware test. Stock files and builds stayed local and temporary.

## The update command takes elekloader's whole catalog — 5 October 2026

`npm run elekloader:update -- elekloader-catalog.json --library` keeps only the mods Modwerk's library lists, with the mods they require on the same device and OS, so elekloader's published catalog goes in as it is. The change list now goes file by file: a catalog can hold two cores for one OS, and a core added beside another was reported as replacing it. A changed core is listed as left to do, because the builds of its OS change.

**Tests.** `elekloader-update.test.ts` adds:
- a catalog cut to the library keeps a required mod for its OS only, drops other devices, and keeps the catalog's other fields;
- the change list for a replaced, an added and a removed file, and a second core added for one OS;
- the follow-ups for a changed core and for a mod kept only as a requirement.

**Run** (reverted after). elekloader's [kit-v0.4.0](https://github.com/irpina/elekloader/releases/tag/kit-v0.4.0) `elekloader-catalog.json` with `--library`:
- it left out the 7 Digitakt and Digitone mods the library does not list: digichain, digieq, digimatrix, digimono, digipoly, digiutils and digitables;
- it downloaded only `core-dn1-2.2.elemod`, kept the same 8 mod files, and the lock and vendor check passed;
- it listed the Digitone 1.43 core 2.2 as left to do, since Digitone 1.43 builds would use it.

## elekloader update review fixes — 6 October 2026

The updater now rebuilds `vendor/licenses/elekloader.txt` from the incoming kit's complete `NOTICE` and `LICENSE` before regenerating the distributed notices. Its staged kit generates and verifies the catalog lock before installation, including kit-only updates. Installation, notice-generation or final vendor-check failures restore the original kit, catalog, lock, licence manifest and all generated notices; original files remain in the reported temporary folder if a filesystem error prevents restoration.

Four CLI regression cases use temporary repositories and the real vendored kit, without firmware or network downloads: changed copyright notices reach the text and HTML distributions and an identical update changes no bytes; a protocol-1 kit with an unsupported catalog schema changes no installed file; notice-generation and final vendor-validation failures restore a combined kit/catalog update, including removed catalog files and notices that did not exist before the update. All four cases fail against the original updater and pass with these fixes.

On Node 24, `npm run check` passed: 716 Vitest tests, licence, machine, module and vendor checks, SDK checks, lint, type checking and the production bundle. No kit, catalog pin, firmware-build output or hardware qualification changed.

**Checks (Node 24, Windows 11).** `licenses:check`, `machines:check`, `modules:check`, `elekloader:check`, `sdk:check`, `lint` and the production build pass. Vitest, on main `5897804` with the pull request it builds on: 710 pass, and the same two fail as above.

## 6 October 2026 — FM Synth dedicated-machine draft

`sdk/drafts/synth` originally pinned octabam `949f3be` and octatrick v2.9 `525f4b1`. Isolated native preview build, seven actual LCD pages, T1–T8 Part/shadow tags, sample-slot preservation, reselection, return to FLEX, and sample-free Octemu audio/double-STOP pass. No current hardware, worst-case cycles, full memory accounting or native/browser package/composition parity is claimed. The draft remains outside native discovery and the public catalog; see its TESTING.md and sanitized evidence.


## FM Synth experimental release — 6 October 2026

FM Synth 0.1.1-experimental is now prepared under sdk/octabam/modules/synth for the ordinary source compiler and common firmware worker, with a dedicated FM SYNTH chooser entry. The owner explicitly approved missing current hardware evidence, chip worst-case timing and complete stack/memory bounds for this exact release; hardware remains untested, and both unknown measurements remain null. sdk/synth-build-approval.json and the source-native SHA-256 bind that exception. No frozen baseline or earlier exception is expanded.

The native/browser coverage set passes all 94 cases: 37 builds matching outside existing platform/logger writes, 57 matching refusals and zero mismatches. Native declarations record 512 clean selections containing FM and refuse 1,536 overlapping sets. The common worker’s MAIN image c1fbc0b2eaf284e72692b7048d1dfd3693f3e3e90c71229159a619d585b52c95 and update 831e7cd878398ee8d1e268e9fc2bcfd902f48e785965e8e510bff58abc1405a6 pass full container round-trip, stock boot/seed preservation, conflict refusal and changed-base/session invalidation. That MAIN passes sample-free Octemu playback (169-frame carrier period, about 261 Hz) and double-STOP silence. Native panel/storage checks and seven real LCD captures retain the separately reproduced byte-identical standalone native image. Full condition and source records are in the module’s TESTING.md and evidence/software.json.

Every existing compiled module byte, address and recipe matches approved pre-FM main after removing only global provenance and additive synth rows. Both committed composition records were replayed: Sidechain Compressor’s 90 cases (62 builds, 28 refusals) and FM Synth’s 94 cases have no mismatches. The additive shared integration is fingerprinted explicitly for unchanged Euclid retained evidence; another protected change blocks reuse. Browser inspection confirms the dedicated-machine page, tutorial/screens, selected FM configuration and a clear Analog BD conflict with working choices. Mixed-build audio, maximum voices, project reload, modulation, MIDI and hardware performance remain unqualified. Local firmware/recordings/cards stay outside Git.

## VECTOR experimental release — 6 October 2026

VECTOR 0.2.3-experimental publishes the former RIFF/Stang 2 generator as a native track machine. Both SRC pages use the normal six cells. Parameter edits immediately publish trigs and PTCH/HOLD/VOL locks; native PLAY remains responsible for transport. The stock list modal uses UP/DOWN/LEVEL for Static/Flex choice and LEFT/RIGHT for menu navigation. RIGHT enters the highlighted native sample pool; sample-slot YES commits its backing kind and sample while preserving the generator settings and sequence. Analog BD and FM Synth share chooser hooks and are refused alongside VECTOR.

The renamed native image was rebuilt and both focused emulator walks repeated with fresh task-private cards/NVRAM: twelve immediate controls, empty-track initial PLAY, advancing playback after live edits/restart, native sample editing, both sample/file pools, cancellation and sample confirmation pass. Eight actual monochrome screens and source/image bindings accompany the tutorial. Firmware-free ASan/UBSan checks pass 244,800 generator cases and 29,772 secondary-control cases; authored assembly reproduces with the pinned compiler. A repeated synthetic native probe passes 3,840 generator/writer cases and eight complete native commit calls. Instruction ceilings and exact counted memory capacities are documented separately from measurements: the cycle model assumes bounded instruction/memory service and a one-second eight-track startup burst. Physical wall-clock cycles and hardware stack canaries remain null; sustained knob rates and maximum mixed audio load are unclaimed.

The owner explicitly waived only current-build hardware testing because their Octatrack is in repair. `sdk/vector-build-approval.json` binds that exception to this exact version, source fingerprint and tested native image. No existing hardware result or qualification baseline is expanded. Project save/reload, power cycles, mixed-load audio continuity and physical recovery still need hardware validation.

The clean standard source-only build and importer pass with four guarded zero replay holes; local verified firmware supplies the inherited spans only during linking. VECTOR's native/browser coverage passes 98 selections: 44 builds matching outside platform/logger writes, 54 matching refusals and zero mismatches. Declaration checks cover 1,024 clean VECTOR selections and 3,072 refusals. Existing Sidechain Compressor (90 cases) and FM Synth (94 cases) records replay without mismatches. Thirty-eight native before/after preservation profiles retain identical complete images in all 34 successful builds and the same four refusals. Exact shared-source transitions and unchanged older package payloads bind Euclid's retained evidence; malformed or later edits fail closed. A firmware-free GNU linker fixture also verifies shared nonempty and empty string suffix ownership.

On Node 24, `npm run check` passes all 794 Vitest tests, generated-module/licence/machine/vendor checks, SDK checks, lint, type checking and the production bundle. Private firmware, linked runtimes, cards, LCD dumps and native executables stay outside Git.

The website common worker also builds VECTOR 0.2.3: MAIN `9ecf5b58e489a0bd59bb4e6f6ab88c2487ecd874bfa0a7af3f795c2189d75e61`, update `051818edea53faefd732f46acbd50eda1dd33dea50d46405f5794885f43d947a`. Full container round-trip, stock seed/tail preservation, Analog BD/FM conflict refusals, changed-base rejection and stale-session invalidation pass. This packaging check does not replace the separately tested native emulator image or qualify hardware.

## elekloader's other Digitakt and Digitone mods — 6 October 2026

The import of digichain, Digi EQ, Digi Matrix, Digi Mono, Digi Poly, Digi utilities and digitables ([decision](DECISIONS.md)).

**Imported files.**
- Every file in `sdk/imports/elemod-2026-10-06.json` was copied from the pinned commit with LF line endings and matches its recorded SHA-256. The one exception is Digi utilities' `src/osc_data.s`, whose transformation is recorded.
- `src/spec_sin.inc` was assembled with `m68k-linux-gnu-as`. It gives the author's `bin/spec_sin.bin` byte for byte (514 bytes).
- Each `build.json` is the conversion of the author's `mod.json`. elekloader's ports replace the top level's keys, so each release carries its complete defsym, cflags and sites.
- Each module's claims are the names in its released `.elemod`, which elekloader checks.
- Each TESTING.md lists the combinations the builder checked, as the module guides ask.

**Source builds, as CI does them.**
- `scripts/build-elemod-packages.mjs`'s steps were run with WSL's `m68k-linux-gnu-gcc` 15.2 and binutils, not CI's container:
  - the same flags, `-I src`, defsyms and `ld -r` linker script;
  - `elfToElemod` and `parseElemod` on the result.
- All 13 module and release builds compile, link and parse.

**The released files** (13, each matching elekloader's catalog pin). They were checked with the vendored builder, using the owner's stock files kept locally.
- **Each mod builds on its own,** with what it requires, linked and verified:
  - Digitakt 1.53: digichain `5dcead8c…`, Digi EQ `c2017f90…`, Digi Matrix `41f337c2…`, Digi Mono with digichain `0398b1d7…`, Digi Poly with digichain `53b3776e…`, Digi utilities `a1641ca2…`.
  - Digitakt 1.54: `a5e6a765…`, `b8f0663d…`, `c49d12a1…`, `30f8c005…`, `bb19da68…`, `6e202625…`, in the same order.
  - Digitone 1.43: digitables `aea014f6…`, and digihealth with core 2.2 `508c42a2…`.
- **Beside every other mod for its OS:**
  - digichain, Digi Mono and Digi Poly are refused beside NEIGHBOR, DIGISLICER and SOPHIE, whose sites overlap;
  - every other pair combines.
- **Memory** is `.run`, `.bss` and 4 bytes per table entry, the figure SOPHIE's manifest uses (8,722 B):
  - digichain 1,828 B; Digi EQ 9,090 B; Digi Matrix 4,293 B; Digi Mono 32,235 B;
  - Digi Poly 4,983 B; Digi utilities 9,080 B; digitables 9,061 B.

**Browser.** The development server ran with the local stand-in for the community API.
- The Digitakt library lists ten modules, each card with its cover art.
- digichain + Digi Mono on Digitakt 1.53 built and verified `0398b1d7…`.
- With SOPHIE added:
  - the library's estimate reported "digichain and SOPHIE cannot be used together";
  - the builder refused it, naming the overlapping sites.
- digitables on Digitone 1.43 built and verified `aea014f6…` with core 2.2.

**Checks (Node 24, Windows 11).**
- **Pass:** `licenses:check`, `machines:check`, `modules:check`, `elekloader:check`, `sdk:check`, `lint` and the production build.
- **Vitest,** on main `f595681`: 826 pass. Four fail here and on main alike: `scaffold.test.ts` and `module-source.test.mjs` need `python3`, `module-publication.test.ts` needs a git identity, and `module-pages.test.mjs` builds a `C:\C:\` path on Windows.
- **`service.test.ts`:** the popularity test rated each Digitakt/Digitone module `index + 1`, which passes 5 with more than five of them. It now rates `index % 5 + 1`.
- **`module:doctor`** is green for all seven.
- **Not run:**
  - no hardware test, and no build in CI's container;
  - stock files and builds stayed local and temporary.

## Digi module documentation — 7 October 2026

Prepared documentation updates for all 12 Digitakt/Digitone modules, following the seven-section module layout, with matching practical tutorials and 41 visually reviewed monochrome LCD captures. The unchanged vendored elekloader kit linked and verified the pinned author releases on private stock Digitakt 1.53 and Digitone 1.43 firmware. Pinned digiemu ran native UI drawing in a sandbox with network and user files denied. Every module keeps its source revision, build identity, exact panel plan, capture timestamps, PNG hashes and limitations in `media/capture.json` and TESTING.md. Firmware, cards, snapshots and built images remain outside the repository.

The frontend support shows committed Digi captures on Overview and Media, identifies the emulator provenance, and links the complete guide beside the matching tutorial. DIGISLICER’s selection, SRC and sample-backed waveform editor assets loaded at 768×384 in the local browser; its tutorial and guide link rendered correctly. Digichain’s screenshots show the dependent POLY machine and explicitly credit its controls. Silent plots and unavailable load counters are labelled; audio, hardware, persistence, timing and stress qualification remain unchanged.

Passed on Node 24: `npm run check` (996 tests), `module:doctor -- --all`, and `modules:check -- --base origin/main`. Native module code, build declarations, source pins, upstream files and author licences are unchanged.

## Analog BD with custom effects — 7 October 2026

The native and browser builders now reserve Analog BD's 1,000-word engine and its relocated 35-word stock reverb helper on each DSP core. A smallest-fit allocation uses the remaining 28-word gap for Tape Echo's five-word DSP stub. Larger inserts use separate Plate/Dark Reverb regions. Donor selection still minimizes the number of lost stock effects, and all stock FX1 effects remain available. When Dark Reverb is a donor, the builder retargets only surviving stock helper calls, leaving custom code untouched. The shared helper called by a retained Plate Reverb remains protected.

Analog BD now composes with Mini Verb, Tape Echo, Euclid, TapeHead and Sidechain Compressor. Each larger companion needs one additional reverb region; Mini Verb and Euclid together share Dark's region while retaining Plate. Tape Echo needs no additional donor beyond Analog BD's Spring region. Four larger companions together still exceed the available separate runs. Crowded-menu checks, MIDI Scenes' standalone restriction, paused modules, original-firmware fingerprints and boot staging limits remain enforced.

Analog BD plus Tape Echo also exposed a bootloader limitation: the packed ColdFire runtime can move the DSP upload table beyond a signed 16-bit PC-relative address. The preboot loader now uses an explicitly absolute 32-bit address. Source packages were rebuilt in the network-disabled toolchain; module algorithm packages are unchanged. Only the preboot template and source provenance changed. The non-preboot loader's instruction bytes are unchanged.

`scripts/export-composition-proofs.py --suite analog-bd --static-stock --vendored-sdk` covers 136 profiles: every subset of the five DSP companions with Analog BD, each individual DSP companion with each utility, and each individual DSP companion with the five utilities together, all with retained and compact FX2 menus. Native accepts 130 and rejects six for real DSP or menu limits. The current native fingerprints are in `src/engine/assets/analog-bd-composition-proofs.json`; older Analog BD refusals remain historical evidence.

Reproduce the browser/native comparison locally with Node 24, GNU m68k tools, and the owner's original firmware:

```sh
node scripts/verify-analog-bd-native.mjs /local/original-1.40C.bin src/engine/assets/analog-bd-composition-proofs.json
```

The verifier compares module-owned OS bytes with native outside runtime-dependent platform fields, checks the logger/platform do not overlap module writes, independently assembles and links each actual logger-bearing bootloader, round-trips the DSP uploads, and tests full upgrade packaging for the five individual DSP companions. It also rejects modified original firmware. Temporary bootloader inputs are removed; only hashes and placement facts belong in the repository. These are composition and packaging checks; no new physical-device, audio, cycle or stress qualification is asserted for the combinations.

The compatibility change was moved onto current `main` in an isolated worktree before opening its PR. Source packages were compiled again against that tree in a network-disabled container, preserving every module algorithm and version. The native comparison matrix and application checks are recorded on that same tree. The library collision fixture uses MIDI Scenes with Analog BD, since Mini Verb with Analog BD is supported.

On the PR branch, `npm run check -- --base origin/main` passed 1,082 application tests in 168 files, 48 SDK checks, lint, TypeScript, catalogue/licence validation and the production build. `node scripts/import-module-build.mjs <packages> --development --check-only --verify-existing` verified the complete rebuilt source inventory and every committed package. Only the requested preboot template and source fingerprints differ from current main; all other compiled package payloads are identical.

The refreshed native matrix accepted 130 configurations and rejected six. `scripts/verify-analog-bd-native.mjs` passed all 130 native module-owned OS and GNU bootloader comparisons, six matching refusals and five complete firmware round trips. The shared `scripts/native-comparison.mjs` path also passed for those five individual companions and six refusals. Original firmware was unchanged, and temporary bootloader inputs were removed. No new hardware, audio, cycle or stress qualification was performed.

## Reported new-module placement warning — 8 October 2026

The reported configuration is Euclid, Vector, Sidechain Compressor, TapeHead, Tape Echo, Mini Verb, Preview Vol and Repitch. With the owner's fingerprint-verified original OS 1.40C, the current `composeSelection` accepts those eight modules, nine with USB Audio, and ten with USB Audio and CC Map. Play Modes added to the eight also composes. Adding Mute Modes or Recorder Loop Fix separately refuses with `A module menu cave exceeds its reserved region.` The real `createEngineSession` inspection/validation path reproduces the same outcomes for the eight-module selection and the three new additions. The reported Play Modes refusal remains unconfirmed.

Every new module composes alone. Removing one of Euclid, Sidechain Compressor, TapeHead, Tape Echo, Mini Verb or Repitch allows Recorder Loop Fix in the reported selection. No single removal from the eight allows Mute Modes; removing Euclid and TapeHead, TapeHead and Sidechain Compressor, or Mini Verb and Tape Echo allows it. These are local placement checks, not new native parity or hardware qualification. No firmware was written or uploaded, and the original firmware remained unchanged.

The compatibility panel now displays the worker's error under “Configuration needs attention” and a checking message while placement validation is running. Menu/patch-space refusals are labelled separately from effect-memory refusals. Previously the panel asked for base firmware even after a successful inspection and a placement refusal. Firmware source, compiled packages, placement rules and public download gates are unchanged.

Node 24 `npm run check -- --base origin/main` passed 1,153 application tests in 175 files, 48 SDK checks, TypeScript, lint, catalogue/licence validation and the production build. The six new panel regressions cover the two reported placement failures, worker-error propagation and fallback, checking status, pre-check/success states and declared-conflict precedence.

## Actionable composition failures — 8 October 2026

The reported eleven-module selection is Mini Verb, Tape Echo, Euclid, Repitch, TapeHead, Analog BD, Preview Vol, Sidechain Compressor, Play Modes, Mute Modes and Recorder Loop Fix. Its declarations pass, but both actual chooser profiles fail menu placement. The compact profile attempts to place Mute Modes' 208-byte menu unit with only 60 bytes remaining in its reserved region. No single-module removal succeeds. Checking all 55 two-module removals finds four builds: Mute Modes together with Mini Verb, Euclid, TapeHead or Sidechain Compressor. The existing Recorder Loop Fix native record already refuses the nine-module subset without Analog BD and Play Modes for the same Mute Modes placement.

The application now carries the failing module and required/remaining byte counts through the worker to the compatibility card. It verifies complete candidate compositions, including declaration checks and the existing compact-menu fallback, before offering removal buttons. Singles precede pairs; diagnostics stop after four working choices or 128 checks, and unavailable choices remain explicit. Firmware-generation changes stop stale diagnostics. USB settings are omitted when a candidate removes USB Audio. The unsupported promise of an upcoming DSP memory optimization was removed from the stock-effect summary.

`node scripts/verify-placement-diagnostics.mjs /local/OCTATRACK_OS1.40C.bin` runs the real application engine with the owner's original firmware. It reproduces the named overflow, verifies all four fixes, builds and hashes the complete upgrade for the Euclid/Mute Modes removal, checks unchanged input and rejects validation after clearing the base. The actual browser worker and compatibility components show the four buttons; selecting Euclid/Mute Modes changes the selection to nine modules and reaches “Configuration fits”. Firmware remains local and the verifier writes no firmware files. No firmware instructions, module versions, compiled packages, allocation rules or qualification claims changed; no hardware/audio/persistence test was performed.

The complete recorded native comparison replay covers 844 profiles: 327 built identities match, 491 refusals match, and 26 historical mismatches remain. Replaying unchanged main at `8b6bcaafa72a5fb8b8b3183898d2726c1c9b2634` produces the same results and mismatches: old Analog BD admission/menus and earlier FM Synth image identities in companion records. This diagnostic update adds no native mismatch and does not relabel those stale records as passes.

Node 24 `VITEST_MAX_WORKERS=1 npm run check -- --base origin/main` passed all 1,258 application/tooling tests in 187 files, 48 SDK checks, lint, TypeScript, catalogue/licence validation and the production build. The one-worker override avoids existing wall-clock test timeouts under local CPU contention; test timeout thresholds and the repository configuration are unchanged. Added regressions cover the full-context two-removal search, single-removal preference, bounded work, stale results, DSP/menu messages, worker payload preservation and actionable panel rendering.

Mini Verb 0.2.0-experimental: 46 current-source DSP regressions passed, including
exact neutral/dry behavior, endpoint spectra, eight-instance isolation and a
30-second guarded moving-control render. Native/browser parity passed all 110
selections (52 builds, 58 matching refusals, zero mismatches). Tone occupies C;
Mix moves to F. Owner accepted the sound and stability in Octemu and explicitly
waived physical hardware evidence for this exact version/source; hardware and
physical reboot persistence remain untested. See the module TESTING.md and
`sdk/miniverb-build-approval.json`.


### Analog BD 0.1.3 modulation smoothing — 8 October 2026

Promoted the exact owner-tested TDEP/SAT DSP update. The MKII owner reports stable
operation with distinct 808/909 instances and settings/audio retained after Part,
project and normal power-off/on. The hardware update/MAIN hashes and the separate
emulator/native results are recorded in the module's TESTING.md. Worst-case chip
cycles, full memory bounds and eight-voice maximum FX load remain unmeasured or
untested under the exact source-bound owner-approved experimental update.

On current main with Mini Verb 0.2.0, stock-free compilation passed. Required
coverage: 112 selections, 36 matching builds and 76 matching refusals. Broader
Analog BD matrix: 136 profiles, 130 native/browser MAIN and GNU bootloader matches,
six expected refusals, five full browser update round trips. Four representative
full native updates match browser encoding byte-for-byte, with checksum/MAIN/tail
verification and changed-stock rejection. Other generated module code is unchanged.
The standalone native MAIN differs from the hardware test only by relocation of
the identical stock FX1 chooser table; the public worker retains the approved
logger/startup additions. Private firmware, projects, cards and dumps stay local.

## Play Modes 0.1.1 — 8 October 2026

Import devilfish707's Octaplay build-24 source `41dbdaa` without modifying
the authored runtime. Host engine/glue tests and ColdFire generation pass.
The prior adapter fails 360 assertions in the updated regression suite;
the update passes. Native/browser comparison covers 110 configurations:
54 builds match outside the existing platform writes, 56 refusals match,
zero mismatches. Altered stock input is refused. Current native-composition
LCD captures show ALL REVERSED and ALL PINGPONG 2; hashes and actions are
retained in the module's `media/capture.json`. No firmware is committed.

Retain the author's attributed MKII build-20–24 functional reports.
Build-19 save/reload and physical reboot evidence remains historical;
current physical reboot, Part/project restore after unsaved edits, distinct
track isolation, MKI operation, chip timing and stock/flood benchmarks
remain unverified. The owner approved the missing current-build hardware checks for exactly
0.1.1 and native source `86105af3` on 8 October 2026, separately from the
historical 0.1.0 approval. No missing behavior is recorded as verified.

Owner exception, 8 October 2026: “Approve scoped exception and release.”
Applies only to Play Modes 0.1.1-experimental and native source
`86105af37d68fcd051cab991b747c949d7813733b73a1fe6d900cf3ec239c5a6`.
Waives fresh physical reboot, Part/project restore after unsaved edits,
distinct-track isolation and stock/flood performance tests. Retain the
author's MKII functional report; missing checks stay unverified.


## Air Chorus 0.1.0 — 9 October 2026

Chris Johnson’s MIT-licensed Airwindows Chorus is ported from pinned published
source to Octatrack FX2. Current native/browser coverage: 114 selections,
46 matching builds (16 identical outright, 30 outside shared platform writes),
68 matching refusals and zero mismatches. The native declaration exporter
records all 28,672 clean selections containing Air Chorus; 36,864 collide and
remain refused. Immutable source scans were memoized after comparing 128
complete uncached/cached ledger results exactly; no checks were omitted.
The browser now charges the module’s sine table and rejects Analog BD with the
same native reason. Verified descriptor fingerprints reference the owner’s
original 1.40C file; stock bytes remain private.

The exact AIRC0R1 image boots in Octemu, accepts four differently configured
track assignments and passes a separate two-track Part/control isolation
readback. Native moving-control checks pass all six cases/eighteen windows;
a guarded eight-instance replay passes for 31 seconds. Conservative modeled
cycles, executed instruction counts and unmeasured hardware deadlines are
reported separately. See [Air Chorus testing](../sdk/octabam/modules/airwindows-chorus/TESTING.md).

The owner’s successful 50-minute MKII report covers the earlier candidate,
several instances and full knob sweeps. Fresh physical testing of bounded
initialization is waived for the exact current source/image in
`sdk/airwindows-chorus-build-approval.json`; eight-track hardware timing,
locks/scenes/LFOs and Part/project/physical reboot remain unverified.


Adding the module changes the shared compiled source inventory. The existing
136-profile Analog BD matrix was rebuilt: all 130 build identities and six
refusals are unchanged, as are its three native builder-source fingerprints.
The broader browser-only check of the ten retained module comparison records
still reports 111 stale mismatch rows after earlier module updates; running the
same check on untouched current main produces exactly the same rows and result
summaries. Air Chorus adds no mismatch to those historical records; its new
114-profile record matches current source independently.

## Sidechain Compressor's table stays in P memory: native XTABLE guard — 9 October 2026

A native remix with Analog BD, Mini Verb, TapeHead and Sidechain Compressor froze the
sequencer after one step on an Octatrack MKII. It used static stock DSP and gave up the
three reverbs, LO-FI and DJ EQ. Because DJ EQ was given up, XTABLE had moved Sidechain's
48-word table into the stock curve bank at X:0x4840. The identical image with the table
left in P memory runs on the same unit. Each image was flashed once. The cause is
open; `sdk/octabam/docs/remixer/FAILURE_MODES.md` records what was ruled out.

`build_bus.py` now keeps a `stock_dsp` module's table in P memory. Such a module is
reached only through hooks, and Sidechain Compressor is the only one with a table. The
build log says why. Tables of dispatched effects still move to X memory. The web
composer places module tables in P memory only, so it is unaffected.

- **The remix that froze.** With the guard, it builds DSP uploads byte-identical on both
  cores to the image that runs on the unit.
- **A dispatched effect beside Sidechain.** A local remix with Spectrum and Sidechain, DJ
  EQ given up, parks Spectrum's table in X and keeps Sidechain's in P.
- **The native Analog BD matrix.** All 136 profiles were rebuilt in the pinned toolchain
  container, one SDK copy per shard. All 130 build identities and six refusals are
  unchanged. The 38 current-main profiles of the octabam infrastructure record were
  rebuilt the same way: 34 images and four refusals are unchanged. Only the
  `build_bus.py` source fingerprint moves, in both records and the import record.

No new hardware run of the guarded build is claimed. Images and firmware stayed local.

## VECTOR reboot regression — 9 October 2026

VECTOR 0.2.4-experimental protects signed packed settings from stock Part validation while leaving selected-machine and other data checks intact. Source SHA-256 `1255e99133cbd8d6d2587c95f93462ea80fccbd169462a2acb02aedbd346cbd3`; tested five-module MAIN `cabcc2967a23a0ef719a38de444aec1b68662c12bb9057093d475b89424d0026`. All 256 host and native instance masks pass. The 3,840-case generator/writer probe retains its bounds; native commit peaks at 472,500 executed instructions/1,048 stack bytes, validation at 64,241/252. Neither is chip timing. Part/project save-reload, fresh saved-card load and battery-only restart preserve two distinct instances; transport advances. Fresh monochrome UI captures cover both SRC pages, sample editing and both backing lists.

The 110-profile VECTOR matrix has 46 matching builds and 64 matching refusals. All 11 compiled artifact payloads/recipes outside VECTOR are byte-identical to current main outside global provenance/version labels. The existing Analog BD matrix, which excludes VECTOR, was rechecked against its unchanged native facts: 130 OS/GNU-loader matches, six matching refusals and five complete firmware round trips. The common worker initially saved a 466,760-byte ELEKLOADER update matching the tested private MAIN. After incorporating main `32e27ef` and Analog BD 0.1.4, the rebuilt common-worker update is 466764 bytes, SHA-256 `3e98ee1f5a1a71b674b682bef496b6fbe73e6df8a67d4b049ce07abfb3b7177a`. Its MAIN `fc8c24c97ffd5ae7b613c8fcff10caf2f9ce62d03ca4014c2a9c14262f628125` passes the original failing and saved battery-state regressions; the solo profile also passes. Only shared inventory/logger provenance differs from the qualified private image. The full local suite passes 1,406 application tests in 200 files, 86 SDK checks, lint, TypeScript and the production bundle. See [the sanitized regression record](vector-reboot-2026-10-09.json). Physical reboot/audio remain unverified under the explicit exact-version owner exception. Published deployment/download/report/notification completion is verified separately after merge.

## POLY8 0.2.5 approved candidate — 8 October 2026

POLY8 0.2.5-experimental uses the standard loader-free Modwerk builder, eight shared voices, one machine per Part, fixed 1/8 per-voice headroom and LOOP OFF on new assignments. The native/browser comparison records 114 selections (30 matching builds, 84 matching refusals, zero mismatches). The supported declaration matrix adds 8,192 clean combinations. The owner checked the standard-builder image in Octemu and reported “it worked”; the exact image and test limitations are in [the release evidence](../sdk/octabam/modules/poly8/evidence/release.md).

The owner approved the exact experimental version with current physical hardware, chip worst-case cycles and complete memory-bound qualification waived. The historical approval retained in [the owner release record](../sdk/octabam/modules/poly8/evidence/owner-release-t10.md#historical-025-approval) binds that candidate’s native-source hash; unknown measurements remain null. Both original stock DSP uploads are unchanged. T06 results and earlier MKII failures retain their original image identities; no emulator observation is presented as a hardware or power-cycle result.


## POLY8 0.2.6 release qualification — 9 October 2026

POLY8 now shares the bounded machine chooser with Analog BD, VECTOR and FM Synth and composes with Repitch, Mute Modes, Scale Quantizer and Sidechain Compressor within native memory/menu limits. Assignment follows FLEX/STATIC: the current page remains open, and double-TRACK opens samples. Eight voices, one POLY per Part, LOOP OFF defaults and fixed 1/8 voice gain remain. The native source is `a32ed194a288c8847ad0ba110e8bca3bf266ada2227772ef813623b32a21421d`.

The fresh 240-profile native/browser matrix has 186 matching builds, 54 matching refusals and zero mismatches. All 65,536 declaration selections containing POLY8 pass the native ledger; these declaration checks are not complete firmware builds. Remaining refusals in the firmware matrix reflect stock menu and code-space limits. Non-POLY shared-builder coverage preserves all 38 current-main complete images/refusals; Analog BD’s 130 builds and six refusals are unchanged. Another 143 unique retained companion profiles were rebuilt and match the browser before their stale records were refreshed.

Production catalog compositions reproduce the exact tested solo T10 MAIN `0271c801ad8b77cd5890d112f72e4a14438520138dc3b587624e703f1950248e` and full eight-module MAIN `280361c83057c82a092a2d051e2468f2672e95cb1b3f90d611980a160076bc4e`. Seven current-main emulator replays pass: solo/full selection flow, LOOP/cancellation, solo/full dirty-memory retained-SRAM boot without CF, chord recording/playback/STOP/128 rapid keys, and four-machine audio/modal/128 rapid keys. Stock FLEX/STATIC controls and the earlier T09 selection-flow negative control retain their original identities. Compiled gates check 121 local PC-relative addresses, loaded startup state and all 256 mixed AB/FM/VECTOR signatures under ASAN/UBSAN. Both original stock DSP uploads remain unchanged; the dynamic DSP loader is disabled.

The owner reports exact T10 “works like a charm” on MKII and approves the exact 0.2.6 source exception. Separately reported Part/project/reboot and hardware load cases, chip worst-case timing and complete memory bounds remain unverified. See [the actual owner report and exception](../sdk/octabam/modules/poly8/evidence/owner-release-t10.md) and [the sanitized exact-image software evidence](../sdk/octabam/modules/poly8/evidence/selection-flow-t10.md). The earlier 0.2.5 candidate is historical and was not publicly listed; publication and saved live-worker output are verified after the owner merge.

The complete release check on main `6545261` passes 1,564 application tests in 214 files and 87 SDK checks, plus lint, TypeScript, module/catalog/licence/source checks and the production bundle. The exact owner exception and compiled source remain unchanged after that rebase.

Two exhaustive compatibility cases exceeded CI’s five-second per-test limit after the larger native declaration matrix was added. Each is now partitioned into 16 disjoint groups covering the same complete selection/order assertions; the timeout is unchanged. The full local check passes again. Native compilation and Windows checks already passed for the unchanged firmware source.

The catalogue-wide qualification replay is also split by module after its single sequential case reached 5.04 seconds in CI. Every source/folder/version/waiver assertion remains; each module now has an independent unchanged deadline. The full local check passes 1,564 app tests and 87 SDK checks.

### Analog BD pre-boot capacity in the logger-bearing builder

Native octabam omits the mandatory browser core logger. At the pre-boot staging boundary, its smaller runtime can fit a crowded Analog BD selection while the browser correctly refuses the logger-bearing image. Native comparison still requires byte-identical module-owned OS/DSP writes and non-overlapping platform/logger writes for these selections. Only the exact Analog BD boot-memory guard is accepted as this separate platform limit; unknown errors remain mismatches. Records retain `browserPlatformRefused` per selection and in the summary, distinct from matching native refusals and downloadable builds. The guard remains enabled; no unsafe firmware is generated.


## Air Chorus 0.1.1 beta access — 9 October 2026

The owner approved the optimized Air Chorus candidate for the independent Beta tester class and waived current hardware testing for its exact 0.1.1 source. Regular members still cannot browse or build it. Session-based eligibility, server build checks, revocation, audited grants, forum/profile badges and eligible-only follower notifications are covered by regression tests. The UI marks the module Beta and states that the historical T3/T4 rhythmic clicking has not been confirmed fixed.

The current native/browser matrix has 118 profiles: 47 matching builds (16 identical outright, 31 outside platform writes), 71 matching refusals and zero mismatches. All 31,744 newly enabled allowed declaration selections pass the actual native ledger. Existing refused selections remain blocked; declaration records are not complete firmware builds. The exporter now accepts an explicit list of missing canonical keys and memoizes immutable source scans, while retaining all cross-module checks. Complete cached/uncached ledger results agree for 64 clean and 64 refused controls; an eight-selection exhaustive/explicit-key matrix agrees; duplicate, out-of-scope, noncanonical and native-refused requested keys fail without writing evidence.

Actual-DSP parity covers 30 fixtures and 983,040 stereo frames. The matched maximum net executed instruction count falls from 524.5 to 336.75 per sample (35.80%); stock Spring is 314 under the matched benchmark. The conservative source model and unmeasured chip timing remain separate. The two-track ColdFire/DSP playback comparison remains bit-identical over 8,192 blocks without reproducing the hardware symptom. Current physical multi-instance audio, deadlines and persistence are untested. The supplied historical checkpoints do not provide current-source audio evidence. See the exact source exception and limitations in the module's TESTING.md.

A normal beta member saved a 452,208-byte solo browser firmware update, SHA-256 814b5733cdd91b8ed88d45ebea865475047929c5483dc46c9fbd395455b315f9. Its decoded MAIN matches the current composer. The existing Analog BD browser matrix retains 130 native image matches, six matching refusals and five complete firmware round trips. The module doctor is green. Production deployment, the requested membership assignment, saved live output and notification counts are verified after the owner merge.

The complete local check passes 1,592 application tests and 87 SDK checks, lint, TypeScript, catalogue/licence/capture-provenance checks and the production bundle. All public and beta compatibility subsets retain their assertions and deadlines; 32 disjoint groups preserve the previous work per case after adding the beta effect.

## E-Verb 0.1.0-experimental — 9 October 2026

E-Verb moves from the author's draft into the published FX2 catalogue. Its DSP,
generator, native manifest and render/performance runners remain byte-identical
to PR #376 at `e3047c0`: native source SHA-256
`f96217aa81947846579dfe8b40aaef5624959ac13c10ae4e3b4a61050adeab7a`.
All 26 native-image emulator render gates were independently rerun and pass.
The browser's default solo module-owned image matches the tested MAIN
`b776efe203efecd0ceda90f68d7fe109cc8fc13a1f07bed00303f81af2769195`
byte for byte: Spring and Dark Reverb give up their code, while Plate Reverb's
helper and all other stock effects remain. The browser adds its separate core
logger and platform writes.

The owner reports a positive MKII audition of `EVRB01T01`, two simultaneous
instances on T1/T5 with distinct settings, Part/project save and reload, and a
physical reboot. These are attributed reported passes, not agent-observed
hardware results. Duration, eight-instance hardware load, full modulation/MIDI/
USB coverage, recovery and chip timing remain unreported. See
[the exact-image hardware report](../sdk/octabam/modules/everb/evidence/owner-hardware.md).

[The release bounds](../sdk/octabam/modules/everb/evidence/release-bounds.md)
supplement the author's loop-only cost with a conservative full-call assembled
word model: 11,920 cycles per instance per 16-frame block, 47,680 per core with
four instances and trigger splits, within the SDK's 49,920 module allowance.
This models neither bus contention nor whole-chip wall-clock timing. Exact
reserved memory, including stock X padding, totals 409,380 bytes for eight
instances. The original matched Spring/DJ EQ instruction benchmarks and
32-second eight-instance software stress retain their original limits.

Native-generated placement facts include E-Verb's priority and free effect ID
27. That omitted ID already resolves to OFF/null on both stock cores, so the
extra omitted-ID writes are no-ops for other selections. All existing compiled
payloads and recipes are unchanged outside global provenance/version metadata.
Before main advanced, the broader browser replay of 12 retained native records
reported the same 80 stale comparisons with identical output on untouched main
`306e3dc`; those rows involve earlier Analog BD companion images. The release
subsequently integrates main `f684770`, preserving Air Chorus 0.1.1 beta access
and its freshly compiled payload. All 36 existing payload/recipe/placement asset
files match that main after excluding E-Verb additions and global provenance.
The broader 12-record browser replay is also byte-identical to the replay on
untouched `f684770`, with the same 80 pre-existing Analog BD companion mismatches.

The fresh E-Verb native comparison covers 122 profiles: 44 matching module-owned
images (16 identical outright and 28 outside separately verified platform
writes), 78 matching refusals, and zero mismatches. Changed stock firmware is
refused. The exhaustive 131,072-selection native declaration scan finds 94,208
clean and 36,864 refused combinations; immutable source-fact memoization matches
uncached checks on 529 varied selections. After the main update, the production
exporter additionally verifies all 51,712 missing allowed E-Verb/Air Chorus beta
combinations as clean. Existing declaration records are preserved.

## Digi Mono repeated-SRC release preparation — 11 October 2026

PR [#424](https://github.com/repeat98/modwerk/pull/424) replaces only Digi Mono's two 0.13b catalog pins with source-built 0.13.2-experimental objects from Modwerk source/package commit `48a9b5ade88052d4fb0130d87a79be64935d4d9d`. The upstream author and MIT notice are preserved. The transactional catalog updater verifies both package hashes; kit 0.5.0, cores and other module pins are unchanged. Evidence and exact private-image identities are recorded in [Digi Mono testing](../sdk/digitakt/modules/digimono/TESTING.md).

Owner repeat98 explicitly approved this exact 0.13.2-experimental source and the two D180 private images on 11 October 2026, with issue #180 closure gated on live-download verification. The scope and literal approval are in Digi Mono’s evidence JSON. Physical hardware, audio, timing, complete runtime memory bounds, persistence, reboot and stress remain unverified. A passing PR does not establish a saved live download.

## Mini Verb mixer regression — 11 October 2026

Mini Verb 0.2.1-experimental fixes clipping when the wide wet-minus-dry
difference entered a 24-bit multiplier register. A measured raw-wet oracle
reproduces the 0.2.0 error at 0.9 FS / MIX 32 on both DSP cores without final
mixed-output clipping. Scaling the difference before multiplication and
restoring it in the accumulator passes the regression. All 53 DSP checks pass,
including exact dry, bounded low-level quantization, eight-instance isolation,
dirty-state guards and a 30-second moving render. The change adds four program
words, no state and 1.096% executed instructions with eight moving instances.

The current native/browser matrix has 126 selections: 52 matching builds,
74 matching refusals and zero mismatches; a modified original is refused.
Both chooser profiles of #428's saved six-module selection also match native
module-owned writes outside platform differences. Exact candidate images,
source hashes and packaging identities are in the module's TESTING.md. Real
LCD captures match that candidate. Separate native T1/T5 THRU runs produce
nonzero audio without output clipping or emulator failure; their private
diagnostic emulator extends the bounded checksum watchdog. Those moderate
input runs do not confirm the reporter's hardware noise.

Physical hardware, played automation, Part/project/reboot persistence, chip
timing and complete runtime bounds remain unverified. The original noise
symptom is unconfirmed. The owner explicitly approved this exact 0.2.1 source and the two I428
private updates with those limits disclosed on 11 October 2026. This is a new
source-bound exception, not an extension of 0.2.0. Report #428 remains open
until reporter confirmation; publication and saved live-download verification
are separate steps.

## E-Verb FUNC stops — 11 October 2026

E-Verb 0.1.1-experimental fixes #438: holding FUNC and turning SIZE, DCY, ABSB
or SPD jumped between 0 and 127 only. The FX page word at P+0x12a is a knob's
edit handler, and E-Verb's clone of DARK REV's page inherited stock's two-stop
editor on those four slots. 0.1.1 writes stock's three-stop editor (0, 64, 127,
as on the stock reverbs' MIX and BAL) on all six plain knobs. The private
image differs from 0.1.0's tested `b776efe2…` in exactly four descriptor bytes;
both DSP memory images are byte-identical, all 27 render gates pass and the
matched benchmark reproduces 0.1.0's figures.

Driven through the firmware's own panel code on the ColdFire emulator with FUNC
held, all six main-page knobs step through 0, 64 and 127 on 0.1.1; the same run
on 0.1.0 reproduces the report on the four knobs. The native/browser matrix has
126 selections: 48 matching module-owned images (18 identical outright, 30
outside platform writes), 78 matching refusals and zero mismatches; a modified
original is refused. The rebuilt packages change only E-Verb's version, its
descriptor recipe and source provenance. The Analog BD composition proofs,
re-exported natively on this tree, are identical apart from the source-tree pin;
E-Verb is in none of them.

No hardware result exists for 0.1.1; the owner's MKII report covers 0.1.0.
Publication needs the owner's approval of this exact source.

## Play Modes 0.2.0-experimental — 19 October 2026

Play Modes 0.2.0-experimental (STEP REPEAT by pgstath, #706) was merged without its owner approval, so `modules:check` and the release-notes test stopped both deploys. The owner approved this exact native source (`sdk/playmodes-build-approval.json`, `da8e028b…`) with hardware testing waived. `npm run module:verify -- playmodes` on the owner's original 1.40C: 60 native module-owned images match the browser builder, 66 refusals match, 0 mismatches, of 126 selections. Play Modes is not in Analog BD's proof matrix; only that file's module source-tree hash moved with the rebuilt packages. Not played on a unit.

## E-Verb ring clear of Sidechain's key window — 18 October 2026

E-Verb 0.1.2-experimental answers #696. Sidechain Compressor keeps its
cross-core key window in the last 514 words of the bank-track-3 FX2 slots
(T7 and T3), and E-Verb's ring was modulo 16,384: on those tracks it wrote and
read the whole window, and Sidechain's tap wrote into its delay lines. The ring
now wraps at 15,870 words (m4 = m5 = `$3dfd`; the FX2 slot bases are
16K-aligned), and the start-up clear stays inside it while keeping 0.1.1's
128 dry calls. The 499 words come off the top of the pre-delay: PRE keeps its
law and is clamped at 227 ms, so PRE 124 to 127 change (they rose to 250 ms).
The native manifest and the runtime package declare 15,870 buffer words.

A new render gate marks the window on both cores and runs the dearest settings
for 2.5 turns of the ring, with REV off and on and at full cyclic depth: 0.1.1
writes all 514 words, 0.1.2 writes none, its frame loop reaches the last ring
word, and it renders bit-identically with the window filled. Every tested
setting with PRE at 123 or below renders bit-identically to 0.1.1, and the
other 27 gates print 0.1.1's output except the placement lines and PRE 127's
onset. The matched
benchmark reproduces 0.1.1's figures; the per-call bound is still 47,680
modeled cycles per core per block.

The native/browser matrix has 126 selections: 42 matching module-owned images
(20 identical outright, 22 outside platform writes), 84 matching refusals and
zero mismatches. E-Verb with Sidechain Compressor builds with and without the
stock FX2 effects. No selection shared with 0.1.1's record changed between
built and refused, and every DSP-space refusal overruns by 61 words or more, so
none comes from the 14 added program words. The Analog BD composition proofs,
re-exported natively, are identical apart from the source-tree pin.

No hardware result exists for 0.1.1 or 0.1.2; the owner's MKII report covers
0.1.0. Publication needs the owner's approval of this exact source.

## Mini Verb DSP cost — 13 October 2026

Mini Verb 0.2.2-experimental removes two coefficient reloads that loaded the
value `y1` already held. Its modeled sample loop falls from 415 to 411 cycles
(the Octatrack loader's 7/4 charge from 727 to 720, within the smaller core's
726 one-module allowance). The disassembled programs differ in exactly those
two instructions. All 75 native DSP checks pass, including new gates that find
0.2.2 bit-identical to the published 0.2.1 program with eight moving instances,
every trigger split on both cores and a 0.9 FS input at TONE 0, 64 and 127; the
builder-path dspbench agrees at splits 0, 1, 7 and 15.

Under Air Chorus's matched protocol (one instance per core, X:0 audio, null stub
subtracted, splits 0–15, every SPRING TYPE and moving controls), worst-case
SPRING REV executes 314.0 instructions/sample and Mini Verb 0.2.2 362.75
(1.155×; 0.2.1 364.75, 0.2.0 360.75), identical on both cores. These are
executed instructions, not chip cycles. The only chip timing is 0.2.0's 665
cycles/sample on the owner's MKII. Native/browser parity, the isolated package
build, owner approval, hardware and chip timing of 0.2.2 are still required.

## BBD Delay 0.1.0-experimental — 14 October 2026

BBD Delay enters the FX2 catalogue as a new module by JamCones under MIT: a
bucket-brigade delay in 1,075 DSP56300 words with a compander, clock-tracking
anti-alias and reconstruction filters, a clocked bucket line, a resonant
feedback tilt, an exact-loop freeze, a feedback governor and a 20-400 Hz input
high-pass (HPF). FX id 14.

`module:verify` compared the browser builder with native octabam on the
author's own 1.40C file: of BBD's 130 selections, 53 module-owned images match
(22 identical outright, 31 outside the platform writes) and 77 refusals agree,
with no mismatches (`sdk/native-comparisons/bbd.json`). The pair ledger finds no
clash between BBD and any other module, so BBD declares no conflicts. Analog
BD's native verifier passes against the build with BBD in it. BBD needs an entry in `src/engine/assets/static-dsp.json` (FX id 14, priority
16), like E-Verb, before the browser places its code.

Beside the stock effects the site gives up SPRING REV and PLATE REV: BBD would
fit in SPRING REV's space, but DARK REV calls a 35-word routine at SPRING
REV+820. BBD is placed from PLATE REV's base and ends before that routine; a
render gate runs DARK REV on both cores with fixed and moving controls and
finds it bit-identical to the stock OS. The browser's default BBD build equals
the author-tested MAIN `bc53d1b3e96a4c22d5efb426c880d08e26d4f0288dccbe8ffaf43e25a18fb3ba`
byte for byte.

All 51 native-image render gates pass, including the DSP against its float
reference (HPF at 1, 64 and 127: −67.8 to −71.7 dB), eight-instance isolation
under guard and dirty start, and the stop-kill input. A matched benchmark
measures at most 439.44 executed instructions per sample with a trig split
(SPRING REV 314.19, CHORUS 293.06, DJ EQ 330.94 under the same cases), and a
32-second, eight-instance stress run finds no clobber or hang. The static
block bound is 11,248 modeled cycles per instance, 44,992 for four per core
against the 49,920 module allowance.

STOP, STOP, STOP does not cut BBD's tail in this release: the stock tail kill
tests the stock reverbs' ids only. BBD's DSP takes the signal on a hidden slot
(11); the ColdFire hook that writes it is left for the USB port, by the
owner's choice.

BBD is not offered over USB in this release. Its USB package (ABI 6, 5,014 bytes, stock-free under the publisher's scans) is refused by the loader's development-base cycle admission (`sdk/machines/octatrack/elekloader/dsp.c`): a module's executed figure is charged at 7/4 and one instance must fit beside seven stock slots, so the limit is 3,120 - 7 x 342 = 726 and BBD's 440 is charged 770. In `ot_emu` on a `--dsp-loader --dev` base with the author's project, `verify-octatrack-dsp-loader.mjs pick` installed E-Verb and ran it on T1 and T5, and refused BBD at VERIFY. The package is left out until the USB port settles the figure (a release base admits hardware-timed figures).

The author reports the release image on an MKII for about ten minutes: DARK
REV working, two instances on T1 and T5, Part and project save and reload, a
power cycle, every parameter with LFOs and trigless locks. MKI, MIDI/USB load,
silicon timing and the USB path on hardware are not reported.

## Apply Scene 0.1.0-experimental — 15 October 2026

Apply Scene is a ColdFire-only scenes module: one detour at the entry of stock's base-layer YES handler and one 636-byte unit. SCENE A or B + YES writes that scene's locks into the active Part; both scene keys + YES writes the crossfader blend.

- **Placement.** The unit is a DRAM unit (`Linked(cpu="5475", dram=True)`, Play Modes' path). As an image-linked ROM unit it took the image's free run before Preview Vol natively, while the browser builder places Preview Vol's fixed-origin ROM unit first: 10 of 130 selections differed. As a DRAM unit `npm run module:verify -- apply-scene` records 58 matching images, 72 matching refusals and 0 mismatches. `module:verify -- --all --check` on this branch shows no mismatch in any selection with Apply Scene; the other modules' recorded mismatches occur only in selections without it (not compared against an untouched main checkout).
- **Packages.** `build-module-packages.py` lists it as a requested ColdFire module. Its USB package (`--octabam`, ABI 7, one hashed site, no relocations) is byte-identical whether the card build links the unit in the image or in DRAM; it shares no 12-byte run with the stock OS and no 16-byte run (`check_stock_free.py`), and the adapted ot_emu's `sites` scenario installed and removed it on the beta base.
- **Gate and hardware.** `verify.py` passes 179 checks on the native image of the final source (the applied bytes equal stock's morph model, mutes, key orders, a worst case with every scene byte locked, Part and project save and reload, an emulated power cycle). The contributor ran the USB package of the previous source revision, with the same code, on an MKII over the beta base: all three modes, NOTHING TO APPLY, Keep, Undo, removal and a power cycle ([TESTING.md](../sdk/octabam/modules/apply-scene/TESTING.md)). `evidence/performance.json` leaves the MIDI-flood load and stress rows empty: the module has no frame-interrupt or MIDI work.
