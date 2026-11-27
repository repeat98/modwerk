# SPOS sp_len USB init tip wire (MOP-202)

Host tip after [mop201](usb-jump-colour-open-mop201-2026-11-25.md) USB dig
peeked `sp_len[0]=0` (BSS never got init default 16) → `sp_map` `.follow`
stock → WAV C≈D. **Tip wire only** — no twin boot, no Accept, no lifecycle,
no `sdk/catalog.json` force-list. Do **not** invent jump-colour Proven.

## Verdict

| Question | Answer |
| --- | --- |
| Wire honest USB init for `sp_len` default 16? | **Yes** — `.data` defaults (trig-prob pattern) |
| Keep `sp_dest_audio_init`? | **Yes** (still resets every len to 16) |
| Site-event subscribe for init? | **None exists** — USB has no place hook; `.data` is the honest equivalent |
| Arm-path ensure when len still 0? | **Yes** — `sp_on_store` + `sp_level` |
| Remapper / dual-install hooks changed? | **No** — `ev_audio_step` order 50 + contribute order 80 + `module_key`/`module_enc` unchanged |
| Tip nm / package show `sp_len` in data = 16×8? | **Yes** |
| Jump-colour Proven? | **No** — still **Open** until USB re-prove after this tip |
| Catalog / Accept | **SHUT** / **none** |

## What landed

1. `unit.s`: move `sp_len[8]` from `.bss` into `.data` with eight bytes of
   **16** (USB image load carries the default; BSS zeros no longer wipe it).
2. `sp_on_store` / `sp_level`: when enabling a track, if `sp_len[t]==0`,
   set **16** (ColdFire: register immediate → indexed store).
3. `sp_dest_audio_init` unchanged (still clears pos/en and writes len=16).
4. `runtime.json`: **unchanged** — no init site-event to subscribe
   (mop201 root cause named the missing subscribe; this tip uses equivalent
   honest init).

## Rebuild / nm (tip-only)

| Check | Result |
| --- | --- |
| `m68k-*-as -mcpu=54455 --defsym MODWERK_EVENTS=1 unit.s` | OK |
| nm `sp_len` | **D** (data), not B |
| Linked tip package (ABI 8, unevented sites) | image **892** + bss **52** = **944** sharedBytes; file **1224** B |
| Package sha256 | `97de37e698ac88a7f2ad921462e18b7adf6c3fe92b590656d1bfe32c907ce222` |
| Image bytes at `sp_len` | `[16,16,16,16,16,16,16,16]` |
| Prior mop195 package | image **848** + bss **60** = **908** |

## Remaining gates vs catalog SHUT

| Gate | Status |
| --- | --- |
| Tip `sp_len` default 16 on USB image | **Landed** (this tip) |
| Jump-colour under address mode | Still **Open** — USB must re-prove after this tip (mop201 `sp_len=0` closed as root cause; colour still unproven) |
| Tip remapper / dual / words-move / toast / qual | Unchanged **Proven** / **Placed** |
| Memory integers | **Re-counted tip-only** — **944** (mop195 **908** lineage) |
| `sdk/catalog.json` | **Must stay absent** / **SHUT** |

## What this tip does **not** claim

- Jump-colour Proven / catalog pin / Accept / lifecycle.
- That mop201 C≈D would have passed with len=16 (USB twin re-prove only).
- Any change to remapper order or dual-install inventory.

## Artifacts

- Store media: `media/mop202-spos-sp-len-init/` (`unit.nm`,
  `package-header.json`, `seq-pos.mwrm`)
- Hub: [MOP-202](../../../../docs/OCTATRACK_LFO_PMTR_EXTENSION.md#spos-sp-len-usb-init-tip-mop-202)
