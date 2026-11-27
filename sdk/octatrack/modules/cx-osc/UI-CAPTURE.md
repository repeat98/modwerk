# CX OSC UI captures

Publication needs three LCD frames under `media/` (`MODULE_UI_CAPTURES.md`): machine list with **CX OSC** highlighted, SRC SETUP (CAR..PWM), and PLAYBACK (PTCH..MIX).

## Hardware (preferred)

After a power cycle, RAM-boot once (~15 s), then captures (~20 s):

```bash
MODWERK_DEV_SOCKET=/tmp/modwerk-dev.sock python3 scripts/device-send.py \
  "boot $HOME/Documents/modwerk-dev-twin-cxosc 4096"
# restart serve, then:
MODWERK_CAPTURE_STEP_TIMEOUT=90 python3 scripts/cx-osc-ui-capture.py \
  --package "$(npm run module:dev -- cx-osc --build-only 2>&1 | sed -n 's/^Built //p')" \
  --out sdk/octatrack/modules/cx-osc/media
```

Use **`/tmp/modwerk-dev.sock`** for scripts (not the share socket). USB has no `PLAYBACK` key; **double-tap T1** for PLAYBACK. Wire `octamod.module.json` `media[]` from `media/capture-hardware.json`.

## Emulator

Built `ot_emu` (`scripts/octatrack-emulator/build.py`) plus `scripts/capture-module-ui.py` and `media/capture-plan-actions.json`. Modwerk dev twins need a large ColdFire handoff budget:

```bash
python3 scripts/octatrack-emulator/build.py \
  --native ~/.cache/modwerk-upstream/octabam \
  --out /tmp/cx-osc-emu

python3 scripts/capture-module-ui.py \
  --emulator /tmp/cx-osc-emu/ot_emu \
  --image "$HOME/Documents/modwerk-dev-twin-cxosc/MAIN.raw" \
  --image-sha256 683999d97678d9d364ae8a08984791bf8df76c88bb082f2e9826c0501a2527e5 \
  --plan sdk/octatrack/modules/cx-osc/media/capture-plan-actions.json \
  --output /private/capture/cx-osc-ui \
  --key-ms 50 \
  --boot-max 400000000
```

**27 Nov 2026:** this path reached `ready` and ran the plan, but first-boot **T1 STATIC** routing never reached FLEX + **CX OSC** in the emulator (frames showed STATIC SRC / slot list). `media/capture.json` keeps the plan and emulator SHA for replay; do not wire PNGs into `octamod.module.json` until hardware or a disposable **FLEX+CX** fixture project loads before capture.

Optional: add `--card`, `--set-name`, `--project-name` when a reviewed stress project exists on the card.