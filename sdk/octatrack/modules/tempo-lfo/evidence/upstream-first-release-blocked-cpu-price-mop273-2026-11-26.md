# Upstream first-release blockers (MOP-273)

Europe/London · 26 November 2026. **No USB. No Accept invent. No forged `cpuPrice`.**

## Blockers (ordered)

1. **Base:** `ot_lfo_pmtr_dest` missing on `repeat98/main`. Fork index 31 collides with upstream `ot_midi_generators`. Needs separate Base PR with remapped free index — not a module-release fold-in.
2. **`resources.cpuPrice`:** Undo-only `npm run device:price` (mop255 cfmeter must not be relabeled).
3. **USB `.mwrm`:** Keep tip `643b46c3…` / 724 B after base lands.

## Staging

Branch `cursor/tempo-lfo-publish-a318` holds the module tree + catalog pin.
See [`../STAGING.md`](../STAGING.md).

## Cross links

- MT pattern: https://github.com/repeat98/modwerk/pull/2193
- Fork tip honesty: https://github.com/jonathanwardle1992-beep/modwerk/pull/239
- Fork base scaffold: `141322f42`
