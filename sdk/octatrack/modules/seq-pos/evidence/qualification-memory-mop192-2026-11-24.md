# Qualification memory measure (MOP-192, tip-only — mop176 §D)

Host tip after [MOP-191](qualification-owner-fill-mop191-2026-11-24.md)
owner fill (memory **null** → `tests.qualification` absent) and
[mop176 recipe](qualification-fill-recipe-mop176-2026-11-24.md) §D.
**Tip-only path** — no twin boot, no Accept, no lifecycle, no
`sdk/catalog.json` force-list. Keep tip24 confirmed
(`eb667962…` / inv 24 / Screen Off / Mute Modes). Undo `[]`.

## Why this note

mop191 filled cycles + QLR-shaped functional hardware in
[`qualification.example.json`](../qualification.example.json) and left
memory integers **null**, so the live manifest object stayed **absent**.
This dig counts the linked unit / USB tip remapper package and fills
those integers. It does **not** invent numbers and does **not** place
`tests.qualification` (mop176 §G — owner placement; toast still Open).

## Method (tip-only)

1. Keep tip24 poll (USB bridge 47811) — tip24 **true**; Accept none.
2. WSL `m68k-elf` rebuild via `sdk/runtime/loader/build.py --octabam seq-pos`
   (scratch copy under `sdk/octabam/modules/`, removed after build; stock
   check against local 1.40C). Output:
   `module f7bb3258, 336 bytes of code and data, 36 of bss, … 0 stock-code sites`.
3. Assemble `unit.s` with `--defsym MODWERK_EVENTS=1` (runtime.json path)
   and link with the loader’s `.image` / `.bss ALIGN(4)` script; `nm` for
   BSS symbol sizes.
4. Package header parse confirms image **336**, bss **36**, sites **0**,
   file **600** B, sha256
   `2c56e500043d3358615cf1455e077051d010d5958960900592cb8879caade8e7`
   (byte-identical to the mop189 peer used on USB digs).

## Measured integers (honest)

| Region | space | words | wordBits | bytes | scope |
| --- | --- | --- | --- | --- | --- |
| Authored ColdFire unit (code + toast strings, DRAM) | `sdram` | 336 | 8 | **336** | shared |
| Per-track `sp_pos_w` halfwords (8 tracks) | `sdram` | 8 | 16 | **16** | shared |
| Per-track `sp_en` (8) | `sdram` | 8 | 8 | **8** | shared |
| Per-track length words (8) | `sdram` | 8 | 8 | **8** | shared |
| `sp_dest_sink` halfword | `sdram` | 1 | 16 | **2** | shared |
| BSS `ALIGN(4)` pad after `sp_len` | `sdram` | 2 | 8 | **2** | shared |
| **Totals** | | | | **sharedBytes / totalBytes = 372** | maxInstances **1**, perInstanceBytes **0** |

BSS reconcile: authored `.space` 16+2+8+8 = 34 + pad 2 = **36** (= package
`bss`). Image + bss = 336+36 = **372**.

### Detours region — omitted (not invented zero)

Validator rejects `words`/`bytes` &lt; 1. Tip remapper USB package has
**sites = 0**: the manifest Detour at `0x400a2d6a` is unevented into the
base `ev_audio_step` remapper (mop167 Proven). Card Detour **6** B is
**not** in this tested USB image, so the mop176 “Detours / pokes”
candidate is omitted rather than filled with a zero. Disclosed in
`memory.conditions`.

### Space note vs mop176 candidates

mop176 §D listed likely `cpu-flash` / `cpu-ram`. Seq Pos `Linked(…, dram=True)`
loads in the DRAM arena — regions use **`sdram`** (same class as
apply-scene / output-matrix DRAM units), not ROM cave.

## What was updated

| Piece | Status |
| --- | --- |
| `qualification.example.json` memory | **Filled** — integers above; conditions cite package + nm |
| `resources.storage` | **372** bytes / method `static` |
| `octamod.module.json` `tests.qualification` | **Still absent** |
| Twin / Accept / catalog | **None** / **SHUT** |

## Remaining gates vs catalog SHUT (after this tip)

| Gate | Status |
| --- | --- |
| Tip-matched remapper + dual-install inventory | **Proven** (mop167) |
| Dual-install words-move peek | **Proven** (mop184) |
| Measured cycles / stress ≥60 s | **Filled (emulator)**; stress **62 s Proven REACHED** (mop181) |
| SETUP PMTR=SPOS monochrome | **Proven** (mop172) |
| Play Modes Detours → `runtime.json` | **Proven** (mop188/189; 0.1.1 `.mwrm` still Detours / `lagsBehind`) |
| FUNC+TRACK toast pages | **Open/miss** (mop175/185) |
| Memory integers | **Measured** (this sheet) |
| `tests.qualification` in manifest | **Still absent** — mop176 §G owner placement; toast Open |
| `sdk/catalog.json` | **Must stay absent** |

## What this tip does **not** claim

- That `tests.qualification` is in the manifest or publication-ready.
- That FUNC+TRACK toast pages are captured.
- That card Detour bytes are part of the USB tip remapper image.
- Any catalog pin / Accept / lifecycle.
- Chip wall-clock or hardware canaries (not measured).

## Artifacts (local / store)

- Package header + nm: Project store
  `media/mop192-spos-memory-qual/` (`package-header.json`,
  `link-symbols.json`, `unit.nm`, `00-keep-tip24.json`)
- Private rebuild dir:
  `modwerk-builds/mop192-spos-memory-qual/`

Hub: [MOP-192](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-memory-mop-192)
(parent [MOP-191](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-owner-fill-mop-191);
recipe [MOP-176](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-qualification-stub-fill-recipe-mop-176)).
