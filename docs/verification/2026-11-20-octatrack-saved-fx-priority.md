# Saved Part effects and Sidechain on project load

Issue [1875](https://github.com/repeat98/modwerk/issues/1875), 20 November 2026. Octatrack MKII OS 1.40C, Tracks Post. The emulator fixtures use constructed projects. The warning at startup with E-Verb on T4 was reproduced separately on 0.7.9 and passed on 0.7.10.

## Reproduction

Install E-Verb 0.1.2, BBD Delay 0.1.2, Sidechain Compressor 0.2.2, Mute Modes 0.2.2, Tuner 0.1.0 and MIDI Scenes 0.3.0. Load a stock project with the ordinary COMPRESSOR on T3. With playback stopped, load a second stock project with the same compressor. On T5 through T8 its first effects are LO-FI, FILTER, DJ EQ and CHORUS. The second effects are DARK REV, SPRING REV, PLATE REV and FLANGER.

On 0.7.10 the latter four tracks needed 4,665 code words. Sidechain and its key bus left 3,992 available, and seven of the eight slots on those tracks came up empty. On the same project, removing only Sidechain loaded all 16 saved effects with 37 code words to spare.

## Candidate

Tracks Post configuration `eb728b97981b724c57bfae8a6da0aa97759ddde4ff7b9708ab4b49408aa6b491`. The stopped project observer reads the complete slot map. Repeated instances of an effect on the same core share one copy of its code. If a reserved engine must yield, the controller goes through its ordinary disable and acknowledgement sequence. The saved effect selection then runs through the ordinary allocator. Other modules keep their reservations, including an independent reader of the key bus. The project and module files stay on the card.

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| Cold boot directly into the heavy stock project | Restoring the module set can race the initial effect selection | Exact Tracks Post release candidate in the MKII emulator | Passed. Six modules restored, all 16 live effects matched the committed selection, and the allocator recorded zero failures and zero refusal dialogs. |
| Switch from the lighter project with Sidechain already running | Firmware must release both reservations before loading the heavy effects | Same candidate, normal LOAD PROJECT in the emulator | Passed. All 16 effects loaded, Sidechain waited on both cores, the pause notice timer started, and the heavy core used 4,665 of 4,702 words. |
| Return to the lighter project | A deferred controller could stay paused | Same emulator session, normal LOAD PROJECT | Passed. All 16 effects loaded and both DSP cores enabled Sidechain and its key bus automatically, with all six packages still installed. |
| Lighter Part fits with Sidechain | A project reload could interrupt an active engine unnecessarily | Controller and receiver host test | Passed. Both cores stayed enabled and no extra enable or disable was sent. |
| Memory pressure on one core | The controller needs both cores to run | Controller, allocator and receiver host test | Passed. All requested effects ran. Sidechain waited on both cores and resumed on both after the lighter selection. |
| Transport running or requested effects exceed the full arena | Parking Sidechain would interrupt playback or fail to help | Controller host test | Passed. Sidechain kept its ordinary admission path. |
| Pause notice | A modal dialog could intercept PLAY or cover an existing screen | Status renderer and key-handler host test | Passed. The two lines appeared once the screen was free, PLAY reached stock, and the notice expired after 180 UI ticks. |

Not tested on a unit. The exact build still needs a stopped load and an audio check on an MKII.
