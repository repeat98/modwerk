# Model:Cycles: the Modwerk base from core-mc 0.3 — 23 November 2026

The first Modwerk base for Model:Cycles OS 1.13, as this pull request vendors it: **dee352df**
(`sdk/machines/model-cycles/base-binding.json`), built by `npm run machine:base -- model-cycles` with the reviewed
toolchain (m68k-elf GCC 16.2.0, binutils 2.47) against the kit at `3b31ef3`. It is core-mc 0.3's source from Elekloader
v0.11.0, unchanged, with eight handlers per hook instead of four; nothing subscribes yet.

- **Package:** compared field by field with the release `core-mc-0.3.elemod` (`e214e171…`): equal except the
  collections. 76 bytes `.boot`, 180 `.run`, 16 `.bss`, 5 sites.
- **Image:** linked with the kit-pinned Elekloader patcher (`elekloader.patch`, checkout from `npm run upstream:tools`)
  on the stock `model-cycles_OS1.13.syx` (`44fe5862…`): `101129e0…`, 976,800 bytes, flash ends at `0x0dc260`; MAIN OS
  `d77d24cb…`. All five hook tables empty, 261,908 bytes of the shared DDR area left.
- **Emulator** (digiemu, macOS app; not hardware evidence): the image boots, a project loads, a pattern on all six
  tracks plays, knobs turn and the PUNCH, GATE, LFO and MACHINES pages open as with stock 1.13. After quitting and
  starting again with the same image it boots again. Nothing off noted.
- **On a unit** (the submitter's Model:Cycles, flashed with this image as an OS update, then a power cycle): it boots
  normally and behaves as with stock 1.13. Nothing off noted.
- **Not run on this build:** a module subscribed to a hook (none exists yet), recovery with the stock `.syx` after this
  image.
