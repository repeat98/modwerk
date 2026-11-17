# Analog Rytm MKI SDK

**Platform:** elemod · **OS:** 1.74 · **Core:** Modwerk's MKI base, from elekloader core-ar2 0.7's source at the MKI's addresses · **Modules:** [`sdk/analog-rytm-mki/modules/`](../../analog-rytm-mki/modules/) · **Status:** research

The Analog Rytm MKI runs the MKII's code base on the same ColdFire family: its OS is the MKII's C++ compiled separately, so routines sit at other addresses, often at a constant distance over long runs, and its data structures are mostly the same. Its base is the MKII base's plain variant ([elekloader/](elekloader/README.md)): core-ar2 0.7's source with the MKI's sites and addresses, and MKI copies of four core-ar2 files. So the [MKII guide](../analog-rytm-mkii/README.md)'s core hooks, parameter pages, mod machines and mod storage apply here as written, at the MKI's addresses; the core's contract is [core-profile/interface.json](../../analog-rytm-mki/core-profile/interface.json). The research, the evidence for every address and the unit runs are in [the MKI research report](../../../docs/RYTM_MKI_OS_RESEARCH.md).

## Modwerk stack

The MKI follows the [machine recipe](../../../docs/MACHINE_RECIPE.md) on its own Modwerk base: the MKII base's plain variant built for the MKI, which passed on a unit (8 November 2026), with a send-bus variant in progress. Mods reach the unit as a full OS file sent with Transfer. The site's builder, the USB link, loading without a reflash and the machine page come after an Elekloader kit that knows the MKI is pinned.

## What differs from the MKII

- **Files.** ELE2, not ELE3: one packed section after a 0x14-byte header and the load address, no table and no seal. Elekloader reads and writes it since [elekloader/elekloader#351](https://github.com/elekloader/elekloader/pull/351) (merged 13 November 2026, not yet in a release); until a kit with it is pinned, the base and modules build only with a privately registered device, and the site cannot build the MKI.
- **Screen.** 122 x 32 pixels, not 128 x 64: in `ev_draw`, y counts up from 0 to 31. A page keeps stock's layout: the title box on the left (x 0-51), the eight knobs in two rows on the right.
- **Keys.** The same key ids as the MKII for the keys both have. The MKI has no PLAY MODE key: stock's kit reload (FX settings included) is NO + KIT (the key rytm-emu names FX).
- **Encoders.** Stock steps a value once per encoder count; a module that waits for two counts a step, as some MKII code does, turns at half speed.
- **Pages.** 11 stock pages (0..10, not 0..11); the page key's views are numbered as on the MKII (CORE_VIEW_LFO is 4, CORE_VIEW_DELAY 5).
- **Project.** The active kit is at project + 232 (the MKII's + 352); the stored project lives in the MKI's persistent memory at 0x20000000.
- **Audio.** The voices reach the CPU in a ring of 10-word frames (the eight voices in voice order, then AUDIO IN L/R), not the MKII's fixed 12-word buffer; MAIN L/R are not in it.
- **Protected.** The main OS's copy of the bootstrap (0x4028C768-0x402A1B84 with its version) and the OS entry's version compare (0x40000592-0x400005D8) are never changed: they are the recovery path.
- **Flash.** The container must end below 0x780000, where the calibration records start.

## Match stock's knobs

A mod's controls should look and turn exactly as stock's do (FUNC, push + turn, speed, widget). On the MKI, every
parameter id has a record in RAM (88 bytes an id, from `0x416a6aa4`) that decides it: the turn's fine step (+4),
the coarse step while the encoder is pushed (+8) and the knob's drawing (+48, +52: a dial, a fader, a bipolar dial, a
list). Most records step 0x100 a count and 0x800 pushed, but records differ (LFO DEP, delay X), and sends and levels
draw as faders. A stock page turns a knob through its record, then core-ar2 hands the result to the mod (core_params'
delta, in 8.8).

- Put a mod's controls on a stock parameter page (core_pages, core_page_fns, core_params) rather than drawing a page
  of its own, so stock turns and draws them.
- Give each control a record that behaves as the stock parameter it stands for: a send as AMP's DEL, a level as a
  VOL, a feedback as the delay's FDB.
- An effect's or knob's own speed tables, ported from the MKII, will feel wrong here: stock steps once a count.

## Audio block notes

- The voices reach the CPU in a ring of 10-word frames: the eight voices in voice order (BD BT SD LT HH MT CY RS's
  voices), then AUDIO IN L/R, each negated as stock's sends read them. MAIN L/R are not in it.
- Stock's send routine builds the delay's and the reverb's inputs from the voices and then runs both itself (the
  delay's output is mixed into the reverb's input in between); anything added to their inputs must go in between,
  not after the routine.
- A voice's delay or reverb gain is (send x 256)^2 / 2 at the centre pan, / 2^31.
- The FX track's smoothed values sit 0xdc bytes before the effective parameter array, as on the MKII.
- rytm-emu makes no sound for the MKI's analog voices: level and audio checks need the unit.

## Create a mod

Port an MKII module, or start one with:

```sh
npm run module:new -- my-mod --machine analog-rytm-mki --author your-github-login
```

A module carries what an MKII module carries ([MKII guide](../analog-rytm-mkii/README.md#create-a-mod)): `tests.documentation` with rytm-emu screenshots at 122 x 32 and their capture record, its release notes in `src/community/module-changelogs/analog-rytm-mki-<id>.json`, and its source-only package once the kit builds the MKI. A port of an MKII module keeps its author and code, and gets its own include (`include/ar2-1.74.inc`, the MKI's addresses for the symbols the source uses) and its own site guards; ask the author first.

## Memory and budgets

- **Shared mod memory:** 128 KiB of DDR (`0x47BE0000–0x47C00000`) for the core and every mod, as on the MKII. A canary over `0x47B00000–0x47F00000` read back intact on a unit (MW02, 8 November 2026).
- **Core image:** the plain base is 10,696 bytes `.run` plus 1,368 bytes `.bss` in the shared area, and a 100-byte `.boot` copier.
- **Fast SRAM:** none.

## Flash and recover

Send the .syx with Elektron Transfer over USB and press YES on the unit; it restarts by itself, and the stock .syx brings it back the same way. If a custom OS will not start, hold FUNC while powering on, choose TRIG 4 (OS UPGRADE) and send the stock .syx over **MIDI DIN** (the startup menu does not take USB; Transfer cannot reach it, so use a paced sender through a USB-MIDI interface straight into the Rytm's MIDI IN, as the research report describes). Only flash a unit that has booted stock 1.74 once.

## Status

Research. The base passed on a unit (MW06), and ten MKII modules built for it ran there together (MW32, 9 November 2026). Each module comes in its own pull request, Ctrl All first. The machine moves to preview once a kit that knows the MKI is pinned and the first module validates.

## Credits

The ELE2 reader and writer and the OS 1.73 findings are gdeo607's ([rytm1_mods](https://github.com/gdeo607/rytm1_mods), elekloader issue #11); the device profile builds on [elekloader](https://github.com/elekloader/elekloader) (irpina, GPL-2.0-or-later). [rytm-emu](https://github.com/trigcondition/rytm-emu) runs the MKI's OS 1.74 for checks and screenshots before flashing.
