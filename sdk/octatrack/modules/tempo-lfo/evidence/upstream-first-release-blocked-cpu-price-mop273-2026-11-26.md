# Upstream first-release blockers (MOP-273)

Europe/London · 26 November 2026. **No USB. No Accept invent. No forged `cpuPrice`.**

## Blockers (ordered)

1. **Base:** draft `cursor/ot-lfo-pmtr-dest-base-a318` @ `9cd7428c4` (fork) ports `ot_lfo_pmtr_dest` at index **63**; PR to `repeat98` held for Jon. Dest lea still deferred (FM Synth overlap). Not merged → contribute packages still need that event on `main`.
2. **`resources.cpuPrice`:** Undo-only `npm run device:price` on the staged upstream `.mwrm` (`654530b1…` / 852 B). mop255 cfmeter must not be relabeled. No unit this turn.
3. **USB `.mwrm`:** Offline rebuild staged (see [`mwrm-rebuild-base63-mop273-2026-11-26.md`](mwrm-rebuild-base63-mop273-2026-11-26.md)). Fork Keep `643b46c3…` is not this image.

## Staging

Branch `cursor/tempo-lfo-publish-a318` holds the module tree + catalog pin + packages row.
See [`../STAGING.md`](../STAGING.md).

## Cross links

- MT pattern: https://github.com/repeat98/modwerk/pull/2193
- Fork tip honesty: https://github.com/jonathanwardle1992-beep/modwerk/pull/239
- Base draft (fork): https://github.com/jonathanwardle1992-beep/modwerk/tree/cursor/ot-lfo-pmtr-dest-base-a318
- Fork base scaffold: `141322f42`
