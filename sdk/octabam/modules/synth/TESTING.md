# FM Synth 0.1.5 testing

0.1.5 updates FM Synth 0.1.4 (the author's octatrick 2.12 line, still unpublished) to the author's 2.13 quantizer, `timhastie/octatrick-modules` at `48b89e7e5315971bf5c29a3fd86183abe8df48f3` (tag `v2.13`). At that commit the engine, page and chooser files (`synth/`) are the same bytes as at `v2.12` (`ca13ed8`); the quantizer (`quantizer/`), the repository's `LICENSE` and README change. The published version before 0.1.4 is 0.1.2. This file is the report that `tests.qualification` names. Earlier reports are kept unchanged: `evidence/release-0.1.1/TESTING.md` and `evidence/release-0.1.2/TESTING.md`. 0.1.4's measurements are carried below where its objects are byte-identical in this image, and named as such.

**Status.** On the exact 0.1.5 image (MAIN OS `37661aee…`), in the pinned emulator: the quantizer's new MIDI-track behaviour against a model of its rules, SCALE OFF against stock, the quantizer's added cost per call, the module's own native Part smoke, the 8 October persistence and two-instance checks, the 2.12 machine-change init, exact memory, the stack bound, the LCD captures and the author's odd-address check. The frame-interrupt cycle table is 0.1.4's (the FM engine and chooser are the same compiled objects at the same addresses), with its bounding cards rerun on this image. The author's MKI report of this exact image is below (`hardwareStatus` `reported`). Modwerk's owner approvals are kept as they are: 0.1.1's in `evidence/release-0.1.1/` (`owner-hardware.md`, `build-approval.json`), and 0.1.2's in `sdk/synth-build-approval.json`, copied to `evidence/release-0.1.2/build-approval.json`. They cover only those versions and are not extended to 0.1.4 or 0.1.5.

## What changed from 0.1.4

**SCALE and ROOT on MIDI tracks (the author's 2.13 quantizer).** With a scale on (PROJECT > CONTROL > SEQUENCER, SCALE and ROOT), a MIDI track's notes follow the scale where they are edited or played from the panel:

- **The NOTE knob** (the NOTE page's first knob, on the Part's value): one click steps to the next note of the ROOT-rotated scale in the turn direction instead of one semitone; a value between scale notes goes to the nearest scale note in the turn direction; at 0 and 127 it stays. Hook `qz_mknob` (`jsr`, 8 B) at `0x40055382`, the knob handler's MIDI-track clamp just before its store `0x4005538a`, which stays stock.
- **NOTE locks**: the same, with a TRIG key held (from the step's lock, or from the Part's NOTE when the step has none), and the lock a NOTE turn writes during LIVE RECORDING. Hook `qz_mplock` (`jsr`, 10 B) at `0x40050b98`, the MIDI p-lock editor's lock store.
- **The MIDI CHROMATIC keys**: each key plays the key's note plus ROOT, snapped to the nearest scale note (the lower one on a tie), so key 1 sounds the root; the number beside the keyboard reads the root's name with stock's octave ("A 3" where stock reads "3"). The note-on, the arpeggiator fed by the keys, the note-off at the key's release (stock stores the note at the press) and LIVE RECORDING carry the snapped note. Hook `qz_mkey` (`jmp`, 10 B) at `0x400436a8`, the press path.

A note's pitch class is its MIDI number mod 12, tested against the same root-rotated scale mask the audio tracks use. NOT2–NOT4 stay semitone offsets from NOTE, TRAN transposes in semitones, and the arpeggiator's own notes, MIDI IN, VEL, LEN, CCs, LFOs on NOTE and scene locks are stock: the author's choice (editing only), because a drum machine's note numbers on a MIDI track are sounds, not pitches; stock's ARP SETUP > KEY forces every note a track sends into a key. **SCALE OFF is stock**: every new detour replays what it displaced. Nothing new is stored: SCALE and ROOT are the existing battery-RAM bytes, and no Part or project format changes.

**The #264 drawer fix is the author's own.** Modwerk's 0.1.2 moved the bundled quantizer's CHROMATIC drawer hook from `0x400449b8` to the drawer's common argument push `0x400449be`, because stock's MIDI branch jumps to `0x400449be` and the old hook skipped the octave push there (CHROMATIC on a MIDI track froze the unit). The author's public line carried the old site from 2.9 to 2.12; his 2.13 takes Modwerk's form at the same site and credits it (his `quantizer/README.md`, "THE FREEZE FIXED (Modwerk #264)", and his `LICENSE`). So the bundled `quantizer.s` no longer carries a Modwerk patch: it is the author's file byte for byte, and its `qz_octnum` keeps stock's number on a MIDI track (with ROOT's name before it when a scale is on). FM Synth images were never affected: 0.1.2 and 0.1.4 carried Modwerk's form.

**Source.** `upstream/quantizer/quantizer.s`, `core.s`, `keys.s`, `scale.s` and `README.md`, and `upstream/LICENSE`, are the author's `48b89e7` files byte for byte; `upstream/synth/*` is unchanged from 0.1.4 (the same bytes at `48b89e7` as at `ca13ed8`). `upstream/quantizer/manifest.py` is the author's 2.13 manifest in Modwerk's stock-guard form: each of its 23 embedded stock expectations (22 detour sites and the SEQUENCER poke's `expect`) became `stock_guard(address, length, SHA-256)`, each literal checked against the developer's MAIN OS `164f3122…` before it was replaced, and the `stock_guard` import is added; descriptions, the per-build include and the poke's write are the author's. `stock-guards.json` lists 76 guards: the synth manifest's 53 (unchanged) and the quantizer's 23 (three new: `0x40055382` 8 B, `0x40050b98` 10 B, `0x400436a8` 10 B). The module `LICENSE` carries the author's 2.13 `LICENSE` in full (one added sentence on the drawer hook's origin). The wrapper `manifest.py` changes only its docstring and proof note. The import inventory is `sdk/imports/synth-48b89e7.json` (it follows 0.1.4's `synth-ca13ed8.json`).

**Compatibility.** The public Scale Quantizer and Analog BD stay declared conflicts. POLY8's chooser bridge is still bound to 0.1.2's chooser (see "Composition parity"). Modwerk's MIDI Scenes builds only on its own (`src/engine/compose-os.ts` refuses any other module beside it), so it never shares an image with FM Synth; its MIDISC2.0 writes cover the knob store `0x4005538a` (8 B) and none of the three new sites, which end before it. No conflict entry is added.

The 0.1.4 changes (the 2.12 metronome fix and machine-change init, the 2.11 machine list, the author's chooser, the 2.10 engine changes and the 6 dB headroom) are unchanged; they are described in the module README and `upstream/synth/README.md`, and the sections below that carry 0.1.4's results say so.

## Build and identities

| item | value |
| --- | --- |
| Module | `synth` 0.1.5-experimental; native source SHA-256 `401d3b61412aff964617581f9f0bfcfe0ac83d6a6ee970bb1440f2393a6ac60a` |
| Image | MAIN OS SHA-256 `37661aee03a49f310d47e1447f043489c1bce9430c13824dd49ab93ad835e236` (1,126,857 B): FM Synth with its bundled quantizer and all stock effects. It is built from this source by `scripts/export-composition-proofs.py --vendored-sdk --static-stock --modules synth --select synth:true`. The LCD captures (`media/capture.json`), the measurements below, the Part smoke, the persistence checks and the quantizer gates all used this image. |
| Update file for the hardware test | 462,628 B, SHA-256 `b42048d57e487869fc9662657ffaf36bc8c54498fa9dda431097bc32e216b68f` (OCTAMOD79). Modwerk's own TS packer decodes it to the MAIN OS above. Re-encoding the stock update with that MAIN OS gives the same bytes. |
| Against 0.1.4's image | MAIN OS `00fa6caa…` (1,126,653 B). The platform runtime's first 23,072 bytes, the engine unit `poly` (20,996 B) and the chooser unit `fmmachine` (2,076 B), are byte-identical and at the same addresses (`0x40a955e0..0x40a9b000`); their objects `00_poly.o` and `01_fmmachine.o` are byte-identical. The page `fmpage` and the quantizer's ROM units (`fm_qzc` 192 B, `fm_qzk` 45 B, `fm_qzs` 6 B) are unchanged. The other differences are the quantizer's: its DRAM unit (3,532 → 3,892 B), the three new hook sites, the operands of its existing detours and SEQUENCER table entries that point into the relinked unit, and the appended loader that packs the runtime (14,093 → 14,297 B). No FM hook site changes. |
| Page | `fmpage` 1,868 B linked at `0x400d24d0`; the build log reports "matches the author's build" against reference `b43d76c9c13c1441f16e32b85826ac2e7664352947fa4dc393401ff332710f92` |
| Address check | the author's `tools/align_check.py` (2.13, `48b89e7`) on this build: 5,843 instruction rows in the five linked objects, all at even addresses, and 78 detour / symbol-ref / poke targets even, every jump into them on an instruction (ColdFire faults on an odd jump target and the emulator does not model it) |
| Stock bytes | no stock bytes are committed. The author's `tools/stock_scan.py` (2.13) over every file of the module folder finds no run of 16 or more stock bytes in any data (manifests, JSON, text). Over the assembled code it finds the displaced-instruction replays and shared assembler idioms only: the bundled quantizer's six hits are exactly those of the author's reviewed 2.13 scan (at most 22 bytes), and the FM units' hits are 0.1.4's (at most 22 bytes; the page's 32-byte icon-table run is mostly zero and is filtered as low-entropy). |
| Emulator | pinned octabam `ot_emu`, SHA-256 `9dc31d1249793fcf857fa6b1c1ac72ab7966646fd59f3e09e90683c8eb41e711`, not rebuilt |

The image, the emulator, the cards and the rig scripts stay local. Only their hashes and the results enter this repository.

## The quantizer on MIDI tracks (this image)

The author's own gate scripts for 2.13, unchanged, on this image: the pinned emulator with the DSP running, the MKII panel and real keys and encoders, MIDI track 1 on channel 1, SCALE and ROOT written into their battery-RAM bytes between cases, and MIDI OUT captured as the bytes the unit's MIDI port transmits. Expected values come from a model of the rules (the author's `qmodel.py`). The SCALE / ROOT settings: OFF, OFF with ROOT A, MAJOR C, MINOR A, PENT.MN F#, WHOLE B, HUNG.MIN D#, MAJOR F#.

- **NOTE knob and NOTE locks: 409 of 409 as the model.** 384 knob turns (the eight settings × eight start values on and off the scale, 0, 1, 126 and 127 × ±1, 2 and 3 clicks) and 25 NOTE-lock checks (a TRIG key held, from no lock, four turns, in five settings, the Part's NOTE untouched). The same script on 0.1.4's image matches the stock clamp 409 of 409: the two SCALE OFF settings give the same values on both images.
- **CHROMATIC keys: 245 of 245.** Keys 1–16 at stock's octave words 0, 3, 4, 5 and 10 in the eight settings (240 keys): every note-on as the model and each with its note-off; a key held across a ROOT change and two keys held across SCALE OFF release their notes; two keys that snap to the same note send one note-on and one note-off; keys feeding the arpeggiator (ARP MODE UP), stopped and playing, give the snapped notes (A3, D4 under MINOR A).
- **CHROMATIC on a MIDI track draws and plays** (the freeze of the author's 2.9–2.12 public tags, #264): every key case above entered CHROMATIC on MIDI track 1, and the capture `media/ot-midi-chromatic.png` shows the keyboard with the readout "A 3".
- **LIVE RECORDING**: two NOTE clicks up from C#3 under MINOR A write the lock E3 on the playing step; every peeked lock and Part byte is equal to the author's run of the same script on his 2.13 build.
- **The sequencer is unchanged.** The author's sequencer gate (trigs with NOT2–NOT4, NOTE locks at 0 and 127, TRAN, ARP SETUP KEY and the arpeggiator; MIDI IN thru and the auto channel, direct and into the arpeggiator), each under SCALE OFF, MAJOR C, MINOR A and PENT.MN F#: every capture gives the same MIDI events on this image as on 0.1.4's, and within this image the same events under every SCALE setting (editing only). The one intended difference: a NOTE set by two clicks up from C#3 under MAJOR C is E3 here and plays E3 F3 G3 with its chord (0.1.4: D#3, D#3 E3 F#3).

**Cost** (emulator instruction counts per call, not a hardware share; SCALE OFF, MAJOR C, MINOR A, PENT.MN F#, WHOLE B, HUNG.MIN D#; each counted from the hook site to its continuation, so it includes the displaced stock instructions):

| call | SCALE OFF | scale on | 0.1.4's image (stock code) |
| --- | ---: | ---: | ---: |
| MIDI CHROMATIC key press (`0x400436a8` → `0x400436b2`) | 6 | 49–77 | 2 (the author's stock measurement) |
| NOTE knob turn, 1–3 clicks (`0x40055382` → `0x40055392`, the clamp, the hook and the store) | 10 | 104–278 | 5 |
| NOTE lock turn, 1–3 clicks (`0x40050b98` → `0x40050ba2`) | 8 | 117–302 (see below) | 2 (the author's stock measurement) |
| sequencer tick (`0x400a1dfe` call → return, not hooked) | mean 1,137.9, max 2,510 | mean 1,137.9, max 2,524 | — |

Each click walks the notes up to the next scale note, so a scale with fewer notes costs more; the counts equal the author's measurement on his 2.13 build, window for window, but one: in both full runs on this image the first NOTE-lock window under PENT.MN F# counted 1,165. A run that also armed `qz_mplock`'s entry and the frame interrupt's entry and exit counts the same window at 173 (the author's figure), with `qz_mplock` entered one instruction after the site and no frame interrupt inside; the 1,165 therefore includes work outside the hook's own path, not identified. All three hooks run in the UI task when a knob is turned or a key pressed; none runs in the frame interrupt.

## Native Part smoke

The module's own `verify.py` (Modwerk's 0.1.1 gate) ran unchanged on this image (MAIN OS `37661aee…`). It checks:

- selecting FM SYNTH through FUNC + SRC on all eight tracks;
- the machine byte FLEX, and `FM`, 1 in the Part and in the battery-RAM shadow;
- the seeded controls 64, 12, 32, 64, 0, 40;
- the sample slots, unchanged;
- reselection, which keeps an edited control;
- the return to FLEX, which clears the signature.

All five checks passed (`evidence/native-smoke.json`). The author's chooser keeps Modwerk's signature and layout bit for bit; reselecting FM SYNTH on an FM track is not a machine change, so 2.12's init does not touch it. `verify-audio.py` and `verify-regressions.py` need Octemu, which is not available here, and were not rerun for 0.1.4 or 0.1.5; the 0.1.2 results remain in `evidence/release-0.1.2/`.
## The 2.12 changes

Both were checked in the pinned emulator (DSP running, MKII panel, real keys and encoders; private scripts and cards kept local). The machine-change walk ran again on this image; the metronome case is 0.1.4's, on its image `00fa6caa…`, whose frame-interrupt code is this image's (the engine is the same object at the same address, and the quantizer adds no frame-interrupt code).

**The metronome case.** The author's own gate, unchanged: a sequencer playing at 120 BPM, a key (VOIC 1) or a VOIC 4 chord held for 9.1 s (18 beats), the metronome ON against the same run with it OFF, track 1's stem compared sample by sample from the key-down.

| case | 0.1.4's image `00fa6caa…`, metronome ON vs OFF | the 2.11 build (`248d987e…`), metronome ON |
| --- | --- | --- |
| a key held, VOIC 1 | sample-identical over the 9.14 s hold (0 samples differ); the engine keeps the note (S_ON never set released) | released at the first clicks: `po_stop` cleared the click word 24 times, S_ON went to released + STOPPED, the stem fell to silence (-90 dBFS) within 4 s |
| a chord held, VOIC 4 | the four voices stay in state 1 (sounding) for the whole hold; 500 ms levels within 0.02 dB of OFF (not sample-identical: the four panel keys land about 16 samples apart between runs) | every voice released (state 2) at the first clicks; the stem fell to silence within 4 s |

The click itself still sounds on both images: in each ON run the frame builder posted the DSP click command 30 times. On 0.1.4's image (and this one) `po_stop` no longer exists and nothing writes the click word except stock's own code.

**The machine-change init** (this image). T1 of an empty project, through SRC SETUP: FLEX → FM SYNTH, then PLAYBACK, LFO, AMP and FX1 edited, → FLEX, → FM SYNTH again. The Part bytes after each step:

- FM SYNTH chosen: FLEX + `FM`, 1; PLAYBACK at FM SYNTH's seeds (PTCH 0, RATO 1, INDX 32, FINE 0c, FDBK 0, DEC 40); the LFO page at the stock new-track values with VOIC 1 and CHRD off; AMP at the stock new-track values.
- FLEX chosen after the edits: the signature cleared; the FLEX PLAYBACK column back at FLEX's defaults (the project's original bytes); the LFO page and AMP at the stock new-track values; FX1 as edited.
- FM SYNTH chosen again: PLAYBACK, LFO, AMP and the setup pages byte-identical to the first choice; FX1 still as edited; FX2 untouched throughout.

All 10 checks passed, as on 0.1.4's image. LFO SETUP and AMP SETUP were not edited in this walk, and step and scene locks were not part of it; the verification of the author's 2.12 line covered every route, the locks kept, SAVE and a cold boot on his builds of the same `machine.s`.
## Persistence and two instances (8 October rules)

Two FM tracks with different settings, on this image (MAIN OS `37661aee…`) in the pinned emulator (DSP running, MKII panel, real keys and encoders; private walk scripts, the card kept local):

- **Two instances.** T1 and T5 were chosen as FM SYNTH through FUNC + SRC and edited differently (four SRC controls each; on the LFO page T1 VOIC 1 with a chord shape, T5 VOIC 4 with another), with trigs on both. Editing T1 left T5 unchanged (passed); editing T5 left T1 unchanged (passed); both carry FLEX + `FM`, 1 and their own PLAYBACK and LFO bytes (passed); the five sample-slot bytes of both tracks never changed (passed).
- **Part save / reload.** FUNC + PART → SAVE, later edits on both tracks, FUNC + PART → RELOAD: both tracks back to the saved bytes (passed).
- **Project save / reload.** PROJECT → SAVE (no card-write error), unsaved edits on both tracks, PROJECT → RELOAD: both back to the saved bytes (passed).
- **Fresh project load.** A new emulator process mounted the saved card and loaded the project: both tracks as saved (passed).
- **Audio after the transitions.** Main-output renders of the two tracks' trigs: after the edits RMS 1267.2, after the project reload 1265.9, after the fresh load 1265.6 (16-bit, peak 3638): sound in every case (passed); 0.1.4's image gave 1267.1, 1265.9 and 1265.7 on the same walk.
- **Not tested here: the battery-RAM-only restart.** The pinned emulator keeps no battery RAM between processes, and a fresh process followed by an explicit project load is not a power cycle. The power cycle with the card in (both tracks back without loading the project) is on the author's hardware sheet for this image.
## Composition parity

**Open: POLY8.** Main carries POLY8 0.2.6, whose shared chooser bridge (`sdk/octabam/modules/poly8/composition.json`, applied by `tools/remix/machine_composition.py` and `src/engine/requested-modules.ts`) replaces FM Synth's chooser hooks with its own and checks every hook it replaces against the exact claims of FM Synth 0.1.2 (Modwerk's chooser). The author's chooser, in 0.1.3 already and in 0.1.4 and 0.1.5, makes different claims at two of those sites (`0x4005221e` is `fm_tick`, `0x400786c8` takes 6 bytes), drops four of them, and turns the six count pokes into detours. Both sides therefore stop on any selection with POLY8 and FM Synth ("seam drift"), as the bridge is designed to. On main `263aa1b`, as on `3151975`, `npm run module:verify -- synth` stops at the first such selection (`POLY8 composition seam drift: synth detours 0x400786c8`), and two POLY8 tests in `src/engine/requested-modules.test.ts` fail. Making the pair build again needs POLY8's bridge to be reviewed for the new chooser (its shared machine also calls 0.1.2's registration functions `fm_type`, `fm_admit_track`, `fm_track_page`, `fm_ui_tick` and `fm_defaults`). That is POLY8's code; this update does not change it. Main's POLY8 is now 0.2.7; its `composition.json` is unchanged from 0.2.6.

Without POLY8 in the pool (a local run on main `263aa1b` with POLY8 left out of the coverage pool in a scratch copy; the record is not committed), `npm run module:verify -- synth` compared Modwerk's browser composer with native octabam on 122 selections of this version (native source `401d3b61…`), the pool now including E-Verb and Output Matrix: 35 builds match native outside the platform writes, 87 refusals match, 0 mismatches. The native side ran the same exporter on the host toolchain instead of the pinned Docker image, which is not available here. With POLY8 in the pool the same command stops at `POLY8 composition seam drift: synth detours 0x400786c8`, as for 0.1.4. `sdk/native-comparisons/synth.json` is still 0.1.2's record.

## LCD captures

Modwerk's `scripts/capture-module-ui.py` ran unchanged on this image with the pinned `ot_emu`, an empty card, the MKII panel and 50 ms keys, in one slot of the shared emulator rig. The plan (`media/capture.json`) is 0.1.4's up to AMP SETUP, then SCALE MINOR, ROOT A and GLIDE in PROJECT > CONTROL > SEQUENCER, SELECT MACHINE TYPE, and MIDI track 1: the NOTE page (C3, then one NOTE click up, which reads D 3 under MINOR A) and CHROMATIC (FUNC held, DOWN). Twelve PNGs were captured and reviewed visually; seven are committed, because a module carries at most eight media and the audio preview is one of them:

- `ot-location.png`, `ot-controls.png`, `ot-voices.png`, `ot-lfo-setup.png`, `ot-legato.png`: byte-identical to 0.1.4's captures of the same plan on image `00fa6caa…`;
- `ot-glide.png`: the SEQUENCER window with SCALE MINOR, ROOT A and GLIDE OFF (0.1.4's showed MAJOR, C, OFF);
- `ot-midi-chromatic.png` (new): a MIDI track in CHROMATIC with SCALE MINOR and ROOT A; the number beside the keyboard reads "A 3".

Kept local: SELECT MACHINE TYPE (byte-identical to 0.1.4's committed capture: FM SYNTH the sixth and last row), the SCALE and ROOT rows, the NOTE page before and after the click, and CHROMATIC after a key press. 0.1.4's `ot-machine-list.png` and `ot-scale.png` are removed for the media limit; the location page and the SEQUENCER window with all three quantizer rows remain.

## Qualification: cycles and memory

The frame-interrupt measurements are 0.1.4's, made on 11 October on its image `00fa6caa…` (the method, the cards and the per-configuration table below). This image carries the same engine and chooser objects at the same addresses and no new frame-interrupt code, and the four cards the bounds come from were run twice more on this image on 12 October; the record's bounds are taken over all seven runs. The memory and stack sections are this image's own.

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

### Results on 0.1.4's image (instr per block, frame-interrupt body; the first run of every card)

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

Five runs of the bounding cards on 0.1.4's image: one VOIC 4 track peaks at 32,214..32,299 (spread 85); the no-FM block floor is 22,619..22,709 (spread 90); eight VOIC 4 tracks peak at 97,681..97,729 and run at 63,362..63,405 sustained.

**This image (two runs of the same four cards, 12 October):** one VOIC 4 track peaks at 32,314 and 32,172 (sustained means 27,851 and 27,768); the no-FM floor is 22,617 and 22,709; eight VOIC 4 tracks peak at 97,689..97,745 and run at 63,366..63,395 sustained. Every figure is inside the rig's run-to-run spread of 0.1.4's (about ±100 instructions). Over the seven runs: one VOIC 4 track 32,172..32,314 (spread 142), the floor 22,617..22,709 (spread 92), eight VOIC 4 tracks 97,681..97,745.

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

**Worst case found:** 97,745 instr in one block (this image's runs; 97,729 on 0.1.4's), at the first PLAY after boot with eight VOIC 4 marker tracks starting chords together (DEC 0 and DEC 127 within the spread). That is 243,597 cycles, 2.54× the block. Sustained, the same load runs at 63,362..63,405 instr, 1.65× the block. The eight-track VOIC 4 configuration cannot meet the budget.

### Pricing for the record

- `worstCase`, one instance: the START-block increment of one VOIC 4 track over the no-FM block minimum, the largest one-track peak of the seven runs over the smallest floor. That is 32,314 − 22,617 = 9,697 instr → **24,167 cycles/block** (rounded up; 0.1.4 recorded 24,125 from its five runs).
- `maxConfiguration`: the largest configuration whose every block, including the first START, fits under the module's own worst case (VOIC 4 chords) is **one FM track**. Its largest measured peak is 32,314 instr + 372 wrapper allowance = 32,686 instr → **81,459 cycles/block** (rounded up; 0.1.4: 81,422). That is inside the budget of 95,779 and leaves 14,320 cycles (5,746 instruction-times), far more than the measured spread (142).
- `maxInstances` = 1 for cycles: one FM track at VOIC 4. Memory is preallocated for eight tracks, so `memory.maxInstances` = 8.

Three tracks at VOIC 1 also keep every block in budget: 37,368 + 372 = 37,740. These configurations fit only at the 8.38 ns end of the calibration (≤ 43,294):

- 2 tracks at VOIC 2: 39,415 + 372 = 39,787;
- 2 tracks at VOIC 4: 41,613 + 372 = 41,985;
- 4 tracks at VOIC 1: 42,140 + 372 = 42,512.

Everything larger does not fit. Eight ordinary sample tracks starting together on the same fixture peak at 51,809 instr, which is also over the block: a simultaneous START is a single-block transient that stock firmware itself produces. A configuration outside this record is not shown to fail on the unit; it is only not qualified.

### Exact memory, from the link map (this image)

| region | bytes | scope |
| --- | ---: | --- |
| engine DRAM unit `poly`, code and tables, `0x40a955e0..0x40a9921c` (the same object and addresses as 0.1.4) | 15,420 | shared |
| per-track state ×8: `sy_state` 128 + 4 voices × 64 + `po_pend` 4 × 16 + `po_chord` 32 + `po_mheld` 8 + `po_mring` 16 + `po_mhead`/`po_mtail` 2 (interleaved arrays `0x40a9921c..0x40a9a1f4`) | 506 per track = 4,048 | instance |
| shared engine state: `po_seq`, `po_vbuf`, `po_clock`, `po_rtlog`, LFO/PLAYBACK/AMP descriptor clones (`..0x40a9a7e4`) | 1,528 | shared |
| chooser DRAM unit `fmmachine` (`machine.s`, the same object and addresses as 0.1.4) | 2,076 | shared |
| pinned FM PLAYBACK page `fmpage`, `0x400d24d0..0x400d2c1c`, in the free ROM run `0x400d24d0..0x400d2ce0` | 1,868 | shared |
| FM hook sites rewritten in place: 52 detours (416 B) and the resolver jump (6 B), unchanged | 422 | shared |
| kind-table entries: FLEX and STATIC renderer, FLEX START | 12 | shared |
| bundled quantizer DRAM unit `fm_qz`, `0x40a9b000..0x40a9bf34` (3,532 B in 0.1.4; the 2.13 MIDI-track code) | 3,892 | shared |
| bundled quantizer ROM units (`fm_qzk` 45, `fm_qzc` 192, `fm_qzs` 6, unchanged), SEQUENCER tables 72, 22 detour sites 170 (three new: 8 + 10 + 10), one poke 4 | 489 | shared |
| platform loader and packed DRAM units appended to the image at `0x4010fdf0` | 14,297 | shared |
| platform reserve: 1,707 pages × 6,144 = 10,487,808 B of Flex sample RAM, less the three DRAM units (26,964) | 10,460,844 | shared |
| ColdFire stack increment, upper bound (see Stack) | 352 | shared |

Totals: 506 × 8 + 10,501,200 = **10,505,248 bytes**. The module's own bytes are **44,404** (0.1.4: 43,812; the difference is the quantizer's DRAM unit, +360, its three new hook sites, +28, and the appended loader that packs the larger unit, +204). The rest is the sample-RAM platform reserve, which any DRAM module creates (sample pages 14,602 → 12,895) and which is counted once.

Reconciliation with the native allocation map:

- `runtime.elf` `.text` is 26,964 B at `0x40a955e0`: `poly` 20,996 (`00_poly.o`), `fmmachine` 2,076 (`01_fmmachine.o`) and `fm_qz` 3,892 (`02_fm_qz.o`). `00_poly.o` and `01_fmmachine.o` are byte-identical to 0.1.4's, and so are the runtime's first 23,072 bytes.
- poly's 20,996 B = 15,420 + 1,528 + 8 × 506.
- In `layout.json`, `runtime_end` is `0x40a9bf34`, and the boot stage holds 14,065 B. The append is 14,297 B, as the build log says.
- The build log reports 12,895 pages left for samples and recorders, against stock's 14,602.

There are no other allocations: no heap, no dynamic allocation and no DSP or SRAM allocation. The module has no battery-RAM bytes of its own. GLIDE is the bundled quantizer's byte; the 2.13 hooks read the existing SCALE and ROOT bytes and write only the stock byte, lock or note register each one replaces. LEG, the LFO destination and the FM SYNTH signature use stock Part bytes and their battery-RAM shadow, written by the author's code or by stock's own store; the machine-change init writes stock Part bytes, their shadow and the live lane.

### Stack (this image)

A static upper bound computed from the assembled runtime of this image (`runtime.elf`), following its control flow: SP displacements of every instruction, both ways at each conditional branch, the callee's own bound at each call (+4 for the return address), a jump out of the runtime ending a path at its depth. Exclusive branches are not summed. Every detour, symbol-ref and table entry point in the runtime was analysed (74: 0.1.4's 71 and the three 2.13 hooks; the bundled quantizer's two ROM-unit entries are outside the runtime). Every bound of 0.1.4's 71 entry points is unchanged.

| path | entry points | bound |
| --- | --- | ---: |
| frame interrupt | `sy_render` 132, `po_fmsource` 32, `po_fmstart` 32, `po_retrig` 24, `po_kill` 12, `po_lfo3b` 8, `po_lfo3` 4, `po_rel` 0 | 132 B |
| MIDI task | `po_mrec` 196, `po_moff` 188, `po_mogate` 52, `po_mon` 44, `po_mtrig` 44, `po_mgate` 44 | 196 B |
| UI task, chooser (`machine.s`) | `fm_validate` 220 (its 116-byte frame + the replayed stock 96-byte validator prologue), `fm_main_commit` 116, `fm_src_commit`/`2` 108, `fm_setup_open` 36, `fm_name_a`/`fm_chooser_row`/`fm_chooser_open` 32, `fm_tick` 12, `fm_setup_row` 8, `ml_win_count`/`ml_src_count`/`ml_draw_bound` 8 (each replays the stock pushes it replaces), `fm_machine_name` 4, the other list detours 0 | 220 B |
| UI task, engine pages | `po_assign` 112, `po_machwin`/`po_machlist`/`po_octave` 88, `po_loadsel` 84, `po_unload` 20, `po_ampstage`/`po_ampdraw1`/`po_ampdraw2`/`po_ampdraw3` 52, `po_ampedit`/`po_amplane` 48, `po_lfdedit` 24, `po_lfopage` 16, `po_lfdname`/`po_lfdlfo` 12 | 112 B |
| UI task, bundled quantizer | `qz_plock` 76, `qz_mknob` 72 (new), `qz_mplock` 72 (new), `qz_knob` 68, `qz_leg0` 68, `qz_leg1` 48, `qz_wr` 36, `qz_mkey` 20 (new), the others 28 or less | 76 B |

Calls into stock add stock's own frames on top (`ml_draw_bound` calls stock's name formatter exactly where stock does). The frame interrupt runs on whichever task stack it interrupts, so the worst single-stack increment is the deepest task path plus the frame path: 220 + 132 = **352 B**, as in 0.1.4.

### What was not measured

- **Chip cycles.** The counts are converted by a calibration from one hardware session. They are not chip wall-clock cycles.
- **UI-task costs.** Machine choice (with the machine-change init), the Part validator, page and setup-window changes, Part changes and project load run in the UI task, outside the frame-interrupt deadline, and were not timed; their stack is bounded statically above. The 2.13 quantizer hooks are the exception: their instruction counts per call are in "The quantizer on MIDI tracks".
- **USB and MIDI traffic, live keys, the metronome.** These were not driven in the cost windows. The key gate's test runs at every START, so the trig STARTs above include it.
- **Hardware stack canary.** Not measured.
- **Other fixtures.** One fixture family was used (120 BPM, CF DELAY on all eight tracks).

## Hardware

The author tests this image (the update file above, MAIN OS `37661aee…`) with a short test sheet that covers:

- a MIDI track with a scale and ROOT on: the NOTE knob steps through the scale's notes from ROOT; the CHROMATIC keys follow ROOT (key 1 sounds the root, the readout shows it); a chord (NOT2–NOT4) and the arpeggiator behave as before; CHROMATIC on a MIDI track no longer freezes; SCALE OFF as before;
- FM SYNTH still plays and chooses as on 0.1.4;
- a power cycle with the card in (the battery-RAM case the emulator cannot test).

**Report** (timhastie, MKI, 2026-10-13, MAIN OS `37661aee…`): The author flashed this exact image (FM Synth 0.1.5 alone, MAIN OS 37661aee...) on his Octatrack MKI and reported every item of its test sheet working: on a MIDI track the NOTE knob and NOTE locks stepped through the scale, the CHROMATIC keys followed ROOT, chords and the arpeggiator played as before, CHROMATIC trig mode no longer froze the unit, and SCALE OFF behaved as before; FM SYNTH played as in 0.1.4; after SAVE and a power-cycle with the card in, SCALE, ROOT and the FM SYNTH track were kept and the NOTE knob still followed the scale.

Limitations:

- Play time, the MIDI gear used and the number of tracks were not recorded.
- A functional check of the test sheet's items, not a load or stress qualification: the cycle and memory figures in this record are emulator measurements, not hardware times.

0.1.4's image (`00fa6caa…`) is not covered by this report.

Historical hardware: the 2.3–2.9 builds and the first 2.10 build ran on the author's MKI, and his 7–8 October report on that build produced the 2.10 fixes. On 10 October he reported the metronome cut-out and the machine-change request on the 2.11 build (`248d987e…`); 2.12 is his answer to both. Those reports do not qualify this exact image.

## Repository validation

See `docs/VERIFICATION.md` for the checks run on this branch.
