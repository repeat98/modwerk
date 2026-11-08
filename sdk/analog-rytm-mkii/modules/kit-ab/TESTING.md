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

The first run stopped before its last section, a change of kit: the kit list on the unit draws a marker after kits 02-16 that the emulator's reference lacks, so the cursor check failed before kit 2 was loaded (the check compared list content the plan does not control; the module had not acted). A second run the same evening, gated again, covered that section alone with the kit-list check narrowed to the cursor row, and passed. NO + PLAY was not exercised: remote NO(PLAY) starts the sequencer in the emulator, so only the KIT menu's sites ran (the NO + PLAY sites call the same `kit_ab_toggle`). After each run stock 1.74 was restored and the test slots emptied.

Earlier, rytm2_mods recorded the original port as confirmed on an Analog Rytm MKII on 2026-10-14 in a full build (before the OS 1.74 port).

## Source and site conversion

The four sites are rytm2_mods' OS 1.74 sites. Its `keep2` sites (which keep a stock opcode word) are written as the equivalent authored instructions, so no stock opcode is retained: the two `jsr` sites are `jsr` sites (opcode `4eb9`), and the two `pea` sites are `bytes` sites (`487900000000`, the address relocated to `kit_ab_kab_msg`). Each guards 6 stock bytes by address, length and SHA-256.

## Library package

`scripts/build-elemod-isolated.sh` compiled this folder in Modwerk's pinned `modwerk-source-tools` image (from `sdk/build/Dockerfile`,
image `sha256:6f8066eb…6895`; m68k-elf GCC 16.2.0, binutils 2.47) from a clean checkout of `6a1fba0c`, and
`scripts/package-elemod-recipe.mjs` exported `sdk/imports/packages/kit-ab/kit-ab-1.0.0-os1.74.elemod`
(`c1ed9d4947e7235330cdc66d34c23ea5a1a7ae590c75d92056faa2a9a70476d9`); `--check` reproduces it. `.run` is 340 bytes, 4 sites; it requires core 0.7, Modwerk's base.

## Source build comparison

`scripts/verify-elemod-source-parity.mjs` linked that build with Modwerk's base for core-ar2 0.7 (plain variant,
`ba530f45d0cd33791d9098d87c1867ef74f6a210953f60d2a97a7548379d20fe`) on stock OS 1.74, and rytm2_mods' release object
`kit-ab-1.0-os1.74.elemod` (`4e36608c9745c985a7b99ab9ab43f25e518451b53c6ba184f517d631c96daa64`, the same file in releases v1.2,
v1.3 and v1.4) with the same base: both give main OS `0e8d066501b18a775d17b2487a4da457f3a975d06911b30b58e42050d7f9856f`, byte parity, `.run` 340 bytes in each
([source-parity.json](evidence/source-parity.json)). KB07 below has the same main OS. The same check with the vendored core-ar2
0.3 release (`6b97dfb3…3e58`) in place of the base also gives byte parity (main OS `91d2887bacd0bee76d0390f728e6ade9c37e9ff9162666fedce1464c01c3d786`). On the base, the module takes 340
bytes of the shared mod area (`ramSpare` 119,004 for the base alone, 118,664 with it). The firmware and the linked builds stayed on the owner's computer.

## Emulator

[analog-emu](https://github.com/trigcondition/analog-emu) `4c07ed3` (rytm-emu lineage), headless `dtboot`, no card, JIT on
([capture plan](media/capture.json)). Build KB07: Modwerk's `scripts/link-image.mjs` with Modwerk's base for core-ar2 0.7 (plain
variant `ba530f45…20fe`) and this folder (compiled with Ubuntu's `m68k-linux-gnu` GCC), materialised against stock OS 1.74,
`--version KB07`: `.syx` `0c773091da851a2e551aacdb0a4b40f03d1ad82b49460d130640d91141c98c6d`, main OS `0e8d066501b18a775d17b2487a4da457f3a975d06911b30b58e42050d7f9856f`.
The same plan ran on stock 1.74, and on KA74 (core-ar2 0.3 release + this module, `.syx` `88839f12…0c24`), whose frames are
byte-identical to KB07's. The committed screenshots are KB07's frames.

| Input | KB07 (and KA74) | Stock 1.74 |
| --- | --- | --- |
| Boot, four NO, BD DEC down to 82 | DECAY TIME 82 | same frame |
| FUNC + PLAY MODE | KIT menu, RELOAD first | same frame |
| YES on RELOAD | KIT RELOADED!; after NO the screen equals the boot frame byte for byte (saved DEC) | same |
| FUNC + PLAY MODE, YES on RELOAD again | EDITS RESTORED!; after NO, DEC is at the edited value | KIT RELOADED!; the screen equals the boot frame (saved DEC) |

Every frame before the second RELOAD is byte-identical on the two builds. The emulator has no audio check here; only the
screen and the working kit's DEC were compared.

## Not tested

- On the unit: NO + PLAY, and every other module beside it.
- Persistence: the stash lives in heap and is not saved; a power cycle or project load loses it, by design. Not exercised.
- NO + PLAY in the emulator: rytm2_mods reports that it does not reach the reload handler in rytm-emu (stock included), so only the KIT menu's RELOAD was run there.
