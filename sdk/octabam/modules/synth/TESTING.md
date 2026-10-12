# FM Synth 0.1.4 testing

0.1.4 is an update of Modwerk's published FM Synth (0.1.1 of 6 October, 0.1.2 of 8 October) to the author's octatrick 2.12 line, `timhastie/octatrick-modules` at `ca13ed85547790f788ceaaada5df3cdd31508441` (tag `v2.12`). Two earlier local drafts were never submitted: 0.1.3 on the 2.10 line (`9bd7169`, MAIN OS `d5e1a7b0…`) and 0.1.4 on the 2.11 line (`5f3d745`, MAIN OS `248d987e…`). The 2.11 build is compared below by its MAIN OS hash. This file is the report that `tests.qualification` names. Earlier reports are kept unchanged: `evidence/release-0.1.1/TESTING.md` and `evidence/release-0.1.2/TESTING.md`.

**Status.** Emulator worst-case cycles, exact memory, the 8 October persistence and two-instance checks and the two 2.12 behaviour changes are measured on the exact 0.1.4 image (MAIN OS `00fa6caa…`). The module's own native Part smoke passes on that image. The hardware fields are `TIM:` placeholders until the author reports his MKI test of this exact image (`hardwareStatus` stays `historical` until then). Modwerk's owner approvals are kept as they are: 0.1.1's in `evidence/release-0.1.1/` (`owner-hardware.md`, `build-approval.json`), and 0.1.2's in `sdk/synth-build-approval.json`, copied to `evidence/release-0.1.2/build-approval.json`. They cover only those versions and are not extended to 0.1.4.

## What changed from 0.1.2

**The 2.12 changes.** Both are the author's, in `upstream/synth/poly.s`, `machine.s` and `manifest.py` (his README describes them with his measurements):

