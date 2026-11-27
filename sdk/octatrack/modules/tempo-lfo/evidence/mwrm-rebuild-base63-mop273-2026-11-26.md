# USB package rebuild against Base draft index 63 (MOP-273)

Europe/London · 26 November 2026. **No USB. No Accept invent. No forged `cpuPrice`.**

## Why a new image

Fork Keep tip package `643b46c3…` / 724 B was built against the fork base
(`ot_lfo_pmtr_dest` index **31**). Upstream draft uses index **63**, so the
hook/reloc layout differs. A title-variant of the Keep tip is not a valid
upstream ship image.

## Rebuild (this host)

```text
python3 -B sdk/runtime/loader/build.py \
  --octabam tempo-lfo --name "TEMPO LFO" \
  --upstream ~/.cache/modwerk-upstream/elekloader \
  -o tempo-lfo.mwrm
```

Tree: Tempo staging merged with Base draft `cursor/ot-lfo-pmtr-dest-base-a318`
@ `9cd7428c4` for the event, then the `.mwrm` copied onto
`cursor/tempo-lfo-publish-a318` alone.

| Field | Value |
| --- | --- |
| Path | `public/octatrack-modules/tempo-lfo/0.1.0-experimental.mwrm` |
| Bytes | 852 |
| sha256 | `654530b1accbaa058768f36cc17f1e541680d31d0187d4f46191de2eb8751c96` |
| module id | `038b0514` |
| Build report | 476 B code/data, 24 B bss, 11 relocations, 1 hooks, 0 stock sites |

## Honesty

- Fork Keep / reboot / audible cites (mop252–254) still describe **behaviour on
  the fork tip package**, not this upstream rebuild.
- Listing still needs Undo-only `npm run device:price` on **this** image (or a
  later tip-matched rebuild), then owner first-release PR. **Do not invent
  `cpuPrice`.**
- Dest lea remains deferred on the Base draft; contribute + SETUP path are what
  this package exercises until lea lands with FM Synth migrate.
