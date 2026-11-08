# Kit A/B — test report

- Module: `kit-ab` 1.0.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.3 or later.
- Source: https://github.com/Iced-Cream/rytm2_mods at `2b3561a78bb716f92c879080d53b262a8d5869a1`, `kit-ab`.
  `src/kit-ab.s` (`b549c214…adda8`, rytm2_mods' `kit-ab/os1.74/kit-ab.s`) and `include/ar2-1.74.inc` (`c57431f7…874b`) are byte-identical to it.
- Original: MrScruff's rytm-mods `0010-kit-ab`.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`.

## Hardware

None recorded for OS 1.74 in this repository. rytm2_mods records the original port as confirmed on an Analog Rytm MKII on 2026-10-14 in a full build (before the OS 1.74 port). A run of this module's test on 1.74 is to be reported by the author.

Test to run on a unit: edit a sound (for example BD DEC). NO + PLAY shows KIT 1 RELOADED! with the saved value. NO + PLAY again shows EDITS RESTORED! with the edited value. Also: edit while the original plays, then press once (the new edits are kept, the old stash dropped); change kit and press (a plain reload); press on an unedited kit (a plain reload, nothing armed); KIT menu > RELOAD twice.

## Source and site conversion

The four sites are rytm2_mods' OS 1.74 sites. Its `keep2` sites (which keep a stock opcode word) are written as the equivalent authored instructions, so no stock opcode is retained: the two `jsr` sites are `jsr` sites (opcode `4eb9`), and the two `pea` sites are `bytes` sites (`487900000000`, the address relocated to `kit_ab_kab_msg`). Each guards 6 stock bytes by address, length and SHA-256.

## Emulator

[analog-emu](https://github.com/trigcondition/analog-emu) `4c07ed3` (rytm-emu lineage), headless `dtboot`, no card, JIT on
([capture plan](media/capture.json)). Build KA74: Modwerk's `scripts/link-image.mjs` with the vendored core-ar2 0.3 release
(`6b97dfb3…3e58`) and this folder (compiled with Ubuntu's `m68k-linux-gnu` GCC), materialised against stock OS 1.74, `--version KA74`:
`.syx` `88839f128eb98b731fdcbd93672422e867b2c9514bfd3323cdffcb978d760c24`, main OS `91d2887bacd0bee76d0390f728e6ade9c37e9ff9162666fedce1464c01c3d786`.
The same plan ran on stock 1.74.

| Input | KA74 | Stock 1.74 |
| --- | --- | --- |
| Boot, four NO, BD DEC down to 82 | DECAY TIME 82 | same frame |
| FUNC + PLAY MODE | KIT menu, RELOAD first | same frame |
| YES on RELOAD | KIT RELOADED!; after NO the screen equals the boot frame byte for byte (saved DEC) | same |
| FUNC + PLAY MODE, YES on RELOAD again | EDITS RESTORED!; after NO, DEC is at the edited value | KIT RELOADED!; the screen equals the boot frame (saved DEC) |

Every frame before the second RELOAD is byte-identical on the two builds. The emulator has no audio check here; only the
screen and the working kit's DEC were compared.

## Not tested

- Everything on a unit with OS 1.74, and every other module beside it.
- Persistence: the stash lives in heap and is not saved; a power cycle or project load loses it, by design. Not exercised.
- NO + PLAY in the emulator: rytm2_mods reports that it does not reach the reload handler in rytm-emu (stock included), so only the KIT menu's RELOAD was run there.
- In the emulator: edit while the original plays, a change of kit, a press on an unedited kit.