- **The metronome no longer cuts a held note.** Since the 2.9 line the engine hooked the frame builder's `clrl 0x46c80350` at `0x4000b2c8` (`po_stop`), taking that word for the sequencer's STOP word. It is the metronome's click word: while the sequencer plays with CLICK ON, the beat code writes 3 or 1 into it, and the frame builder turns it into the DSP click command and clears it. So `po_stop` ran at every click and released every held note and chord. 2.12 removes the detour; `0x4000b2c8` is stock again. STOP still ends the engine's voices through `po_kill` at the stock voice kill (`0x4000685c`).
- **A machine change resets the track to init.** Changing a track to or from FM SYNTH, through SRC SETUP or SELECT MACHINE TYPE (`fm_choose`), the slot assigner (`po_assign`) or the file browser (`po_loadsel`), runs `ml_reset` in `machine.s`. It writes the new machine's init into the track's PLAYBACK and PLAYBACK SETUP (FM SYNTH's own seeds, or a stock machine's PLAYBACK descriptor defaults), AMP, AMP SETUP, the LFO page and LFO SETUP (the stock new-track values, read at run time from the same stock descriptors the stock Part initialiser uses; FM SYNTH puts VOIC 1 and CHRD off in LFO 3's bytes), in the Part, its battery-RAM shadow and the live lane. Step locks and scene locks are kept and apply by position, as at a stock machine change; FX1 and FX2 stay. One new detour supports it: `po_unload` (`jsr`, 6 B) at `0x40022732`, in the file browser's load callback, keeps the FLEX slot's marker state across the browser's slot unload so `po_loadsel` sees the change. A change between two stock machines is untouched.

**The 2.11 machine list.** The author's 2.11 line makes the rows after PICKUP a table (`ml_rows` in `machine.s`), assembled per build through each unit's `remix.inc`: `HAVE_SYDRUM` (1 only when his SY DRUM module is in the build) and the equates shared with SY DRUM (`engine_abi.inc`). FM SYNTH is always the first table row. The six row-count and row-bound constants that 2.10 poked (`pea 5` → 6 and five `moveq #4` → 5) became six detours that read the table's count (`0x40079248`, `0x400585fa`, `0x4003c950`, `0x40078678`, `0x400786ce`, `0x40079904`). Five more detours widen the machine window's row clamp after a list move (`0x40078c22`, `0x40078cb0`, `0x40078d2e`, `0x40078dee`, `0x40078e7c`). The drawer detour at `0x40078678` draws `name(row + the list's top)`, so SELECT MACHINE TYPE scrolls like SRC SETUP once a build has more than six rows. This package has FM SYNTH alone: one table row, the same six rows as 0.1.2, and `HAVE_SYDRUM` 0. The bundled quantizer (`fm_qz`) assembles to exactly the 2.10 and 2.11 builds' code; the engine (`poly`, 20,996 B) differs from the 2.11 build's only by 2.12's two changes, and the chooser unit `fmmachine` grows from 1,440 to 2,076 B with the machine-change init. The author's manifest also declares Analog BD as a native `conflicts` entry; the wrapper clears it, because Modwerk carries conflicts in `octamod.module.json` (it lists `analog-bassdrum` already) and a native entry would switch on the browser's span-contract check for every module.

**Source.** These files are the author's ca13ed8 (v2.12) files byte for byte: `upstream/synth/poly.s`, `page.s`, `machine.s`, `engine_abi.inc`, `README.md` and `upstream/LICENSE`. Every measurement below was made on the image built from them, MAIN OS `00fa6caa…`. `upstream/synth/manifest.py` is the author's manifest with every stock expectation replaced by `stock_guard(address, length, SHA-256)`. There are 53 guards, one per hook site (2.12 drops the `po_stop` site's guard and adds `po_unload`'s; the five clamp sites share one hash), each checked against the developer's MAIN OS `164f3122…`; `stock-guards.json` lists all 73 with the quantizer's 20. The manifest's precompiled `PINNED_PAGE`, `emit_page` and `CavePatch` are removed. `upstream/quantizer/` is unchanged from v2.11 in v2.12: `quantizer.s` is the author's file plus Modwerk 0.1.2's octave-drawer fix (#264) at the common argument push `0x400449be`, the same site and behaviour as the public Scale Quantizer's 0.1.3 MIDI fix; the author's file recognizes the FM/1 signature in `qz_is_synth`, and SY/1 only when `HAVE_SYDRUM` is 1. The quantizer manifest is Modwerk 0.1.2's with the author's 2.11 per-build include on its DRAM unit. The import inventory is `sdk/imports/synth-ca13ed8.json`.

**The chooser is now the author's.** His `machine.s` is adapted from Modwerk's 0.1.1 chooser and keeps the same Part signature, FLEX plus `FM`, 1 in the track's NEIGHBOR PLAYBACK bytes. Projects made with 0.1.1 or 0.1.2 therefore open as FM tracks. Hooks dropped from 0.1.2:

- `machine.s`, `registration.c` and `registration.s` (units `fmmachine` / `fmregistration`).
- `fm_resolve_pb` at `0x40031e74`: the author routes PLAYBACK through `pg_resolve` only.
- `fm_name_b` at `0x4004c36a`.
- `fm_main_commit` at `0x4007991c`: the author commits at the machine window's MACHWIN site `0x40079816`.
- The `fm_start` SymbolRef at `0x400d6458` and the `fm_source_dispatch` detour at `0x4000d514`. The author's own `po_fmstart` and `po_fmsource` replace them at the same sites.
- The `pg_resolve` detour at `0x40031ece`. It becomes a guarded poke writing the author's `emit_page` jump `jmp 0x400d24e0`, so `page.s` stays byte-identical.

The other chooser sites (`0x400334d8`, `0x4003c928`, `0x4003d718`, `0x4003c980`, `0x400786c8` now 6 B, `0x400585dc`, `0x40078886`, `0x4005221e`, `0x4003a52e`, `0x4003cd98`, `0x4005a616`, `0x4005a850`, `0x40002318`) are the same sites, now running the author's code; the six chooser pokes are the 2.11 detours above. Two author detours that 0.1.1 removed come back: MACHWIN (`0x40079816`, into `fm_main_commit` and then `po_machwin`) and LISTWIN (`0x4005a848`, `po_machlist`). The three 2.10 LFO-list detours (`0x4003bff2`, `0x4003bffa`, `0x400392cc`) are new. The Part validator wrap is the author's `fm_validate` at the same site; Modwerk's wrap is no longer needed. The private quantizer bundling and its `fm_*` relabelling are kept as Modwerk wrote them.

**Behaviour.** The 2.10 changes and the 7–8 October fixes are described, with the author's measurements, in `upstream/synth/README.md`:

- DEC 127 = HOLD, and 0 = the shortest decay.
- Note starts no longer click.
- The LFO destination list shows the FM names.
- A held key is the gate.
- A note restarted at a short DEC no longer clicks.
- Fast VOIC 2–4 runs no longer lose notes.
- Recorded legato phrases keep sounding.
- FM SYNTH chosen after a sample plays C4 at FINE 0c.

**Headroom: 6 dB, the author's decision.** 0.1.2's `OUTPUT_SHIFT` (18.06 dB source attenuation for #273) was Modwerk's change to `poly.s`. The author's 2.10 engine, unchanged in 2.11 and 2.12, makes its own: one arithmetic shift right (`HEADROOM`, 6.02 dB) at the mono voice's output and at each paraphonic voice's contribution before the sum, the same places 0.1.2 shifted by 3. Envelopes, voice ratios (`1 / sqrt(VOIC)`), crossfades and the final saturating clamp are unchanged; a VOIC 4 chord's coincident peaks now reach full scale instead of twice it. AMP VOL 0 is the reference and VOL up to about +6 stays clean. At identical settings 0.1.4 is about 12 dB louder than 0.1.2. The author measured it on his own build: -6.02 dB on every render, each sample the previous one halved within 1 LSB (`upstream/synth/README.md`, "6 dB of headroom (2.10)").

## Build and identities

| item | value |
| --- | --- |
| Module | `synth` 0.1.4-experimental; native source SHA-256 `4fc06072b4039db83cba1600e949d00770c9753d974bbf76a5809f8e1be9e851` |
| Image | MAIN OS SHA-256 `00fa6caab06dbfa95d5258b2f255fd174f3492a7aebfdbb7c3658ede9157033e` (1,126,653 B): FM Synth with its bundled quantizer and all stock effects. It is built from this source by `scripts/export-composition-proofs.py --vendored-sdk --static-stock --modules synth --select synth:true`. The LCD captures (`media/capture.json`), the measurements below, the Part smoke, the persistence checks and the 2.12 checks all used this image. |
| Update file for the hardware test | 462,396 B, SHA-256 `2267af13293b302a4bd88bf3c0c753965e36bb7861d2609875060303f1072909` (OCTAMOD79). Modwerk's own TS packer decodes it to the MAIN OS above. Re-encoding the stock update with that MAIN OS gives the same bytes. |
| Page | `fmpage` 1,868 B linked at `0x400d24d0`; the build log reports "matches the author's build" against reference `b43d76c9c13c1441f16e32b85826ac2e7664352947fa4dc393401ff332710f92` |
| Address check | the author's `tools/align_check.py` (v2.12) on this build: 5,723 instruction rows in the five linked objects, all at even addresses, and 75 detour / symbol-ref / poke targets even, every jump into them on an instruction (ColdFire faults on an odd jump target and the emulator does not model it) |
| Stock bytes | no stock bytes are committed. In the compiled FM units the code's stock-equal runs are the displaced-instruction replays at the hook sites, at most 22 bytes (as in the 2.10 and 2.11 builds); the 2.12 code adds none. The longest stock-equal run of any kind, leaving out fills, is 32 bytes, mostly zero, in the page's icon tables (`pg_img_ratio` / `pg_img_fdbk`), unchanged since 2.10. |
| Emulator | pinned octabam `ot_emu`, SHA-256 `9dc31d1249793fcf857fa6b1c1ac72ab7966646fd59f3e09e90683c8eb41e711`, not rebuilt |

The image, the emulator, the cards and the rig scripts stay local. Only their hashes and the results enter this repository.

## Native Part smoke

The module's own `verify.py` (Modwerk's 0.1.1 gate) ran unchanged on this image. It checks:

- selecting FM SYNTH through FUNC + SRC on all eight tracks;
- the machine byte FLEX, and `FM`, 1 in the Part and in the battery-RAM shadow;
- the seeded controls 64, 12, 32, 64, 0, 40;
- the sample slots, unchanged;
- reselection, which keeps an edited control;
- the return to FLEX, which clears the signature.

All five checks passed (`evidence/native-smoke.json`). The author's chooser keeps Modwerk's signature and layout bit for bit; reselecting FM SYNTH on an FM track is not a machine change, so 2.12's init does not touch it. `verify-audio.py` and `verify-regressions.py` need Octemu, which is not available here, and were not rerun for 0.1.4; the 0.1.2 results remain in `evidence/release-0.1.2/`.

## The 2.12 changes on this image

Both were checked in the pinned emulator on this image (DSP running, MKII panel, real keys and encoders; private scripts and cards kept local).

**The metronome case.** The author's own gate, unchanged: a sequencer playing at 120 BPM, a key (VOIC 1) or a VOIC 4 chord held for 9.1 s (18 beats), the metronome ON against the same run with it OFF, track 1's stem compared sample by sample from the key-down.

| case | this image, metronome ON vs OFF | the 2.11 build (`248d987e…`), metronome ON |
| --- | --- | --- |
| a key held, VOIC 1 | sample-identical over the 9.14 s hold (0 samples differ); the engine keeps the note (S_ON never set released) | released at the first clicks: `po_stop` cleared the click word 24 times, S_ON went to released + STOPPED, the stem fell to silence (-90 dBFS) within 4 s |
| a chord held, VOIC 4 | the four voices stay in state 1 (sounding) for the whole hold; 500 ms levels within 0.02 dB of OFF (not sample-identical: the four panel keys land about 16 samples apart between runs) | every voice released (state 2) at the first clicks; the stem fell to silence within 4 s |

The click itself still sounds on both images: in each ON run the frame builder posted the DSP click command 30 times. On this image `po_stop` no longer exists and nothing writes the click word except stock's own code.

**The machine-change init.** T1 of an empty project, through SRC SETUP: FLEX → FM SYNTH, then PLAYBACK, LFO, AMP and FX1 edited, → FLEX, → FM SYNTH again. The Part bytes after each step:

- FM SYNTH chosen: FLEX + `FM`, 1; PLAYBACK at FM SYNTH's seeds (PTCH 0, RATO 1, INDX 32, FINE 0c, FDBK 0, DEC 40); the LFO page at the stock new-track values with VOIC 1 and CHRD off; AMP at the stock new-track values.
- FLEX chosen after the edits: the signature cleared; the FLEX PLAYBACK column back at FLEX's defaults (the project's original bytes); the LFO page and AMP at the stock new-track values; FX1 as edited.
- FM SYNTH chosen again: PLAYBACK, LFO, AMP and the setup pages byte-identical to the first choice; FX1 still as edited; FX2 untouched throughout.

