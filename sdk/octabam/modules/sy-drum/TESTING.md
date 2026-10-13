# SY DRUM 0.1.0 testing

SY DRUM 0.1.0 is a new module: Tim Hastie's octatrick 2.14 `sy-drum/`, `timhastie/octatrick-modules` at `39dc5d8ca285c14674b66a452f58a5a0364efb96` (tag `v2.14`), packaged for Modwerk. It needs FM Synth 0.1.5 in the same build. FM Synth 0.1.5 stays pinned to the author's `v2.13` (`48b89e7`): `v2.14` changes only `sy-drum/` and the top-level README, so FM Synth's `synth/` is the same bytes at both tags. This file is the report that `tests.qualification` names.

**Status.** Emulator worst-case cycles, exact memory, a static stack bound, the module's native Part smoke, the machine-list walk, the 2.12 machine change, the two-instance and Part / project-load checks and the power-off walks are measured on the exact image below. The power-off walks ran on a second emulator build that carries the battery-backed memory over (named there); everything else on the pinned emulator. The hardware fields are `TIM:` placeholders until the author reports his MKI test of this exact image (`hardwareStatus` stays `historical` until then). Instruction counts are the emulator's: they are not hardware percentages or chip wall-clock timings.

## Source

`upstream/sy-drum/` is the author's `sy-drum/` at `39dc5d8` byte for byte except `manifest.py`; `upstream/synth/engine_abi.inc` is his `synth/engine_abi.inc` (the one file SY DRUM's manifest reads from `synth/`, the same blob at v2.12, v2.13 and v2.14); `upstream/LICENSE` is his LICENSE at v2.14 (since 2.13 it also names the quantizer's drawer hook, which is FM Synth's). In `upstream/sy-drum/manifest.py` every stock expectation is `stock_guard(address, length, SHA-256)`: `PAGE_STOCK`, `SETUP_EDIT_STOCK` and the 51 `LOCK_HOOKS` rows, 53 guards over 410 bytes, each recomputed from the developer's MAIN OS `164f3122…` and checked equal to the SHA-256 of the literal it replaces (0 mismatches); the one guard new in 2.14 is the UI tick's transport test at `0x4005224a` (8 bytes, `sl_io_tick_hook`). `stock-guards.json` is regenerated from the manifest (the 52 earlier guards unchanged, in the same order). The author's native `conflicts` (KITS, PLOCKS P2, STEM REC) name octabam modules this catalogue does not carry; `manifest.py` clears them and `octamod.module.json` lists them. The inventory, with every file's hash and the author's, is `sdk/imports/sy-drum-39dc5d8.json`; `sdk/tests/test_sy_drum_import.py` checks it.

Against the previous build of this package, pinned to v2.12 (MAIN OS `d0dab5fe…`): `git diff ca13ed8 39dc5d8 -- sy-drum/ synth/engine_abi.inc` touches `tools/locks_io.c` and `locks_io.inc.s` (generated from it by `tools/gen_locks_io.py`, which changed too), `manifest.py` (the new `LOCK_HOOKS` row and the counts in its docstring) and `README.md`; `sydrum.s`, the engine, the other lock sources and `engine_abi.inc` are unchanged (2.13 changed nothing in this folder). In the image, the SY DRUM unit `03_sydrum.o` differs from the previous image's only in the code assembled from `locks_io.inc.s`: a per-label comparison of the two objects (normalized disassembly and bytes) finds 530 of the previous image's 551 `.text` labels unchanged, and the 21 that differ and the 5 new ones (`sl_io_tick_hook`, `sl_io_tick_stock`, `sl_io_play_tick`, `sl_io_queue_post`, `sl_io_stock_card_ready`) are all in `locks_io.inc.s`; in `.data` 37 labels are unchanged and 3 are new (`sl_io_play_ticks`, `sl_io_flush_pending`, `sl_io_flush_job`). The unit is 136,061 B at 2.14 (code 68,297 including the 113 B of strings, data 67,764), 346 B more than the previous image's. FM Synth's objects (`poly`, `fmmachine` and `fm_qz` in their SY DRUM variants, the linked page and quantizer objects) are byte-identical to the previous image's.

The module's native source SHA-256 changes from the previous image's `f7175f34…` to `8526f406…` (below): Modwerk's fingerprint covers the whole module folder, and the pinned source (`upstream/`, `manifest.py`, `stock-guards.json`) changed with the re-pin, as did the records it includes (`evidence/native-smoke.json` and `evidence/performance.json` record this image and its figures). The author's `tools/stock_scan.py` (v2.14) on the v2.14 tree with this `manifest.py` reports the same 62 runs as on v2.14 itself, all in assembled code, none in a manifest or data directive. Over the assembled objects of this build, every run of 12 or more bytes equal to stock (73 runs) is one the previous image's build or FM Synth 0.1.5 alone already has (displaced-instruction replays and common compiler / assembler idioms in `.text`, zero-filled tables in `.data`); the 2.14 code adds none.

