# Phaser testing

## Host: the same samples as Send FX

`phaser.c` against Send FX 45baa516's PHASER (`send-fx.c`, built for the host with its state reset first): 20,000 blocks of random input and random settings, every block identical. The run is not in this repository; its sources are in the pull request.

## rytm-emu

Test build MB02 (OS 1.74, sha256 c693e8c1…): the Modwerk base with the send bus, this module, the two other send effects, Loop Sync 0.3.2 and Retrig Grid. It boots and the interface runs. The SEND and SEND FX pages could not be reached in rytm-emu 3c4c42c (MD07 behaves the same), so nothing on them was seen.

## Unit

Evidence tier **author-hardware** for 0.1.0-experimental, source sha256 `dac6cfa2ce99c4e40acea936dbe0ea1b1207dc0b7285d8573c1e998f9d90bef5` (sha256 over `build.json` then each `src/` file in name order, each as its path, a NUL, its bytes and a NUL).

Test build MB02, 29 October 2026, Analog Rytm MKII on OS 1.74, as the author reported: "tout marche". The sound was the same as MD07's Send FX, the SEND and SEND FX pages worked, p-locks worked, and everything came back after a power cycle. Which steps of the sheet were run was not detailed; the CPU reading was not reported.

## Resources

Code and data: 1703 bytes (m68k-elf GCC 16.2.0). Work area: none, from the base's shared pool. Load: not measured.

## Sound quality

Not tested.

## Stock flows

Not tested.
