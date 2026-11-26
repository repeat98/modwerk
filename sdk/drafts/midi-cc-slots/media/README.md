# Midi Mode 2 — emulator walkthrough

Actual firmware LCD pixels from the MKII emulator, captured on 24 October 2026. The naming images show 0.0.7-experimental. The earlier CC walkthrough retains its 0.0.4-experimental capture identity. They are not physical-device photographs or hardware qualification.

## Name a MIDI track

![MIDI NOTE SETUP with NAME/PUSH in the lower right.](06-name-setup.png)

In Bank 1, select a MIDI track and double-tap SRC. Click F at NAME/PUSH.

![Native MIDI TRACK NAME editor containing BASS.](07-name-editor.png)

Enter a default name such as BASS. YES confirms and NO cancels; names can be
up to ten characters.

![Bank 2 pattern B01 showing the name LEAD.](09-bank2-name.png)

In Bank 2, rename that track to LEAD through the same editor. This overrides
only Bank 2, shared across its Parts. Other unedited names still follow Bank 1.

![Bank 1 pattern A01 still showing BASS after the Bank 2 edit.](08-bank1-name.png)

Return to Bank 1 to see BASS unchanged. Stop transport and recorders and wait
for MIDI PROFILE SAVED before switching off. Copy both MIDI3_*.DAT files with
project backups. Native Save As/copy integration remains unqualified.

These are native emulator LCD exports with guarded runtime publication, not
physical photographs. Capture hashes, module/source bindings, panel actions,
renderer and the declared UI tick shim are in capture-names.json. No label or
pixel shape was redrawn. The earlier native-restoration image below is retained
as historical CC documentation; the current site gallery has eight images.

## Open the assignment page

![MIDI CTRL 1 SETUP showing PB and AT as STK, with CC1 7, CC2 1, CC3 2 and CC4 10.](01-native-setup.png)

Select a MIDI track and double-tap FX1 to open CONTROL 1 SETUP. PB and AT show STK here; click encoder A or B to switch that position into CC mode.

## Choose two controllers

![MIDI CTRL 1 SETUP with CC0 in the first position and CC127 in the second position.](02-cc-setup.png)

Click A and B in SETUP to switch both positions into CC mode. Each starts at CC0; this example leaves A at CC0 and turns B to CC127, then confirms with YES. Use controller numbers supported by your receiving instrument.

## Send a value

![MIDI CONTROL 1 on MIDI channel 01 showing CC0 at 64 and CC127 at 32, with the other four CC positions OFF.](03-control-1.png)

Press FX1 to return to CONTROL 1 and enable A or B with FUNC + encoder press. The headers identify CC0 and CC127; their enabled values are 64 and 32 here. Turn the encoder to send a value on the MIDI track’s output channel.

## Read the other assignments

![MIDI CONTROL 2 with controller numbers 71, 72, 73, 74, 75 and 76; all six values are OFF.](04-control-2.png)

Press FX2 to view CONTROL 2. Its headers show the assigned CC numbers, here 71–76, instead of slot names. All six values are OFF in this capture; enable a value before sending it.

## Restore pitch bend

![MIDI CTRL 1 SETUP showing PB as STK in the first position while the second position remains CC127.](05-native-restored.png)

Double-tap FX1 and click A again to restore native pitch bend. PB returns to STK while B keeps CC127, so the modes remain independent. Switching A back to CC later starts at CC0.



## Initialize once (0.0.11)

![MIDI NOTE SETUP showing centered INIT with FN+ / PUSH at encoder D.](16-init-gesture.png)

Back up the project, set Bank A / Part 1 names and channels, stop transport
and recorders, then save normally. Double-tap MIDI SRC. Hold FUNC and click D
at INIT; FN+ / PUSH explains the gesture. NO cancels safely while work runs.
Wait for MIDI SETUP SAVED. An initialized project does not need Apply again.

This current capture is bound to 0.0.11 in capture-init-layout.json. Earlier
naming images above retain their 0.0.7 behavior and provenance; the current
template snapshots independent names into each bank and uses MIDI4 sidecars.


## Replace a saved setup (0.0.12)

![INIT with FN+ / PUSH in MIDI NOTE SETUP.](18-replace-init.png)

Back up the project, set Bank A / Part 1 and save normally. Hold FUNC and click D.

![REPLACE ALL? YES/NO confirmation on MIDI NOTE SETUP.](20-replace-confirm.png)

An initialized project asks before overwriting bank edits. YES copies Bank A’s
names and channels into every bank and Part, including empty names and OFF.
NO keeps the saved setup. Wait for MIDI SETUP SAVED; NO cancels safely during
progress. Ordinary bank changes and restart never perform this replacement.
The current images are version-bound in capture-replace-setup.json.


## Valid working/saved differences (0.0.13)

![Current INIT and FN+ / PUSH in MIDI NOTE SETUP.](21-map-init.png)

Keep the updated module installed before INIT so restart can recover an
unfinished operation. Save normally, then hold FUNC and click D. Confirm YES
at REPLACE ALL to replace all banks, or NO to keep bank edits. Valid channel
differences between working and stored files no longer cause a save loop.
Other check failures show a bank code. Exact capture provenance is in
capture-bank-map-fix.json; prior screenshots keep their original versions.
