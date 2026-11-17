# Scale Quantizer 0.1.4 testing

Version: `0.1.4-experimental`. Author source: timhastie/octatrick-modules
`8f6f564a9c42636ed4c5cc6ad314ee6b7ce69e5c` (his 2.21 line plus the TRACK / FOLLOW rows,
released with Octatrick 2.22 on top of v2.21), `quantizer/` byte for byte. The files were
vendored on 29 October from his working commit `990eff8`, whose `quantizer/` is identical to
`8f6f564`'s; the wrapper `manifest.py` docstring still names `990eff8` and is left as is,
because that file's SHA-256 is bound in the committed package records (`src/engine/assets/requested-packages.json`,
`media/capture.json`, the machine adapters). Records made on 29 October 2026 on
macOS with Node 24.21.0, Python 3.13, m68k-elf binutils 2.47, and the `modwerk-source-tools`
image `sha256:0db04819ba7c59e422ac32a5a519ba2c19760ac73f46a30bf94018d10edb7ac7` (colima).
No firmware, stock bytes, card images or raw renders are committed.

## Beside FM Synth (31 October 2026)

FM Synth 0.1.4 bundles this module's author source byte for byte (his `bb784c4`, whose `quantizer/` equals `8f6f564`'s) and declares `quantizer` in its `compatibility.conflicts`, as agreed with the owner on #555 (31 October 2026): both would patch the same sites, and a module may not hook into another module's code, rows, tables or files. This module's `conflicts` stays empty, as on main (the module whose change makes the pair collide flags it, docs/module-guides/README.md 'Who flags'); `manifest.py`'s note that FM Synth declares a conflict with this module is true. This module alone is unchanged by any of it.

## On current main (31 October 2026)

The branch was rebased onto main `00ecaf52` (#1029, #1094 and #1095 since `886098f5`; the quantizer recipe's pin of `sdk/runtime/loader/build.py` follows main's). The card image rebuilt at the rebased head (TEST3) is byte-identical to TEST2: update file `ec4b811fe6620f06eb6ba9fd23c18e996830f8fea255cf6552fdcc4d089ff808` (449,848 B), MAIN `22541cd628f8064cb6d12e81a0481b17ffad9e737fd968454ae6eb419bb735e8`, container `fcf9160d…`; the author's MKI report of 30 October 2026 (below) therefore stands for this image, and on 1 November 2026 he ran the TEST3 sheet on the same bytes (next section). The branch was then rebased onto main `4ce910bb` (1 November 2026); none of the card build's inputs changed between `00ecaf52` and `4ce910bb` (the module folder, `sdk/octabam/{platform,tools,dsp,licenses}`, the exporter, the module adapters, the package script and `build_core.py`: an empty diff), so the image is not rebuilt.

## Author-reported hardware — 1 November 2026 (TEST3)

Tim Hastie reports the Scale Quantizer 0.1.4-experimental TEST3 sheet passing on his **Octatrack MKI on 1 November 2026**; his words, one line for three sheets: "scale quantizer ... pass". TEST3 is the image above, byte for byte TEST2 (update file `ec4b811fe6620f06eb6ba9fd23c18e996830f8fea255cf6552fdcc4d089ff808`, 449,848 bytes, MAIN `22541cd628f8064cb6d12e81a0481b17ffad9e737fd968454ae6eb419bb735e8`), rebuilt on main `00ecaf52`. **Reported by the author**, not independently repeated here. `octamod.module.json` keeps `tests.hardwareStatus` `reported` and adds a `tests.gates` line; no `tests.qualification` object, for the reason given under the 30 October report.

- tested on: 2026-11-01
- tester: timhastie
- model: MKI
- summary: the TEST3 sheet's checks, all reported passing: SEQUENCER has eight rows ending in TRACK and FOLLOW and DOWN past FOLLOW does nothing; TRACK AUDIO 8 with FOLLOW OFF, then TRACK to MIDI 1 and back, reads ON and OFF as it turns without leaving the page, and TRACK stops at AUDIO 1 and MIDI 8; with the same pitched sample on T1 and T8 at PTCH +1 and trigs on 1, 5, 9 and 13, C MAJOR with AUDIO 8 FOLLOW OFF plays T1 at the root and T8 a semitone higher, and AUDIO 8 FOLLOW ON plays both the same; after SAVE and a power-cycle SCALE reads MAJOR, TRACK is back at AUDIO 1, AUDIO 8 still reads FOLLOW OFF and T8 still plays +1.
- limitations: play time and readings were not recorded; the report is the sheet's pass line. Whether the optional step (a 2.21-saved project with SCALE rows OFF) was run is not stated. A functional check of the sheet's items, not a load or stress qualification; no cycle or memory figure is measured.

## This cut: 2.21 + TRACK / FOLLOW (29 October 2026)

What changed against the v2.20 cut below:

- The sixteen per-track rows (MIDI 1..8 SCALE, AUDIO 1..8 SCALE) are two rows: TRACK
  (AUDIO 1..8, MIDI 1..8; a RAM byte of the unit, AUDIO 1 at power-on, not saved; it
  changes no sound) and FOLLOW (ON / OFF for that track, on the same battery-RAM bits
  as before). The module contributes five SEQUENCER rows (SCALE, ROOT, GLIDE, TRACK,
  FOLLOW): within the base's eight over USB, the same five on the card (tables 3 + 5,
  row-count poke 3 -> 8). The project-file lines are unchanged.
