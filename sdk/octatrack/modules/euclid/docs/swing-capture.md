# Euclid track swing documentation capture

Captured on 6 October 2026 for documentation version 0.1.3-experimental.
The new screenshot shows **TRACK TRIG EDIT → SWING** on track 1, with the
actual firmware-rendered **SWING TR1:62** label and selected even-numbered
swing steps. Select the track, enable Grid Recording with REC, open the menu
with FUNC+BANK, select SWING using UP/DOWN, and turn LEVEL. Holding FUNC
while turning LEVEL changes every track's amount; Euclid reads the amount
and swing mask of the audio track it occupies.

The new PNG is an actual 128×64 LCD export at integer scale 6 (768×384),
using the original monochrome pixels. The image is the verified unmodified
stock 1.40C MAIN OS, SHA-256
`164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`.
This common stock menu configures the track settings followed by Euclid;
Euclid was not installed in the image used for this stock-menu screenshot.
The existing Euclid FX captures, native code, original test report,
untested hardware status and capture record remain unchanged. Editorial
validation compares the runtime inputs with approved commit
`cb1f0a16a41902fe874b8f307dd3d9065daf6eff`, version 0.1.2-experimental.

The capture ran in a disposable, read-only toolchain container with network
access disabled, no credentials, a writable private scratch workspace and
an empty scratch card. Source scripts were copied from the approved base;
no new native source was compiled. The tool removed its scratch card,
LCD/RAM planes and private logs. The temporary base image was removed after
capture. Only the selected PNG and this sanitized record are published.

Reproduction uses `scripts/capture-module-ui.py` with the full panel plan
below and a private stock image matching the recorded fingerprint:

```sh
python3 -B scripts/capture-module-ui.py \
  --emulator /opt/toolchain/emu-build/ot_emu \
  --image <private-stock-main-os> \
  --image-sha256 164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e \
  --plan <panel-plan.json> --output <new-private-capture-directory>
```

## Contributor declaration

Original framebuffer export: Modwerk contributors (headless capture),
produced for this owner-requested documentation update on 6 October 2026.
`LicenseRef-OT-UI-Documentation` covers the original capture/documentation
contribution for use in Modwerk module documentation. Underlying Octatrack
interface artwork, labels and other Elektron material retain their owners'
rights. This declaration grants no licence to that underlying material;
reuse-rights review remains part of publication review. The emulator's
upstream attribution is preserved in the SDK. See the original
[media declaration](../media/LICENSE.md).

## Capture and source identities

The first and last screenshots in the tool's record were inspected but are
not published; the retained track-swing screenshot hash is identified
separately under `publishedScreenshots`.

```json
{
  "firmware": "1.40C",
  "imageSha256": "164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e",
  "emulatorSha256": "f521565f3866947788d7c45507576a4ed386d2e4ef57e9683ab65fa0acc6a166",
  "setup": "Headless ot_emu; MKII panel; stopped transport; 128\u00d764 LCD at integer scale 6.",
  "palette": {
    "on": [
      240,
      240,
      240
    ],
    "off": [
      24,
      24,
      24
    ]
  },
  "keyMs": 150,
  "plan": [
    {
      "wait": 3000
    },
    {
      "press": [
        "YES"
      ]
    },
    {
      "wait": 2000
    },
    {
      "press": [
        "NO"
      ]
    },
    {
      "press": [
        "T1"
      ]
    },
    {
      "press": [
        "REC"
      ]
    },
    {
      "press": [
        "FUNC",
        "BANK"
      ]
    },
    {
      "capture": "ot-trig-edit.png"
    },
    {
      "press": [
        "DOWN"
      ]
    },
    {
      "press": [
        "DOWN"
      ]
    },
    {
      "encoder": {
        "name": "LEVEL",
        "delta": 12
      }
    },
    {
      "capture": "ot-swing-track.png"
    },
    {
      "hold": [
        "FUNC"
      ]
    },
    {
      "encoder": {
        "name": "LEVEL",
        "delta": 4
      }
    },
    {
      "capture": "ot-swing-all.png"
    },
    {
      "release": [
        "FUNC"
      ]
    }
  ],
  "screenshots": {
    "ot-trig-edit.png": "6202f8e2c4a72224d2d5c5d878dba260d08c2edb17744a42953f139b671afc84",
    "ot-swing-track.png": "2b075d2744fe1432dd0764fe1124a2c2ff56610eacf53808f2b339e3b8331535",
    "ot-swing-all.png": "d9c8987231fc935f52d28582fa6fcf0bd704d9b0de933fce4cb970152a4a9e09"
  },
  "captured": "2026-10-06",
  "moduleId": "euclid",
  "documentationVersion": "0.1.3-experimental",
  "imageProfile": "Verified unmodified stock 1.40C MAIN OS; no module runtime loaded. This stock menu edits the track swing inputs followed by Euclid.",
  "emulatorSource": "Locally reviewed octamod-tapehead-qualification-tools:local; /opt/toolchain/emu-build/ot_emu. No emulator was rebuilt for this documentation update.",
  "captureScriptSha256": "8122aa8d33ef7e709f81b1f3d94f3aaff7560cf59038b5fdeeae891cf279d397",
  "publishedScreenshots": {
    "media/ot-swing-track.png": "2b075d2744fe1432dd0764fe1124a2c2ff56610eacf53808f2b339e3b8331535"
  },
  "limitations": [
    "Stock-menu UI evidence only; Euclid timing behavior is described from unchanged module source and the retained 0.1.2-experimental record.",
    "Only ot-swing-track.png is published; the intermediate menu and all-track images were inspected and discarded.",
    "Empty scratch card; no samples or user projects; stopped transport; no hardware, audio or new native qualification."
  ],
  "nativeSourceFiles": {
    "control.s": "e9c7bb033d109922a606f2486fddd05f3c214d9c50f8008d02576d712e080b13",
    "control.h": "3b46d1ec81f83942c0303bbb146cbd3509cabd7e030c4ed1d6ff7304181bb7b2",
    "hooks.s": "00e12da65fe555fc9223c2716093e45591ed73cee9ddf1fb672b46affc953d6e",
    "manifest.py": "e43eac70260eda028417be31773b2cd3abf4bf60698ca5968704de3774d1f31a",
    "control.c": "d12f48f641555febc8f416a6eb15bbbb2d238b4a98c11b88e674cb7d6e203707",
    "generate_control.py": "64e711025c513d5c3c933dbecf73a95e1193bb9a7ab31a11ad28906246dbf6fd",
    "filter.asm": "b0fef9bfb99aabc67de2bd452feba6ae045603340b7d56405140d2afc3a0f35e"
  }
}
```
