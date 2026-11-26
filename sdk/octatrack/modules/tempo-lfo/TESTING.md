# Tempo LFO testing

### MOP-204 tip scaffold

Parked draft under `sdk/octabam/modules/tempo-lfo/`: contribute `ot_lfo_pmtr_dest`
**TEMPO** index **39**, order **100**, `after_store` → `tm_on_store` →
`PROJECT_BPM24` (`0x8000181c`). Hub note in
[`docs/OCTATRACK_LFO_PMTR_EXTENSION.md`](../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md).
Peer conflict lists + `drafts:park-check` updated. **No USB / Accept /
catalog force-list** in the scaffold tip. Do not invent Proven.

## Commands and exact revision

```sh
python3 sdk/octabam/modules/tempo-lfo/fill_guards.py --os ~/.cache/modwerk-native/section_3_MAIN_OS.bin
npm run drafts:park-check
# static cycles (MOP-213)
m68k-linux-gnu-as -mcpu=54455 -o /tmp/tempo-lfo.o sdk/octabam/modules/tempo-lfo/unit.s
m68k-linux-gnu-objdump -d /tmp/tempo-lfo.o
# (optional, local with Elekloader + OS)
# npm run module:doctor -- tempo-lfo
```

`verify.py` only prints readiness notes; it is not a behavioural gate.

## Hardware and audio quality

### MOP-205 USB smoke — SETUP TEMPO + BPM24/words (25 Nov 2026 Europe/London)

Keep tip24. Twin `775d9322…`. Private tip-matched package
`643b46c3…` + coexist MWMS (PROB…TEMPO). Undo only. **No Accept.**

| Gate | Result |
| --- | --- |
| Dial max | **39** |
| SETUP PMTR → TEMPO | **39** |
| Dest `wordsPtr` / `afterStore` | live |
| PLAY `tm_bpm_w` T1 high unique | **16** (`0…63`) |
| PLAY `PROJECT_BPM24` unique | **25** (`720…3912` ≈ 30…163 BPM) |
| Undo | **`[]`** |
| Catalog / Proven / WAV | **SHUT** / not claimed |

Evidence: [`evidence/usb-smoke-mop205-2026-11-25.md`](evidence/usb-smoke-mop205-2026-11-25.md).
Fixture note: first PLAY-only pass was flat unique=1; mop184-shaped
LFO-page max + mid-PLAY wiggle moved words/BPM. `holdTrial` emptied
inventory mid-dig — leave trial active until Undo leave.

### MOP-213 tip publish gates — static cycles + qual hooks (25 Nov 2026)

No USB / Accept. Catalog **SHUT**.