All 10 checks passed. LFO SETUP and AMP SETUP were not edited in this walk, and step and scene locks were not part of it; the verification of the author's 2.12 line covered every route, the locks kept, SAVE and a cold boot on his builds of the same `machine.s`.

## Persistence and two instances (8 October rules)

Two FM tracks with different settings, on this image in the pinned emulator (DSP running, MKII panel, real keys and encoders; private walk scripts, the card kept local):

- **Two instances.** T1 and T5 were chosen as FM SYNTH through FUNC + SRC and edited differently (four SRC controls each; on the LFO page T1 VOIC 1 with a chord shape, T5 VOIC 4 with another), with trigs on both. Editing T1 left T5 unchanged (passed); editing T5 left T1 unchanged (passed); both carry FLEX + `FM`, 1 and their own PLAYBACK and LFO bytes (passed); the five sample-slot bytes of both tracks never changed (passed).
- **Part save / reload.** FUNC + PART → SAVE, later edits on both tracks, FUNC + PART → RELOAD: both tracks back to the saved bytes (passed).
- **Project save / reload.** PROJECT → SAVE (no card-write error), unsaved edits on both tracks, PROJECT → RELOAD: both back to the saved bytes (passed).
- **Fresh project load.** A new emulator process mounted the saved card and loaded the project: both tracks as saved (passed).
- **Audio after the transitions.** Main-output renders of the two tracks' trigs: after the edits RMS 1267.1, after the project reload 1265.9, after the fresh load 1265.7 (16-bit, peak 3638): sound in every case (passed). The level differs from the 2.11 build's run of the same walk because choosing FM SYNTH now resets AMP to the stock new-track values.
- **Not tested here: the battery-RAM-only restart.** The pinned emulator keeps no battery RAM between processes, and a fresh process followed by an explicit project load is not a power cycle. The power cycle with the card in (both tracks back without loading the project) is on the author's hardware sheet for this image.

