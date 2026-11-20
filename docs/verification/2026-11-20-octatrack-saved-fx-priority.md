# Saved Part effects and Sidechain on project load

Issue [1875](https://github.com/repeat98/modwerk/issues/1875), 20 November 2026. Octatrack MKII OS 1.40C, Tracks Post. The emulator fixtures use constructed projects. The warning at startup with E-Verb on T4 was reproduced separately on 0.7.9 and passed on 0.7.10. The reporter also confirmed that switching between projects made on 1.40C and on the Modwerk base stopped showing the warning after updating to 0.7.10.

## Reproduction

Install E-Verb 0.1.2, BBD Delay 0.1.2, Sidechain Compressor 0.2.2, Mute Modes 0.2.2, Tuner 0.1.0 and MIDI Scenes 0.3.0. Load a stock project with the ordinary COMPRESSOR on T3. With playback stopped, load a second stock project with the same compressor. On T5 through T8 its first effects are LO-FI, FILTER, DJ EQ and CHORUS. The second effects are DARK REV, SPRING REV, PLATE REV and FLANGER.

On 0.7.10 the latter four tracks needed 4,665 code words. Sidechain and its key bus left 3,992 available, and seven of the eight slots on those tracks came up empty. On the same project, removing only Sidechain loaded all 16 saved effects with 37 code words to spare.

## Initial candidate

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

## MKII RAM trial

On an Octatrack MKII running the Tracks Post development build `c761e9ebb33f148b2aaec14bf1d789cd3c6d87894942515327c36504c85bc5f8`, the first two stopped loads of the heavy project in a six-module USB trial failed. The refusal reported code memory on the core serving T5 through T8. Only FILTER remained on that core, using 441 words. The saved Part still contained all 16 requested effects. With the other five modules installed, the same Part loaded all 16.

Three subsequent heavy loads in six-module trials passed. The saved effects used 4,665 words, with Sidechain and its key bus paused on both cores. Returning to the lighter project brought both back. In a 7.012-second Tracks Post recording, channels 9 and 10 carried signal, with at most six consecutive zero samples between signal. The DSP counters recorded no new stalls or errors during playback. This recording measured digital output. The trial used the development binary.

The first RAM boot lost its USB connection. After a power cycle, the next RAM boot connected. After the trials, the original firmware identity, ten-module set identity, project, pattern and all four working and saved Parts matched the starting state. Both scratch projects were removed from the card.

## Replaying the allocation

The candidate allocator, replayed with the MKII's effect sizes and alignments, distinguishes two layouts for the same heavy Part. With the full 4,702-word arena, an existing FILTER at word 0 allows all effects to load. With FILTER at word 261, the 261-word hole before it is too small for the smallest incoming effect (289 words). The allocator returns `DL_ALLOC_TRANSITION`. With Sidechain reserving 710 words, both layouts return `DL_ALLOC_MEMORY`.

Two passing hardware loads captured FILTER at word 0 before the transition. The first two refusal records lacked its address. An instrumented Tracks Post development build (`9a92e9de532509a46aa3aabf5b6431e5f392b0ba1c4f9006c015a1f6a1a7210e`) recorded the allocator result, capacity, reservations and placements together at the point of refusal.

On this MKII, FILTER at word 0 loaded all 16 effects. To create the alternate layout through the front panel, a scratch Part used SPATIALIZER on T5–T8 with DELAY in FX2. After Undo and idle packing, SPATIALIZER started at word 0. In a fresh six-module trial, selecting FILTER on T6 placed its 441 words immediately after SPATIALIZER at word 261. Loading the heavy project from there, and again from the lighter compressor project, produced `DL_ALLOC_TRANSITION` both times. Each refusal recorded 4,702 words available and zero engine reservations on the heavy core. FILTER was the only effect still occupying code space on that core.

In the release candidate emulator, a normal card-restored six-module set started with the same FILTER placement. Idle compaction made two moves and the heavy Part loaded all 16 effects. Background compaction stays suspended throughout a USB module trial.

## Targeted retry

For a stopped saved Part whose Sidechain reservation has been released, the loader can try one stock-effect move after its usual trim and pack attempts. It checks the complete requested code layout against a private copy of the allocator, then uses the ordinary upload, bind and retirement sequence for a disjoint copy. The existing binding stays live until the DSP acknowledges the new one. A pending pattern change, active publication, rollback or disconnect prevents starting the move.

The controller and receiver regression covers the fragmented Part, an unsettled USB transaction, a queued pattern, a rejected transfer, a module effect occupying the same span and playback starting during the copy. On each frame the receiver checks that the running effect still points to its complete code. The rejected transfer leaves the old placement bound. After a successful move the lighter Part readmits Sidechain on both cores.

The default base package SHA-256 was `630052d87bea9ab7c38ef653183e1c1d41280564d69bbb9cbc6d914c40d0a00d`. Software stages 1–4 of the base procedure passed, including the 42-module compatibility run over all 861 pairs. The corrected Tracks Post release configuration is `0ff172ff8993aa80c7ffea90b841ac7211ff346358262373ed942b26149a2875`.

## Corrected MKII trial

The corrected Tracks Post development build was `c207fd174e2f266ac5f8264fca27a5c6e73254760c021cd2a388395577ad3cd2`. Each run started with transport stopped, all six modules active in a temporary USB trial, and FILTER at word 261. The front-panel project selector loaded the same heavy Part in both cases.

| Case | Starting state | Result on the MKII |
| --- | --- | --- |
| SPATIALIZER scratch project to heavy Part | SPATIALIZER at word 0 and FILTER at 261 | FILTER moved to word 4,261. All 16 live and committed slots matched the saved selection. |
| Lighter compressor project to heavy Part | FILTER at 261 and Sidechain active on both cores | FILTER moved to 4,261. All 16 slots matched again. |
| Heavy Part back to lighter compressor project | Sidechain and its key bus paused on both cores | All 16 slots matched. Sidechain and its key bus resumed on both cores and reserved 710 words per core. |

Both heavy loads used 4,665 of the 4,702 code words on the core serving T5–T8. There were zero residency failures, refusal dialogs or allocator rollbacks. During 7.012 seconds of scratch playback, Tracks Post channels 9 and 10 carried signal with a maximum of four consecutive zero samples. The DSP recorded zero new stalls and errors during playback. Listening by ear and persistence across a Keep and power cycle remain untested on this build.

After Undo, the starting project, Set, selected track, pattern and all four pairs of working and saved Parts matched the pre-trial checksums. All three scratch projects were removed. The MKII also booted the exact Tracks Post release configuration `0ff172ff` in RAM and answered a status request. Returning to the starting 0.7.9 firmware restored the identical ten-module inventory and set identity. The instrument was released to the next session.

The exact Tracks Post release also cold-booted in the MKII emulator with the six-module set restored from its virtual card. The cold heavy Part, a switch to the lighter Part, and the switch back to the heavy Part each loaded all 16 saved effects with zero residency failures and zero refusal dialogs. On the heavy reload, the pause notice appeared and Sidechain was disabled on both cores. The seven USB layouts passed the browser/native rebuild comparison.
