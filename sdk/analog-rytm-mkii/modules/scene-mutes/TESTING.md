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
- Not tested: a build with core-ar2 0.7, rytm-emu on OS 1.74, and any unit run.

## Upstream results (OS 1.73, rytm-mods-src)

Recorded by the original mod's design notes, emulator only, 0018 alone on stock 1.73
(2026-11-01). Not yet repeated on 1.74:

- SCENE + FUNC + T3 set scene 1's mask to T3 and marked it, with no track select and the mutes unchanged.
- Engaging scene 1 saved the mutes and muted T3; a CC 94 mute while engaged went into the saved mutes; CC 92 = 0 put them back.
- SCENE + FUNC held lit T3.
- `<CLEAR>` and `<CLEAR ALL>` on the engaged scene dropped mask and mark and put the mutes back.
- The mask survived a power-off save and cold boot; a kit change left the other kit's record untouched.

## To test on a unit

1. Hold SCENE until scene edit opens, then FUNC + T1 and T3: T1 and T3 light while FUNC is held.
2. Engage that scene: BD and SD mute. Disengage: the mutes are back as before.
3. Engage it, mute CH by hand, disengage: CH stays muted.
4. `<CLEAR>` on the engaged scene: its mutes go, the earlier ones come back.
5. Save, power cycle, engage the scene: BD and SD mute again.
