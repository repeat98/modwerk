**A module or module update:** Experimental draft `sdk/drafts/cx-osc/`. Buchla-style complex oscillator on FLEX (signature CX,1): PLAYBACK PTCH/RATO/INDX/FINE/FOLD/MIX and SRC SETUP CAR/MOD/DEC/SYMM/FDBK/PWM. Port of Tim Hastie CX OSC at `256bcf4b` (octabam `modules/cxosc`). Registers through `runtime.json` on `ot_machines` with `SETUP_ALL`, `cx_ui_tick`, and native FLEX start; baked `standalone/*.s` for the package builder. Declared conflict with FM Synth in `octamod.module.json`; group-owned `compatibility.json` entry waits for catalog listing.

**Base (same PR):** `machine_registry.c` `counts()` now patches the second `pea` at `0x40079248` so SELECT MACHINE TYPE visible rows match `min(6, 5+n)`. Stock left viewport height at 6 while row count stayed 5, which drew a blank sixth line until CX OSC was trialed. Regenerate the RAM dev twin after merge (`npm run octatrack:base -- --stock … --beta --out …` then RAM boot). Host gate: `test_machine_registry` (`visible_now`).

**Version:** `0.1.0-experimental` (draft, not in `sdk/catalog.json`; share via branch and `npm run module:dev -- cx-osc`).

**Attribution:** upstream Tim Hastie (LICENSE-TIM in `upstream/cxosc/`); pins in `sdk/imports/cx-osc-256bcf4.json`.

**Guide gaps:** nothing; backport notes in `sdk/drafts/cx-osc/BACKPORT-OCTABAM.md`.

**Tested on a unit:** base `46c30886a7e8f3f6`, MKII OS 1.40C, RAM-booted dev twin of base `0.8.2`, 27 Nov 2026, package SHA-256 `f52815adb0d5cdb0f1926c519f8319ce4527f1adcc52313d502023fb306065ad`.

Edge cases

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| FM Synth + CX OSC same set | Shared engine hook sites | `octamod` conflicts + manual install | pass: configurator declares conflict; not run together |
| Machine pick beside synth hooks | LFO depth site `0x40003ca4` shared with synth | `npm run module:doctor -- --draft cx-osc` after staging | pass: only one of synth/cx staged for doctor; ox abstain until catalog relation |
| CX OSC on 3+ tracks CPU FULL | Instance curve first 2.1 % but heavy render | `device:test` all-at-once T1–T8 | pass: T4–T8 refused, trial rolled back, no crash |
| SRC SETUP FDBK encoder E | Needs `SETUP_ALL` machine flag | USB trial + author panel | pass: FDBK moves (TESTING.md) |
| Part dirty after pricing | Curve edits pattern | `savepart` + `device:test` | pass: preflight ready, test passed |

Load stress (27 Nov 2026): `npm run device:cx-stress -- --arm-trigs --preset all` → `evidence/stress-hardware.json`; morph_zero 1–3 and morph_heavy 1–2 pass readback; ~3 hot CX instances per Part before CPU FULL on pick. Rerun n=4–6 in `stress-hardware-n456.json`.

Validation:

- `test_machine_registry` (host binary under `sdk/machines/octatrack/elekloader/`, `visible_now` after the viewport poke)
- `npm run module:doctor -- --draft cx-osc` (experimental gate; cross-compat with synth expects catalog + relation next)
- `python3 -B sdk/drafts/cx-osc/verify.py`
- `npm run check -- --part contract`
- `npm run modules:compat` (no inactive relation)
- `npm run device:price` / `device:test` / `device:cx-stress` on dev twin (`sdk/drafts/cx-osc/evidence/`)
- UI capture plan + `capture-module-ui.py --boot-max` (`sdk/drafts/cx-osc/UI-CAPTURE.md`); reviewed PNGs still open

Listing follow-up (not this draft’s scope): `NEXT-SHIP.md`.

Docs: none (BACKPORT-OCTABAM.md only).