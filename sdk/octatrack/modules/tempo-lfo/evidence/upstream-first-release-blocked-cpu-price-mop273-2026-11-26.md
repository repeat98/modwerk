# Upstream first-release staging — `cpuPrice` + `.mwrm` (MOP-273)

Europe/London · 26 November 2026. **No USB. No Accept invent. No forged `cpuPrice`.**

## Status

| Item | State |
| --- | --- |
| Staging branch | `cursor/tempo-lfo-publish-a318` off `repeat98/modwerk` `main` |
| Module + fork-cite qual + catalog pin | **Staged** under `sdk/octatrack/modules/tempo-lfo/` |
| USB `.mwrm` / packages row | **Missing** — Keep tip `643b46c3…` / 724 B needs rebuild (no stock/m68k here) |
| `resources.cpuPrice` (`npm run device:price`) | **Missing** — mop255 cfmeter must not be relabeled |
| Owner first-release PR | **Not opened** |

See [`../STAGING.md`](../STAGING.md) for the resume checklist.

## Resume (Undo-only when unit free)

1. Rebuild/ship USB `.mwrm` (title-variant honesty vs Keep `643b46c3…` as #2193).
2. `npm run device:price -- --write … tempo-lfo` (MOP-274 TCP serve).
3. `modules:generate`; doctor; `modules:check -- --base upstream/main`.
4. Open PR to `repeat98/modwerk`. **Do not merge.**

## Cross links

- MT pattern: https://github.com/repeat98/modwerk/pull/2193
- Fork tip honesty: https://github.com/jonathanwardle1992-beep/modwerk/pull/239
- Keep: [`usb-hw-mop253-keep-2026-11-25.md`](usb-hw-mop253-keep-2026-11-25.md)
- Measured (not a price): [`otemu-cycles-mop255-2026-11-25.md`](otemu-cycles-mop255-2026-11-25.md)