## Composition parity

**Open: POLY8.** Main carries POLY8 0.2.6, whose shared chooser bridge (`sdk/octabam/modules/poly8/composition.json`, applied by `tools/remix/machine_composition.py` and `src/engine/requested-modules.ts`) replaces FM Synth's chooser hooks with its own and checks every hook it replaces against the exact claims of FM Synth 0.1.2 (Modwerk's chooser). The author's chooser, in 0.1.3 already and in 0.1.4, makes different claims at two of those sites (`0x4005221e` is `fm_tick`, `0x400786c8` takes 6 bytes), drops four of them, and turns the six count pokes into detours. Both sides therefore stop on any selection with POLY8 and FM Synth ("seam drift"), as the bridge is designed to. On main `3151975`, `npm run module:verify -- synth` stops at the first such selection (`POLY8 composition seam drift: synth detours 0x400786c8`), and two POLY8 tests in `src/engine/requested-modules.test.ts` fail. Making the pair build again needs POLY8's bridge to be reviewed for the new chooser (its shared machine also calls 0.1.2's registration functions `fm_type`, `fm_admit_track`, `fm_track_page`, `fm_ui_tick` and `fm_defaults`). That is POLY8's code; this update does not change it.

Without POLY8 in the pool (a local run on main `3151975` only; the record is not committed), `npm run module:verify -- synth` compared Modwerk's browser composer with native octabam on 122 selections: 35 builds match native outside the platform writes, 87 refusals match, 0 mismatches. The native side ran the same exporter on the host toolchain instead of the pinned Docker image, which is not available here. `sdk/native-comparisons/synth.json` is still 0.1.3's record.

## LCD captures

Modwerk's `scripts/capture-module-ui.py` ran unchanged on this image with the pinned `ot_emu`, an empty card, the MKII panel and 50 ms keys, in one slot of the shared emulator rig. The plan is 0.1.2's plan with waits, plus LFO SETUP and SELECT MACHINE TYPE (`media/capture.json`). Eight PNGs are committed (a ninth, the root page, was captured and is not committed: eight media per module). Seven are byte-identical to the 2.11 build's captures of the same plan. `ot-voices.png` differs by design: choosing FM SYNTH now writes its init, VOIC 1 into LFO 3's SPD3 byte, so the VOIC dial is drawn at its first position; the 2.11 build left the stock byte there, which also reads VOIC 1. SRC SETUP and SELECT MACHINE TYPE show FM SYNTH as the sixth row and nothing after it. All were reviewed visually.

## Qualification: cycles and memory — 11 October 2026

Every count marked **instr** is an emulated ColdFire instruction count from the pinned emulator. These counts are not chip wall-clock cycles and not a CPU percentage. **cycles** are those counts converted with the calibration below.

### Method

- **Rig.** One card at a time is booted in the emulator panel (`--max 300000000`, ATA write interrupt every 32 samples) in one slot of the shared emulator rig. A measurement script runs, then stops the transport and the panel. Instruction counts are computed inside the emulator and do not depend on the host's load.
- **Counter.** The panel arms the emulator's PC watch, pauses pacing and runs N emulated ms. It returns every hit with the global instruction index.
- **Frame window.** This is the stock frame-interrupt body `0x4000aad8 .. 0x4000d9a6`, plus 4 instructions. It contains the stock builder, locks, scenes, LFOs, the CF DELAY, the DSP transfer, each track's renderer, and the FM frame hooks: `po_lfo3b`, `po_retrig`, `po_rel`, `po_kill`, `po_fmsource` and `po_fmstart`.
- **Renderer window.** A second window pairs `sy_render` (`0x40a95600`, RTS `0x40a95dcc` = `sy_done` + 12, checked in the link map) with the nested stock renderer (`0x40004008`, RTS `0x40004266`).
- **Runs.** Each card gets one 100 ms window with PLAY pressed inside it (the first PLAY after boot), four more 100 ms windows while playing, and two 60 ms `sy_render` windows. That is about 1,540 complete frames per card. Every card ran once; the cards the bounds come from (no FM track, one VOIC 4 track, eight VOIC 4 tracks at both DEC extremes) ran five times, because the rig's run-to-run spread is about ±100 instructions.
- **Fixtures.** Each card is a copy of the toolkit's measurement project (120 BPM, stock DELAY in FX2 on all eight tracks), edited as follows:
  - N tracks get FLEX slot 1 = the `SYNTH` marker, with PTCH 64, RATO 127, INDX 127, FINE 64, FDBK 127 and DEC as given, plus the Part VOIC and CHRD MA9 inversion 3.
  - Every pattern has a trig on all 16 steps of those tracks.
  - Each step locks the six PLAYBACK controls between their extremes, plus VOIC and a different CHRD shape and inversion.
  - LFO1 → INDX and LFO2 → FDBK run at full speed and depth.
  - Scene locks fill all 16 scenes; the crossfader is at 64. GLIDE is 0x20.

  Every step changes the pitch, so the 2.10 crossfades, fades and waiting notes run on every step.
- **The chooser.** Card `c127` is the eight-track VOIC 4 card with every track made FM by the Part signature alone (FLEX + `FM`, 1, slot an ordinary sample). It measures the machine-list route, which supplies the voice through `po_fmsource` without the stock sample renderer.

### Budget and conversion

One frame interrupt serves 16 samples at 44.1 kHz, so the block is 362.8 µs. The ColdFire runs at 264 MHz, which gives **95,779 cycles per block**.

Emulated instructions are converted with the toolkit's hardware calibration (CF METER, 28 September 2026, 2.9 line): **8.38–9.44 ns per emulated instruction**. This record uses 9.44 ns. One instruction then costs 2.49216 cycles, and the block holds 38,432 instruction-times (43,294 at 8.38 ns). This is a calibrated estimate, not a cycle-exact measurement. The RTOS interrupt wrapper outside the window (at most 372 instr per block) is added as an allowance.

The criterion is strict: the whole frame-interrupt body, stock reserve plus the module, must fit one block on every block, including the first START after boot, with the measured run-to-run spread to spare.

### Results (instr per block, frame-interrupt body; the first run of every card)

| configuration | sustained mean (playing) | first START after boot | later START blocks | `sy_render` per block, mean / max |
| --- | ---: | ---: | ---: | ---: |
| no FM track playing (stock reserve, CF DELAY ×8) | 22,746 | 22,775 | 22,893 max | 0 |
| 1 track VOIC 1 | 24,962 | 27,756 | 27,046 | 2,313 / 2,603 |
| 3 tracks VOIC 1 | 29,332 | 37,368 | 35,252 | 6,934 / 7,809 |
| 4 tracks VOIC 1 | 31,483 | 42,140 | 39,308 | 9,245 / 10,412 |
| 8 tracks VOIC 1 | 40,305 | 61,441 | 55,773 | 18,490 / 20,824 |
| 2 tracks VOIC 2 | 29,709 | 37,051 | 39,415 | 7,179 / 13,466 |
| **1 track VOIC 4** | 27,765 | **32,298** | 31,393 | 5,207 / 7,039 |
| 2 tracks VOIC 4 | 32,915 | 41,613 | 40,025 | 10,407 / 14,078 |
| 4 tracks VOIC 4 | 43,094 | 60,292 | 57,052 | 20,814 / 28,156 |
| 8 tracks VOIC 4, DEC 127 (HOLD) | 63,398 | 97,697 | 91,243 | 41,650 / 56,312 |
| **8 tracks VOIC 4, DEC 0 (shortest)** | **63,369** | **97,705** | 91,113 | 41,649 / 56,312 |
| 8 tracks VOIC 4, DEC 127, chosen as FM SYNTH (Part signature) | 55,958 | 88,317 | 81,385 | 34,168 / 48,624 |
| reference: 8 stock sample tracks, same locks/LFOs/scenes | 26,996 | 51,809 | 46,836 | 4,965 / 11,867 |

Five runs of the bounding cards: one VOIC 4 track peaks at 32,214..32,299 (spread 85); the no-FM block floor is 22,619..22,709 (spread 90); eight VOIC 4 tracks peak at 97,681..97,729 and run at 63,362..63,405 sustained.

FM's own code per `sy_render` call (two calls per track per block), excluding the nested stock renderer:

| VOIC | own mean | own max |
| --- | ---: | ---: |
| 4 | 2,065–2,068 | 5,813 (5,772 on the chooser route) |
| 2 | 1,330 | 5,645 |
| 1 | 625 | 1,491 |
| ordinary sample track (pass-through) | 83 | 104 |

On marker tracks the stock renderer adds 532 mean, 1,175 max per call. The chooser route nests no stock renderer.

The cost per track (first run):

- One VOIC 4 track adds 5,018 to 5,087 sustained and 9,379 to 9,523 on its START block.
- One VOIC 1 track adds 2,184 to 2,215 sustained and 4,833 to 4,981 on its START block.
- The chooser route is cheaper, because no stock sample renderer runs under it: for eight VOIC 4 tracks, 7,440 less sustained and 9,380 less at the peak. The marker route bounds the cost.

**Against the 2.11 build** (MAIN OS `248d987e…`, the same cards and rig, one run per card): the frame-interrupt code differs only by the removed `po_stop` hook, and 2.12's machine-change code runs in the UI task. The counts agree within the rig's run-to-run spread: START peaks differ by at most 78 instructions (0.19 %), sustained means by at most 87. The record below uses this image's own numbers.

**Worst case found:** 97,729 instr in one block, at the first PLAY after boot with eight VOIC 4 marker tracks starting chords together (DEC 0; DEC 127 is within the spread). That is 243,557 cycles, 2.54× the block. Sustained, the same load runs at 63,362..63,405 instr, 1.65× the block. The eight-track VOIC 4 configuration cannot meet the budget.

### Pricing for the record

- `worstCase`, one instance: the START-block increment of one VOIC 4 track over the no-FM block minimum, the largest one-track peak of the five runs over the smallest floor. That is 32,299 − 22,619 = 9,680 instr → **24,125 cycles/block** (rounded up).
- `maxConfiguration`: the largest configuration whose every block, including the first START, fits under the module's own worst case (VOIC 4 chords) is **one FM track**. Its largest measured peak is 32,299 instr + 372 wrapper allowance = 32,671 instr → **81,422 cycles/block** (rounded up). That is inside the budget of 95,779 and leaves 14,357 cycles (5,761 instruction-times), far more than the measured spread (90).
- `maxInstances` = 1 for cycles: one FM track at VOIC 4. Memory is preallocated for eight tracks, so `memory.maxInstances` = 8.

Three tracks at VOIC 1 also keep every block in budget: 37,368 + 372 = 37,740. These configurations fit only at the 8.38 ns end of the calibration (≤ 43,294):

- 2 tracks at VOIC 2: 39,415 + 372 = 39,787;
- 2 tracks at VOIC 4: 41,613 + 372 = 41,985;
- 4 tracks at VOIC 1: 42,140 + 372 = 42,512.

Everything larger does not fit. Eight ordinary sample tracks starting together on the same fixture peak at 51,809 instr, which is also over the block: a simultaneous START is a single-block transient that stock firmware itself produces. A configuration outside this record is not shown to fail on the unit; it is only not qualified.

### Exact memory, from the link map

| region | bytes | scope |
| --- | ---: | --- |
| engine DRAM unit `poly`, code and tables, `0x40a955e0..0x40a9921c` | 15,420 | shared |
| per-track state ×8: `sy_state` 128 + 4 voices × 64 + `po_pend` 4 × 16 + `po_chord` 32 + `po_mheld` 8 + `po_mring` 16 + `po_mhead`/`po_mtail` 2 (interleaved arrays `0x40a9921c..0x40a9a1f4`) | 506 per track = 4,048 | instance |
| shared engine state: `po_seq`, `po_vbuf`, `po_clock`, `po_rtlog`, LFO/PLAYBACK/AMP descriptor clones (`..0x40a9a7e4`) | 1,528 | shared |
| chooser DRAM unit `fmmachine` (`machine.s`: code, the six-name table, the 2.11 row table, the eleven list detours and 2.12's machine-change init) | 2,076 | shared |
| pinned FM PLAYBACK page `fmpage`, `0x400d24d0..0x400d2c1c`, in the free ROM run `0x400d24d0..0x400d2ce0` | 1,868 | shared |
| FM hook sites rewritten in place: 52 detours (416 B; eleven the 2.11 machine-list sites, `po_unload` the 2.12 file-browser site in place of the removed `po_stop`), the resolver jump (6 B) | 422 | shared |
| kind-table entries: FLEX and STATIC renderer, FLEX START | 12 | shared |
| bundled quantizer DRAM unit `fm_qz` | 3,532 | shared |
| bundled quantizer ROM units (`fm_qzk` 45, `fm_qzc` 192, `fm_qzs` 6), SEQUENCER tables 72, 19 detour sites 142, one poke 4 | 461 | shared |
| platform loader and packed DRAM units appended to the image at `0x4010fdf0` | 14,093 | shared |
| platform reserve: 1,707 pages × 6,144 = 10,487,808 B of Flex sample RAM, less the three DRAM units (26,604) | 10,461,204 | shared |
| ColdFire stack increment, upper bound (see Stack) | 352 | shared |

Totals: 506 × 8 + 10,500,968 = **10,505,016 bytes**. The module's own bytes are **43,812** (the 2.11 build: 42,722; the difference is the chooser unit's machine-change init, +636, the engine, +16, and the appended loader that packs the larger units, +438). The rest is the sample-RAM platform reserve, which any DRAM module creates (sample pages 14,602 → 12,895) and which is counted once.

Reconciliation with the native allocation map:

- `runtime.elf` `.text` is 26,604 B at `0x40a955e0`: `poly` 20,996 (`00_poly.o`), `fmmachine` 2,076 (`01_fmmachine.o`) and `fm_qz` 3,532 (`02_fm_qz.o`). The `.text` of `02_fm_qz.o` is byte-identical to the 2.11 build's.
- poly's 20,996 B = 15,420 + 1,528 + 8 × 506.
- In `layout.json`, `runtime_end` is `0x40a9bdcc`, and the boot stage holds 13,861 B. The append is 14,093 B, as the build log says.
- The build log reports 12,895 pages left for samples and recorders, against stock's 14,602.

There are no other allocations: no heap, no dynamic allocation and no DSP or SRAM allocation. The module has no battery-RAM bytes of its own. GLIDE is the bundled quantizer's byte. LEG, the LFO destination and the FM SYNTH signature use stock Part bytes and their battery-RAM shadow, written by the author's code or by stock's own store; the machine-change init writes stock Part bytes, their shadow and the live lane.

### Stack

A static upper bound computed from the assembled runtime of this image (`runtime.elf`), following its control flow: SP displacements of every instruction, both ways at each conditional branch, the callee's own bound at each call (+4 for the return address), a jump out of the runtime ending a path at its depth. Exclusive branches are not summed. Every detour, symbol-ref and table entry point in the runtime was analysed (71; the bundled quantizer's two ROM-unit entries are outside the runtime).

