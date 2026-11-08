# ctrl-in-perf

Port of rytm-mods-src `mods/0017-ctrl-in-perf` (MrScruff), at
[`cd4ded4`](https://github.com/Iced-Cream/rytm-mods-src/tree/cd4ded4a8fc5eabd4bddb824696196202db50ef8/mods/0017-ctrl-in-perf),
status "built" there: every check passed in the emulator, never run on a unit.

rytm-mods-src targets OS 1.73. This module is for OS 1.74 on core-ar2 0.7, so every stock address
was moved to its OS 1.74 place, and two of the original's three hooks are gone.

## Changes from rytm-mods

- **No audio-interrupt detour.** The original detoured the audio interrupt right after
  `adc_pedal_update` (OS 1.73 0x40120e9e). Here the same code runs from the core's `ev_render_in`,
  which the core calls at the audio interrupt's entry (0x4011fb6e), before `adc_pedal_update`
  (called at 0x40120f00 on OS 1.74) and before stock's lock loop (0x40120fc8). It reads the port
  value the previous block left, so the macro follows the jack one block (0.67 ms) later than in
  the original, and stock's lock loop still applies it in the same block it is written.
- **PERF DEST in mod storage.** The original kept it device-wide in the persisted gap at 0x405c8e84
  under its own tag. Here each port's PERF DEST is a 4-bit core-ar2 mod storage field in global
  scope, so it belongs to the globals slot and is saved with the project's globals, as Silent
  Pad+Trig's settings are. A project saved without the module, or a new project, reads OFF.
- **MODE from the settings, on the tick.** The original read each port's MODE from the engine's
  port records in the interrupt. Here `ev_tick` reads it through stock's settings getter
  (0x400fa7e4, as Control In Actions does) and caches it with PERF DEST for the audio block.
- **The menu site** is the original's, moved to OS 1.74: where ControlInputConfig's rebuild
  converges (OS 1.73 0x40131962, OS 1.74 0x40131b2e), 6 bytes, `jmp ctrl_in_perf_menu`. Its code
  is the original's.
- **The probe build is gone.** It hard-wired a mapping for emulator tests; rytm-emu tests poke the
  converter's result words instead.
