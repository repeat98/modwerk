# SPOS toast tip wire (MOP-195) — builders + module_key/enc

Host tip after [mop194](usb-toasts-alt-stall-mop194-2026-11-24.md) source
stall. **Tip wire only** — no twin boot, no Accept, no lifecycle, no
`sdk/catalog.json` force-list. Do **not** invent a USB toast pass.

## Verdict

| Question | Answer |
| --- | --- |
| Port `sp_level` / `sp_off` into tip `unit.s`? | **Yes** (from archive `unit.full.s`) |
| `sp_toast` BSS in tip unit? | **Yes** |
| USB `module_key` / `module_enc`? | **Yes** — `sp_module_key` / `sp_module_enc` in `runtime.json` (trig-prob TRACK+LEVEL pattern; no private Detour) |
| Tip-built nm shows toast symbols? | **Yes** |
| USB FUNC+TRACK toast pages Proven? | Re-proved [mop196](usb-toasts-prove-mop196-2026-11-25.md) |
| Catalog / Accept | **SHUT** / **none** |

## What landed

1. `unit.s`: `sp_level` (`Tn SPOS nn`) + `sp_off` (`Tn SPOS OFF`) +
   `NOTIFY 0x4005a2b8`; held state `sp_held_track` / `sp_func_held`.
2. `sp_module_key`: tracks FUNC (`0x2d`) + TRACK (`0x10..0x17`); takes
   FUNC+TRACK+NO → `sp_off`.
3. `sp_module_enc`: takes LEVEL encoder (`6`) while FUNC+TRACK held →
   `sp_level`.
4. `runtime.json`: subscribe `module_key` → `sp_module_key`,
   `module_enc` → `sp_module_enc` (keeps `ev_audio_step` order 50).

## Rebuild / nm (tip-only)

| Check | Result |
| --- | --- |
| `m68k-*-as -mcpu=54455 --defsym MODWERK_EVENTS=1 unit.s` | OK |
| nm `sp_level` / `sp_off` / `sp_toast` / `sp_module_key` / `sp_module_enc` | **present** |
| Linked tip package (ABI 8, unevented sites) | image **848** + bss **60** = **908** sharedBytes; file **1172** B |
| Package sha256 | `5c1b28d9c38f78e54aade10a8b217d38432807257769e11bdccf1cba9181d1c8` |
| Hooks | `module_key` @ `0x268`, `module_enc` @ `0x2f0` (offsets in image) |
| Prior mop192 package | image **336** + bss **36** = **372** (pre-toast-wire) |

## Remaining gates vs catalog SHUT

| Gate | Status |
| --- | --- |
| Tip toast builders + `module_key`/`module_enc` | **Landed** (this tip) |
| FUNC+TRACK toast USB pages / publication PNGs | Re-proved [mop196](usb-toasts-prove-mop196-2026-11-25.md) |
| Memory integers | **Re-counted tip-only** — **908** after toast wire (was mop192 **372**) |
| `tests.qualification` in manifest | **Absent** (mop176 §G placement) |
| `sdk/catalog.json` | **Must stay absent** / **SHUT** |

## What this tip does **not** claim

- Any Accept / lifecycle / catalog pin (USB prove is mop196, not this tip).
- That mop175/185 miss frames are toast evidence.

## Artifacts

- Store media: `media/mop195-spos-toast-wire/` (`unit.nm`,
  `package-header.json`, `seq-pos.mwrm`)
- Hub: [MOP-195](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-toast-tip-wire-mop-195)