- 2.21 adds two guarded detours, `qz_panel_stage` (0x4004fc84, 16 bytes) and
  `qz_panel_commit` (0x40005162, 8 bytes), and includes `remix.inc` twice (the flags,
  then `panel_transaction.inc.s`); without FM Synth they assemble to their replays.
  The wrapper declares the two new guards (28 detours + the poke);
  `quantizer_runtime.py` writes the standalone include at both sites and calls it from
  the octabam root. The author's include enables the transaction beside SYNTH MACHINE,
  where it writes FM's engine state (`sy_state`); FM Synth bundles its own copy and
  conflicts with this module, so the wrapper gives the include a selection without FM
  Synth. Before that, the card-build object assembled for the whole requested set named
  `sy_state` and did not link alone; the card image and the USB package are the same
  either way.

Results:

- Card build (`scripts/export-composition-proofs.py --vendored-sdk --static-stock
  --modules quantizer --select quantizer:true`, private stage with the local 1.40C):
  MAIN `22541cd628f8064cb6d12e81a0481b17ffad9e737fd968454ae6eb419bb735e8` (1,116,202 B),
  update `ec4b811fe6620f06eb6ba9fd23c18e996830f8fea255cf6552fdcc4d089ff808` (449,848 B);
  rebuilt identical from the committed tree.
- USB package: the machine recipe re-captured for the new sources (6 copies, hashes
  only); `quantizer/0.1.4-experimental.mwrm` 7,210 B
  `33700b9339c0d0e619716cf6358ac83c9912c9881e30721411d2bf79897bbe04`, 19 hooks, 9
  stock-code sites; `octatrack:module-packages --check --stock`: 27 identical, rc 0.
- Card-build packages: Docker isolated build + `modules:import --development`; GNU link
  proofs refreshed in the toolchain image (7); standalone recipes' four asset pins
  refreshed.
- Emulator (ot_emu, MKII panel, a card with tracks 1 and 8 FLEX on one sine sample,
  trigs 1/5/9/13, Part PTCH +1 st): on the card
  image above, PROJECT > CONTROL > SEQUENCER lists stock's three rows, SCALE, ROOT,
  GLIDE, TRACK (AUDIO 1), FOLLOW (ON); DOWN past FOLLOW stays there. TRACK = AUDIO 8,
  FOLLOW = OFF sets bit 7 of `0x100b14eb`; turning TRACK to MIDI 1 shows FOLLOW ON in the
  first LCD read 60 ms after the turn, back to AUDIO 8 shows OFF, and TRACK turns change
  no stored byte. TRACK stops at AUDIO 1 and MIDI 8, [YES] wraps MIDI 8 to AUDIO 1, [YES]
  toggles FOLLOW. Playing in C MAJOR, track 1's PTCH word is snapped from +1 to 0 st by
  `qz_atrig` at every trig while track 8 (FOLLOW OFF) keeps +1; with AUDIO 8 FOLLOW ON
  both snap. SAVE PROJECT writes `#SEQUENCER_MIDI_SCALE_OFF=2` and
  `#SEQUENCER_AUDIO_SCALE_OFF=132` (AUDIO 3, AUDIO 8, MIDI 2 OFF) and a `project.work`
  byte-identical to the one the author's 2.21 writes for the same settings; after a power
  cycle (battery RAM in, no load posted) the bits are back and TRACK starts at AUDIO 1;
  a project saved by 2.21 with those tracks OFF loads with the same tracks OFF. The
  SEQUENCER screens of stock's rows and SCALE / ROOT / GLIDE are pixel-identical to
  2.21's. Every screen of these walks is pixel-identical to the author's standalone 2.21 +
  TRACK / FOLLOW build. The six media PNGs were re-captured from this image
  (`scripts/capture-module-ui.py`, ot_emu `07a7c08e`); only `ot-track-rows.png` changed.