| path | entry points | bound |
| --- | --- | ---: |
| frame interrupt | `sy_render` 132, `po_fmsource` 32, `po_fmstart` 32, `po_retrig` 24, `po_kill` 12, `po_lfo3b` 8, `po_lfo3` 4, `po_rel` 0 | 132 B |
| MIDI task | `po_mrec` 196, `po_moff` 188, `po_mogate` 52, `po_mon` 44, `po_mtrig` 44, `po_mgate` 44 | 196 B |
| UI task, chooser (`machine.s`) | `fm_validate` 220 (its 116-byte frame + the replayed stock 96-byte validator prologue), `fm_main_commit` 116 (88 on the 2.11 build: it now calls the machine-change init), `fm_src_commit`/`2` 108 (80), `fm_setup_open` 36, `fm_name_a`/`fm_chooser_row`/`fm_chooser_open` 32, `fm_tick` 12, `fm_setup_row` 8, `ml_win_count`/`ml_src_count`/`ml_draw_bound` 8 (each replays the stock pushes it replaces), `fm_machine_name` 4, the other list detours 0 | 220 B |
| UI task, engine pages | `po_assign` 112 (80 on the 2.11 build), `po_machwin`/`po_machlist`/`po_octave` 88, `po_loadsel` 84 (32), `po_unload` 20 (new), `po_ampstage`/`po_ampdraw1`/`po_ampdraw2`/`po_ampdraw3` 52, `po_ampedit`/`po_amplane` 48, `po_lfdedit` 24, `po_lfopage` 16, `po_lfdname`/`po_lfdlfo` 12 | 112 B |
| UI task, bundled quantizer | `qz_plock` 76, `qz_knob` 68, `qz_leg0` 68, `qz_leg1` 48, `qz_wr` 36, the others 28 or less | 76 B |

