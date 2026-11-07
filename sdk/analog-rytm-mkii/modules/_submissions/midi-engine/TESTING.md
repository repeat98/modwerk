# MIDI Engine testing

## Builds

Built locally from this folder at the branch's commits, in the pinned toolchain (`sdk/build/Dockerfile`, `scripts/build-elemod-packages.mjs --module analog-rytm-mkii:midi-engine`), packaged with `scripts/package-elemod-recipe.mjs`, and linked with core-ar2 0.7 (`vendor/elekloader/catalog/core-ar2-0.7.elemod`) onto the stock OS 1.74 with elekloader's `patch.build` (dc6ac1f). Firmware and built images stay on the developer's computer.

| Build | Change |
| --- | --- |
| ME01 | first build: links with no overlaps, boots |
| ME02 | a sound's parameter slots start at +20 (ME01 overwrote the machine byte, so MIDI ENGINE could not be chosen) |
| ME03 | the machine's knobs follow slot 42's SYNTH page layout |
| ME04 | a MIDI ENGINE track holds VOL at 0 and SMP OFF; values always show as numbers |
| ME05 | controllers start as not yet sent, so MW and AT at 0 go out |
| ME06 | CHN and the CC numbers are turned and saved by stock; lane switches in mod storage |
| ME07 | a lock trig plays no note |
| ME08 | the MIDI SETUP page removed |
| ME09 | the current kit's index is read as the 32-bit word it is (ME08 read its top half, so only kit 1 worked) |
| ME10 | (not released) a trig's unlocked values from the knob, with effective minus the engine's copy as the modulation: flickered by 1 and still dipped, from the smoothing lag |
| ME11 | a trig's locked values go out as locked; any other value is the knob's now plus the modulation (effective minus smoothed), so a trig's older snapshot never goes out |
| ME12 | lanes run 1..119 (no CC 0, Bank Select); every value goes out again at PLAY; a setup knob left outside its range by the previous machine (DEC at 127, say) turns back into it instead of sticking |
| ME13 | a turned knob's value is taken from the engine's copy at once (the kit's value follows only every few hundred ms), ignoring the copy's change at a trig |
| ME14 | a sound switched from MIDI ENGINE to another machine gets plain AMP and FILTER ATK/DEC/SUS values, through stock's edit queue (0x4003355c on the queue 0x401947e4 returns), as a knob turn sets them |
| ME15 | (not released) the machine named MIDI, filed under BD: the machine list put it at the top of the BD group, since the list's group comes from a category table that gives every hidden slot category 0 |
| ME16 | the machine named MIDI, filed with DISABLE: listed last, after DISABLE |
| ME17 | leaving the MIDI machine also switches its lanes and SND OFF (on ME16 a lane left on came back with the reset PAN, 64, as its CC: the sustain pedal) |

## Emulator (rytm-emu, OS 1.74)

rytm-emu 4c07ed3 with a local trace of each DIN MIDI byte and its codec frame (not committed). Not hardware evidence. 127 BPM; BD on MIDI ENGINE, channel 1, N2 +7, lane 1 on CC 73 with CC1 at 99, SND PMA; trigs on steps 1, 5, 9 and 13 with LEN 1/16, a CC1 lock of 21 on step 9, step 13 at LEN INF, and a lock trig on step 3 with a CC1 lock of 60.

ME07, played in the window and read from the frame trace:

| Check | Result |
| --- | --- |
| Machine list | MIDI ENGINE listed, chosen and kept |
| SYNTH page | N2 N3 PB MW / AT CC1 CC2 CC3 |
| First trig | CC 73 = 99, PB centred (`e0 00 40`), MW 0, AT 0, then the notes |
| Chord | note 36 and 43 at velocity 100 on every trig |
| Timing | note-ons within 0.7 ms of the step; controllers one audio block (0.67 ms) before their notes |
| LEN 1/16 | off after 1.005 steps |
| Lock on step 9 | CC 73 = 21, then 99 again on step 13 |
| Lock trig on step 3 | CC 73 = 60 on the step, no note |
| Unchanged value | no CC sent when the value is the one last sent |
| LEN INF | held until the next same note, whose off goes first in the same frame |
| STOP mid-note | an off for each held note at once; no stuck note |
| Double STOP | stock's CC 120 on channels 1-13, unchanged |
| AMP and SYNTH pages after a cold boot with the saved project | load as set (reported by the developer) |

ME09 and ME11, headless (dtboot) on the saved project above, playing, with scripted knob turns:

| Check | ME09 | ME11 |
| --- | --- | --- |
| MW swept up in steps of 8 | follows, glides, and dips at each trig (21, then 17; 40, then 35) | one message per step, at the knob's value (9, 17, 27 ... 93 and back), no dip |
| Lane 1: lock trig 60 on step 3, lock 21 on step 9, base 99 | 61, 99, 21, 99 | the same |
| LFO (triangle, FREE) on CC3 with lane 3 on, CC3 at 64, depth raised | the triangle, widening with the depth | the same values |

ME12, headless on the same project: DEC (C2#) at 127 from before turns down to OFF and one click up shows 1 (ME11 stuck at 119: every turn landing above 119 was refused); after STOP and PLAY, twice, lane 2's value, pitch bend, mod wheel and pressure go out again.

ME12 and ME13, headless: MW turned one step every 50 ms, 60 steps up and 60 down, while playing: ME12 sends 17 values (one every 8 steps or so), ME13 every step (117), neither dips at a trig; locks (61, 99, 21, 99) and the LFO on CC3 come out the same as ME11; after STOP and PLAY every value goes out again.

ME14, headless on the same project: HLD 40, DEL 17 and PAN 10 turned on the AMP page (stock knob turns, VOL held at 0), then BD's machine changed to a stock one: the sound shows HLD 0, OVR 0, DEL 0, PAN 64, VOL 110, and the stored working kit (what a power cycle brings back) changes at the same bytes the knob turns had changed. The emulator's power-off brings back the saved project rather than such edits, so persistence across a power cycle is for the unit.

ME16 and ME17, headless on the same project: lane 6 and SND switched on, BD switched to DISABLE and back to MIDI through the machine list, then PLAY: ME16 sends CC 64 = 0, pitch bend, mod wheel and pressure before the notes, ME17 only the notes.

Earlier builds: ME03 played the same chord, timing and locks; ME06 showed STOP releasing an INF note.

Headless (dtboot): a sound switched to MIDI ENGINE drops VOL from 110 to 0 at the next tick and keeps it there (ME04).

## Unit (developer's MKII, headphones)

- ME08, reported by the developer: flashed and booted (ME08 in the corner). On a project whose current kit was not kit 1, a track switched to MIDI ENGINE showed its SYNTH page but still played its previous sound, from the pads and the sequencer, and its AMP page showed stock values. Cause: the kit index read above. The emulator, with kit 2 made current, reproduced it on ME08 (VOL stayed 110) and not on ME09 (VOL 0).
- ME09, the guide's test pattern at 120 BPM (BD on MIDI ENGINE, channel 1, N2 +7, lane 1 on CC 74 with CC1 at 100, SND PMA; steps 1, 5, 9, 13 with LEN 1/16, a CC1 lock of 20 on step 9, step 13 at LEN INF, a lock trig on step 3 with CC1 at 60), OUTPUT TO MIDI, USB not connected; DIN into a USB MIDI interface and a monitor on a computer. Observed by the developer:
  - the BD track is silent in headphones;
  - every trig sends notes 36 and 43 at velocity 100 on channel 1; the first trig is preceded by CC 74 = 100, pitch bend centred, mod wheel 0 and pressure 0, sent once;
  - the lock trig on step 3 sends only CC 74 = 60; step 5 sends 100 again, step 9 sends 20, step 13 sends 100; no CC is repeated when unchanged;
  - LEN INF holds step 13's notes to the next bar, where each note's off comes before its new on; STOP sends an off for each held note; no stuck notes;
  - CCs from locks and note offs land on the step grid; note-ons come 5 to 20 ms after the step, growing during the run. A stock TRK SEND MIDI note on SD (channel 2, step 5) came out at the same moment as the engine's notes and its off on the grid too, and its off on the grid too. A later run with SD sounding and sending on the same steps showed the same: the first message of a step leaves on the step, and the rest (the engine's notes and stock's SD note alike) 5 to 20 ms later, even two notes queued together; offs between steps are never late. The hold-up is in stock's MIDI note task at the step, which the engine shares; it adds none of its own. Note lengths are shorter than LEN by that delay, as stock's are. The developer heard no flam between the synth and the Rytm's SD.
  - Double STOP: stock's CC 120 on channels 1-13, as without the module.
  - PB, MW and AT turned live while playing: each follows its knob, about one message every 4 ms (PB 14-bit). At each trig the value jumps back to the knob's value from about 250 ms earlier and then glides to the current one (AT 86 before a trig, 16 at it, then 20, 33 ... 97); when the knob had stopped, the old value stayed until the next trig. The engine sends the sound's effective values, which the trig sets to those it was prepared with. Open: send the live knob value at a trig unless the trig locks the parameter.
  - Check H (ME09): N3 at +12 gives three notes on every trig (the trig's note, +7, +12), three offs after LEN; at LEN INF each held note's off comes before its new on; STOP releases all three.
  - SND OFF: no pitch bend, mod wheel or pressure; notes and lane 1 unchanged.
  - Save and reload (ME11): after a power cycle the SYNTH page values, the AMP page setup and the trigs came back. SND first came back OFF; it had been left OFF by check F. Set to PMA, then a power cycle with no save: PMA came back.
  - Check G (ME11), read on the Rytm's USB MIDI port: lane 2 on CC 71 at 30 sends CC 71 = 30 once before the first notes; turned while playing it follows the knob (34, 47, 60, 67, 71, 54 ... 30), with no value from before going out at the trigs; switched OFF while stopped, the next run sends no CC 71 while CC 74 and the notes carry on. The same messages, in the same order, as on DIN; on USB too a step's first messages leave on the step and some later ones 10 to 13 ms after.
  - Check G again on DIN (ME11): CC 71 follows the CC2 knob while playing, with no older value at the trigs. Turning DEC (C2#) left passes 0 (the lane still on, at CC 0) before OFF: a run with DEC at 0 sent CC 0 (Bank Select) from the CC2 knob; with DEC at OFF, turning CC2 sends nothing while CC 74 and the notes carry on. A lane switched on again keeps the last value sent, so CC 71 was not sent again at PLAY.
  - Check F again (ME11): MW, PB and AT follow the knobs (MW 66, 34, 0; PB 6784, -8192 ... 0; AT 94, 44, 0) with no older value at the trigs; SND OFF stops them. But each message came about 450 ms after the one before, however the knob turned: the kit, ME11's source, takes a turned value only that often. Fixed in ME13.
  - Check J (ME11), MUTE mode: while BD is muted no notes and no lane values go out; notes that had started got their offs first; after unmute the chord and CC 74 carry on. Muting and unmuting also sent CC 94 = 1 and = 0 on channel 1, BD's track channel: stock's own mute message, not the engine's.
  - Check L (ME09, the flam run): SD on a stock machine with trigs on steps 1, 5, 9, 13 sounded beside the MIDI ENGINE BD (heard in headphones, no flam against the synth), and the engine's notes, chords and lane values went on unchanged; SD's own TRK SEND MIDI notes went out on channel 2 beside them.
  - Check K (ME13), a trig added on step 2 (LEN 1/16), 120 BPM, three runs:
    - swing 50 %: step 2's notes one 16th after step 1 (+125 ms);
    - swing 60 %: step 2's notes 150 ms after step 1 (+25 ms), steps 1, 3, 5, 9, 13 unmoved; step 2's offs one LEN after its own notes;
    - swing 50 %, step 5 nudged later with microtiming: step 5's CC 74 and notes about 26 ms after the step, its offs one LEN after them; the other steps unmoved.
  - Every PLAY (ME13) sent CC 74, pitch bend, mod wheel and pressure again before the first notes.
  - Lane switch (ME13): DEC (C2#) from OFF, one click right, showed 7, the number it held when an earlier, faster turn had switched it OFF; turned down to OFF again and one click right, it shows 1.
  - Check I (ME13): BD's LFO on CC1 (lane 1, CC 74), triangle, fast: CC 74 moves continuously between trigs, one message about every 4 ms at most; it moves around the base (100) and around each lock (20 on step 9, 60 on the lock trig on step 3), clamped at 0 and 127; turning the depth down narrows the swing, and at depth 0 only the base and the locks go out again.
  - Check F on ME13: MW, PB and AT turned live go out as the knob moves, one message every 30 to 40 ms while it turns (MW 1, 2, 3, 5, 7, 12, 18, 36 ... 127; PB 640 ... 8064 ... -8192 ... 0; AT 6 ... 127 ... 0), no older value at the trigs; SND OFF stops them while the notes and CC 74 go on. In this run the notes after a step's CC 74 came 20 to 35 ms after it (5 to 20 ms in the earlier runs; within 1 ms in the LFO run, where CC 74 went out every few ms).
  - Check N (ME13): BD switched back to BD HARD sends no more MIDI, but stays silent: its VOL is 0, as the MIDI ENGINE sound held it, until turned up again.
  - Check N again (ME14): BD switched from MIDI ENGINE to BD HARD sounds at once, with plain AMP values (PAN centred, VOL 110); after a power cycle without a save they are still there.
  - ME16: the machine list shows MIDI; with N2 +7 and N3 +12 every trig sends three notes. Back on MIDI after the ME14 run of check N, lane 6, still on, sent CC 64 (Damper Pedal) = 0 at PLAY: its CC number is PAN, which leaving had set to 64. Fixed in ME17. (BD's and SD's TRK SEND MIDI were still on from the stock baseline, so stock's own BD note came beside the engine's.)
  - ME17: after BD went to another machine and back to MIDI, the AMP page showed OFF for every lane and SND. With HLD 74, SND PMA, N2 +7 and N3 +12, PLAY sent CC 74, pitch bend 0, mod wheel 0 and pressure 0 once, then the three-note chord on every trig and Note Offs at STOP; no CC 64.
  - (An earlier ME09 run sent CC 0 at 0: the lane's C# and CC1 had been left at 0. Set as above, the run passed.)

## Stock baseline (stock OS 1.74, developer's unit)

BD and SD on stock machines with TRK SEND MIDI on (channels 1 and 2), trigs on steps 1, 5, 9 and 13 of both, a parameter lock on BD's step 9, 120 BPM, DIN into the same interface and monitor: the first note of a step leaves on the step and the second 6 to 15 ms after it; on the locked step BD's note comes about 26 ms after SD's, and its off 26 ms after SD's too. So stock's own MIDI notes leave late in the same way, and the delays seen with MIDI Engine (5 to 35 ms after a step's first message) are stock's sending, not the engine's.

## Not tested

- Several MIDI tracks at once, shared voices (CH/OH, RS/CP, MT/HT, CY/CB), scenes and performances, conditions, pattern and song changes, the load under a flood (`perf:audit`).
- Beside other modules.

## Stock flows

Compared in the emulator: the machine list (stock machines still chosen and kept), STOP and double STOP, TRK SEND MIDI on other tracks (stock notes still sent). Not tested: everything else.