| Gate | Result |
| --- | --- |
| `cycles.static` | **624** (39 authored ×16; `tm_on_store` 25 + `tm_map_bpm24` 14) |
| `cycles.measured` / load / stress | **Filled later** — see [MOP-255](#mop-255-measured-cycles--load--stress-25-nov-2026) |
| `tests.qualification` | **Absent** — recipe hooked; place still Open |
| Proven / WAV / catalog | not claimed / **SHUT** |

Evidence:
[`evidence/usb-cycles-static-mop213-2026-11-25.md`](evidence/usb-cycles-static-mop213-2026-11-25.md),
[`evidence/cycles-performance-plan-mop213-2026-11-25.md`](evidence/cycles-performance-plan-mop213-2026-11-25.md),
[`evidence/qualification-fill-recipe-mop213-2026-11-25.md`](evidence/qualification-fill-recipe-mop213-2026-11-25.md),
[`evidence/catalog-gate-mop213-2026-11-25.md`](evidence/catalog-gate-mop213-2026-11-25.md).
Hub: [MOP-213](../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#tempo-lfo-tip-publish-gates-mop-213).

### MOP-226 catalog-gate honesty (25 Nov 2026)

Tip-docs only. No USB / Accept. Restates that USB smoke PASS + static
**624** + qual hooks do **not** open the catalog — measured / WAV /
`tests.qualification` place / pin still **SHUT**. Do not invent Proven.

Evidence:
[`evidence/catalog-gate-mop226-2026-11-25.md`](evidence/catalog-gate-mop226-2026-11-25.md).
Hub: [MOP-226](../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#tempo-lfo-catalog-gate-honesty-mop-226).
Current stamp: [MOP-250](#mop-250-audible--keep-tip-25-nov-2026).

### MOP-250 audible + Keep tip (25 Nov 2026)

Tip-docs only. No USB dig claimed. No Accept. Catalog **SHUT**. Index
**39** locked. Audible Keep-safe Undo protocol + Keep Accept protocol
(Jon auth only) tip-ready. Do not invent Proven / WAV / Keep.

| Gate | Result |
| --- | --- |
| Audible WAV fixture tip | Ready — [`next-audible-fixture-mop250-2026-11-25.md`](evidence/next-audible-fixture-mop250-2026-11-25.md) |
| Keep Accept protocol tip | Ready under Jon auth — [`protocol-mop250-keep-usb-2026-11-25.md`](evidence/protocol-mop250-keep-usb-2026-11-25.md); AFK must **not** `device_keep` |
| USB audible / Keep this tip | **Not run** |
| Catalog / Proven | **SHUT** / not claimed |

Evidence:
[`evidence/publishability-gates-hub-mop250-2026-11-25.md`](evidence/publishability-gates-hub-mop250-2026-11-25.md),
[`evidence/catalog-gate-mop250-2026-11-25.md`](evidence/catalog-gate-mop250-2026-11-25.md).
Hub: [MOP-250](../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#tempo-lfo-audible-and-keep-tip-mop-250).

### MOP-255 measured cycles / load / stress (25 Nov 2026)

Private ot_emu dig after mop254. Catalog **SHUT**. No Accept.

| Gate | Result |
| --- | --- |
| `cycles.measured` | **624** (matches static; high 0/64/127) |
| OOR early exit | authored **9** → **144** |
| cfmeter load stock/module | longest ISR **287.8 / 287.8** µs |
| ≥60 s stress | REACHED; hangs **0**; dropped **0** |
| Budget | **4790** (peer 10% frame cite) |

Evidence:
[`evidence/otemu-cycles-mop255-2026-11-25.md`](evidence/otemu-cycles-mop255-2026-11-25.md),
[`evidence/performance.json`](evidence/performance.json).

### MOP-256 qualification tip honesty (25 Nov 2026)

Tip-docs only. No place of `tests.qualification`. No catalog pin.
A–G audited; place **blocked** on owner review (G). **Ask Jon** before
any `sdk/catalog.json` pin.

| Gate | Result |
| --- | --- |
| Example cycles stub | Filled — worstCase **624**; budget **4790** |
| `tests.qualification` in manifest | **Absent** |
| Catalog / pin | **SHUT** |

Evidence:
[`evidence/qualification-gate-mop256-2026-11-25.md`](evidence/qualification-gate-mop256-2026-11-25.md),
[`evidence/catalog-gate-mop256-2026-11-25.md`](evidence/catalog-gate-mop256-2026-11-25.md).

### Still open (not claimed)

1. Place `tests.qualification` + **Jon owner review (G)**.
2. Catalog pin — **ask Jon**; never AFK force-list.
3. SETUP LCD glyph OCR for the TEMPO label (panel PNG retained; not OCR'd).
4. Hardware functional checks as qualification report (cite prior only until place).

Catalog remains **SHUT**.

## Not tested

- MIDI LFO / MIDI clock interaction while TEMPO is driven
- Coexistence with TSPD on the same remix (conflict-listed until base
  table + `modules:compat`)
- Catalog pin / `tests.qualification` place / OCR Proven

### MOP-257 qualification place + catalog pin (25 Nov 2026)

Jon AUTHORIZES owner review (G) + catalog pin. `tests.qualification`
**Placed**; `sdk/catalog.json` **PINNED**; promoted to
`sdk/octabam/modules/tempo-lfo/`.

| Gate | Result |
| --- | --- |
| Place | **PASS** — cycles **624** / budget **4790** / bss **24** |
| Catalog pin | **PINNED** (fork) |
| Accept invent | none |

Evidence:
[`evidence/qualification-place-mop257-2026-11-25.md`](evidence/qualification-place-mop257-2026-11-25.md),
[`evidence/catalog-pin-mop257-2026-11-25.md`](evidence/catalog-pin-mop257-2026-11-25.md).

### MOP-273 upstream first-release blocked on `cpuPrice` (26 Nov 2026)

Tip-docs only. **No USB. No Accept.** Intended mirror of Micro Timing
[#2193](https://github.com/repeat98/modwerk/pull/2193) to `repeat98/modwerk`
`resources.cpuPrice` **measured** Undo-only 2026-11-26: value **0** on
shipped `654530b1…` / 852 B (`evidence/cpu-price.json`). mop255 cfmeter
is **not** a price. Base PR [#2261](https://github.com/repeat98/modwerk/pull/2261)
open (index **63**; lea deferred); do not merge Base here.

**Shipped vs Keep package:** hardware/qual cites bind Keep tip
`643b46c3…` / 724 B (fork base index 31). Staged upstream USB package is
`654530b1…` / 852 B / module `038b0514` (offline rebuild vs Base draft
index 63). The earlier Keep run does **not** cover the shipped digest —
after `device:price`, run `device:qualify` (or re-Accept) on the priced
tip-matched image and rebind `imageSha256`. See
[`evidence/mwrm-rebuild-base63-mop273-2026-11-26.md`](evidence/mwrm-rebuild-base63-mop273-2026-11-26.md).

| Gate | Result |
| --- | --- |
| Fork pin / Keep / qual / cycles | **PASS** (cite mop253–257; Keep `643b46c3…`) |
| Staged upstream `.mwrm` | `654530b1…` / 852 B — **not** covered by Keep |
| Base `ot_lfo_pmtr_dest` on upstream | **Draft** on fork (PR held); not on `main` |
| `resources.cpuPrice` | **0** — Undo-only `device:price` 2026-11-26 on `654530b1…` (`evidence/cpu-price.json`) |
| Upstream listing PR | **Ready to open** (Keep cites remain fork tip; shipped digest priced) |
| Accept invent | none |

Evidence:
[`evidence/upstream-first-release-blocked-cpu-price-mop273-2026-11-26.md`](evidence/upstream-first-release-blocked-cpu-price-mop273-2026-11-26.md),
[`STAGING.md`](STAGING.md).
