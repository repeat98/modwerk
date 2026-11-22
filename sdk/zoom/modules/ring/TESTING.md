# Ring 0.3.0 verification

Ziddle passed the loader check and rendered 22,050 stereo frames. The compiled file passed the stock-code scan and MS-70CDR size limits. Hardware untested. The display guard compares an aggregate checksum over the known OS locations.

Ring.ZDL, 11,502 bytes, Delay 415, header 0.03, SHA-256 `7be0ab44802cad6e3ebe08f94c23c51e0dcafc4e0ccaaf9ce596b336ad2d094c`.

Built from [aee98c53](https://github.com/themanro/ZoomMultistompZDL/tree/aee98c53d7b568cbb55bb927aefbdc9b4e739f3e/src/custom/ring) with the own-runtime linker and TI C6000 8.5.0.LTS. The emulator rendered a half-second stereo signal at 44.1 kHz with the effect’s default controls. Hardware behavior, actual DSP load and patch recall are unmeasured.

The [build recipe and SHA-256 inventory](https://github.com/repeat98/ZoomMultistompZDL/tree/a0dd89a0f429b533563631cb1a58a518ddc98e4a) reproduce this release.
