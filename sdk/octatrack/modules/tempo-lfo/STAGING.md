# Tempo LFO — upstream first-release staging (MOP-273)

WIP branch `cursor/tempo-lfo-publish-a318` off `repeat98/modwerk` `main`.
**Do not open the owner first-release PR until every gate below is green.**
**Do not invent Accept / Proven / `cpuPrice` / a fake `.mwrm`.**

Mirror: [Micro Timing #2193](https://github.com/repeat98/modwerk/pull/2193).

## Hard prerequisites (upstream)

### 1. Base table `ot_lfo_pmtr_dest`

| Fact | Detail |
| --- | --- |
| Fork scaffold | commit `141322f42` |
| Fork event index | **31** (collides with upstream `ot_midi_generators`) |
| Upstream draft | branch `cursor/ot-lfo-pmtr-dest-base-a318` @ `9cd7428c4` on fork — index **63**; formatter/count/beq/store claimed |
| Dest lea | **Deferred** in that draft (published FM Synth still overlaps `0x4000d03e`); full dest resolve needs companion migrate + lea claim |
| PR to `repeat98` | **Held** for Jon authorize (MOP-274 for-review); elemod unchanged until OS rebuild |

Until that Base PR merges (and lea lands with FM Synth migrate), Tempo cannot ship a full contribute USB package that resolves destinations on upstream.

### 2. `resources.cpuPrice` via Undo-only `npm run device:price`

**Done** 2026-11-26 DESKTOP: value **0** (% of frame; at rest frame +0, cpu +0) on mwrm `654530b1…` / 852 B. mop255 cfmeter is not a price. See `evidence/cpu-price.json`.

### 3. USB `.mwrm`

Offline rebuild against Base draft index **63** staged:
`public/octatrack-modules/tempo-lfo/0.1.0-experimental.mwrm`
(`654530b1…` / 852 B, module `038b0514`). **Not** the fork Keep tip
`643b46c3…` / 724 B (different base hook index). See
`evidence/mwrm-rebuild-base63-mop273-2026-11-26.md`.

## Done on this branch

- [x] Module at `sdk/octatrack/modules/tempo-lfo/` (from fork mop257 tip)
- [x] Catalog pin `{ id: tempo-lfo, version: 0.1.0-experimental }`
- [x] Community changelog + `changelog/2026-11-26-tempo-lfo-catalog.md`
- [x] Qual cites retained; `sourceSha256` rehashed for this tree
- [x] Honesty: no forged `cpuPrice`
- [x] Base draft prepared separately (index 63; PR held)
- [x] USB `.mwrm` row (upstream rebuild vs Base draft — needs `device:price`)
- [x] Measured `resources.cpuPrice` = **0** (Undo-only `device:price` 2026-11-26; `evidence/cpu-price.json`; honest at-rest +0)
- [ ] Upstream listing PR

## Resume order

1. Jon authorizes → open Base PR from `cursor/ot-lfo-pmtr-dest-base-a318` → `repeat98:main` (do not merge).
2. Follow-up: FM Synth `po_lfo3b` → `0x4000d03a` + claim dest lea + owner OS base rebuild; rebuild `.mwrm` if hook layout moves.
3. Undo-only `device:price --write` for tempo-lfo on the staged image (or tip-matched rebuild).
4. `modules:generate`; doctor; `modules:check -- --base upstream/main`.
5. Open owner first-release PR to `repeat98:main`. **Do not merge.**
