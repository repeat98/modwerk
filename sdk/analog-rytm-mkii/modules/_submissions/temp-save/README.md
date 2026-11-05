# Temp Save

An Analog Rytm MKII mod by Nathaniel Pavel (@npp1993). Version 0.1.0-experimental. See [TESTING.md](TESTING.md) for what ran on a unit.

Save the pattern and its kit with one gesture, try something, and get back.

## Controls

| Gesture | What it does | Message |
| --- | --- | --- |
| FUNC + YES | Saves the active pattern and its kit. | TEMP SAVED |
| FUNC + NO | Reloads both. | RELOADED |
| FUNC + NO with no save for this pattern and kit | Nothing changes. | NO TEMP SAVE |
| FUNC + YES when the pattern links another kit than the active one | Nothing is saved, and an earlier save is dropped. | KIT NOT LINKED |

Both work on the main screen and the sound pages, stopped or playing. In running LIVE RECORDING, FUNC + NO stays stock's: it erases the active track's locks. There are no settings, no effect slot and no knob.

## What it saves

It runs stock's pattern save and kit save, then stock's pattern reload and kit reload. The kit's record holds its performance and scene locks, so they come back too.

- **The pattern's copy is one buffer in RAM.** Stock refills it on every pattern change, so a save belongs to its pattern and its kit. Change either and come back, load a project or power off, and FUNC + NO shows NO TEMP SAVE. A project save keeps the copy apart from the pattern's edits: load that project and the pattern comes up as it was at the project save, and stock's pattern reload still returns to FUNC + YES. A power cycle does not keep it: the pattern stays as it was, and stock's pattern reload changes nothing. The module uses no memory for the copy: a pattern is 85,760 bytes, more than the room modules share.
- **The kit's copy is the kit's saved copy.** FUNC + YES replaces what stock's kit reload returns to, and a project save keeps it apart from the kit's edits: load that project and the kit comes up as it was at the project save, and stock's kit reload still returns to FUNC + YES. This is the difference from the Octatrack module of the same name.
- **Stock's kit reload reads the kit the pattern links.** A save needs that kit to be the active one, or a reload would bring back a different kit.
- **Stock's saves share those copies.** Save the pattern, a track or the kit with stock after FUNC + YES, and FUNC + NO brings back that later save.

## Changes to stock flows

| Change | For whom | Why | Neighbouring flows |
| --- | --- | --- | --- |
| FUNC + NO on a sound page reloads instead of setting stock's lock erase, unless LIVE RECORDING is running or a trig is held. | Anyone with the module installed. | The gesture matches Digitakt and Digitone and the Octatrack module. Stock's erase only acts in running LIVE RECORDING, and there FUNC + NO stays stock's. | Erasing locks in LIVE RECORDING, RANDOMIZE PAGE (page key + YES) and the sample slot list were run with the module in; see TESTING.md. |
| FUNC + YES saves where stock does nothing visible. | Anyone with the module installed. | The gesture itself. | Menus and lists take YES first and keep it. |
| FUNC + YES replaces stock's saved pattern and saved kit, the copies NO + SCNE and NO + PLAY MODE return to. | Anyone who presses it. | A pattern is larger than the room modules share, so the module keeps no copy of its own. The musician's earlier stock save is lost, with no prompt, and the owner agreed this in review. | Stock's reloads and saves on their own, kit reload after a power cycle and after a project load were run on a unit; see TESTING.md. |

## Compatibility

It patches three stock calls, in the main view's YES and NO cases and in the sound page's NO case, and subscribes to `ev_tick` and `ev_project`. A screen above those views that takes YES or NO keeps it, and the RECORDER keeps both. Claims `ui:FUNC + YES` and `ui:FUNC + NO`. It needs no other module.

## Credits

Original work by Nathaniel Pavel. The design follows Digitakt's and Digitone's temp save and the Octatrack's Temp Save, with no code shared.