- Checks: in this tree, without the owner's records: `sdk:imports:check`
  pass (82 files); `test_requested_imports` and `test_quantizer_group_participants` pass;
  lint (0 errors) and typecheck pass; `octatrack:module-packages --check --stock` 27
  identical. `modules:generate`, `modules:check` and `npm run check` stop at "quantizer:
  owner-approved update does not cover this module version" (owner record);
  `modules:compat -- quantizer` reports one problem, "POLY8 bundled quantizer declaration
  drift" (owner record `composition.json`). The vitest failures this tree adds over main
  follow from those two records (the generated catalogue documents stay at 0.1.3, so
  "Compiled module versions differ from the catalog" and the changelog test) and from the
  Analog BD composition proofs, which are not refreshed: this Mac's exporter output differs
  from the committed record also for selections without the quantizer.

## The v2.20 cut (25-27 October 2026)

The sections below record the earlier 0.1.4 cut (author v2.20 `fd18f55`, nineteen
SEQUENCER rows, card MAIN `e1c4f103...`), kept as history. Its TEST1 hardware report
applies to that image, not to this cut's.

## What changed against 0.1.3

The 2.19 source adds seven hooks to the 0.1.3 set: `qz_mknob`, `qz_mplock`,
`qz_mkey` (MIDI NOTE knob, NOTE locks and chromatic keys), `qz_mnote` (the
sequencer's MIDI note stage: NOTE, chords, TRAN, the arpeggiator), `qz_mprev`
(GRID RECORDING chord preview), `qz_atrig` (the frame builder's trig path: what
a Static or Flex track plays follows the scale) and `qz_heldmark` (the held-key
mark on the chromatic keyboard). The SEQUENCER tables grow by 19 rows (SCALE,
ROOT, GLIDE, MIDI 1..8 SCALE, AUDIO 1..8 SCALE) and the window count from 3 to
22. The settings are battery-RAM bytes: SCALE, GLIDE, ROOT, the MIDI-off bits and
the AUDIO-off bits. 0.1.3's #181 / #264 drawer fix is in the author's line since
2.13; `upstream/quantizer/quantizer.s` is no longer edited here.

## Guards

`manifest.py` declares every guard of the module in Modwerk's form,
`stock_guard(address, length, sha256)`: the 26 detours and the SEQUENCER
row-count poke, each the SHA-256 of the original 1.40C bytes at that site. The
author's manifest runs with its `stock_guard.py` stood in for, and each of its
detours and its poke gets the guard declared for its site; the wrapper checks
that the sites are exactly the declared ones and that each guard covers what
the hook overwrites (`pad_to`, or the poke's write). The 20 sites 0.1.3 also
hooks carry the same digests as on main. `sdk/imports/octabam-363861e.json`
lists the 27 guards under `stockGuards` (path `modules/quantizer/manifest.py`),
and `sdk/tests/test_requested_imports.py` matches them against the file.

A clean checkout without firmware therefore declares the real guards. The USB
package rebuilds identical with and without the developer's OS, and POLY8's
seam guards for `qz_octkey` and `qz_octnum` match (no seam drift).

The vendored `upstream/quantizer/manifest.py` is the author's v2.20 file byte
for byte. It names no stock bytes: each of its 26 detours and its poke takes
`stock_guard(site, length)`, which his `stock_guard.py` would read from the
build's MAIN OS section. The wrapper stands in for that reader while the
manifest loads and answers each site with the guard declared above. Re-vendored
from v2.19, and again from `7cca7a2` and `fd18f55`, the declaration is unchanged: the same sites,
lengths, units, tables and `module_signature` (`80c6db12...`).

## Card build (native, macOS)

`scripts/export-composition-proofs.py --vendored-sdk --static-stock --modules quantizer
--select quantizer:true` on a private stage of this checkout (the local 1.40C beside
it, outside Git), menus from `defaultChoosers(['quantizer'], true)`:

- 26 detours placed (qz_boot and qz_defaults into the ROM core), the three SEQUENCER
  tables grown 3 + 19, the window count poke; ROM units 204 + 45 + 6 = 255 bytes.
- MAIN image `e1c4f1036f88644a85f02b9009cd915a41c62c04a06c5ad7fd9902a172c8e412`
  (1,116,117 bytes); update file
  `f33e20bf7da813bc55e5135e86b25346de86271a1d020fa7f289673b4452d524` (449,836 bytes).
- Rebuilt from commit `ae5a5ef0` (after the guard change), from a fresh clone at
  `193d7877` (the v2.20 files at `a0e8df4`) and from a fresh clone at `ce285c1b` (the
  files at `7cca7a2`) and from a fresh clone at `3a01cc1b` (the files at `fd18f55`): both
files identical each time, runtime ELF `a51a75e3...`.

## Author-reported hardware — 30 October 2026 (TEST2)

Tim Hastie reports every item of the Scale Quantizer 0.1.4-experimental TEST2 sheet working,
tested on an **Octatrack MKI, OS 1.40C, on 30 October 2026**: in his words, "passed all
checks". The image is the one above: update file
`ec4b811fe6620f06eb6ba9fd23c18e996830f8fea255cf6552fdcc4d089ff808` (449,848 bytes), MAIN
`22541cd628f8064cb6d12e81a0481b17ffad9e737fd968454ae6eb419bb735e8`. **Reported by the author**,
not independently repeated here. The same facts are in `octamod.module.json`
(`tests.hardwareStatus` `reported`, a `tests.gates` line); no `tests.qualification` object is
added, because the contract wants worst-case cycles and exact memory beside the hardware block
and this cut measures neither.

- tested on: 2026-10-30
- tester: timhastie
- model: MKI
- summary: every item of the sheet worked. SEQUENCER has eight rows ending in TRACK and FOLLOW
  and DOWN past FOLLOW does nothing; TRACK AUDIO 8 with FOLLOW OFF, then TRACK to MIDI 1 and
  back, reads ON and OFF as it turns without leaving the page, and TRACK stops at AUDIO 1 and
  MIDI 8; with the same pitched sample on T1 and T8 at PTCH +1 and trigs on 1, 5, 9 and 13,
  C MAJOR with AUDIO 8 FOLLOW OFF plays T1 at the root and T8 a semitone higher, and AUDIO 8
  FOLLOW ON plays both the same; after SAVE and a power-cycle SCALE reads MAJOR, TRACK is back
  at AUDIO 1, AUDIO 8 still reads FOLLOW OFF and T8 still plays +1.
- limitations: play time and the MIDI gear used were not recorded; whether the optional step
  (a 2.21-saved project with SCALE rows OFF) was run is not stated. A functional check of the
  sheet's items, not a load or stress qualification; no cycle or memory figure is measured.

## Author-reported hardware — 26 October 2026

Tim Hastie reports PASS for every item on the Scale Quantizer 0.1.4-experimental
TEST1 hardware sheet, tested on an **Octatrack MKI, OS 1.40C, on 26 October 2026**.
This is **reported by the author**; it has not been independently repeated here. The reported checks include:

- Switching MAJOR/MINOR moves the playing PTCH locks with the scale and restores
  them when switching back.
- All nineteen SCALE rows appear on SEQUENCER.

The tested update file is
`f33e20bf7da813bc55e5135e86b25346de86271a1d020fa7f289673b4452d524`
(449,836 bytes), with MAIN image
`e1c4f1036f88644a85f02b9009cd915a41c62c04a06c5ad7fd9902a172c8e412`
(1,116,117 bytes). `QZR/RECORD_QZR.txt` records the clean native build at
`193d787795465bd7d93b05a1f6e7e7c9a55525aa`; the card-build section above records
later byte-identical rebuilds. This hardware report is bound to those complete
image identities, not a claim that the current branch HEAD was tested on hardware.
The existing `tests.evidenceRevision` remains the revision of the historical
software evidence.

The report does not supply a test duration, project/track load, maximum-instance
or stress measurements, ColdFire cycle measurements, or complete memory bounds.
It does not establish USB hardware behavior. `tests.hardwareStatus` is `reported`;
full qualification and the owner approvals listed below remain outstanding.

## Card-build packages (Docker)

From the committed tree at `ac8faff8`: `scripts/build-modules-isolated.sh . <new dir>
<image ID>` (no network, no firmware), then `npm run modules:import -- <dir>/packages
--development`. The import is commit `ae5a5ef0`: the quantizer's requested packages at
0.1.4 and the new source identity in every asset file. After the v2.20 files the same
two steps from `92100a66` give commit `a15865d1`: no compiled object changes, only the
source identity (`sourceCommit`, `sourceTreeSha256` and the source pins). After the
`7cca7a2` files, the same two steps from `e7bb02ae` give commit `c8480276`, and after the
`fd18f55` files the same two steps from `9cd357db` give commit `3496d816`: again only
the source identity (`9cd357db` changes the wrapper's docstring pin, so its digest moves
in `requested-packages.json`).

Three records follow the import (commit `193d7877`; refreshed again in `ce285c1b` after the
`7cca7a2` files and in `3a01cc1b` after the `fd18f55` files, each time: the link proofs come out identical, the Analog BD record changes only
in its header's `moduleSourceTreeSha256` with all 212 proofs identical, and the four
standalone pins follow the import again; `verify-analog-bd-native.mjs` passes again):

- `src/engine/assets/requested-link-proofs.json`: `scripts/export-requested-link-proofs.py`
  in the toolchain image (no firmware). The four proofs with the quantizer take
  0.1.4's object; the other eleven are unchanged.
- `src/engine/assets/analog-bd-composition-proofs.json`: `scripts/export-composition-proofs.py
  --suite analog-bd --static-stock --vendored-sdk` on the developer's 1.40C, six shards
  merged in the suite's order. The 28 selections with the quantizer change (26 images,
  2 refusals that now stop at a different fit), the other 184 are identical, no
  selection flips between built and refused, and the header's `moduleSourceTreeSha256`
  follows `module-build.json`. `scripts/verify-analog-bd-native.mjs` passes: 162 native
  OS and GNU bootloader comparisons, 50 matching refusals, 6 complete firmware round
  trips.
- `sdk/machines/octatrack/module-adapters/standalone-recipes.json`: Tape Echo's and
  Euclid's pins of `dsp-packages.json`, `descriptor-recipes.json`, `menu-recipes.json`
  and `rom-packages.json`, the four files the import rewrites; then
  `octatrack:module-packages -- --check` prints every package identical.

## USB package

`sdk/runtime/loader/build.py --octabam-machine quantizer` through
`machine_ports.effective()` and `quantizer_runtime.port()`: 18 take events and the
`ot_sequencer_rows` contribution (19 hooks), 7 stock-code sites, 6,084 bytes of
code and data, 131 relocations, recipe in `machine-recipes.json` (5 copies, 0 fills);
strict stock-free scan: longest run shared with stock 11 non-zero bytes (fails at 12).
Package `quantizer/0.1.4-experimental.mwrm`: 7,374 bytes,
`bfcbacf27c9d938f080359116c13881bf52bd77b720f74e212a083809732c3a7`. After the guard
change, after the v2.20 files and after the `7cca7a2` and `fd18f55` files, it rebuilds identical
without any OS file (and with it). The five machine recipes re-pin `machine-ports.json`, and the quantizer's recipe the
wrapper and the two v2.20 files; all five packages rebuild identical.

Over USB the base shows stock's three SEQUENCER rows and eight contributed rows
(`events.json` room, `SEQ_ROWS 11` in `machine_registry.c`): SCALE, ROOT, GLIDE and
MIDI 1..5 SCALE appear; MIDI 6..8 SCALE and AUDIO 1..8 SCALE stay ON and cannot be
reached there. Card builds show all nineteen rows.

## Emulator (ot_emu `07a7c08e`, MKII panel)

On the card build's MAIN image above (`e1c4f103...`, the same bytes before and after
the guard change and the v2.20 files):

