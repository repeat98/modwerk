# Play Start testing

## Commands and exact revision

Stock guards at `0x40061822` (6-byte `move.l 0x800066a0,d0`), PERSONALIZE count `0x40068fb2`, and the three ANDY `pea 0x64` sites match original OS 1.40C (`section_3_MAIN_OS.bin` SHA-256 `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`) as hashed locally; those bytes are not in this folder. `npm run module:verify` and `ot_emu` have not been run.

## Hardware and audio quality

A private card image of `0.1.0-experimental` was flashed on a unit (23 October 2026). Reported:

1. PLAY START appeared in PERSONALIZE as the words OFF/ON, not a checkbox.
2. Cursor up/down in PERSONALIZE changed OFF to ON.
3. Toggling ON did not change [PLAY]: it still paused.

A private card image of `0.1.1-experimental` (SHA-256 `60c74be9b26cfe39fd69330b03b46543e5038c9b45cf09b26a2239e87b3bc2b6`) was retested on the same unit. Reported:

1. Empty box does appear (checkbox glyphs work).
2. YES can sometimes put an X, but it is temperamental (YES often does not tick).
3. Arrow keys while navigating PERSONALIZE still undo the X.
4. When the box shows X, [PLAY] still pauses.

Do not treat `0.1.1-experimental` as a pass.

A private card image of `0.1.2-experimental` (stamp still `PLAYSTART`) was reported on the same unit as no difference whatsoever (or it was not possible to tell it installed). Do not treat `0.1.2-experimental` as a pass.

A private card image of `0.1.3-experimental` (ELEK `PS 0.1.3`, SHA-256 `09911ff850c5062e37d471ff53a0ca196e14db1a9537dd00cc4459b7413107fb`) was retested on the same unit. Reported:

1. PLAY START appears in PERSONALIZE, checked or empty, and that status is now stable.
2. YES toggles the box on and off.
3. With the box showing X, [PLAY] still pauses on the second press and continues from the pause point.

Do not treat `0.1.3-experimental` as a pass. `0.1.3` wrote POS0=-1 then entered `0x40061856`; stock `0x400a030c` returns immediately when POS0<0.

A private card image of `0.1.4-experimental` (ELEK `PS 0.1.4`, SHA-256 `945b6fe5dffbefb32a6a0696610d12deb3c55cafe4ad3874a4e85a67b0491285`) was retested on the same unit. Reported: with PLAY START showing X, [PLAY] still pauses. Do not treat `0.1.4-experimental` as a pass.

A private card image of `0.1.5-experimental` (ELEK `PS 0.1.5`, SHA-256 `c3e5fa5d3d2f4596fc63c2853e83df132d7cd7f11ca861f47ffb67da73e19fa4`) was retested on the same unit. Reported: with PLAY START showing X, [PLAY] is unresponsive — no LED feedback, no sequencer. Do not treat `0.1.5-experimental` as a pass.

A private card image of `0.1.6-experimental` (ELEK `PS 0.1.6`, SHA-256 `836585948894e13594bb51b81a03724e2cfc5f4fae6f9ec8ca8969a3dc75a977`) was reported on the same unit as no change whatsoever. Do not treat `0.1.6-experimental` as a pass.

A private card image of `0.1.7-experimental` (ELEK `PS 0.1.7`, SHA-256 `c701c6af9946b00ceef9743043f9589e7308113be9aef38ebd3fb09141a0b9a4`) was retested on the same unit. Reported: with PLAY START showing X, [PLAY] lights the LED and runs the sequencer, but a second press still pauses and a third continues from the pause point. Do not treat `0.1.7-experimental` as a pass.

A private card image of `0.1.8-experimental` (ELEK `PS 0.1.8`, SHA-256 `4ba100e216192b25206bfeaf5d776171d103c719b0e5a79194f7bc06746ca880`) was retested on the same unit. Reported: still pausing and unpausing. Do not treat `0.1.8-experimental` as a pass. 0.1.8 hooked the 0x460d1aec!=0 pause (0x40061848). This unit's PLAY uses the SEQ pause at 0x4006188a and start at 0x40061892.

