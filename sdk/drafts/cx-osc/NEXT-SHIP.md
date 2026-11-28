# CX OSC: what is done and what listing still needs

Modwerk draft only (`sdk/octatrack/modules/cx-osc/`). Octabam backport is out of scope here (`BACKPORT-OCTABAM.md` stays separate).

## Done on this branch

| Area | Artifact |
|------|----------|
| Host | `test_cx_osc_port.py`, `test_cx_osc_load.py`, `verify.py` |
| Package | `npm run module:dev -- cx-osc --build-only` → SHA `f52815ad…`, 29,968 bytes |
| Unit smoke | `device:test` on dev twin `46c30886` (see `TESTING.md`) |
| Frame curve | `evidence/frame-cost.json` (first 18.3 %, each 0.1 %) |
| CPU price | 6 % machine-render in `octamod.module.json` + descriptor |
| Load stress | `scripts/cx-osc-device-stress.py`, `load-scenarios.json`, `LOAD-STRESS.md` |
| Stress evidence | `evidence/stress-hardware.json`, `evidence/stress-hardware-n456.json` |
| Configurator | `conflicts: ["synth"]`; `owner-compat-relation.json` ready for owner |
| PR draft | `pr-body-cx-osc.md` (CI draft #2293) |
| UI capture prep | `UI-CAPTURE.md`, `media/capture-plan-actions.json`, `capture-module-ui.py --boot-max` |

**Doctor (draft):** host tests, cpu price, frame cost, thumbnail, board claim ✓. Cross-compat with **synth** stays ✗ until catalog + owner relation.

## Your order of work (everything except octabam)

### A. Owner window (blocking catalog)

1. Open or refresh **draft PR #2293** on `repeat98/modwerk` (rebase, push, link CI in PR body).
2. Ask owner for a **Fix:** PR that pastes `owner-compat-relation.json` into `sdk/machines/octatrack/compatibility.json` **the same day** `cx-osc` hits `sdk/catalog.json` (never active without the relation).
3. **Build approval:** `sdk/approvals/cx-osc-build-approval.json` (first release; see `synth-build-approval.json`). Request waiver items you still lack: `chip-worst-case-cycles`, optional `complete-memory-bounds` (see `evidence/waiver-request.md`).

### B. ColdFire cycles and perf stamp (doctor ○ until listed)

1. Static bound or measured worst case for `sy_render` / `poly.s` path (`cfmeter` or owner waiver like FM Synth).
2. `npm run perf:audit -- check sdk/octatrack/modules/cx-osc/evidence/performance.json --stamp` after cycles are non-null.
3. Optional stock twin idle comparison for `stockLongestUs` / idle percents.

### C. UI captures (doctor + library)

1. **Hardware:** RAM-boot dev twin, trial CX, capture LCD over USB (see `UI-CAPTURE.md`). Bind `evidence/local-image.json`.
2. **Emulator (optional):** `ot_emu` needs `--boot-max 400000000` on Modwerk twins; first-boot STATIC track did not reach CX OSC in the panel plan (27 Nov). Use a disposable FLEX+CX project via `--card`/`--project-name` when available.
3. Commit reviewed PNGs, wire `tests.documentation.screenshots` and `media[]` in `octamod.module.json`.
4. USB: no `PLAYBACK` key; double-tap track for PLAYBACK, `FUNC+SRC` for SETUP (`LOAD-STRESS.md`).

### D. Qualification record

1. Fill `qualification.example.json` → copy into `octamod.module.json` `tests.qualification` via `npm run module:qualify -- cx-osc --procedure … --write` (after cycles + captures).
2. Bind hashes: `evidence/listing-prep.json`, `npm run module:qualify -- cx-osc --rehash`.
3. `evidence/hardware-report.json` is a prose source for the hardware block.

### E. Catalog move (one PR with packages)

Follow `CATALOG-SHIP.md` steps 3–12: move folder, `catalog.json`, `REQUESTED`, Docker `build-modules-isolated.sh`, `modules:import`, commit `public/octatrack-modules/cx-osc/0.1.0-experimental.mwrm`, `device:price --write-costs`, `module:doctor -- cx-osc` (no `--draft`), `modules:compat` with synth listed.

### F. Still manual on the unit (not blocking draft)

Listening pass, MIDI chromatic, Part/project save with CX, power-cycle after Keep, behaviour with other installed modules.

## After power cycle (your unit)

You do **not** need another reboot for USB work. Flash boots beta; run:

```bash
npm run device -- serve --share /tmp/modwerk-share.sock
python3 scripts/device-send.py "boot /Users/iliamurzinov/Documents/modwerk-dev-twin-cxosc 4096"
# serve restarts
```

## Quick commands

```bash
npm run module:doctor -- --draft cx-osc
python3 -B sdk/octatrack/modules/cx-osc/verify.py
MODWERK_QUALIFY_TIMEOUT=300 npm run device:cx-stress -- --arm-trigs --preset all --cpu-settle 15 …/cx-osc.mwrm
```