- **The rows** (25 October 2026, the disposable SYTEST project, card read-only): from
  PROJECT > CONTROL > SEQUENCER one DOWN at a time, all nineteen rows draw and scroll in
  order: SCALE (OFF), ROOT (C), GLIDE (OFF), MIDI 1..8 SCALE (ON), AUDIO 1..8 SCALE
  (ON); AUDIO 8 SCALE is last and a further DOWN stays on it.
- **Menu and knob** (same project): LEVEL sets SCALE to MAJOR; on a Flex track PTCH
  0 steps to +2 and +4 semitones (Part byte 64, 74, 84) through `qz_knob`; on AUDIO 1
  SCALE, LEVEL left sets OFF; the MIDI trig-mode popup opens and closes, CHROMATIC on a
  MIDI track reads `C 3` and the panel stays responsive.
- **Recorded notes follow the scale** (a Flex sine track, PTCH locks +1, +3, 0, +2 on
  steps 1, 5, 9, 13; pitch by zero crossings over each step):

  | Setting | Steps 1, 5, 9, 13 (semitones) |
  | --- | --- |
  | SCALE OFF | +1, +3, 0, +2 |
  | MAJOR, ROOT C | 0, +2, 0, +2 |
  | MAJOR, ROOT C, AUDIO 2 SCALE OFF | +1, +3, 0, +2 |
  | MAJOR, ROOT D | +1, +2, -1, +2 |

  Every value is the nearest scale degree, ties to the lower, and the stored locks
  still read +1, +3, 0, +2 afterwards. `qz_atrig` runs on every trig. The first trig
  after PLAY in the SCALE OFF run read the Part's 0 instead of its +1 lock; that run is
  the stock path, so the table uses the second bar.