**The dependency on FM Synth.** The author's manifest `requires=("SYNTH MACHINE",)`, so native octabam refuses SY DRUM without FM Synth. Octatrack modules in Modwerk's contract v2 have no `requires`, so the configurator refuses the same selection through one rule in `src/catalog/selection-conflicts.ts` (`sy-drum-needs-synth`, fix: remove SY DRUM), with a test in `selection-conflicts.test.ts`. FM Synth's three units that are written per remix (`poly`, `fmmachine`, the bundled quantizer `fm_qz`) take `HAVE_SYDRUM` from their `remix.inc`: `scripts/build-module-packages.py` builds their ordinary objects for FM Synth alone and adds one variant each, `whenModules: ["sy-drum"]` (not with POLY8), assembled with SY DRUM in the remix. `sy-drum` joins the requested-module list there and the loader-free list in `src/engine/compose-os.ts`. These are the only shared-code changes; the re-pin to 2.14 changes none of them.

## What 2.14 changes for SY DRUM

- **The step locks survive a power-off without SAVE.** `sylockNN.work` follows lock edits within about 1.2 s while the sequencer plays too (before 2.14 only while it was stopped), so a power-off while playing or just after STOP keeps the PLAYBACK SETUP locks edited during playback, as stock keeps its PLAYBACK locks. One more stock hook: the UI tick's transport test (`0x4005224a`), which counts the stock save's 60-tick cadence while the sequencer plays with an unwritten lock edit and posts one job of the module's own (kind `0x80`; the module's dispatcher hook writes the files, the stock dispatcher drops the kind). At most one write every 60 UI ticks (1.2 s on the emulator; the unit's tick rate was not measured), none while no edit is unwritten. An edit less than about 1.2 s before a power-off can still come back without it; SAVE PROJECT closes that. Measured below ("Power-off without SAVE").
- **The lock files load whatever the stock bank load returned.** A missing, cut or damaged stock bank file of the project (stock's own message, that bank started empty) no longer leaves every bank without its step locks. Measured below.
- The author found the first on the previous image of this package on his MKI (12 October 2026; below) and tested the play-time write on his own octatrick build afterwards; that is not a report of this image ("Hardware").

## What 2.12 changes for SY DRUM

- **A machine change resets the track's machine parameters.** Whenever a track's machine changes and the old or the new machine is FM SYNTH or SY DRUM, its PLAYBACK, PLAYBACK SETUP, AMP, LFO and their SETUP pages get the new machine's init (SY DRUM's: PTCH 0, MODE A, WDTH 64, SWEP 0, SPED 64, DEC 64; LSPD 64, LDEP 0, WAVE OFF, S&H OFF; a stock machine's: a new project's values). Step locks and scene locks are kept, as in the stock firmware; SY DRUM's own setup-LFO step locks are kept too and play again when the track returns to SY DRUM; the FX1 / FX2 slots are kept. The code is FM Synth's machine list (`synth/machine.s`, `ml_reset`), active for SY DRUM through the SY DRUM variant of FM Synth's units. Measured below ("Machine change").
- **The metronome.** FM Synth's engine no longer hooks the frame builder's click word, which with CLICK ON released held engine notes at every beat in 2.11. FM Synth's record measures it; it was not measured separately with a SY DRUM track here (the hardware sheet asks for it).

## With FM Synth 0.1.5

FM Synth 0.1.5 carries the author's 2.13 quantizer (MIDI-track paths); SY DRUM is a machine for audio tracks. Built alone from this branch, FM Synth gives FM Synth 0.1.5's own test image (MAIN OS `37661aee…`), so the SY DRUM changes leave FM Synth alone untouched. Every check below was re-run on this image. Against the previous image: the five LCD captures, the machine-list walk's 24 values, the machine change's and the persistence walks' values and verdicts and the seven renders are the same; the per-routine costs are the same to within 2.8 instructions: the largest difference is `sy_render` on s1, 858.7 against 861.5 a call, a mean that follows the run's RND LFO values; every other is within 0.4; the peak blocks (maximum over the runs) are s1 29,017 (-16), s2 33,419 (+14), s3 37,749 (-154), s4 42,304 (-14), s8 59,601 (-344) instructions against the previous image's maxima, inside the run-to-run spread of either image (208 here, 418 there); exact memory grows by 536 B; the stack bounds are the same.

## Build and identities

| item | value |
| --- | --- |
| Module | `sy-drum` 0.1.0-experimental; native source SHA-256 `8526f406181896a65943c3c907e8f752e7e3643fbb1b7b4ee8ac100942490d52` |
| With | `synth` 0.1.5-experimental (FM Synth, the author's `synth/` with his 2.13 bundled quantizer, pinned to v2.13: the FM Synth 0.1.5 package this branch is stacked on) |
| Image | MAIN OS SHA-256 `27c213b2dca96e071200d97441de821c900bf9f87556af0918da200ef623aed9` (1,180,726 B): FM Synth + SY DRUM and all stock effects, built from this source by `scripts/export-composition-proofs.py --vendored-sdk --static-stock --modules synth,sy-drum --select synth+sy-drum:true`. The captures, the measurements, the walks and the Part smoke all used this image. |
| Update file | 521,012 B, SHA-256 `1644e5fa8746bd96a11e39e5f19e84cdbc16fb8077d47df318d9e7912926d651` (OCTAMOD79); Modwerk's TS packer decodes it to that MAIN OS and re-encodes the same bytes; kept local, never committed. |
| Alignment | The author's `tools/align_check.py` (2.14) on this build: ok — 12,798 instruction rows (1,385 at a code symbol) in 5 linked objects, all even; 131 detour / symbol-ref / hook / poke targets even, every jmp / jsr into them on an instruction |
| Emulator | the pinned `ot_emu` (SHA-256 `9dc31d12…`), MKII panel, DSP lockstep, for everything but the power-off walks; those ran on `ot_emu` `07a7c08e…` (the same emulator with the battery-backed memory carried over a power-off). |

The earlier local builds of this package are superseded: the octatrick 2.12 SY DRUM beside FM Synth 0.1.5 (MAIN OS `d0dab5fe…`), the build beside FM Synth 0.1.4 (MAIN OS `199e9b09…`) and the 2.11 build (MAIN OS `b9b65cd9…`).

## Native Part smoke

`python3 verify.py --emulator <ot_emu> --image <MAIN OS> --image-sha256 27c213b2dca96e071200d97441de821c900bf9f87556af0918da200ef623aed9 --sdk <SDK>`: passed: eightTrackSelection, sampleSlotsUnchanged, partAndShadowSignature, reselectPreservesControls, fmSynthRowBeside, returnToFlex (`evidence/native-smoke.json`). On an empty card it chooses SY DRUM on all eight tracks from SRC SETUP, checks the machine byte, the Part and battery-RAM-shadow signature `S`, `Y`, 1, the seeds (PLAYBACK 64 0 64 64 64 64, SETUP 64 0 0 0) and that no sample slot changes; reselecting keeps an edited control; FM SYNTH, one row up, still writes `F`, `M`, 1; FLEX clears the signature.

## Machine-list walk

On an empty project card (the author's verification walk `choose7`, run on this image): SELECT MACHINE TYPE scrolls to the seventh row and YES stores `SY`, 1 with the seeds; both windows reopen on SY DRUM; FM SYNTH from the same window stores `FM`, 1 and its own seeds; SY DRUM again gets its own init and nothing of FM's; FLEX clears the signature and gets a new project's FLEX values; SRC SETUP chooses SY DRUM the same way. The PLAYBACK page reads PTCH MODE WDTH SWEP SPED DEC with the footer `SY DRUM>SY DRUM`, and the setup half LSPD LDEP WAVE S&H. Machine byte, signature and seeds read back from the live Part after each choice: SY DRUM `53 59 01`, PLAYBACK `40 00 40 40 40 40`, setup `40 00 00 00 00 00`; FM SYNTH `46 4d 01`, `40 0c 20 40 00 28`; FLEX `00 00 00` with PLAYBACK `40 00 00 7f 00 4f` and setup `01 00 00 00 01 40`, the bytes the track had before any choice. All 24 values equal the previous image's.

## Machine change (2.12)

Walk (`mc`, scripted panel presses on the pinned emulator) on the two-track card of the persistence checks below (T1 and T5 SY DRUM, with different settings and setup-LFO step locks; T3 an untouched FLEX track). T1: the PLAYBACK knobs, the setup LFO, the LFO page, AMP and FX1 turned away from their values and a setup-LFO lock recorded on step 9 in GRID RECORDING; then SRC SETUP, UP to FM SYNTH, YES; then SRC SETUP, DOWN to SY DRUM, YES; a 2.4 s render. T3: SRC SETUP, DOWN to SY DRUM, YES, as the reference init from a stock machine. Values read from the live Part (the blocks of all eight tracks) and the lock table in RAM after each step.

| check | result (emulator) |
| --- | --- |
| SY DRUM → FM SYNTH | signature `46 4d 01`; PLAYBACK `40 0c 20 40 00 28`, setup `00 00 00 00 00 00`, LFO page `20 20 01 00 00 00` (VOIC 1), AMP `00 7f 7f 40 40 7f`: FM SYNTH's init, nothing of SY DRUM's edits: yes |
| FM SYNTH → SY DRUM | signature `53 59 01`; PLAYBACK `40 00 40 40 40 40` (PTCH 0, MODE A, WDTH 64, SWEP 0, SPED 64, DEC 64), setup `40 00 00 00 00 00` (LSPD 64, LDEP 0, WAVE OFF, S&H OFF), LFO page `20 20 20 00 00 00`, AMP `00 7f 7f 40 40 7f`: yes |
| the same init as from a stock machine | T3 FLEX → SY DRUM gives the same PLAYBACK, setup, LFO, AMP and page-2 bytes: yes |
| FX slots | FX1 keeps T1's edit through both changes (`09 76 00 40 00 40`); FX2 unchanged: yes |
| setup-LFO step locks | T1's rows (step 1, and step 9 recorded before the change) unchanged on FM SYNTH and back on SY DRUM: yes |
| other tracks | T5 (SY DRUM) unchanged in every byte and lock row throughout; T3's change leaves T1 alone: yes |
| audio after the round trip | RMS 485.9, peak 2,724 (main outputs, 2.4 s) |

21 of 21 checks pass (the per-track block strides are checked on the six untouched tracks). The stock step and scene locks were not read back in this walk; keeping them is the stock firmware's behaviour, which 2.12 leaves alone, and the author's 2.12 verification covers it. This walk changes the machine in SRC SETUP; `choose7` above makes the same kind of change in SELECT MACHINE TYPE. The marker-file route was not walked here. Every byte and verdict of this walk equals the previous image's.

## Sound

Seven batch renders of the author's verification cards on this image (`r_lfo`, `r_dec`, `r_ptch`, `lk_a`, `lk_b`, `lk_c0`, `lk_ns`: SY DRUM tracks with TRI, SQR and RND LFOs, S&H, the decay and sweep ranges, and step locks), the SY LFO state set at transport frame 0 as he does, 6,000 frames each through the emulator's DSPs, compared with his own renders of the same cards on his octabam 2.11 build (the voice and LFO sources are unchanged since): every 0.125 s window of every active output channel identical (17 of 17 windows on each), at a lag of at most 1 sample (where each run's transport start is detected), his comparison method and tool; and identical in the same way to the previous image's renders and to the earlier builds of this package. He compared his octabam build with his on-board development engine the same way, identical on `r_lfo`, `r_dec`, `r_ptch`, `lk_a` and `lk_b` (`upstream/sy-drum/README.md`, "Measured").

## Composition parity

`npm run module:verify -- sy-drum` with native octabam on this host's toolchain (no Docker here; a shim runs the container's command): 126 selections, 4 builds matching native outside the platform writes, 122 matching refusals, 0 mismatches (`sdk/native-comparisons/sy-drum.json`, its `pool` lists the modules). **POLY8 is not in that pool**, locally: POLY8's bridge (0.2.7 on this base) checks FM Synth's chooser claims against 0.1.2's and stops FM Synth 0.1.5 on both sides (the FM Synth PR's open question); a selection with POLY8 and SY DRUM needs FM Synth and stops the same way. The native declaration checks for every selection the configurator allows (32,768 with FM Synth) are recorded in `src/catalog/native-metadata.json`. SY DRUM alone, or beside any module without FM Synth, is refused by native (`requires SYNTH MACHINE`) and by the browser (the same class, "conflicting native declarations"); the configurator refuses it before building (`sy-drum-needs-synth`).

## LCD captures

Five black-and-white captures of this image with `scripts/capture-module-ui.py` on a disposable project card (all tracks STATIC, no sample assigned; plan, card hash and screenshot hashes in `media/capture.json`), each opened and reviewed: SELECT MACHINE TYPE and SRC SETUP on the SY DRUM row, the PLAYBACK page, the setup page, and the setup page in GRID RECORDING with a trig held whose LDEP lock is drawn inverted. All five are byte-identical to the previous image's captures (and to those of the earlier builds): 2.14 changes no page. The TEMPO popup was not captured: the capture tool has no TEMPO key.

## Persistence and multiple instances (8 October 2026 rules)

Card: a project with two SY DRUM tracks, T1 and T5, different PLAYBACK and setup values and different step locks (T1 step 1 LSPD 100; T5 step 3 LDEP 20, WAVE 3). Values are read from the live Part, its battery-RAM shadow and the lock table in RAM; "audio" is a 2.4 s render of the main outputs through the emulator's DSPs. Pinned emulator.

| check | result (emulator) |
| --- | --- |
| two SY DRUM tracks (T1, T5) with different PLAYBACK, setup and step locks | both signed `SY`, 1 with their own bytes: yes |
| editing T1 (PLAYBACK knobs, the Part's LDEP, a new lock on step 5) leaves T5 alone | T5's machine, signature, PLAYBACK, setup and locks unchanged: yes |
| replacing T1 by FLEX, then SY DRUM again | FLEX clears T1's signature and gets a new project's FLEX PLAYBACK and setup bytes (2.12): yes; SY DRUM again gets SY DRUM's init (2.12): yes; T5 unchanged both times: yes; T1's step locks kept: yes |
| audio of both tracks before / after | RMS 1443.9, peak 3,116 / RMS 487.8, peak 2,662 (16-bit main outputs, 2.4 s; after: T1 at SY DRUM's init) |
| Part SAVE, edits on both tracks, Part RELOAD | the saved bytes come back on both tracks: yes (the edits had changed pb_t1, setup_t1, pb_t5); the step locks untouched: yes; audio after: RMS 1406.0, peak 3,130 |
| SAVE PROJECT with step locks on both tracks (T1 steps 1 and 9, T5 steps 3 and 7), then a further lock (T1 step 11), stopped, and quit | the card holds `sylock01.strd` (generation 3: the four saved rows) and `sylock01.work` (generation 4: the working rows, step 11 included, from the background save) beside the stock files |
| that project loaded from the card by a fresh emulator process (`--mount --project`: the menu's LOAD PROJECT, job 4; no battery-backed memory carried over) | the lock table equals the WORK rows: yes; the Part bytes are the saved ones: yes |
| edits after the load (T1 PTCH, a new lock on T5 step 15), then PROJECT > RELOAD | the lock table equals the saved STRD rows (step 11 and step 15 gone): yes; the saved Part bytes: yes; audio after: RMS 1445.1, peak 4,394 |
| a power-off without SAVE, then the power-on load (job 5) with the battery-backed memory | the next section |

The walks are scripted panel presses on the pinned emulator with the image's DSPs running. The previous record of this package called the load row above a "cold boot"; it is the menu's project load from the card (job 4), with an empty battery-backed memory, not the unit's power-on path. The power-on path, with the battery-backed memory carried over, is the next section. Every value and verdict above equals the previous image's.

## Power-off without SAVE (the power-on load) — 13 October 2026

The author's finding on the previous image (MAIN OS `d0dab5fe…`, 12 October 2026, his MKI): PLAYBACK SETUP step locks (LSPD LDEP WAVE S&H) edited while the pattern played came back without those edits after a power-off with no SAVE PROJECT, in about half of his runs, while the stock PLAYBACK locks always came back; with SAVE PROJECT after the edits both came back. The cause (the author's 2.14 README): stock keeps the current bank, and so its own locks, in battery-backed memory and writes its working files only while the sequencer is stopped; SY DRUM's working file `sylockNN.work` was written by that same stopped-only background save, so a power-off while playing, or within about a second of STOP, found it behind. A second cause with the same symptom: when one stock bank file of the project was missing or unreadable at load, the SY DRUM files were not read at all. 2.14 writes the working file while the sequencer plays too (a job of the module's own, posted from the UI tick at most once every 60 ticks while a lock edit is unwritten) and reads the files whatever the stock bank load returned.

**Method.** The pinned emulator cannot carry the battery-backed memory over a power-off, so these walks run on a second build of the same emulator, `ot_emu` SHA-256 `07a7c08e…` (octabam's emulator with `--cs1-in` / `--boot-load`), used for these walks only: the session ends with a dump of the battery-backed memory (CS1, 1 MiB) and a hard stop, with no flush beyond what the firmware had written to the card; a fresh process then powers up with that memory and that card (`--boot-load`: the firmware's own power-on load, the card-mount handler's job 5, not the menu's LOAD PROJECT). Card: a project with Flex samples in slots 1–7, T1 and T5 SY DRUM. The walk makes T2 SY DRUM from the machine list and places four trigs, then records in GRID RECORDING four PLAYBACK locks (stock: T1 s5 and s9, T2 s3 and s11) and five PLAYBACK SETUP locks (SY DRUM's: T1 s5 and s13, T2 s7, s15 and s3); no SAVE after them. Read at the cut and after the power-up: the step-lock table's rows of T1, T2 and T5 (pattern 1), the stock lock bytes of T1 and T2 in the live pattern, the ready mask; a row "back" means it reads at the power-up as it did at the cut. Both images ran the same walks on the same card, one emulator process each.

| the edits, then | this image | previous image (control) |
| --- | --- | --- |
| made while playing; about 10 s more playing; power cut while playing | 5 of 5 PLAYBACK SETUP rows, 4 of 4 stock lock bytes | 0 of 5 PLAYBACK SETUP rows, 4 of 4 stock lock bytes (lost: T1 s5, T1 s13, T2 s3, T2 s7, T2 s15, back as before the edits) |
| made while playing; 3 s more; STOP; power cut 0.6 s after pressing STOP (0.45 s after its release) | 5 of 5 PLAYBACK SETUP rows, 4 of 4 stock lock bytes | 0 of 5 PLAYBACK SETUP rows, 4 of 4 stock lock bytes (lost: T1 s5, T1 s13, T2 s3, T2 s7, T2 s15, back as before the edits) |
| made while stopped; power cut about 4 s after the last knob turn | 5 of 5 PLAYBACK SETUP rows, 4 of 4 stock lock bytes | 5 of 5 PLAYBACK SETUP rows, 4 of 4 stock lock bytes |
| made while stopped; 3 s; one more PLAYBACK SETUP lock (T2 s7, encoder B); power cut 0.6 s after that knob turn, the trig still held | 5 of 5 PLAYBACK SETUP rows, 4 of 4 stock lock bytes, the last edit included: nothing was unwritten at the cut (dirty mask `00000000`; a write fell between that edit and the cut) | — |
| made while playing; 3 s; one more PLAYBACK SETUP lock (T2 s7, encoder B); power cut 0.6 s after that knob turn, playing | 4 of 5 PLAYBACK SETUP rows, 4 of 4 stock lock bytes: the row of the last edit (T2 s7) came back without that edit (dirty mask `00000001` at the cut); every earlier edit came back | — |
| made while stopped; 3 s; one more PLAYBACK SETUP lock (T2 s7, encoder B); power cut 0.3 s after that knob turn, the trig still held | 5 of 5 PLAYBACK SETUP rows, 4 of 4 stock lock bytes, the last edit included: nothing was unwritten at the cut (dirty mask `00000000`; a write fell between that edit and the cut) | — |

The previous image loses every PLAYBACK SETUP edit made while playing in both play cases and keeps the stock locks: the author's symptom. This image brings every row back in the three cases. In the residue walks (one more lock 0.3 to 0.6 s before the cut) the last edit came back where a write had fallen between it and the cut (the dirty mask 0 at the cut) and came back without that edit where it was still unwritten (the dirty mask 1); every earlier edit and every stock lock came back in each. That is the residue the author's README names: an edit less than about 1.2 s (60 UI ticks on the emulator) before a power-off can be lost; SAVE PROJECT closes it.

**A stock bank file missing or damaged at power-on.** The card of the "made while stopped" session as it was at the cut, rebuilt with one stock bank file of the project damaged, powered up with that session's battery-backed memory (no keys pressed until the read at 3.5 s, then NO to stock's ABORT question, read again):

| `bank05.work` | this image | previous image (control) |
| --- | --- | --- |
| `bank05.work` removed | ready mask `0000ffff`, every step-lock row of T1, T2 and T5 as at the cut: yes; stock rows as at the cut: yes | ready mask `00000000`, the lock files not loaded (the table reads zero): no SY DRUM step lock; stock rows as at the cut: yes |
| `bank05.work` cut to 4,096 B | ready mask `0000ffff`, every step-lock row of T1, T2 and T5 as at the cut: yes; stock rows as at the cut: yes | ready mask `00000000`, the lock files not loaded (the table reads zero): no SY DRUM step lock; stock rows as at the cut: yes |
| `bank05.work` with its first 64 bytes 0xFF | ready mask `0000ffff`, every step-lock row of T1, T2 and T5 as at the cut: yes; stock rows as at the cut: yes | ready mask `00000000`, the lock files not loaded (the table reads zero): no SY DRUM step lock; stock rows as at the cut: yes |

Stock's own message is the same on both images (SOME ERRORS OCCURED, then ABORT LOADING THIS PROJECT?); answered NO, stock starts that bank empty and loads the project. The previous image then has no SY DRUM step lock at all and none can be set until the next project load; this image has every bank's rows. Holding T1's step 5 on the setup page in GRID RECORDING afterwards shows its LDEP lock drawn inverted with its value on this image and no lock on the previous image (the same LCD capture in all three cases on each image). Not walked here: the same power-up answered YES (no project, as before), SAVE PROJECT followed by a power-off on this path (the hardware sheet has it), and the write cadence while playing (the author's 2.14 README: ten writes 1.2 s apart over 12 s of edits, none while nothing is unwritten).

## Qualification: cycles and memory — 13 October 2026

### Method

The image runs on the pinned emulator with its PC watch on the frame interrupt's body (`0x4000aad8` … `0x4000d9a6`, + 4, the convention of FM Synth's record) and on `sy_render` / `sy_done`. The watch is armed before PLAY, so the first START after PLAY is in every run; each run plays 3 s (about 8,500 frames). Every card ran five times on the same image (each run a fresh emulator process); the record takes each card's maximum over its runs. The peak block moves from run to run by up to 208 instructions on this image (n0 1, s1nl 14, s1 32, s2 46, s3 14, s4 208, s8 64); the cause of that run-to-run variation on the emulator was not traced. The same walk times `sd_tick` (SY DRUM's once-a-frame work), `sy_render` and `sl_seq_publish` (the step-lock publication at a START). Every number is an emulated ColdFire instruction count, never a hardware cycle count.

