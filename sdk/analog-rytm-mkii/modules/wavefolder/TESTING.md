# Wavefolder testing

## Host: the module's own source

`src/wavefolder.c`, built for the host with the base's tables (`fx-tables.h`) and run as the base runs it: the send at 24 kHz in blocks of 16, lifted (`MW_FX_LIFT`), brought back to 48 kHz linearly. The harness is in the pull request.

- **The same samples on the ColdFire.** A hash of every output over 32 random settings of 64 blocks each is the same built for the host and built with m68k-elf GCC 16.2.0 (`-mcpu=54455 -O2`) and run on rytm-emu's ColdFire core (`cfbench`): `85fbcaa6` both.
- **Arithmetic.** 20,000 blocks of random settings, a new set every 97 blocks and every control at an end every 997, over noise, sines and square waves at +-65535 and silence, under `-fsanitize=undefined`: no overflow, no bad shift.
- **Idle.** A second of noise, then silence: the last half second holds no more than a few units (below -70 dBFS) at the defaults and at every control's top, but for what FDBK or the repeats still play.

## Resources

Code and data: 2803 bytes of `.run` and `.bss` (m68k-elf GCC 16.2.0). Work area: none.

Load, on rytm-emu's ColdFire core alone (`cfbench`, instructions per `render`, the mean of 64 blocks of a drum loop at full send, five places), against CHORUS 0.1 at 2,644 on the same input: 1.03 at the defaults, 1.27 at its dearest settings. Instructions are not cycles: on the unit, the base's CPU reading on SEND FX is the measure. Not measured on a unit.

## Sound quality

Host renders only (a drum loop, a snare recording, a held chord): not judged on the unit.

## Stock flows

Not tested.

## rytm-emu

Test build MB08 (OS 1.74, sha256 1f29794a…): the Modwerk base with the send bus and the clock for send effects, this module and the other effects of its group, CHORUS, FLANGER and PHASER, Loop Sync 0.3.2 and Retrig Grid 0.2.0. It boots in rytm-emu 3c4c42c, the boot notice clears with NO, and over 8G instructions it draws the same frames and ends on the same screen as MB02. Storage layout 0x3a9157b2. The base's clock was checked on its own (a traced build): from PLAY its step follows the sequencer's master step, step for step, at 1x with the pattern's swing read. The SEND and SEND FX pages could not be reached in rytm-emu, so the effect was not heard there.

## Unit

Not tested yet.
