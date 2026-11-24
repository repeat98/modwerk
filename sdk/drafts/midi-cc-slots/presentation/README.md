# Midi Mode 2 presentation draft

`COPY.md` contains the proposed module-page copy, controls and reviewed screenshot captions. `thumbnail.svg` is original vector artwork in CC Map’s dark-grid, lilac routing-diagram style, following the shared module thumbnail guide. Its example numbers describe assignments, not measured output or device pixels. The artwork is covered by the draft’s MIT licence.

The [five-image emulator walkthrough](../media/README.md) now supplies the actual screen images. Its captures are separate from the illustration and carry their own provenance/rights declaration. This is presentation work only: no catalogue entry, runtime ID change, native rebuild or site publication. Keep `midi-cc-slots` as the installed ID when adopting the display name so the current installation remains addressable.

## Emulator capture

The user chose emulator screenshots. The existing reviewed local ot_emu ran the private 0.0.4-experimental draft image on its MKII panel. The shared `scripts/capture-module-ui.py` tool applied only front-panel keys, encoder movements and waits to a disposable empty card, with transport stopped. It exported the actual 128×64 LCD and popup pixels at integer scale 6 in two grayscale colors. No labels were redrawn and no RAM values were injected to manufacture a screen.

The walkthrough shows native PB/AT in SETUP, CC0/CC127 assignments, enabled values 64/32 on CONTROL 1, numeric headers 71–76 with values OFF on CONTROL 2, then PB restored while B keeps CC127. All five images were visually reviewed against their captions.

`../media/capture.json` records the exact panel plan, renderer/emulator/image/source hashes, runtime-package binding, screenshot hashes and reviewed media descriptions. Its image hash matches the existing private runtime reconstruction proof, and slots.s matches the build receipt. Capture used the existing native image; no firmware code or package bytes changed for this presentation name.

To reproduce, save the `plan` array from that record to a private JSON file and use the reviewed emulator and matching private image:

```sh
python3 -B scripts/capture-module-ui.py \
  --emulator /absolute/private/ot_emu \
  --image /absolute/private/candidate.private.bin \
  --image-sha256 c00ddf1ca5e6abca8efca968c4b33a38b2149701ca5bb0574d9b2fb3bd818404 \
  --key-ms 50 --plan /absolute/private/panel-plan.json \
  --output /absolute/private/new-capture-directory
```

On macOS, the emulator needs shared-memory access. Capture failure without that access is a host execution constraint, not evidence of a module failure. See [Module UI captures](../../../../docs/MODULE_UI_CAPTURES.md) for the capture/provenance contract and physical-device alternatives. These images illustrate controls; they do not establish physical hardware behavior, MIDI receiver response, saved projects or release qualification. Catalogue registration remains the next stage.
