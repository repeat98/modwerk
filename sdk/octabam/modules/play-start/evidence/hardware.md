# PLAY START hardware report

- **Tester:** jonathanwardle1992-beep, 23 October 2026.
- **Unit:** one Octatrack (OS 1.40C card flash). Panel generation not recorded; treat model as unstated.
- **Source:** `0.1.10-experimental` commit `ca547781153c2ea03a16592985d3baa7e44e9791` (PERSONALIZE MAGIC empty/X). `0.1.9` was commit `ef7b8a61af9d8cc8a7647a6e4f1935e4f7d854db`.
- **Image:** private card ELEK `PS 0.1.10`, SHA-256 `275e74e4afcd9eee48b382fa5eb09496d62deca941990f7e93f193c20f3e6558`. Firmware is not in git. `0.1.9` card SHA-256 `6e94a54bfe082ae0e11919d14f33fc4d5f00dc720a672160d53bea7a256ca316`.

## Results

Same-unit cards of `0.1.0`–`0.1.8` failed as listed in [TESTING.md](../TESTING.md).

`0.1.9` on the same unit, 23 October 2026: with PLAY START showing X, every [PLAY] starts the sequencer from step 1 instead of pausing. The PERSONALIZE row was later reported as beginning ticked, needing two YES presses to show empty.

`0.1.10` packed, not flashed. Intended: empty on boot; one YES ticks; one YES clears.

## Limits

- This exact `0.1.10` image was not run on the unit.
- USB Keep/Undo, MIDI START / CONTINUE / STOP, `ot_emu` and LCD captures are untested.
- [REC] + [PLAY], pickup machines, chained patterns and an MKI panel are untested.
- PLAY START alone on a card build; Mute Modes cannot share PERSONALIZE with it.
- Instruction counts below are a static bound of authored ColdFire, not chip wall-clock and not stock callees.
- One tester, one unit, one short session.
