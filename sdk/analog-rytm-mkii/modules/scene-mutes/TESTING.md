# Scene Mutes — test report

- Module: `scene-mutes` 0.1.0-experimental, for Analog Rytm MKII OS 1.74 on core-ar2 0.7.
- Source: https://github.com/Iced-Cream/rytm-mods-src at `cd4ded4`, `mods/0018-scene-mutes/stub.s`,
  with the changes marked `elemod` in `src/scene-mutes.s`: one `.text` section in place of
  cave18 and cave10, the run-time state in `.bss`, and a global alias for each site target.
- Addresses: rytm-mods-src's OS 1.73 symbols, moved to 1.74 by rytm2_mods `tools/port_os.py`'s
  region shifts (code 0x6c or 0x1cc, the SceneEditView vtable 0x2b0, RAM unmoved).

## Results

- Assembly: `m68k-linux-gnu-as -mcpu=5475` assembles `src/scene-mutes.s` with no warnings
  (1002 B of code, 6 B of state).
- Port check (2026-11-08, offline, owner's stock OS 1.73 and 1.74 files): rytm2_mods
  `tools/port_os.py`'s Mapper moves each of the 19 addresses the module names to the 1.74
  address it uses (16 by matching code, the two vtable slots by nearby data, the stored
  project unmoved), and the stock SHA-256 of all six sites in `build.json` matches 1.74.
- Build SM01 (Modwerk's linker: the Modwerk base for core-ar2 0.7, plain variant ba530f45, +
  this module from `15c89ef5`, against stock OS 1.74, `--version SM01`): `.syx`
  `556262bde12a54fe6108d5de3e4af30b9ef95304dc54f2059d84deead3d91767`, main OS
  `587b50cac11c7fa268cbb20f7c74ced971dfe1a847ae625d132e34810393f71b`; ramSpare 117992 B,
  flashHeadroom 1203104 B. Comparison build SM00, the same base without the module: `.syx`
  `2f55f264dc32bf8d8096dbaed7f5928bb643c6e707401ed56489e34821f9ec43`.
- rytm-emu (2026-11-08, emulator only, dtboot with rytm-emu `2ac0f1f`'s code, no card, the
  factory project; the same plan on SM01 and SM00):
  - Scene edit + FUNC + T1, T3: scene edit opens on both, screens identical; with FUNC held
    SM01's T1 and T3 LEDs change, SM00's don't.
  - Engaging scene 1 (SCNE, then the BD pad) and opening MUTE: on SM01 the BD and RS pads go
    dark and track_mute_set runs twice, the first time from module code with track 0, mute 1;
    on SM00 every pad stays lit and it never runs.
  - Disengaging (BD again): SM01 unmutes both (four calls in all), every pad lit again.
  - No faults on either build. The screens show no mute state, so the mutes were read from
    the pad LEDs and the routine's calls.
- Not tested on a unit: `<CLEAR ALL>`, scene engage by CC 92, NRPN or Overbridge, kit changes.

## Hardware

Run T210, 2026-11-08, on an Analog Rytm MKII with OS 1.74, driven by elkbench under the owner's
go, with one power cycle by the owner. Build SMH1 (the Modwerk base for core-ar2 0.7, plain
variant ba530f45, + analoghealth 1.3 as the remote-key harness, not under test, + this module
at `e5317b15`): `.syx` `7bec08468757ca5ef2e9ad0afd9a1ee1d3c9922ad0adb3c6734b361d57d66740`. Each
flash (SMH1 over stock, stock 1.74 back) and both plans passed the emulator gate first. Peaks
are from the USB audio takes; RS, outside the mask, played at -10 dBFS in every take.

- Setup: a new `~T` project in test slot 121, trigs on BD, SD, RS and CH, scene 1's mask set
  with SCENE + FUNC + T1, T2.
- Scene 1 engaged: BD and SD silent (-83 dBFS), CH played (-11).
- CH muted by hand while engaged: CH silent (-79).
- Scene 1 disengaged: BD and SD back (-17, -14); CH stayed muted.
- After a power cycle: scene 1 still silenced BD and SD (-82 to -85 once the earlier hit's
  tail had died away), and the hand mute of CH was still in the saved mutes.
- `<CLEAR>` showed CLEARED; afterwards scene 1 no longer muted BD or SD.
- CPU (analoghealth): 74 % before the keys, 82 % at the end; heap flat.
- Iced-Cream listened to the takes (2026-11-08).

## Upstream results (OS 1.73, rytm-mods-src)

Recorded by the original mod's design notes, emulator only, 0018 alone on stock 1.73
(2026-11-01). Not yet repeated on 1.74:

- SCENE + FUNC + T3 set scene 1's mask to T3 and marked it, with no track select and the mutes unchanged.
- Engaging scene 1 saved the mutes and muted T3; a CC 94 mute while engaged went into the saved mutes; CC 92 = 0 put them back.
- SCENE + FUNC held lit T3.
- `<CLEAR>` and `<CLEAR ALL>` on the engaged scene dropped mask and mark and put the mutes back.
- The mask survived a power-off save and cold boot; a kit change left the other kit's record untouched.

## To test on a unit

1. Hold SCENE until scene edit opens, then FUNC + T1 and T2: T1 and T2 light while FUNC is held.
2. Engage that scene: BD and SD mute. Disengage: the mutes are back as before.
3. Engage it, mute CH by hand, disengage: CH stays muted.
4. `<CLEAR>` on the engaged scene: its mutes go, the earlier ones come back.
5. Save, power cycle, engage the scene: BD and SD mute again.
