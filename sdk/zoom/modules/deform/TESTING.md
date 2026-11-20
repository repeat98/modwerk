# Deform 0.4.0 verification

Ziddle passed the loader check and rendered 22,050 stereo frames. The compiled file passed the stock-code scan and MS-70CDR size limits. Hardware untested. The display guard compares an aggregate checksum over the known OS locations.

Deform.ZDL, 17,806 bytes, Delay 417, header 0.04, SHA-256 `9d2daaaccf6808ab09e4c3b215007c052d86a25cedde6d90eee5503a0c904369`.

Built from [aee98c53](https://github.com/themanro/ZoomMultistompZDL/tree/aee98c53d7b568cbb55bb927aefbdc9b4e739f3e/src/custom/deform) with the own-runtime linker and TI C6000 8.5.0.LTS. The emulator rendered a half-second stereo signal at 44.1 kHz with the effect’s default controls. Hardware behavior, actual DSP load and patch recall are unmeasured.

The [build recipe and SHA-256 inventory](https://github.com/repeat98/ZoomMultistompZDL/tree/a0dd89a0f429b533563631cb1a58a518ddc98e4a) reproduce this release.
