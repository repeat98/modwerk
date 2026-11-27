**A module or module update:** Experimental draft `sdk/drafts/cx-osc/`. Buchla-style complex oscillator on FLEX (signature CX,1): PLAYBACK PTCH/RATO/INDX/FINE/FOLD/MIX and SRC SETUP CAR/MOD/DEC/SYMM/FDBK/PWM. Port of Tim Hastie CX OSC at `256bcf4b` (octabam `modules/cxosc`). Registers through `runtime.json` on `ot_machines` with `SETUP_ALL`, `cx_ui_tick`, and native FLEX start; baked `standalone/*.s` for the package builder. Declared conflict with FM Synth in `octamod.module.json`; group-owned `compatibility.json` entry waits for catalog listing.

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

Validation:

- `npm run module:doctor -- --draft cx-osc` (experimental gate; cross-compat with synth expects catalog + relation next)
- `python3 -B sdk/drafts/cx-osc/test_cx_osc_port.py` (8 tests)
- `npm run check -- --part contract`
- `npm run modules:compat` (no inactive relation)
- `npm run device:price` / `device:test` on dev twin (evidence under `sdk/drafts/cx-osc/evidence/`)

Docs: none (BACKPORT-OCTABAM.md only).