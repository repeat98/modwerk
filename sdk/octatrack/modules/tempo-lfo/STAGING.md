# Tempo LFO — upstream first-release staging (MOP-273)

WIP branch `cursor/tempo-lfo-publish-a318` off `repeat98/modwerk` `main`.
**Do not open the owner first-release PR until every gate below is green.**
**Do not invent Accept / Proven / `cpuPrice` / a fake `.mwrm`.**

Mirror: [Micro Timing #2193](https://github.com/repeat98/modwerk/pull/2193).

## Hard prerequisites (upstream)

### 1. Base table `ot_lfo_pmtr_dest` is **absent** on `repeat98/main`

Fork has the LFO PMTR extension table; upstream does not. Package build fails:

`A subscription names an event or table of sdk/machines/octatrack/events.json … ot_lfo_pmtr_dest`

| Fact | Detail |
| --- | --- |
| Fork scaffold | commit `141322f42` — Base: scaffold ot_lfo_pmtr_dest |
| Fork event index | **31** |
| Upstream index 31 | already **`ot_midi_generators`** (max index **62**) |
| Port implication | Additive base PR must remap to a free index (≥63) and update generated loader/SDK headers — **not** a blind fork copy; **not** inside the module first-release PR |

Until that base PR merges, Tempo LFO cannot ship as a contribute USB package on upstream.

### 2. `resources.cpuPrice` via Undo-only `npm run device:price`

Same gate as Seq Pos (MOP-249). mop255 cfmeter is **not** a price.

### 3. USB `.mwrm`

Keep tip `643b46c3…` / 724 B. Needs base event + m68k-elf + Elekloader (partially prepared on this host) or Jon private rebuild.

## Done on this branch

- [x] Module at `sdk/octatrack/modules/tempo-lfo/` (from fork mop257 tip)
- [x] Catalog pin `{ id: tempo-lfo, version: 0.1.0-experimental }`
- [x] Community changelog + `changelog/2026-11-26-tempo-lfo-catalog.md`
- [x] Qual cites retained; `sourceSha256` rehashed for this tree
- [x] Honesty: no forged `cpuPrice`
- [x] Elekloader upstream tools fetched; m68k-linux-gnu symlinked as m68k-elf-* (build blocked on missing base event)

## Resume order

1. **Owner/base:** port `ot_lfo_pmtr_dest` onto current upstream (new free index; separate Base PR).
2. Rebuild USB `.mwrm` against that base; add packages row.
3. Undo-only `device:price --write` for tempo-lfo (MOP-274 TCP serve).
4. `modules:generate`; doctor; `modules:check -- --base upstream/main`.
5. Open owner first-release PR to `repeat98:main`. **Do not merge.**