Calls into stock add stock's own frames on top (`ml_draw_bound` calls stock's name formatter exactly where stock does). The frame interrupt runs on whichever task stack it interrupts, so the worst single-stack increment is the deepest task path plus the frame path: 220 + 132 = **352 B**, as in the 2.10 and 2.11 builds.

### What was not measured

- **Chip cycles.** The counts are converted by a calibration from one hardware session. They are not chip wall-clock cycles.
- **UI-task costs.** Machine choice (with the machine-change init), the Part validator, page and setup-window changes, Part changes and project load run in the UI task, outside the frame-interrupt deadline. They were not timed; their stack is bounded statically above.
- **USB and MIDI traffic, live keys, the metronome.** These were not driven in the cost windows. The key gate's test runs at every START, so the trig STARTs above include it.
- **Hardware stack canary.** Not measured.
- **Other fixtures.** One fixture family was used (120 BPM, CF DELAY on all eight tracks).

## Hardware

The author tests this image (the update file above, MAIN OS `00fa6caa…`) with a short test sheet that covers:

- the metronome case: CLICK ON, the sequencer playing, a held chord and a held key that keep sounding through the clicks;
- a machine change FM SYNTH → FLEX → FM SYNTH that shows FM SYNTH's init on PLAYBACK and LFO, with an FX1 setting kept;
- the FM SYNTH row in SRC SETUP and SELECT MACHINE TYPE;
- a power cycle with the card in (the battery-RAM case the emulator cannot test) with two FM tracks.

His report fills `tests.qualification.hardware`, whose `TIM:` fields are placeholders, and sets `hardwareStatus` to `reported`. Until then this version is not publishable under the qualification gate. The earlier local builds of 0.1.3 and 0.1.4 (MAIN OS `d5e1a7b0…`, `248d987e…`) are superseded.

Historical hardware: the 2.3–2.9 builds and the first 2.10 build ran on the author's MKI, and his 7–8 October report on that build produced the fixes above. On 10 October he reported the metronome cut-out and the machine-change request on the 2.11 build (`248d987e…`); 2.12 is his answer to both. Those reports do not qualify this exact image.

## Repository validation

See `docs/VERIFICATION.md` for the checks run on this branch.
