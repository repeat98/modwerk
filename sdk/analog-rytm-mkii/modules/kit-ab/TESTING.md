# Kit A/B — test report

- Module: `kit-ab` 1.0.0, for Analog Rytm MKII OS 1.74 on Modwerk's base (core-ar2 0.7).
- Source: https://github.com/Iced-Cream/rytm2_mods at `2b3561a78bb716f92c879080d53b262a8d5869a1`, `kit-ab`.
  `src/kit-ab.s` (`b549c214…adda8`, rytm2_mods' `kit-ab/os1.74/kit-ab.s`) and `include/ar2-1.74.inc` (`c57431f7…874b`) are byte-identical to it.
- Original: MrScruff's rytm-mods `0010-kit-ab`.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`.

## Hardware


On an Analog Rytm MKII with OS 1.74, 2026-11-08, Iced-Cream ran build **KBH7**: stock 1.74 + Modwerk's base for core-ar2 0.7
(plain variant `ba530f45…20fe`) + analoghealth 1.2 (`a86f07c5…87b6`, remote keys only, no site shared with this module) + this
module, linked by `scripts/link-image.mjs`: `.syx` `a94bed0fe09ebd2fb3e959b52e0912a3c18203dabe1691844cdf5c902b691678`, main OS `987562e097f7db2f4944b1d8f4bffe9123e049336dbcc0e7ea100d5746b72559`.
elkbench plans, each gated in the emulator first, flashed it over stock, ran the test and flashed stock 1.74 back (about 7 minutes a run).
The evidence is bound to the tested source, `src/kit-ab.s` (`b549c21470a24aabf88a91cbe8102537015aa1584ee63668957ce1f57a3adda8`), unchanged since rytm2_mods. Every check below is a screen comparison against the emulator's reference, in a `~T` test project made by CREATE NEW, through the
KIT menu's RELOAD (FUNC + PLAY MODE):

| Check | Result |
| --- | --- |
| Unedited kit, RELOAD twice | KIT RELOADED! both times, saved BD DEC kept |
| BD DEC to 0, RELOAD | KIT RELOADED!, saved DEC |
| RELOAD again | EDITS RESTORED!, DEC 0 |
| RELOAD (A/B armed), DEC to 127, RELOAD | KIT RELOADED! (not EDITS RESTORED!), saved DEC |
| RELOAD again | EDITS RESTORED!, DEC 127 (not the stashed 0) |
| CPU after the flash, twice 30 s apart | 76.6 / 76.2 %, DSP 70.1 / 70.0 %, heap flat |
| Second run: DEC to 0, RELOAD (A/B armed), LOAD KIT kit 2, RELOAD twice | KIT RELOADED! both times on kit 2, never EDITS RESTORED! |
| Second run, CPU after the flash | 74.7 / 74.2 %, DSP 70.0 / 69.8 %, heap flat |

The first run stopped before its last section, a change of kit: the kit list on the unit draws a marker after kits 02-16 that the emulator's reference lacks, so the cursor check failed before kit 2 was loaded (the check compared list content the plan does not control; the module had not acted). A second run the same evening, gated again, covered that section alone with the kit-list check narrowed to the cursor row, and passed. These two runs sent NO + PLAY, which pressed transport PLAY, not the reload key, so only the KIT menu's sites ran; the third run below covers NO + PLAY MODE. After each run stock 1.74 was restored and the test slots emptied.

On 2026-11-09, after the review of the pull request, a third run pressed NO + PLAY MODE, stock's kit reload key, by remote keys
(analoghealth key `PLAYMODE`, 0xb5; transport PLAY is 0x51), on build **KBH8**: stock 1.74 + Modwerk's base for core-ar2 0.7 (plain variant
`1c14b6b0…13b6`, current `main`) + analoghealth 1.2 + this module (package `90354e1d…c09c`), `.syx` `51efb833d06f6228119018cc64320ee222227fb0922ad6eccf3f52c714786c52`, main OS `c29fe4c8cc945e6d6046b2b9f92b38362f51a6872158c9c1c0821cd710ee6aca`.
Gated in the emulator first (gate r-6fb2ef), then on the unit (r-bf0528, r-03dac9, r-7cf43c), in a `~T` project made by CREATE NEW:

| Check | Result |
| --- | --- |
| Unedited kit, NO + PLAY MODE twice | KIT 1 RELOADED! both times, saved BD DEC kept |
| BD DEC to 0, NO + PLAY MODE | KIT 1 RELOADED!, saved DEC |
| NO + PLAY MODE again | EDITS RESTORED!, DEC 0 |
| After every press | the stop square: the sequencer stayed stopped (transport PLAY was not pressed) |
| CPU after the flash, twice 30 s apart | 74.8 / 74.3 %, DSP 70.1 / 69.9 %, heap flat |

Stock 1.74 was restored and the test slots emptied.

Earlier, rytm2_mods recorded the original port as confirmed on an Analog Rytm MKII on 2026-10-14 in a full build (before the OS 1.74 port).

Stock's single-kit reload key is NO + PLAY MODE (the OS 1.74 manual: "[NO] + [PLAY MODE]"). Until 2026-11-09 this module's documents, like rytm2_mods' README, called it NO + PLAY; `src/kit-ab.s` keeps rytm2_mods' comments unchanged, so they still say NO + PLAY.

## Source and site conversion

The four sites are rytm2_mods' OS 1.74 sites. Its `keep2` sites (which keep a stock opcode word) are written as the equivalent authored instructions, so no stock opcode is retained: the two `jsr` sites are `jsr` sites (opcode `4eb9`), and the two `pea` sites are `bytes` sites (`487900000000`, the address relocated to `kit_ab_kab_msg`). Each guards 6 stock bytes by address, length and SHA-256.

## Library package

