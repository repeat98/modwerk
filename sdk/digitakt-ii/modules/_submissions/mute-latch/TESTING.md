# Mute Latch testing

Nothing here was run on a unit. Everything below is emulator evidence: digikit's headless ColdFire-only `panel_drive` (no DSP) with the SSI clock at 96 kHz, a one-sample card made with digikit's `plusdrive`, and a 128-step pattern. It approximates the instrument; the emulator is not Modwerk's.

## Build under test

- Stock: `Digitakt_II_OS1.17.syx`, SHA-256 `26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5`.
- Image: elekloader's `python -m elekloader.patch` with `core-1.0.elemod` (SHA-256 `95303655a9358f581b485acb68b884b394a577f5d0b373f0a3e5957c8d0ca72c`) and this module's `.elemod` built from `src/main.c` with GCC 13.3 `m68k-linux-gnu` (not the project's pinned GCC 16 `m68k-elf`), version string `2.0b`; image SHA-256 `e50d7a00bdc6e0896ee6695a651a96c6604da3287fa8a329a646b84aab938cb4`. The linker reported no overlaps.
- Count of executions comes from `panel_drive --count` on the stock routines `0x40068b96` (a track's mute toggles) and `0x4006de70` (applies a PREP MUTES choice).

## Observed (stock OS 1.17, emulator)

- Mute Mode is entered with FUNC+TRK. In it, holding FUNC and pressing TRIG keys shows "PREP MUTES" with the chosen tracks; letting go of FUNC applies the choice at once (2 toggles for 2 tracks). There is no setting to turn on.
- With FUNC held, PERFORM is the stock **Tap tempo**: it opens a "Tap tempo 1/4" view over PREP MUTES. A first version of the module polled PERFORM and never saw its view on top, so it did nothing; the module now takes the PERFORM key event instead.
- Step position `0x43164fe0` + track rises by 1 per step (about 16.5 M instructions) and wraps to 0 after the last step; playing flag `0x43164f94` is 1 while playing; pattern pointer `0x4316501c`.
- The view on top of the stack is read as the module assumes: Brain `0x44f5de40`, last node `0x450d0b00`, object `0x450b0750` with vtable `0x401f8a18`; its choice mask at +`0x88` (5 for tracks 1 and 3) and session flag at +`0x8d` (1 while FUNC is held).

## Observed with the module linked in (emulator)

- Both tick handlers run (477 calls in a 300 M instruction run); the image boots, plays and shows its normal screens.
- Playing, Mute Mode, FUNC held, TRIG 1 and 3, then PERFORM: the screen stays "PREP MUTES" (no Tap tempo), the choice mask reads 0, and after letting go of FUNC and PERFORM there were 0 toggles after 100 M instructions.
- Mutes switch at the wrap: with the master position at 98, 119 and 124, still 0 toggles; at the next sample (position 1) 2 toggles and 1 apply.
- PERFORM again with nothing chosen cancels: 0 toggles after a full pass (2.3 G instructions).
- Playing, no PERFORM: 2 toggles at the release of FUNC, as the stock OS.
- Stopped, with PERFORM: Tap tempo opens as in stock and 2 toggles at the release of FUNC.
- PERFORM alone with the pattern playing: normal screen, no toggles.

## Not tested

- A unit: every behaviour in the README, audio, reboot and a power cycle.
- The project's pinned toolchain build, memory and load.
- Scale per track, a pattern change while tracks are parked, a second PREP MUTES session started while tracks are still parked, and holding TRIG keys after PERFORM.
- Whether the "PREP MUTES" screen should keep showing the parked tracks: after PERFORM the squares show no choice, because the stock mask is cleared.
- The stock flows with and without the module beyond those listed above; DSP-coupled emulation.

## Build with PERFORM, MUTES ARMED and LEDs (emulator only)

Run on the Digitakt II emulator (ColdFire only, SSI clock), image linked from core 1.0 and this module with Elekloader:
- Playing, Mute Mode, FUNC held, TRIG 1 and 3, PERFORM: header "MUTES ARMED", stays after releasing FUNC; 0 toggles at release.
- LED arrays after release: TRIG 1 and 3 hold 0x11 on layer 2, the same value PREP MUTES gives chosen tracks; other TRIG LEDs 0x21.
- After the pattern wrap: 2 toggles, 1 apply, LEDs back to normal.
- Not tested: whether the LEDs blink exactly like stock on a unit, PERFORM's stock sub-function behaviour, anything on hardware.
