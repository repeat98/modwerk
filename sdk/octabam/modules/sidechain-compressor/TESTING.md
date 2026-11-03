# Sidechain Compressor verification

Version **0.2.0-experimental**, recorded **25 October 2026**. Built by Modwerk's shared firmware builder, beside any other module that fits, and over USB part of the beta base. The DSP figures are emulator measurements, not chip timing; the hardware record is below. The 0.1.2 and 0.1.1 records follow as history.

## 0.2.0-experimental

### What changed

The author's final SIDECHAIN_COMPRESSOR: a base-width key filter (KBAS, an 18 dB/oct Butterworth high-pass in Hz; KWID, a 12 dB/oct Butterworth low-pass 0.5-9.9 octaves above it, both OFF-able) in place of KFLT; KEY on a 9-position rotary switch; KWID's link clip; MON and KEY changes crossfaded over 256 samples. Page 2 moves from RMS · (blank) · KEY · KFLT · KGN · MON to RMS · MON · KEY · KGN · KBAS · KWID. MON stores 2 = OFF (left) and 3 = ON (right) with its own step handler, and `sc_norm` turns any other value OFF, so a COMPRESSOR saved with an earlier version comes up with MON OFF. KEY has its own step handler, so a turn with the encoder pressed moves one position as a plain turn does (stock's generic handler moves 7). The key-filter table is a second table (`ptable2`) loaded by its own literal: 0.2.0's first build (MW_SC020, 24 October 2026) took its address from a register the gain store had already moved, which broke KBAS and KWID on hardware. A 0.1.x COMPRESSOR keeps KEY; KGN takes the old KFLT, KBAS the old KGN, KWID the old MON, and MON comes up OFF.

The beta base changes with it (owner review): the resident engine takes the new DSP text (Jannik's key-phase change re-anchored on `sctap:`, its two MON changes dropped because the source now consumes MON_ON itself, `kph2` writes `clr a` for `move #0,a` so every instruction form is one the source already uses), a seventh site `dsp_compressor_init` (COMPRESSOR init, A `0x01aa4` / B `0x01864`) bridged inside the normalized stock COMPRESSOR package like the proc, the controller links `sc_ui` beside `sc_cf` and ships its stock-equal spans as stock copies, and `machine_registry.c`'s power-up check recognises the new page 2 (#712). The key bus tap is now one pass: 25 executed instructions a sample for a core's four tracks (was 41).

### Source and identities

- Author pin: Zac-Kyoti/octatrack-kyoti-fw `b0d49bf32d3fcc2e3ce7e9cec67f4fbb2619e511`, `modwerk-modules/sidechain-compressor/` (`sdk/imports/sidechain-compressor-b0d49bf.json`): every source and `manifest.py` byte for byte.
- Native image of this module alone, stock FX2 kept (`export-composition-proofs.py --select sidechain-compressor:true --image-dir`, modwerk-source-tools): MAIN OS `131142e1839bf1a62b48929dee396cc23b1f2f27f33595a9e6f39bf57f7be22e`. `sc_cf` 698 B and `sc_ui` 616 B equal the author's references (`976f9f95…` at 0x400d7000, `b2c45834…` at 0x400d7300); 612 code words and 16 + 49 table words on each core, four hooks; the key-filter table loads at `$1262` (A) and `$1022` (B), straight after the KEY GAIN table.
- Card file for the hardware test (OS VERSION `MW_SC021`): `6a02a0672a7888390667af1bab0b4920652b5ca26cd820a6b9cbc9e450468aa4`.
- Beta base: browser `.bin` = build_core `.bin` `eef42677eca067ae27228e309a41e82c1ab87b11db85d1fcbb0f7edacc261128`; the SC controller package carries two stock-code sites and eight stock copies, and both strict stock-free scans pass (longest shared run 11 non-zero bytes; no 16-byte run).

### Building it with other modules

Native octabam (the toolchain image, without network) and the Modwerk composer: the module alone builds in both menu modes, and beside each other module. The suites, regenerated in the toolchain image (`export-composition-proofs.py --vendored-sdk --static-stock`, 4 shards each):

| Suite | Selections | Built with 0.2.0 | Built with 0.1.2 |
| --- | ---: | ---: | ---: |
| `sidechain` (original eight modules) | 512 | 169 | 200 |
| `sidechain-visible` (nine visible modules) | 1,024 | 618 | 786 |
| `analog-bd` (Analog BD companions) | 212 | 146 | 162 |

No selection that 0.1.2 refused builds now. The newly refused, by cause:

- `sidechain-visible`, 168: the effect-menu clone window and the cave (Euclid's label formatters 94, CC Map's page-2 cave 32, the FX1 chooser window 16, the wide-dial hook 10, Scale Quantizer's getters and setters 10, Tape Echo's TIME formatter 6), now that the module's two ColdFire units take 1,314 B instead of 338; the smallest is Euclid + Scale Quantizer + this module (2 selections of 3 modules, 10 of 4, the rest larger).
- `analog-bd`, 16: core A's DSP code space ("does not fit any harvested region"); the smallest is Analog BD + Airwindows Chorus + this module.
- `sidechain`, 31: all with the paused Spectrum, Modulation or Character (core A's DSP region 20, Euclid's formatters 8, the wide dial 2, the FX1 chooser window 1); the smallest is MiniVerb + Modulation + this module.

`sidechain-analog-bd-proofs.json` stays the 0.1.1 record it is (its test calls it historical); the current Analog BD layout is the `analog-bd` suite above.

Linking `sc_ui` in DRAM (octabam's PLACE=DRAM) instead of the cave would likely give the ColdFire-space selections back; this version keeps the cave, the placement the hardware test ran.

### DSP

Emulator, not hardware: our load meter (`tools/load_audit/la_run.py` in the author's repository) runs ot_emu on the OT DEMO project with core 1's four-track loop (B P:17a..333) on a stopwatch, in datasheet cycles (opcodecycles, no memory stalls), transport playing, 400 frames. Every FX1 and FX2 slot holds COMPRESSOR, each keyed from a track on the other core (T1-T4 from T5-T8 and the reverse), KGN 64, KBAS 40, KWID 30, MON ON, set at frame 3 so the filters' glides and the MON fade-in fall inside the window.

| Configuration (core 1, 8 COMPRESSORs) | Mean | Peak |
| --- | ---: | ---: |
| Stock firmware, stock COMPRESSOR | 1,271.3 | 1,298.3 |
| 0.2.0, keyed, filters on, MON ON | 1,527.8 | 1,742.9 |
| 0.2.0, keyed, filters on, MON OFF | 1,525.0 | 1,706.3 |
| 0.2.0, keyed, filters OFF, MON OFF | 1,509.1 | 1,616.2 |

Modelled cycles per sample for the whole loop (stock dispatcher, every effect and this module). The peak is 1,742.9 × 16 = **27,887 cycles/block** against the 72,560-cycle budget (4,535 a sample). A read-back of the DSP state at the end of the MON-ON run shows most instances keyed and their filters set up (r7+$2a set, the key's window address and key in use as poked); the T1 FX1 instance read as not set up, so the meter may not exercise every instance. Allowing every instance the filter cost measured during development (about 44 modelled cycles a sample, 4 keyed compressors per core) on top gives about 2,100 a sample, still under half the budget. Development measurements on the same meter (OT DEMO, 4 keyed COMPRESSORs and 4 DJ EQs per core): 2,652.1 a sample with the filters on, 2,691.2 with MON ON, 2,475.4 with both filters OFF (core 1 mean).

The 0.1.x static model (every branch, a 2× allowance, the 22,640-cycle stock reserve) was run in a private measurement host that is not part of this repository; it was not rerun for 0.2.0.

### ColdFire

`sc_norm`'s reset still writes five bytes (MON OFF, KEY OFF, KGN 64, KBAS OFF, KWID OFF); a compressor with KEY 0..8 now also has its MON checked, four instructions and at most one store more than 0.1.2's path. The 0.1.2 frame bound (2,800 cycles for one stale compressor, 8,192 for sixteen, against 9,577) was not re-derived for those instructions; they add at most a few cycles per COMPRESSOR slot a frame. The UI callbacks run in the UI task at the 30 Hz redraw: `sc_cf`'s formatters (86 instructions) and `sc_ui`'s widgets (88) have no loops, so one call executes at most 174 authored instructions plus the stock widget, knob, blit and sprintf it calls. The KEY switch lends one entry of stock's switch glyph table (0x400bde2a) for the duration of the stock widget call and gives it back before returning.

### Memory

Sixteen instances: **768 B/instance + 14,000 B shared = 26,288 logical bytes** (0.1.2: 23,520). Changed from 0.1.2: two DSP code blocks of 612 words (were 340), two tables of 65 words (16 KEY GAIN + 49 key-filter; were 48), ColdFire code 698 + 616 B (was 340 B with alignment), 48 B more UI-task stack for the KEY switch's two wrapper frames and 12 B for the MON and KEY step handlers. The key filters' state (r7+$1c..$2d) sits inside stock COMPRESSOR's 256-word instance block, which another effect in the slot may also use: scinit starts it over whenever the slot is assigned COMPRESSOR. Y ranges, windows and every other region are 0.1.2's.

### Hardware

Reported by the author on an Octatrack MKI, 26 October 2026: Modwerk's native image of the module alone (MAIN OS `131142e1…`, card file `MW_SC021`) works: KBAS and KWID across their range with MON on and off, MON's OFF/ON switch and its OFF on a project saved with an earlier version, KEY's pressed turn, the MON and KEY fades, and a MON ON project across a power cycle. The checklist and the report are in [evidence/hardware.md](evidence/hardware.md). The first 0.2.0 image (`MW_SC020`, 24 October 2026) broke KBAS and KWID; this source fixes it.

### Not tested

- Over USB on a unit (the owner flashes the base); the base's power-up check is covered by `test_machine_registry.c`.
- Sixteen instances on a unit; chip timing; a stress run.

## 0.1.2-experimental (history)

### What changed

A COMPRESSOR saved on stock firmware holds stock's page-2 slot 8..11 defaults `0x7f/0/0/0`, which 0.1.1 read as KEY "T127" (the detector keyed from unrelated Y memory), KFLT fully low-passed and KGN at minimum. Turning KEY down lands on T8 first with KFLT/KGN still at minimum, so the key barely reaches the detector (a likely route to Modwerk report #321). 0.1.2 adds `sc_norm` to the ColdFire unit (134 → 338 B) and two guarded `jsr` detours over the first instruction of both page-2 copiers (`lea 0x80000a50,%a3` at `0x4000cae8`, the frame builder's, and its twin `0x40003d1c`; the 6 stock bytes at each are declared by address, length and SHA-256 `9a4b68c7…`, never carried). For each track and FX slot it resets a COMPRESSOR whose KEY is above 8 to KEY 0, KFLT 64, KGN 64, MON 0, in the current Part's working store and in the live lane, each copy judged only by its own FX id. A KEY of 0..8 is never touched. No flags, kernel or UI calls, no private state. The DSP source and tables are byte-identical to 0.1.1 (`patch_sc_dsp3.asm` `aaa1a1c9…`, `sc_tables.py` `8045e06f…`).

### Source and identities

- octabam `922878234b22221a1c298b3c7e0b3bdeffb468a9`; author pin Zac-Kyoti/octatrack-kyoti-fw `329b801cf90f32cbca97c6699a908908968e4df6`. Per-file provenance: [the import record](../../../imports/sidechain-compressor-9228782.json).
- Native source SHA-256 `0a0e8d770973eef0acc580724ab16732ba593e1b6b0240cc1c48e83b05248ae2`.
- ColdFire unit `sc_cf`, linked at the standalone's address, equals the author's reference (`76a4badcef6024b7de8bd6f05930146bdb6a47ffd577da340a6c252c316ff854`, 338 B) on every build.
- Tested image: Modwerk's native build of the module alone, stock FX2 kept, MAIN OS `2816f0bce5aaabfadac6dba9e778dc184b8af3e4a611990d6e6b3e36095bc5eb` (stock FX2 removed: `9b6342c28437f026673d07bb8ac3680626f4ee6f89c01637ac3ea01e6ae9c324`). Both detour sites read `4eb9 400d6d86` (`jsr sc_norm`) in it.
- Toolchain: `sdk/build/Dockerfile` (binutils 2.47, GCC 16.2.0, dsp56300 `8ccdd843…`), run under Colima on an Apple-silicon Mac.

### Building it with other modules

| Check | Result |
| --- | --- |
| Coverage set | `npm run module:verify -- sidechain-compressor --os <1.40C>`: native octabam built all 122 selections of the coverage set (alone, beside each module, the fullest selections and the fixed sample, with and without stock FX2). |
| Original eight modules | `export-composition-proofs.py --suite sidechain`: 512 selections, native builds 200 and refuses 312, all for code or cave space. 16 selections built in the 0.1.1 record are now refused for core A DSP code space (2,726–2,738 of 2,724 words); every one holds Spectrum or Character, and unchanged `main` refuses the same 16 with the same word counts, so this is drift in other modules since the 0.1.1 record, not 0.1.2. |
| Nine visible modules | `--suite sidechain-visible`: 1,024 selections, native builds 786 and refuses 238, all for ColdFire cave space. Every selection of one or two other modules builds (92 of 92). 12 selections built by 0.1.1 (and by unchanged `main`) are refused with 0.1.2's larger unit: the dial hook or FX1 chooser list no longer fits; each holds Euclid with Scale Quantizer, or eight or more modules. |
| Analog BD suite | Not regenerated: all 22 selections refuse because Analog BD runs with stock effects only, which does not depend on this module's bytes. The exporter's current Analog BD list also includes Air Chorus, so a rerun would not be the recorded suite. |
| Packages | `scripts/build-modules-isolated.sh` in the pinned image, then `modules:import --development`: the sidechain ROM unit changes (968 → 1,524 B object, 338 B code); the DSP package's code words are unchanged, only labels and manifest hashes move. |

### ColdFire bound

`sc_norm` runs once per frame from the frame builder's copier (transport running or stopped). Its twin site has no static caller and never ran in a 600-frame emulator coverage run; it is priced as if it also ran every frame.

Executed instructions, counted from the source (every branch, `jsr` at the site included):

| Case | Instructions/call |
| --- | ---: |
| No COMPRESSOR in any slot | 144 |
| One COMPRESSOR reset (working store and lane) | 182 |
| Sixteen COMPRESSORs reset in one frame (worst) | 752 |
| Measured, OT DEMO project, emulator (standalone image) | 171/frame |

A reset happens once per stale compressor; afterwards its KEY is in range and the slot costs the compare path only. Model: **4 cycles per executed instruction** (the routine uses `moveq`/`cmpi`/`Bcc`/`move.b`/`lea`, one `mulu.w` per track and two six-register `movem`s, within that allowance per the [MCF547x reference manual](https://www.nxp.com/docs/en/reference-manual/MCF5475RM.pdf)), plus **32 cycles per cold 16-byte line fill** from SDRAM: 14 code lines, the part-store id and page-2 lines (up to 18) and 2 stack lines, every call cold. The lane, live ids and current-part byte are internal SRAM (0x8000xxxx), priced inside the per-instruction allowance; counted as cold SDRAM fills too, the worst frame would be 9,344.

    one instance   = 2 × (182 × 4 + 21 × 32) = 2,800 cycles/frame
    sixteen        = 2 × (752 × 4 + 34 × 32) = 8,192 cycles/frame
    frame          = 264 MHz × 362.8 µs (16 samples at 44.1 kHz) = 95,779 cycles
    allowance      = 10% of the frame = 9,577 cycles (Modwerk's ColdFire allowance; the rest is stock)

The KEY/KFLT formatters and the KEY list trampoline are unchanged from 0.1.1 (132/60 executed instructions, 88/72 B stack peaks) and run in the UI task at the 30 Hz redraw, outside the frame path; their 0.1.1 bound below still applies. This is a conditional static model, not a chip measurement.

### Memory

0.1.2 adds 204 B of ColdFire code (unit 134 → 338 B, 340 B with alignment) and raises the extra caller stack from 16 to 40 B (`sc_norm`: 24 B of saved registers, its return address and three nested words; the formatters' 16 B run in a different context). The two detours rewrite 12 stock bytes in place and allocate nothing. Everything else is the 0.1.1 inventory below. Sixteen instances: **768 B/instance + 11,232 B shared = 23,520 logical bytes**.

### DSP

Unchanged. The DSP code and the 48 table words per core are the 0.1.1 bytes, so the 0.1.1 static stage costs, the 69,496-cycle sixteen-slot bound and the 6,196-cycle single-instance ceiling below describe 0.1.2 too.

### Hardware

[evidence/hardware.md](evidence/hardware.md): on 10 October 2026 the author flashed the tested image above on an **MKI** and reported every item of the checklist passing: a COMPRESSOR saved before installation came up with KEY OFF, KFLT and KGN centred and MON OFF; COMPRESSOR on T1 FX1 keyed from T5 and on T5 FX2 keyed from T1 both ducked and stayed independent; MON auditioned the key; Part save/reload, project save/reload and a power cycle kept both compressors' settings; nothing odd was seen. Duration and project were not reported; two instances, not sixteen; no stress, maximum-load, timing or recovery test.

### Not tested

- The Modwerk download itself (the composed image with the core logger) and any selection with other modules, on hardware.
- Sixteen instances, maximum load, MIDI/USB activity alongside, and cross-core key latency on hardware.
- Sound quality (`npm run fx:audit`: aliasing, DC, clipping, idle behaviour): not tested. The DSP code is unchanged from 0.1.1.

## 0.1.1-experimental (history)

Recorded **5 October 2026**. Built by Modwerk's shared firmware builder, beside any other module that fits. New physical hardware evidence is waived by the owner's explicit instruction. No current-image hardware pass or chip wall-clock timing is claimed.

### Source, tools and reproduction

- octabam wrapper and tools: f80ecfeabc187a33403588678e707443161afc96.
- Zac Kyoti dependency: d3e0801a5f666abc04bc05fc1cb37969d7fb38d0.
- Modwerk's native builder: octabam b8deefc88b2c3e5f3c6158e364eb741df1924e1d with this module's stock-DSP, replacement and raw-descriptor support.
- Original local 1.40C update SHA-256 34695b606eb00e1b4dded5fd0c4b66f3a460522a632e47d7416dbd220599e1ad; MAIN OS SHA-256 164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e.
- Pinned toolchain: GNU binutils 2.47 (m68k-elf), GCC 16.2.0, dsp56300 8ccdd843adda9c18fc232a2ca50d6caccbf3cb1e, in `sdk/build/Dockerfile`.

[The import record](../../../imports/sidechain-compressor-f80ecfe.json) retains hashes and attribution without firmware. Release automation compiles the authored source in the pinned container without firmware or network; the browser rebuilds the guarded stock fields from the visitor's own firmware and checks each against its fingerprint.

### Building it with other modules

The module takes COMPRESSOR's row on FX1 and in the FX2 chooser and keeps stock COMPRESSOR's dispatch; three guarded hooks per core carry its code. Modwerk's composer was compared with native octabam on every selection that contains it, with and without the stock FX2 effects: the eight original modules (512 selections), the nine visible modules other than Analog BD (1,024), and Analog BD alone, beside each other visible module and beside all of them (22). That is 1,558 selections: native builds 1,014 and refuses 544. [evidence/common-builder.json](evidence/common-builder.json) records the counts; the selection-by-selection fingerprints are `sidechain-composition-proofs.json`, `sidechain-visible-proofs.json` and `sidechain-analog-bd-proofs.json` in `src/engine/assets/`, and `node scripts/verify-sidechain-native.mjs` repeats the comparison against your own 1.40C update.

| Check | Result and scope |
| --- | --- |
| Refusals | Every selection native octabam refuses, Modwerk refuses, for the same class of reason: no room in DSP code space on core A, no room in the effect menus, or Analog BD (544 of 544). |
| Builds | Every selection native builds, Modwerk builds (1,014 of 1,014). The module-owned writes (chooser, descriptors, ROM units, DSP payloads) reproduce native's image byte for byte, outside the platform writes. |
| Platform writes | The browser always links the core logger, which native cannot, so the arena sizes, the boot call and runtime detours are compared with their spans reset to the original bytes. Where native has no runtime the image is identical outright. |
| Overlap | The platform and logger writes never touch a byte a module owns. |
| Unchanged modules | The native output for all 512 selections of the original eight modules is identical with and without the shared-builder changes. |
| Resource ledger | Declared DSP data ranges, every module's absolute x:/y: literals and stock's own shared-window tenants are checked; Sidechain is clean beside every module and all of them together. |
| Declaration checks | All 1,024 selections of the visible modules that contain it are recorded as clean. |
| Original-base guard | A changed byte in the original firmware is refused before composition. |
| Emulator | The complete composed image, with its runtime and the core logger, boots in the headless emulator, and KEY, KFLT, KGN and MON draw correctly. The frames are pixel-identical to the native image's. |

What it costs other selections is small. Among the nine visible modules other than Analog BD, it builds beside every other module (18 of 18 selections) and every pair (72 of 72), and of the 882 selections that build without it, 798 still build with it. No selection refused without it builds with it. The other 84 (48 module sets, each holding Euclid or Scale Quantizer with at least two more modules) run out of effect-menu cave space once its descriptor clone and ColdFire unit are added. Among the eight original modules, the 48 selections it newly refuses (24 sets) each include Spectrum, Modulation or Character, which Modwerk does not offer: its 388 words per core no longer fit core A's code space beside them. Analog BD runs with the original effects only, so it is refused beside every custom DSP module, this one included.

#### What the stock-code difference is

The author-form image (below) and the shared builder's image of the module alone differ in 56 bytes: the relocated FX1 list and its three references, and six stock DSP words that newer octabam applies to every build (stock's cross-core mailbox moves from Y:0x38000 to 0x37F00, and payload B's boot zero loop widens to cover it). The module's own bytes are identical. [evidence/common-builder.json](evidence/common-builder.json) lists every address.

### Measurements

The cycle matrix, static pricing, numerical stages and ColdFire counts below were measured on the **author-form image**, built by octabam f80ecfe from `remixes/test/sidechain-compressor` (MAIN SHA-256 `b5aa8cee7787a3dc0ea53007fe31358ba14d155421ebec9c7f98948de740675f`, 2,462 changed bytes). That image and the shared builder's differ only as described above, so the measurements describe the module's own contribution in both. They do not price other modules sharing a core, and no mixed image has been stress-tested.

| Check | Result and scope |
| --- | --- |
| Native assembly and author parity | Both payloads passed; only table addressing differs at code word indices 138, 209, 210. Exact native substitutions match all words. |
| ColdFire and tables | Reference unit matches the author's 134 bytes; all 48 coefficients per core match. |
| COMPRESSOR dispatch | Original init/process table entries retained on both payloads. |
| Static cycle analysis | All branches priced, complete fixed loops, split overhead, initialization and shared work included; both payloads agree. |
| Dual-core matrix | 16 split positions × 2,304 blocks × 16 instances; every call returned. Initial measured maximum 19,828 modeled instruction cycles/core/block, init 192/core; a repeat gave 19,498 (A) and 19,506 (B). |
| Numerical detector stages | Author's pinned gain/filter/cold-warm/HP-reentry/split/stash/MON-publish assertions passed. |
| ColdFire formatters | All KEY 0..8 and KFLT 0..127 calls returned through the real stock sprintf; maxima 132/60 executed instructions, stack peaks 88/72 bytes. |
| UI evidence | Three reviewed MKII LCD captures on the shared-builder image; transport stopped, no audio assets. |

The matrix exercises full patched stock compressor calls on both DSPs at the real X:0 audio base and r7 three-block track stride. It is an isolated algorithm workload, not the firmware's streaming/transport scheduler. The numerical suite is same-core payload B detector verification; it does not measure whole-chip cross-core synchronization or audible live ducking. Static bounds do not depend on the matrix finding every signal-dependent path.

### DSP bound

44.1 kHz, 16 stereo frames/block, 200 MHz/core. Conservative available budget: 4,535 × 16 = **72,560 cycles/core/block**. The core reserve **1,415 × 16 = 22,640** comes from pinned octabam tools/build/cycle_count.py and covers standard stock scheduling/transport work; it is a budget reservation, not a new measured scheduler maximum.

Instruction costs use the reviewed DSP56300 opcodecycles model, based on the [NXP DSP56300 manual](https://www.nxp.com/docs/en/reference-manual/DSP56300FM.pdf). Instrumentation counts every nested DO/REP instruction, not only outer interpreter calls. The independent static decoder respects instruction boundaries and prices both sides of conditional branches even when mutually exclusive. All ordinary control flow is forward/return; the eight authored loops have fixed 32-word or 16-pair limits. The seven stock compressor sample loops use n7; both split segment lengths sum to sixteen.

Both payloads give identical conservative stage costs:

| Stage | Modeled cycles/block |
| --- | ---: |
| Tap: all branches, two 32-word copies | 222 |
| Detector: all branches, five fixed loops | 1,049 |
| Monitor: all branches, 32-word copy | 107 |
| Stock compressor body: all branches and split setup | 1,612 |
| Additional second-split detector exit ceiling | 64 |
| Stock init spike, one instance | 24 |
| Two compressor hook entry costs | 10 |

The second detector call bypasses the loops when r0 is nonzero; KEY OFF calls only the bounded publish-OFF helper. Its forward-path ceiling is below 64. For maximum pricing:

    instance = 1612 + 1049 + 64 + 24 + 10 = 2759
    track tap/commit = 222 + 107 + 10 = 339
    core module code = 8 × 2759 + 4 × 339 = 23428
    core with reserve = 2 × 23428 + 22640 = 69496
    single-instance ceiling = 2 × (2759 + 339) = 6196

The 2× allowance is an explicit conservative model for instruction interlocks and bounded shared-memory contention. It is not measured silicon wait states. Both cores are priced separately at eight instances, covering FX1 and FX2 on four tracks each. Four global tap/commit calls/core run regardless of compressor count. Even repeated initialization is charged in the same block. Maximum load leaves **3,064 modeled cycles/core/block**.

This is a conditional engineering bound under the stated standard reserve and bounded contention model. Arbitrarily stalled memory, clock changes, corrupted parameters and unscheduled RTOS interruptions have no finite software-only wall-clock guarantee. Streaming/MIDI/USB/control dispatch use the stock reserve; the module adds no separate USB/MIDI event loop. LFO, p-lock, scene and CC modulation all update the same bounded parameter words. Static coverage prices all extremes/modes irrespective of input; the software matrix adds rapid block-rate changes and all split positions. The bound is for this module's contribution; it is not summed with other modules selected on the same core.

### ColdFire bound

ColdFire callbacks add UI formatting only; audio processing remains on the DSPs. Direct calls used the native linked unit and the real stock sprintf tail. KEY 0..8 peaks at 132 executed instructions/88 stack bytes; KFLT 0..127 peaks at 60/72. tools/cf-probe.cpp records that workload. The four-instruction KEY list trampoline changes one flag then tail-calls the unchanged stock widget.

At an explicit 30 Hz UI event basis and 264 MHz, budget **8,800,000 cycles/event**. A conservative allowance of **1,024 cycles/executed instruction**, including bounded memory service, prices the longest formatter at **135,168 cycles/event**. Charging sixteen such callbacks plus a **6,000,000-cycle stock UI/scheduling reserve** yields **8,162,688 cycles/event**. This is a conditional model, not a hardware measurement or a claim that the emulator's instruction counter equals cycles. The existing stock list/raster rendering is charged to the reserve, not omitted. The CPU arithmetic/cache/peripheral distinction follows the [MCF547x reference manual](https://www.nxp.com/docs/en/reference-manual/MCF5475RM.pdf).

### Exact memory inventory

All DSP values below are **logical 24-bit words**, three bytes each. Host .mem representations use four bytes/word and are temporary host files, not target allocations. Maximum is sixteen compressor instances; state is not reallocated per hook. The declaration totals **768 bytes/instance + 11,004 shared bytes = 23,292 logical bytes**.

| Region | Range/capacity and bytes |
| --- | --- |
| Existing compressor instance X block | r7 = stateBase + (1 + 3×track + FX-slot)×0x100; 256 words/instance = 768 B. Sixteen instances = 12,288 B. Sidechain fields +0x14/+0x16/+0x17/+0x18 reuse four words inside it. |
| Authored DSP code | A P:1282..13d5; B P:1042..1195 when the module is placed alone in SPRING REV's space; 340 words/core = 2,040 B total. The addresses move when other modules share the core. |
| Coefficients | A P:1252..1281; B P:1012..1041; 48 words/core = 288 B total. |
| Private Y | Both cores Y:7f0..9ff, 528 words/core = 3,168 B. MON flags/key indices at 7f0..7ff, keybus at 800..9ff. |
| Shared key windows | A Y:33dfe..33fff and B Y:3bdfe..3bfff, 514 words/core = 3,084 B. Includes seed/counter and 4×4×32-word generations. They are the unused tail of the track-3 FX2 buffer slot, past the +0x3DA2 any stock effect writes. |
| Existing low-X scratch | X:0..ff on each core, 256 words/core = 1,536 B. Audio X:0..1f and detector X:40..5f fit inside this borrowed capacity. |
| Existing DSP hardware stacks | Sixteen 48-bit entries/core = 192 B total, represented as 64 logical 24-bit words. Authored nesting peaks at one caller entry plus two DO entries; the OFF helper adds one entry without an active DO. No recursion. |
| CPU descriptor cave | 400d6b20..400d6cbf, 416 B reserved stride; 402-byte inherited descriptor plus 14-byte alignment/slack. The cave starts here when the module is first in the placement order (stock FX2 kept). |
| CPU authored unit | 134 B plus 2 B alignment = 136 B, placed by the builder after the descriptors (400d6d00..400d6d85 for the module alone). |
| Chooser lists | The relocated FX1 list (48 B) and the FX2 list (60 B for 14 entries) hold every selected module's rows, not only this one; the module adds no row, it takes COMPRESSOR's. 128 B reserved. |
| Additional ColdFire stack | KEY's 12 B of arguments plus 4 B call return = 16 B. Formatter observed total peaks include reused stock sprintf frames (88/72 B). The trampoline tail-call allocates no new frame. |

These reused stock capacities are counted once; they are not incremental memory consumption. The exact incremental claim consists of the authored code/tables, keybus/windows, clone/UI caves and at most 16 B extra caller stack. The unused SPRING REV donor space remains available slack: original 1,063 words minus the 35-word DARK REV helper leaves 1,028 words; this module uses 388/core and leaves 640. That retained 35-word helper is existing stock, not a new allocation. No heap, SDRAM reservation, appended runtime, delay-line allocation or other dynamic peak is introduced by the module. Temporary DSP addresses lie in the declared scratch/state ranges; table indices and key addressing are bounded by the control domain. Stock DARK/PLATE buffers stay below the shared tail claim; the resource ledger enforces competing claims. Hardware canaries and physical stack peaks were not measured.

### Historical author evidence and waiver

The pinned author report says the MKI ran this octabam form on 4 October 2026 with all six KYOTI modules and REC_TRIG_MUTE: both pages, same-core/cross-core KEY both ways, KFLT/KGN/MON, no T7 reverb crosstalk, muted KEY in each MUTE MODE and the first kick after PLAY. Earlier standalone/KYOTI tests covered ducking, MON and muted KEY with MUTE_MODES. This is attributed upstream operation evidence for a different combined image; duration, exact hardware image hash and sustained maximum-load timing were not supplied.

On 5 October 2026 the owner explicitly stated: “I explicitely approve not needing hardware evidence right now.” It waives only new current-build hardware evidence, retaining cycle, memory, source, licence, UI and composition gates. Hardware status stays historical.

Known physical caveats remain: cross-core rate locking/two-generation latency, shared-KEY MON stash interactions, dirty persisted state, effect replacement with MON left on, project reload and recovery. Turn MON off before replacing the effect; KEY OFF restores self-keying. No new physical maximum-load or live ducking claim follows from this report.

### Ordinary checks and data hygiene

npm run check, modules:check -- --base origin/main and git diff --check read source/data and never run submitted firmware/emulator/native manifests. Focused tests validate the hardware-only exception, resource arithmetic, report identities, the committed composition fingerprints, the ledger's range checks and the module's chooser, conflict and package declarations.

Keep firmware/images/updates, cards/projects, extracted stock disassembly, instrumented vendor/host copies, audio renders and raw logs private and temporary. Commit only authored sources, source-only recipes/packages, full licenses, sanitized hashes/counts and reviewed media.

### Reproduce

Composition: build a private copy of `sdk/octabam` with its vendored DSP tools, put your own original MAIN OS at `out/raw/section_3_MAIN_OS.bin`, and run `python3 scripts/export-composition-proofs.py PRIVATE_SDK DEST --app . --vendored-sdk --static-stock --suite sidechain` (or `sidechain-visible`, `sidechain-analog-bd`; add `--cache` to reuse octabam's content-addressed compiler memo and `--shard i --shards n` to split a suite), then `node scripts/verify-sidechain-native.mjs YOUR_1.40C_UPDATE [--shard=i/n]`. The resource ledger's cases run with `python3 sdk/octabam/tools/remix/selftest.py`.

Measurements: run tools/build_meter.py, tools/measure_matrix.py, tools/stock_cfg.py, tools/build_static.py and tools/price_static.py from modules/sidechain-compressor, in that order, in a private isolated workspace with the reviewed meter host, against the author-form image. evidence/cycle-matrix.json and evidence/static-cycles.json retain only aggregate counts. Keep .mem files, extracted .bin/.dis files and host outputs private.
