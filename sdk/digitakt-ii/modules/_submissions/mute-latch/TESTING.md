# Mute Latch testing

Build under test: none. No image was built, flashed or run.

## What was done

- `src/main.c` passes `clang --target=m68k -ffreestanding -fsyntax-only -Wall -Wextra` with no warnings. It was not compiled with the project's pinned m68k-elf toolchain.
- The stock locations in `build.json` (`1.17` defsyms) were read from the owner's `Digitakt_II_OS1.17.syx` (SHA-256 `26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5`) by static disassembly only.

## Observed in an emulator (ColdFire only, stock OS 1.17)

Build under test: the stock `Digitakt_II_OS1.17.syx` above, run unmodified in digikit's ColdFire-only `panel_drive` (no DSP, one-sample card made with digikit's `plusdrive`), with the module's source **not** linked in. This reads the stock OS only. It is emulator evidence, not hardware evidence, and digikit's emulator is not Modwerk's.

- Boot: the main UI is up at 834 M instructions; PLAY (key 20) only takes effect after about 1.5 G instructions, then `0x43164f94` reads 1 (0 before PLAY).
- Step position: `0x43164fe0` + track (16 bytes) are equal on every track in the run, rise by 1 per step (about 16.5 M instructions) and wrap to 0 after the pattern's last step (observed `126, 127, 0, 1` in the generated project's 128-step pattern). They start at 0 on the first PLAY. `0x43164ff0` + track counts the six ticks inside a step.
- Pattern: `0x4316501c` held `0x41776cb8`; the master length word at +`0x1db74` and the track length word at +`0x48c` both read 128.
- PREP MUTES view: its constructor ran once at boot (one instance, as the module assumes).
- Stock mute toggle: with the permanent mute mode off, FUNC held and two TRIG presses called the toggle routine `0x40068b96` twice and never reached the PREP MUTES view's key handler. The PREP MUTES path therefore needs the permanent mute mode, which was **not** enabled in this run.
- View stack: the Brain getter returned `0x44f5de40`. Its list at +`0x40` is a circular list whose header is at +`0x54`; the last node's payload held an object whose first word is a vtable address (`0x40216f14`), as `top_object()` assumes. The object's identity was not compared with the PREP MUTES vtable.

## Not tested

- Build with the pinned toolchain, link into a Digitakt II image, memory and load.
- Emulator: whether PREP MUTES is the view on top while FUNC is held (needs the permanent mute mode), whether the session flag and mask offsets are as read, that clearing the mask stops the stock mute on FUNC release, that `0x4006de70` applies the parked set, and whether FUNC+TEMPO has a stock function.
- The module's own code in an emulator: it was never linked into an image.
- A unit: every behaviour in the README, the pattern-change and Scale-per-track cases, and a power cycle.
- Parameter locks, scenes and project save/load: the module keeps no project data.