Cards (project `SYTEST/PROJECT 260930`, 120 BPM, 16 steps): **n0** eight FLEX tracks and no trig (the image's idle cost); **sN** N SY DRUM tracks (N = 1, 2, 3, 4, 8), a trig on every step, the setup LFO at its most active (LSPD 127, LDEP 127, WAVE RND, S&H ON), a step lock of all four setup controls on every step, p-locks of all six PLAYBACK controls on every step (PTCH 52…75, MODE A…F in turn, WDTH / SWEP / SPED / DEC at alternating extremes), LFO1 on WDTH and LFO2 on SPED at full speed and depth, and scene locks on all six PLAYBACK controls in all sixteen scenes; **s1nl** s1 without the step locks.

### Budget and conversion

One 16-sample frame is 362.8 µs at 44.1 kHz. As in FM Synth's record, instructions convert at the CF METER calibration, 9.44 ns an instruction (2.49216 cycles at 264 MHz): the block is 38,432 instruction-times, 95,779 cycles. The budget holds the whole frame interrupt, stock reserve included.

### Results (instructions per block, frame-interrupt body)

| card | runs | first START block, max (range) | later peak, max | sustained mean | over idle, a track: START / sustained | inside the block (+372) |
| --- | --- | --- | --- | --- | --- | --- |
| n0 (idle, SY DRUM present) | 5 | 23,475 | 23,829 | 23,386 | — | yes |
| s1nl | 5 | 28,935 (28,921–28,935) | 28,097 | 25,946 | +5,106 / +2,561 | yes (0.763 of the block, 9,125 left) |
| s1 | 5 | 29,017 (28,985–29,017) | 28,123 | 25,976 | +5,188 / +2,590 | yes (0.765 of the block, 9,043 left) |
| s2 | 5 | 33,419 (33,373–33,419) | 31,592 | 27,658 | +4,795 / +2,136 | yes (0.879 of the block, 4,641 left) |
| s3 | 5 | 37,749 (37,735–37,749) | 35,044 | 29,344 | +4,640 / +1,986 | yes (0.992 of the block, 311 left) |
| s4 | 5 | 42,304 (42,096–42,304) | 38,552 | 31,031 | +4,619 / +1,911 | NO (1.110 of the block, over by 4,244) |
| s8 | 5 | 59,601 (59,537–59,601) | 52,561 | 37,756 | +4,472 / +1,796 | NO (1.560 of the block, over by 21,541) |

The once-a-frame work: `sd_tick` 606 emulator instructions a frame with the module in the image and no SY DRUM track on this package's idle card (eight FLEX tracks; 588 on the author's idle card, the difference being the card); 1,642 with one worst-case track, 2,053 with eight. On the author's verification cards: `sd_tick` 1,620.7 with one track and a trig on every step, 1,646.2 with a lock on every step; `sl_seq_publish` 223–268 at each START; `sy_render` 937.6 a call (two calls a frame a track). These match the author's measured figures (upstream README, "Cost": 1,620, 1,645, 223–268, about 938) and the previous image's (means over 5,513 frames): the same to within 2.8 instructions: the largest difference is `sy_render` on s1, 858.7 against 861.5 a call, a mean that follows the run's RND LFO values; every other is within 0.4. The START block is the peak in every run: each START adds the voice's recharge and the step's lock publication to that frame.