- **UI captures**: `scripts/capture-module-ui.py` with an empty scratch card and the plan
  in [media/capture.json](media/capture.json). The five screens 0.1.3 also shows are
  pixel-identical; `ot-track-rows.png` is new. `capture.json` names the wrapper and the
  v2.19 upstream files as they were when the captures were taken (wrapper `014b9038...`);
  the image it names is the one this version builds.

## Checks on this branch

Two passes on commit `193d7877`, each from a fresh clone of this branch with `npm ci`,
`origin/main` = `98f17ed6`, 25 October 2026: first without any OS file (as CI runs),
then with the developer's 1.40C MAIN OS in `sdk/octabam/out/raw/` and the Elekloader
and octabam tool checkouts named by `ELEKLOADER_UPSTREAM`, `MODWERK_UPSTREAM` and
`OCTABAM_NATIVE`. One pass each; nothing was changed between steps.

Pass in both: `licenses:check`, `machines:check`, `elekloader:check`,
`licenses:generate` and `machines:generate` (no diff), the module changelogs,
`sdk:imports:check` (82 files), `lint`, `typecheck`, and
`npm run octatrack:module-packages -- --check` (with the OS also `--stock`): all 25
packages print `identical` (the quantizer `bfcbacf27c9d938f`, Tape Echo, Euclid and
Analog BD included; Play Modes is kept by its declared lag), and with the OS every
strict scan is at most 11 non-zero bytes.