`scripts/build-elemod-isolated.sh` compiled this folder in Modwerk's pinned `modwerk-source-tools` image (from `sdk/build/Dockerfile`,
image `sha256:6f8066eb…6895`; m68k-elf GCC 16.2.0, binutils 2.47) from a clean checkout of `1a91a0f1` (re-exported 2026-11-09 for the NO + PLAY MODE name; first built from `6a1fba0c`), and
`scripts/package-elemod-recipe.mjs` exported `sdk/imports/packages/kit-ab/kit-ab-1.0.0-os1.74.elemod`
(`90354e1df1b2af8870f92b6572fe7ed6bd39742e4817fd7e219d66fb5e2bc09c`); `--check` reproduces it. `.run` is 340 bytes, 4 sites; it requires core 0.7, Modwerk's base.

## Source build comparison

`scripts/verify-elemod-source-parity.mjs` linked that build with Modwerk's base for core-ar2 0.7 (plain variant,
`1c14b6b058d473ca20ba93a128ca39fe74a69f0b08603ca566ee0300933713b6`, current `main`; before it `ba530f45`, with main OS `0e8d0665…856f`) on stock OS 1.74, and rytm2_mods' release object
`kit-ab-1.0-os1.74.elemod` (`4e36608c9745c985a7b99ab9ab43f25e518451b53c6ba184f517d631c96daa64`, the same file in releases v1.2,
v1.3 and v1.4) with the same base: both give main OS `11f2ad04bebfd1aac6e865f38087089182b834a989f0a6d8fdcb7db6485152ca`, byte parity, `.run` 340 bytes in each
([source-parity.json](evidence/source-parity.json)). KB17 below has the same main OS. The same check with the vendored core-ar2
0.3 release (`6b97dfb3…3e58`) in place of the base also gives byte parity (main OS `91d2887bacd0bee76d0390f728e6ade9c37e9ff9162666fedce1464c01c3d786`). On the base, the module takes 340
bytes of the shared mod area (`ramSpare` 118,836 for the current base alone, 118,496 with it; 119,004 and 118,664 on `ba530f45`). The firmware and the linked builds stayed on the owner's computer.

## Emulator

[analog-emu](https://github.com/trigcondition/analog-emu) `4c07ed3` (rytm-emu lineage), headless `dtboot`, no card, JIT on
([capture plan](media/capture.json)). Build KB17: Modwerk's `scripts/link-image.mjs` with Modwerk's base for core-ar2 0.7 (plain
variant `1c14b6b0…13b6`, current `main`) and this folder (compiled with Ubuntu's `m68k-linux-gnu` GCC), materialised against stock OS 1.74,
`--version KB17`: `.syx` `2128ac54e0dcd0c2da9dc6a3d484ff21f7481c57bb6a82d2988670886ec74b36`, main OS `11f2ad04bebfd1aac6e865f38087089182b834a989f0a6d8fdcb7db6485152ca`.
The same plans ran on stock 1.74, on KB07 (the earlier plain base `ba530f45` + this module, `.syx` `0c773091…8c6d`) and on KA74
(core-ar2 0.3 + this module); KB07's and KA74's frames are byte-identical to KB17's.

| Input | KB17 (KB07, KA74 the same) | Stock 1.74 |
| --- | --- | --- |
| Boot, four NO, BD DEC down to 82 | DECAY TIME 82 | same frame |
| FUNC + PLAY MODE | KIT menu, RELOAD first | same frame |
| YES on RELOAD | KIT RELOADED!; after NO the screen equals the boot frame byte for byte (saved DEC) | same |
| FUNC + PLAY MODE, YES on RELOAD again | EDITS RESTORED!; after NO, DEC is at the edited value | KIT RELOADED!; the screen equals the boot frame (saved DEC) |

Every frame before the second RELOAD is byte-identical on the two builds. The emulator has no audio check here; only the
screen and the working kit's DEC were compared.

NO + PLAY MODE, stock's kit reload key, after the same DEC edit:

| Input | KB17 | Stock 1.74 |
| --- | --- | --- |
| NO + PLAY MODE | KIT 1 RELOADED!; the screen equals the boot frame (saved DEC) | same |
| NO + PLAY MODE again | EDITS RESTORED!; DEC at the edited value (the KIT menu's second RELOAD frame, byte for byte) | KIT 1 RELOADED!; saved DEC |

Beside Temp Save: KT17 = the same base + Temp Save 0.1.0-experimental + this module (`.syx` `27429dcbc04c582c98b9253bcc3bc68445f0948aba3a22e77826f49be0904101`), against KS17 (Temp Save alone,
`937a5569…89b4`) and KB17. Neither module requires the other, and they share no site. One plan: DEC edit, NO + PLAY MODE twice, FUNC + YES,
DEC edited again, FUNC + NO, NO + PLAY MODE.

| Input | KT17 (both) | KS17 (Temp Save) | KB17 (Kit A/B) |
| --- | --- | --- | --- |
| NO + PLAY MODE twice | KIT 1 RELOADED!, EDITS RESTORED! | KIT 1 RELOADED! twice | as KT17 |
| FUNC + YES | TEMP SAVED | TEMP SAVED | stock (no popup) |
| DEC edited, FUNC + NO | RELOADED, DEC back to the temp-saved value | RELOADED, its saved value | stock |
| NO + PLAY MODE | KIT 1 RELOADED!, DEC at the temp-saved value (a plain reload: the kit equals its save) | KIT 1 RELOADED! | KIT 1 RELOADED! |

Each module's frames in KT17 equal its frames alone up to the point where the other module's state differs.

## Not tested

- On the unit: any other module beside it (Temp Save was checked beside it in the emulator).
- Persistence: the stash lives in heap and is not saved; a power cycle or project load loses it, by design. Not exercised.
