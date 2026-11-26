# Tempo LFO — upstream first-release staging (MOP-273)

WIP branch `cursor/tempo-lfo-publish-a318` off `repeat98/modwerk` `main`.
**Do not open the owner first-release PR until every gate below is green.**
**Do not invent Accept / Proven / `cpuPrice` / a fake `.mwrm`.**

Mirror: [Micro Timing #2193](https://github.com/repeat98/modwerk/pull/2193).

## Done on this branch

- [x] Module at `sdk/octatrack/modules/tempo-lfo/` (from fork mop257 tip)
- [x] Catalog pin `{ id: tempo-lfo, version: 0.1.0-experimental }`
- [x] Community changelog + `changelog/2026-11-26-tempo-lfo-catalog.md`
- [x] `tests.qualification` retained (Keep/measured cites); `sourceSha256` rehashed for this tree
- [x] Honesty: no forged `resources.cpuPrice`

## Still required before PR

1. **USB `.mwrm`** — Keep tip package `643b46c3…` / 724 B (mop253). Rebuild with
   `build.py --octabam tempo-lfo --name "Tempo LFO"` (or title-variant match like #2193),
   place at `public/octatrack-modules/tempo-lfo/0.1.0-experimental.mwrm`, add
   `octatrack-module-packages.json` usbOnly row. Cloud tip has no stock OS / m68k
   toolchain — needs self-hosted / Jon private `modwerk-builds`.
2. **`resources.cpuPrice`** — Undo-only  
   `npm run device:price -- --write --base <id> --scene <text> tempo-lfo`  
   (MOP-274 TCP serve tip). Write `evidence/cpu-price.json`. **No Accept.**
3. **`modules:generate`** + doctor + `modules:check -- --base upstream/main`.
4. Open owner first-release PR to `repeat98:main`. **Do not merge.**

## Cite-only (already Proven on fork — do not re-invent)

| Gate | Cite |
| --- | --- |
| Keep Accept + reboot | mop253 / mop254 — package `643b46c3…` |
| Measured 624 + load/stress | mop255 |
| Qual place + fork pin | mop257 / fork #224 |