Docker (the toolchain image above), as the module PR workflow runs it: the isolated
package build from the clean clone, the upload controller compile, and
`import-module-build.mjs --development --check-only --verify-existing` (passes: the
fresh build reproduces the committed packages, provenance aside).

Stop in both, for the owner:

- `npm run check -- --base origin/main` and `modules:check -- --base origin/main` stop at
  "quantizer: owner-approved update does not cover this module version": the approval
  record names 0.1.3. This version's native source (`moduleNativeSourceSha256`) was
  `b06f49f3b02d8db5e0d717db05968bd1d3762f99911d7182e1243cad3a3a38a0` at `193d7877`; at `3a01cc1b`
  it is `729c3fa443566c26c70a7bca585ecdd38b1548b1f74e946acde263dc739413e3` (the wrapper's docstring pin moved).
- `modules:generate` stops at the same record, so the module media are not generated and
  `build:bundle` stops at the first missing media file.
- `modules:compat` (also `-- quantizer`): one problem, "whole set: composition: POLY8
  bundled quantizer declaration drift". `composition.json` holds the signature of 0.1.3's
  declaration (`f9b186d8...`); this version's is `80c6db12...`. No seam drift, no byte
  overlap, no room problem (`ot_machines` full, not used by this module).
- `modules:pairs` stops on the same drift.
- `npm run module:verify -- quantizer --os <1.40C>` (toolchain image, `--jobs 6`): the
  native side builds the first selections (18 here: 16 built, the quantizer alone
  1,116,117 bytes, and the two beside FM Synth refused by their conflict), then stops on
  the same POLY8 drift; no record is written. How many selections report before that
  stop varies from run to run, even at the same `--jobs 6` (18 here, 37 in a verifier's
  run at `95d9d074`, 9 at `ce285c1b`, 18 in a verifier's run at `54c683c3`, 36 at `3a01cc1b`);
  only the stop at the drift is stable.

`npm run test`: without the OS 2,565 of 2,602 pass, with it 2,566. The failures are
`module-pages` 33 (the media `modules:generate` did not write), `module-qualification` 1
(the approval record), `native-comparisons` 1 (the record is 0.1.3's) and `module-doctor`
1 (its lines below); without the OS also `module-publication` 1, its 15-second timeout.

`npm run sdk:check`: without the OS, 450 tests, 5 failures and 4 errors; with it, 458
tests, 5 failures, 1 error and 20 skips. The five failures and one error are the POLY8
drift (the every-combination gate with quantizer, synth and poly8; the repository
gate; `test_fm_normalizes_only_its_exact_redundant_quantizer`). The other three errors
without the OS are the Elekloader checkout missing from its default path.
`test_quantizer_group_participants` and `test_requested_imports` pass.

`npm run module:doctor -- quantizer`: catalogue entry, library, category guide,
thumbnail, packages ("compiled into the committed packages at 0.1.4-experimental") and
declaration checks pass; module rules (the approval record), native comparison (0.1.3's
record) and cross-compatibility (the drift) do not.

Re-run at `3a01cc1b` (the `fd18f55` files and the records after them; the commit after
it changes only this file), one pass from a fresh clone with the developer's OS and the
Elekloader and octabam checkouts, Docker included, 25 October 2026: the same results as
the pass with the OS above, apart from the known 15-second `module-publication` timeout,
which hit this time (vitest 2,565 of 2,602: the same 36 and that one). `sdk:check` 458
tests, 5 failures, 1 error, 20 skips, `modules:compat` the one drift, the USB check 25
identical (the quantizer `bfcbacf27c9d938f`; strict scans at most 11), the isolated build,
the upload controller compile and `import-module-build.mjs --development --check-only
--verify-existing` pass, and `module:verify` stops at the drift (36 reported: 34 built, 2
refused beside synth). The earlier re-run at `ce285c1b` (the `7cca7a2` files) gave the same
results without the timeout.

## Beside FM Synth

FM Synth bundles its own copy of this quantizer (labels `fm_*`) and lists
`quantizer` in `compatibility.conflicts` (above); the declaration ledger refuses the
two together, so a build selects one. Over USB both ports subscribe the same 18 take
events (FM at 40, Scale Quantizer at 50) and contribute rows with the same labels,
and the keyed table shows one set. With 2.19 sources on both sides, FM's bundled copy
and this module would both patch the seven sites that have no event (`qz_mknob`,
`qz_mplock`, `qz_mkey`, `qz_mnote`, `qz_atrig`, `qz_mprev`, `qz_heldmark`), and the
base would refuse the second package. FM Synth on main is still 0.1.2 (2.9 sources),
so nothing meets there today.

## Open

- The 30 October 2026 MKI report of TEST2 and the 1 November 2026 MKI report of TEST3 (the
  same bytes) are the author's own (above): not independently repeated; play time, readings
  and MIDI gear not recorded.
- Owner: the approval record for 0.1.4 and POLY8's composition signature; then
  `module:verify`, `modules:pairs -- --write` and `modules:generate`.
- `src/engine/assets/analog-bd-composition-proofs.json` is not refreshed (see the checks
  above); it needs the reference toolchain's run.
- Base: side-by-side USB installs with a 2.19-or-later FM Synth need events at the nine
  guarded sites.

## Historical evidence

0.1.3 (11 October 2026) repaired the standalone MIDI trig-mode popup (#181); its
record is in this file's history. Earlier versions pinned octatrick-modules v2.9.