**The 2.14 tick hook is not in the audio block.** The new detour sits on the UI tick's transport test (`0x4005224a`), in the UI task, outside the frame interrupt these figures measure. From the linked disassembly against the stock tick: while the sequencer is stopped the hook adds 2 instructions a UI tick (the jump into it and back); while it plays with no lock edit unwritten, 34 (7 in the hook beyond the stock test it replays, 27 in `sl_io_play_tick`'s early return); with an edit unwritten a few more a tick for the count, and once every 60 ticks the posting of the module's job (the card write itself is an engine-task job, like stock's own background save). The frame-interrupt figures above move against the previous image's by no more than the run-to-run spread, and the per-routine costs are the same to within 2.8 instructions: the largest difference is `sy_render` on s1, 858.7 against 861.5 a call, a mean that follows the run's RND LFO values; every other is within 0.4. That is what an unchanged audio path gives; the cards measured here edit no lock while playing, so the play-time write does not run in them.

### Pricing for the record

- **worstCase** 14,246 cycles/block: one track's highest START block over its 5 runs, 29,017, minus the lowest idle frame, 23,301 = 5,716 instructions x 2.49216, rounded up.
- **Run-to-run spread.** Across the runs of each card the peak block varied by up to 208 instructions on this image (n0 1, s1nl 14, s1 32, s2 46, s3 14, s4 208, s8 64). The frame interrupt runs the same code as on the previous image (the SY DRUM unit differs only in its card code, which runs in the UI and engine tasks; FM Synth's objects and the stock OS are the same bytes), whose runs varied by up to 418. A configuration is qualified only when its highest peak, plus FM Synth's 372-instruction allowance, leaves at least the larger of the two (418) inside the 38,432 instruction-time block.
- **maxInstances** 2: two tracks peak at most 33,419, 33,791 with the allowance, 4,641 instructions inside the block.
- **maxConfiguration** 84,213 cycles/block: 33,791 instructions (the 2-track maximum + 372) x 2.49216; 11,566 cycles left in the 95,779.
- 3 tracks peak at most 37,749 (38,121 with the allowance): inside the block in every run, but with 311 instructions to spare, less than the 418-instruction margin. That is within the measurement noise (the previous image's ten three-track runs of the same code peaked at 37,903), so 3 tracks are not qualified.
- 4 tracks peak 42,304 and 8 tracks peak 59,601 on their START blocks (1.110x and 1.560x the block); their sustained means stay inside it (37,756 with eight). Whether the unit absorbs such START blocks is a hardware question.
- Against the previous image (MAIN OS `d0dab5fe…`, maxima over its own runs: s1 29,033, s2 33,405, s3 37,903, s4 42,318, s8 59,945; its largest spread 418): the peak blocks moved by n0 +3, s1nl -40, s1 -16, s2 +14, s3 -154, s4 -14, s8 -344 instructions, within the run-to-run spread; worstCase 14,286 -> 14,246, maxConfiguration 84,178 -> 84,213 cycles/block, maxInstances 2 -> 2.

### Exact memory, from the link map

| region | space | bytes | scope |
| --- | --- | --- | --- |
| Per-track SY DRUM state: engine track record, four voice records, LFO / S&H state, setup-stage bytes | sdram | 698 | instance |
| SY DRUM DRAM unit code and tables (.text less the per-track state) | sdram | 62,704 | shared |
| SY DRUM unit data (.data less the setup-stage bytes): 49,184 B card-file buffer, lock clipboard and undo, queues | sdram | 67,660 | shared |
| SY DRUM read-only strings (.rodata) | sdram | 113 | shared |
| Runtime link padding before .data (alignment, present only with SY DRUM) | sdram | 8,195 | shared |
| FM Synth's units assembled with SY DRUM: poly +420, fmmachine +8, fm_qz +60 | sdram | 488 | shared |
| Step-lock table sl_work_table: 16 banks x 8,192 rows x 16 B, a DRAM region at the top of the platform reserve | sdram | 2,097,152 | shared |
| SY DRUM hook sites rewritten in place: 53 detours | cpu-flash | 410 | shared |
| Appended platform payload growth (the packed SY DRUM unit and FM growth) | cpu-flash | 53,869 | shared |
| ColdFire stack increment upper bound (engine-task card job 1,216 B plus the frame path 72 B) | sdram | 1,288 | shared |

perInstanceBytes 698, sharedBytes 2,291,879, maxInstances 8 (state is preallocated for every track), totalBytes 2,297,463. Exact link map of the measured native build (runtime.elf, layout.json, the exporter's build directory) against FM Synth 0.1.5 alone built from the same source. The SY DRUM unit is 136,061 B (68,184 .text, 67,764 .data, 113 .rodata), of which 698 B a track x 8 is preallocated per-track state; the link adds 8,195 B of alignment before .data; FM Synth's three per-remix units grow 488 B when built with SY DRUM; the 2,097,152-byte lock table is a DramRegion at the top of the platform's 10,487,808-byte reserve (layout: 0x41295de0), so it takes no sample memory beyond the reserve FM Synth already creates (counted in FM Synth's record, not here). OS image: 53 hook sites (410 B) and 53,869 B more appended payload. No heap or dynamic allocation; no SRAM, battery-RAM or DSP allocation (the SY DRUM choice and the setup controls use stock Part bytes and their battery-RAM shadow; the step locks are in the RAM table and the sylockNN card files). Stack: static bounds from the linked disassembly, the stock file-system routines the card jobs call through pointers excluded (their frames are stock's). Hardware canaries not measured. Against the previous image: the unit +346 B (`.text` +322, `.data` +24: the play-time write and the bank-load change), the link alignment +2 B, one more hook site (+8 B), the appended payload +180 B; total +536 B.

### Stack

Static upper bounds from the linked disassembly of this image (a scan of the disassembly: the prologue frame, then every call priced at the frame plus the pushes since, 4 bytes of return address and the callee's own bound): the frame path's SY DRUM routines 72 B (`sy1_mono_render`, `sd_trigger`; `sd_tick` 36), the UI-task hooks at most 128 B (the clipboard hooks; the 2.14 tick hook 36 B with `sl_io_play_tick`), the engine-task card jobs at most 1,216 B (`sl_io_export`; the 2.14 dispatcher path `sl_io_before_job` 116 B, `sl_io_banks_load` 920 B), excluding the stock file-system routines they call through pointers. Record: 1,288 B, the engine-task path plus a frame interrupt nested on it, the same as the previous image's. FM Synth's own bounds are in its record. Hardware canaries not measured.

### What was not measured

- Hardware: every timing above is emulated instructions; whether START blocks above the budget are heard is the author's test.
- Mixed loads: FM Synth tracks and SY DRUM tracks together, sample tracks beside them, USB / MIDI traffic.
- The UI and engine tasks' time (machine choice, the machine-change init, lock editing, the card jobs, the play-time write): outside the frame interrupt, not timed; the tick hook's count above is static.
- A card write during playback beside a STATIC track streaming from the card: only the unit can show whether it disturbs the stream (the hardware sheet asks for it).
- A static upper bound of the per-frame path (evidence/performance.json says so).

## Stock flows compared

Exercised with SY DRUM in the build, on the emulator: SELECT MACHINE TYPE and SRC SETUP (the five stock rows and FM SYNTH unchanged in order and behaviour; FLEX chosen after SY DRUM gets a new project's FLEX values), the PLAYBACK and setup pages of a FLEX track after a SY DRUM round trip, Part SAVE / RELOAD, SAVE PROJECT (the stock bank and project files written as before, the `sylockNN` pairs beside them), a project load from the card, PROJECT > RELOAD, GRID RECORDING with held trigs, a power-off while playing and after STOP with the power-on load, a stock bank file missing or damaged at that load (stock's message and its NO). The author's own comparisons of every sequence edit (copy / paste / clear / shift / undo, LIVE RECORDING) against his development build are in `upstream/sy-drum/README.md` ("Measured"); his verification of 2.14 on his own octatrick build ran the LIVE RECORDING and the page clear / undo / track paste walks with results identical to the previous image's. Not compared here: a held trig's copy / paste, a track's or a pattern's copy / paste, page duplication, EXPORT and DELETE on the emulator (the author ran the last two against an in-memory card), MIDI, USB, the metronome with a SY DRUM track, and the stock step and scene locks across a machine change (the author's 2.12 verification covers those; the setup-LFO lock rows are checked above).

## Hardware

Pending: the author's MKI test of image `27c213b2…`. The `tests.qualification.hardware` fields are `TIM:` placeholders until then; they are filled from his report, never from emulator results. The power-off without SAVE while playing, the power-cycle with two locked tracks after SAVE and a STATIC track streaming while the lock file is written are on his sheet.

For the record's history only, none of it evidence for this image: on the previous image (`d0dab5fe…`, 12 October 2026) the author found the PLAYBACK SETUP locks lost by a power-off without SAVE after editing them while playing (above); 2.14 is the fix. On 12 October 2026 he also ran the play-time write on his MKI in his own octatrick build (not a Modwerk image, and without 2.14's bank-load change): the locks came back after a power-off while playing without SAVE, and he heard no crackling on a STATIC track streaming from the card while the lock file was written. On 10 October 2026 he reported the 2.11 build of this package (`b9b65cd9…`) as working, with one limitation that 2.12 changed. None of these reports is carried over to this image.

## Repository validation

- The checks run on the records as committed (packages, native comparison, catalogue) are stated in the revision of this file that follows the package commit.
