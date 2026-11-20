# Spool 1.2.0 verification

Ziddle passed the loader check and rendered 22,050 stereo frames. The compiled file passed the stock-code scan and MS-70CDR size limits. Hardware untested.

Spool.ZDL, 16,010 bytes, Delay 914, header 1.02, SHA-256 `18c7cfc2494453074a0c4e68ee27706c3f46b37673b55a725c1ce1aa7a5f88dc`.

Built from [aee98c53](https://github.com/themanro/ZoomMultistompZDL/tree/aee98c53d7b568cbb55bb927aefbdc9b4e739f3e/src/airwindows/tapeecho4) with the own-runtime linker and TI C6000 8.5.0.LTS. The emulator rendered a half-second stereo signal at 44.1 kHz with the effect’s default controls. Hardware behavior, actual DSP load and patch recall are unmeasured.

The [build recipe and SHA-256 inventory](https://github.com/repeat98/ZoomMultistompZDL/tree/a0dd89a0f429b533563631cb1a58a518ddc98e4a) reproduce this release.
