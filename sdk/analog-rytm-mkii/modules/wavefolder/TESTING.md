# Wavefolder testing

## Host: the module's own source

`src/wavefolder.c`, built for the host with the base's tables (`fx-tables.h`) and run as the base runs it: the send at 24 kHz in blocks of 16, lifted (`MW_FX_LIFT`), brought back to 48 kHz linearly. The harness is not in the repository: written for the author's eleven new send effects at once, it is kept on the author's computer with the MB24 test builds' sources, and can be shared on request.

- **The same samples on the ColdFire.** A hash of every output over 32 random settings of 64 blocks each is the same built for the host and built with m68k-elf GCC 16.2.0 (`-mcpu=54455 -O2`) and run on rytm-emu's ColdFire core (`cfbench`): `85fbcaa6` both.
- **Arithmetic.** 20,000 blocks of random settings, a new set every 97 blocks and every control at an end every 997, over noise, sines and square waves at +-65535 and silence, under `-fsanitize=undefined`: no overflow, no bad shift.
- **Idle.** A second of noise, then silence: the last half second holds no more than a few units (below -70 dBFS) at the defaults and at every control's top.

## Resources

Code and data: 2803 bytes of `.run` and `.bss` (m68k-elf GCC 16.2.0). Work area: none.

Load, on rytm-emu's ColdFire core alone (`cfbench`, instructions per `render`, the mean of 64 blocks of a drum loop at full send, five places), against CHORUS 0.1 at 2,644 on the same input: 1.03 at the defaults, 1.27 at its dearest settings. Instructions are not cycles: on the unit, the base's CPU reading on SEND FX is the measure. Not measured on a unit.

## Sound quality

Host renders only (a drum loop, a snare recording, a held chord): not judged on the unit.

## Stock flows

Not tested.

## rytm-emu

Test build MB08 (OS 1.74, sha256 1f29794a…): the Modwerk base with the send bus and the clock for send effects, this module and the other effects of its group, CHORUS, FLANGER and PHASER, Loop Sync 0.3.2 and Retrig Grid 0.2.0. It boots in rytm-emu 3c4c42c, the boot notice clears with NO, and over 8G instructions it draws the same frames and ends on the same screen as MB02. Storage layout 0x3a9157b2. The base's clock was checked on its own (a traced build): from PLAY its step follows the sequencer's master step, step for step, at 1x with the pattern's swing read. The SEND and SEND FX pages could not be reached in rytm-emu, so the effect was not heard there.

In rytm-emu 2ac0f1f (6 November 2026), build WF01 (the base's send-bus variant 0cdf0343 and this module's library package, sha256 `bdf7e776…`): the SEND page opens behind AMP on BD, and on the FX track the SRC key (DELAY there) switches between DELAY and SEND FX, which shows 04 WAVEFOLDER chosen with its controls ([media/capture.json](media/capture.json)). The sound is not modelled there.

## Unit

Evidence tier **author-hardware** for 0.1.0-experimental, source sha256 `6cc42991b690994f8bb4dacc4a72255dce8ae565f3d640a0ed56c822c53a073f` (sha256 over `build.json` then each `src/` file in name order, each as its path, a NUL, its bytes and a NUL).

Test build MB11, 30 October 2026, Analog Rytm MKII on OS 1.74 (sha256 3ed14a3d…): this effect with FREQ SHIFTER, REVERSE DELAY and RING MOD, CHORUS, FLANGER and PHASER, Loop Sync 0.3.2 and Retrig Grid 0.2.0, on the base with the send bus and the clock. As the author reported, that group holds "les meilleurs effets de toute la liste". Which steps of the sheet were run was not detailed; the CPU reading was not reported. MB11 built this source with id 10; the library's takes 4, the next free id on main's base, and nothing else differs.

## Library release (proposed, 6 November 2026)

The library's package (sha256 `3b5621c0…`) is compiled from this source in Modwerk's source-only container. That exact package has not run on a unit. The site builds a set holding WAVEFOLDER on the Modwerk base's send-bus variant, whose 32 KB work area this effect does not use.
