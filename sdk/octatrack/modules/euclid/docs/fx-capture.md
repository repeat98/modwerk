# Euclid FX documentation captures

Captured on 6 October 2026 for documentation version 0.1.3-experimental.
The original 1 October FX PNGs used a yellow LCD palette. They and their
original capture record are preserved unchanged as historical evidence.
Current documentation uses these newly captured monochrome FX pages,
with separate paths and provenance. There is still only one swing capture.

The native Euclid files and reviewed shared build code are unchanged from
approved main commit `cb1f0a16a41902fe874b8f307dd3d9065daf6eff`.
Only the documentation publication version changed. A temporary copy of
those sources was built in a disposable, network-disabled, read-only
`octamod-tapehead-qualification-tools:local` container with no credentials
and a private writable scratch workspace. No pending module source was
included. No native qualification, audio, hardware, stress or parity gate
was run. The original [TESTING.md](../TESTING.md) remains unchanged.

The build used the native `Remix` and `build_bus.main()` composition oracle:
FX2 has NONE and EUCLID; FX1 has its normal ten stock effects. The usual
omitted-reverb donor region holds Euclid's authored DSP code; no stock
reverb chooser row is claimed for this capture profile. Euclid was assigned
with panel keys and confirmed with YES before the pages were exported.
Both reviewed PNGs show the real controls and no error popup. Original
128×64 LCD pixels are preserved at integer scale 6 (768×384), using the
renderer palette of gray 24 and 240.

The base image was the locally verified stock 1.40C MAIN OS, SHA-256
`164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`.
Its private build and scratch data were deleted after retaining these PNGs
and sanitized identities. This UI capture does not qualify a hardware or
firmware release and does not relabel the original measurement evidence.

## Reproduction

Create the recorded `Remix` from the image profile below with
`static_stock=False` and `fallback=NO_FALLBACK`. Set
`registry.PLATFORM_NAMES=()` and supply that profile to
`registry.remix`, then call the reviewed `build_bus.main()` under the
recorded build environment. Use a copied stock image matching the base
fingerprint. Run `scripts/capture-module-ui.py` with the resulting private
MAIN OS, recorded image hash, reviewed emulator, and panel plan below:

```sh
python3 -B scripts/capture-module-ui.py \
  --emulator /opt/toolchain/emu-build/ot_emu \
  --image <private-euclid-main-os> \
  --image-sha256 0186288f6fa4059fec7df0d1f1b9aec0ce67a79d7ed201dcf7ad37457edced0f \
  --plan <panel-plan.json> --output <new-private-capture-directory>
```

## Contributor declaration

Original framebuffer exports: Modwerk contributors (headless capture),
produced for this owner-requested documentation update on 6 October 2026.
`LicenseRef-OT-UI-Documentation` covers the original capture/documentation
contribution for use in Modwerk module documentation. Underlying Octatrack
interface artwork, labels and other Elektron material retain their owners'
rights; this declaration grants no licence to the underlying material.
Reuse-rights review remains part of publication review. Emulator source
attribution remains in the SDK. See the original
[media declaration](../media/LICENSE.md).

## Capture and source identities

```json
{
  "firmware": "1.40C",
  "imageSha256": "0186288f6fa4059fec7df0d1f1b9aec0ce67a79d7ed201dcf7ad37457edced0f",
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
        "FUNC",
        "FX2"
      ]
    },
    {
      "encoder": {
        "name": "LEVEL",
        "delta": -20
      }
    },
    {
      "encoder": {
        "name": "LEVEL",
        "delta": 1
      }
    },
    {
      "press": [
        "YES"
      ]
    },
    {
      "capture": "ot-setup-monochrome.png"
    },
    {
      "press": [
        "FX2"
      ]
    },
    {
      "capture": "ot-controls-monochrome.png"
    }
  ],
  "screenshots": {
    "ot-setup-monochrome.png": "5aee5a72240520b8846dc532dadfff4e6da98521fd59b5e289917ddabe5d8233",
    "ot-controls-monochrome.png": "cefad4ef4bed6a280e4eae9da6ddb274cd92049373bcdc6642a1b5045bb729cf"
  },
  "builderSha256": "f923fbb0d3e5d42722c794864f066bc1a053aa0f2a91d4c7bd37c040bdc13fe8",
  "nativeProfile": [
    "EUCLID"
  ],
  "captured": "2026-10-06",
  "documentationVersion": "0.1.3-experimental",
  "sourceCommit": "cb1f0a16a41902fe874b8f307dd3d9065daf6eff",
  "nativeSourceFiles": {
    "control.s": "e9c7bb033d109922a606f2486fddd05f3c214d9c50f8008d02576d712e080b13",
    "control.h": "3b46d1ec81f83942c0303bbb146cbd3509cabd7e030c4ed1d6ff7304181bb7b2",
    "hooks.s": "00e12da65fe555fc9223c2716093e45591ed73cee9ddf1fb672b46affc953d6e",
    "manifest.py": "e43eac70260eda028417be31773b2cd3abf4bf60698ca5968704de3774d1f31a",
    "control.c": "d12f48f641555febc8f416a6eb15bbbb2d238b4a98c11b88e674cb7d6e203707",
    "generate_control.py": "64e711025c513d5c3c933dbecf73a95e1193bb9a7ab31a11ad28906246dbf6fd",
    "filter.asm": "b0fef9bfb99aabc67de2bd452feba6ae045603340b7d56405140d2afc3a0f35e"
  },
  "buildEnvironment": {
    "REMIX": "euclid-documentation",
    "XBUS": "1",
    "SPEC": "1",
    "DEV": "0",
    "BUILD": "79",
    "OCTABAM_STATIC_STOCK": "0",
    "OCTABAM_NO_CACHE": "1"
  },
  "imageProfile": {
    "fx2": [
      "NONE",
      "EUCLID"
    ],
    "fx1": [
      "NONE",
      "FILTER",
      "EQUALIZER",
      "DJ EQ",
      "PHASER",
      "FLANGER",
      "CHORUS",
      "SPATIALIZER",
      "COMB FILTER",
      "COMPRESSOR",
      "LO-FI"
    ],
    "staticStock": false,
    "fallback": "NONE",
    "platformNames": []
  }
}
```
