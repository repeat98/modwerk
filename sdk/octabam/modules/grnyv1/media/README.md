# FRACT 0.10.0-experimental captures

Four LCD screenshots of FRACT 0.10.0-experimental (source
`57db580c9b880b224a5a8a6b2500272e96299d9e`, the package
`86aaa8dbcd32739ca72252dbc81a51d639b3990a11fd6e1af848929aae0eb442`),
captured on 2026-10-22 with `make media-capture` (`scripts/capture_media.py`)
in headless octemu (revision `3adc0a8e…`, binary SHA-256 `d821b5e2…`).

The Modwerk base draws FRACT's page through `module_tick` and
`module_draw`, which octemu does not offer. The image captured is FRACT's
UI probe build (SHA-256
`b868cb5339b65b6776374272815e06cfa84c9e0197b8e3a6db404b1cb5ae9aa3`): the
card build of this source with `og_ui` and `og_draw` called from the stock
UI tick and LCD flush instead, the same image `make ui-probe-check` runs.
Every pixel is the firmware's own 128x64 frame with FRACT's page composed
into it; nothing was drawn or relabelled. Each frame is enlarged six times
by nearest-neighbour duplication, lit pixels grey 240 and unlit grey 24, as
Modwerk's own captures are. The walk (every key, encoder turn and wait) and
the hashes are in [capture.json](capture.json).

| Capture | Shows | SHA-256 |
|---|---|---|
| `ot-location.png` | T1's FX2 SETUP right after choosing FRACT: FRACT selected in the list, PAN 0, SCAN 64, SRNG FULL and DENS 127 | `85088ebc9916ddd12b68af5784b3e421e16c1b5295cdd9871fcf42618a9752da` |
| `ot-setup.png` | The same page while DENS is turned to 95 | `e4fb7f1227594b4aed0d33d4b908d85e3ca578b48a3e88c5e1428e2fff7d2d5f` |
| `ot-main.png` | FRACT's FX2 main page, T1 playing, every control at its default, 8 s after PLAY | `3e405bd3a1c17869d2dc4cef38870931d5d0dd9e20fcbf410cf7c94fd019ba5e` |
| `ot-second.png` | T3's FX2 page after choosing FRACT there while T1 plays and has it: `FRACT ON T1` | `0cc53251f9bf6691346bb7d9f7407e7bcaf62927e0a5c2110777aeb27db0d475` |

The project is the private demo of `scripts/preview.py`: T1 is a Flex track
playing the project's original synthesized texture (`make demo`), stored on
the card as `SINE440.WAV`, which is the name the page shows. In this build
FRACT is second in the FX2 list; the Modwerk base lists it in its own FX2
list. A second run of the same walk produced byte-identical PNGs.

These are emulator captures: they show the page and its controls, not the
sound, and no hardware behaviour. Earlier captures (0.7.0 to 0.9.3, with
other control layouts) were removed from this folder in this version; they
remain in the repository's history (last at `b9e5225`).