A private card image of `0.1.9-experimental` (ELEK `PS 0.1.9`, SHA-256 `6e94a54bfe082ae0e11919d14f33fc4d5f00dc720a672160d53bea7a256ca316`) was retested on the same unit, 23 October 2026. Reported: with PLAY START showing X, every [PLAY] starts the sequencer from step 1 instead of pausing. Empty box remains stock play/pause. Later the same PERSONALIZE row was reported as beginning ticked, needing two YES presses to show empty. Do not treat the PERSONALIZE default of `0.1.9` as a pass. USB Keep/Undo, MIDI transport, `ot_emu` and LCD captures are untested.

A private card image of `0.1.10-experimental` is prepared locally (ELEK `PS 0.1.10`, SHA-256 `275e74e4afcd9eee48b382fa5eb09496d62deca941990f7e93f193c20f3e6558`). Firmware is not in git. Intended card checks:

1. On boot, PLAY START is empty. One YES ticks it; one YES more clears it. Cursor keys do not change it.
2. Empty box: [PLAY] still pauses and continues, as on stock. [STOP] always stops.
3. Ticked box: every [PLAY] starts from step 1, as on `0.1.9`.

Do not treat `0.1.10-experimental` as a pass until those card results exist.

Intended card checks after this image:

1. Empty box: [PLAY] still pauses and continues, as on stock. [STOP] always stops.
2. Ticked box: every [PLAY] starts the sequencer from the beginning (never pause/continue), including [PLAY] while running and [PLAY] from pause. [STOP] still stops.
3. Only [YES] ticks or unticks PLAY START. Arrow keys must not change it.
4. [REC] + [PLAY] still starts live recording.
5. Save a project with the box empty, reload it: the project is unchanged. The box is global, not in the project.
6. Power cycle with the box ticked: the row should still be ticked on a card build (ANDY restore). USB install restore is `ps_restore` on `module_tick` and is untested.

## Stock flows

`0.1.0`–`0.1.8` failed as listed above. `0.1.9` same-unit card: with X, [PLAY] starts from step 1 on every press. MIDI transport, scenes, sampling, USB Keep/Undo, and menus this module does not own: not tested.

## Performance

Static bound only. Authored ColdFire in `playstart.s` is 76 instruction lines. Worst-case event used for qualification is that whole unit if every opcode ran once (76), as a conservative static ceiling, not a measured path. Stock `jsr` callees, cache and wait states are not included. Chip wall-clock and `ot_emu` executed-instruction traces are unmeasured. New-module `perf:audit` remains open.

## Resources

Authored ROM is one ColdFire unit of 274 bytes (native linked `playstart`). Plus four six-byte [PLAY] detours, ANDY length pokes, a row-count poke, and relocated PERSONALIZE pointer arrays in stock space (not counted as extra module RAM). One PERSONALIZE word and its ANDY shadow are stock SRAM. No DSP memory. One instance.

## Hardware

`0.1.0`–`0.1.8` card flashes, 23 October 2026: failed as listed above. `0.1.9-experimental` same-unit card, 23 October 2026 (ELEK `PS 0.1.9`, SHA-256 `6e94a54bfe082ae0e11919d14f33fc4d5f00dc720a672160d53bea7a256ca316`): with X, every [PLAY] starts from step 1; PERSONALIZE later reported as beginning ticked. `0.1.10` not yet flashed. See [evidence/hardware.md](evidence/hardware.md).

## OT UI capture evidence

Hardware LCD photographs, 25 October 2026, in `media/` (`capture.json`). SYSTEM STATUS stamp on the photographed unit reads `PS 0.1.9`. PERSONALIZE shows PLAY START empty and ticked. Never commit firmware, dumps or cards.
