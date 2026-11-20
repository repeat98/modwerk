# Octatrack USB Audio package on macOS, 20 November 2026

All six USB Audio layouts recorded at their expected channel counts on the owner's Octatrack MKII with a single USB client. The 20-channel stream continued through all three SETTINGS choices. Two earlier four-channel trials rolled back during enumeration while a paired browser was open.

## Build and setup

Draft [#1848](https://github.com/repeat98/modwerk/pull/1848), revision `df69f0579ff3`, built from the owner's OS 1.40C with USB MIDI, the development USB function slot, and the flags in the [handoff](https://github.com/repeat98/modwerk/issues/1831#issuecomment-7040937021). The build after merging main at `92fa72be238c` and declaring the empty stock-site list for `ot_settings` produced the identical RAM image and 20-channel package.

| Build item | SHA-256 |
| --- | --- |
| Base identity | `27ab58d50fe7514e6418e1b7f65a41ccd5757abadc15830346fb9a0ff0ef31b0` |
| RAM image | `31183dd5e4adc204ec4094fbcff5bd80d8169348b238fd885963dc44f44b7422` |
| Tracks + Main + Cue, 20 channels | `2289eecf66f725fece541599324337c582fb4a595f0eac6cff3c04ba1bd3190b` |
| Main + Cue, four channels | `eff249e7d3f2354ab11716d6e312d2216af3bf8acb18e76b3e0a727ae4c38281` |

The host steps of `npm run test:procedure -- --base` passed on the merged source. The SDK executed 715 cases with 38 skips. The compatibility check covered 42 modules and all 861 pairs. The stock guards on the packages and the three checks in `check_flash_safety.py` passed for the original development build. Earlier emulator results for all six layouts are on the draft PR.

## Unit results

The owner power-cycled before the first boot. The agent recorded the flashed inventory, RAM-booted the development base, and selected a stopped scratch pattern whose working and saved Part matched. Each trial began with four USB interfaces and the base's empty runtime inventory.

| Case | Observation |
| --- | --- |
| Add the 20-channel package | The base acknowledged the trial. After one USB reconnect the configuration was 259 bytes with six interfaces, and the inventory contained USB AUDIO, layout 1. |
| Change SETTINGS during capture | A single Core Audio input stream delivered 1,059,328 frames at 44.1 kHz with 20 channels. The display cycled through ALL CHANNELS, OFF, MAIN + CUE ONLY, and ALL CHANNELS again. OFF yielded zeros on every channel throughout the measured interval. MAIN + CUE ONLY yielded zeros on channels 1–16 and nonzero samples on 17–18. The scratch pattern's overall signal was very low. Audible quality, Cue routing and per-track levels still need a known source. |
| Frame interrupt | With playback stopped and the host recorder closed, the installed package measured 23.6% in two one-second windows. Two windows after Undo also measured 23.6%. While recording and playing, the measured windows for ALL CHANNELS were 35.2% and 35.1%. These readings do not compare the package with a linked-in producer on the same scene. |
| Undo while Core Audio records | Undo restored the previous active digest. A second USB reconnect restored the initial descriptors, inventory and Part. The recorder delivered 127,488 frames before its device went away. |
| Open the four-channel layout | The unit acknowledged each of three trials. With 400 ms between USB FUNCTION reads, the first and third runs returned with the audio configuration live and its module row gone. A second reconnect restored the empty set before the host requested Undo. The run with 50 ms between reads stayed open, recorded 89,088 four-channel frames at 44.1 kHz and passed Undo. Polling interval is an observation, not an established cause. |
| Restore the instrument | The unit returned to its initial bank and pattern. Both original Part hashes matched before the final power cycle. The owner power-cycled and the agent verified the original flashed identity and all ten inventory rows. The trial used no Keep or flash. |

## Four-channel reconnect

On one failed 400 ms run, the macOS USB log showed Opera opening the instrument's vendor interface about 200 ms before the native test bridge got its first status reply. The [site's connection handler](../../src/engine/elekloader/octatrack-link.ts) attempts to undo an unfinished trial when a paired page reconnects. The log records which process opened the interface. It does not record an Undo command from Opera.

The owner closed the paired browser tabs. On the same development image, with the same packages and 400 ms polling interval, the agent then installed, recorded and undid each trial separately. Main + Cue passed three consecutive times. Every recording below ran at 44.1 kHz. Each Undo restored the baseline USB configuration, active identity, module inventory and both scratch Part copies. This supports competing USB clients as the explanation for the earlier rollbacks.

| Layout | Channels | Frames per recording | Package SHA-256 |
| --- | ---: | ---: | --- |
| Main + Cue | 4 | 88,576 | `eff249e7d3f2354ab11716d6e312d2216af3bf8acb18e76b3e0a727ae4c38281` |
| Tracks pre-fader | 16 | 88,576 | `8d09922f6e7fbbaf5cf1dfd1aaa522e6d885be1803ea8cea3cba87a29aa62ee8` |
| Track 8 / Master | 2 | 88,576 | `b1f14e816e72f6e255f39e974fabe14f3986404b7f5aaf8b225f479126e0fe26` |
| Main | 2 | 88,576 | `999a9d411463ac7208a0e2a889c6efca27d44936bd4d721f8187edc12a08d484` |
| Tracks post-fader | 16 | 88,576 | `de65b7c4e229b0123f40f54feef33822f2df69ca3560099394325df52ac38df2` |
| Tracks + Main + Cue | 20 | 88,576 | `2289eecf66f725fece541599324337c582fb4a595f0eac6cff3c04ba1bd3190b` |

## Choice after power-off

On the original development build, the previous ALL CHANNELS entry was present before any package installation. With the 20-channel trial open, the agent selected OFF on the instrument and read back the saved value 1. After Undo and an owner-confirmed power cycle, the ten flashed modules returned. The agent RAM-booted the same image, found value 1 before installation, reinstalled the same package, and observed OFF on the LCD before changing the choice. The agent restored ALL CHANNELS (value 0), undid the trial, and verified the starting bank, pattern and both Part copies. After the owner's final power cycle the flashed inventory matched all ten original rows.

## Two-level SETTINGS on the Octatrack MKII

On local revision `91d603d98bc8` the development base identity was `753a8d9c9d11966dc1b918629f546f523238e40fc6e91cc61a2b4b4a2c296ab3`. The RAM image SHA-256 was `173d990bd44f819634f28aed20557445ec25b85b8f322ec2e2d985973908c485`. The 20-channel module package was byte-identical to the one above.

The agent opened SETTINGS with only USB AUDIO installed and captured the module list, then its options page. The LCD showed ALL CHANNELS, OFF and MAIN + CUE ONLY together. DOWN moved the cursor to OFF while the active mark and saved value stayed on ALL CHANNELS. NO returned to the module list. YES reopened USB AUDIO with ALL CHANNELS highlighted. Selecting MAIN + CUE ONLY, OFF and then ALL CHANNELS stored 2, 1 and 0 respectively. Undo restored the original descriptors, set and scratch Part.

A separate four-channel trial on this base rolled back during its add reconnect. macOS again recorded a paired browser trying to claim the interface. These records establish contention but do not identify an Undo command. The run stopped there. The owner power-cycled and all ten original flashed inventory rows matched after the project loaded.

## One configurable USB Audio package

The owner granted an exception for the Modwerk integration on 20 November. Mark Roberts remains the original module author. The trial used revision `d15bcaa66340`, base `5416441a2276d1355333ea0ebf5a2b043ed58df00b38ba06718f7e980eecfdf6`, RAM image `495b84a2fd26c538e1bdfe7c1db4fe270242c9838a5d89286be44bc368f06023` and package `e579d74e0297cb3f2173a193952d347c9df3ce7a6a7269dc25e6169e01c53f7c`. Its inventory row reported kind 7. The same installed package produced every recording below.

On the owner's Octatrack MKII, SETTINGS opened a module list. USB AUDIO showed SEND TO, LAYOUT, TRACK TAP and OUTPUT MODE with their current values. Opening TRACK TAP displayed both PRE LEVEL and POST LEVEL. Selecting OUTBOX 8 added four assignable stereo pairs and ASSIGN IN ORDER.

| Panel choice | Core Audio recording at 44.1 kHz |
| --- | --- |
| Tracks + Main + Cue | 353,792 frames on 20 channels. The agent switched from PRE LEVEL to POST LEVEL during the recording. |
| Tracks | 353,792 frames on 16 channels, including the change from POST LEVEL to PRE LEVEL. |
| Outbox 8 | 88,576 frames on eight channels. With MAIN, MAIN, OFF and CUE selected, the first two stereo pairs matched sample for sample and contained nonzero data throughout. Both channels of the third pair were zero throughout. Cue was silent on this pattern. |
| Main + Cue | 88,576 frames on four channels. |
| Main and Track 8 / Master | Each recorded 88,576 frames on two channels. Main contained a low-level signal. Track 8 was silent on this pattern. |

In the two track recordings the right channel of track 1 changed from a peak of 1,023 in PRE to 255 in POST (32-bit host samples, start and end windows). The scratch pattern carried very little signal. A listening test with known music, and separate measurements for mute, solo and crossfader response, remain open. No physical Outbox 8 was available to check its jacks.

Two earlier attempts on the same base rolled back during the add reconnect, including a repeat with a 50 ms polling interval. During the 400 ms attempt macOS explicitly reported Opera holding the Octatrack before the test bridge could open it. After the owner quit Opera, the original 400 ms test stayed active through all the layout changes. The source of an Undo command was not logged. In a separate emulator run, the proposed site's actual Octatrack link opened alongside a native client's trial. It reported the unit busy and released the shared interface. The native client still held the same package digest and completed Undo.

ASSIGN IN ORDER restored the first four sources. The agent restored COMPUTER, 20 channels, PRE LEVEL and ALL CHANNELS and verified the original settings word (0). Undo restored the initial USB descriptors, empty runtime inventory, active identity and scratch Part. The agent returned to the original A01 and verified both Part copies. The owner power-cycled and all ten flashed inventory rows matched. No Keep or flash was performed.

Host tests exercised the packaged descriptor blocks at both speeds, the grouped settings and saved values, exact left/right channel order with distinct test samples, duplicated and silent pairs, and the full-speed stereo fallback. macOS denied the development bridge direct access to the audio class interface. In the emulator, the same package accepted SET_CUR at 44.1 kHz, rejected 48 kHz, sent whole 20-channel frames and produced the expected silent samples for OFF and MAIN + CUE ONLY. It also sent whole frames at 16 and 20 channels in POST, eight routed Outbox channels and stereo on a simulated full-speed host. Undo restored the original USB configuration. Across menu changes and interrupted host polling the emulator counted 11 overruns and 52 underruns. Continuous-stream timing needs a separate measurement.

After merging the cumulative base, the release build caught a difference in the module link addresses between the USB MIDI and linked-audio layouts. The base now reads the native USB configuration from a fixed-size record in its USB reserve. The package rebuilt byte-for-byte to the SHA-256 in the unit trial above. On a MIDI-only base built from `ce5435093` (identity `220d9ce231d00830`), the emulator installed that package, received all 16 requested high-speed packets with zero overruns and underruns, and returned to the four original interfaces after Undo.

The cumulative 0.7.11 build (`61a2c3b75a848dec`) reproduced its native OS byte-for-byte with the browser builder on all seven legacy layouts. All seven shared the same controller links and module addresses. The five existing base-bound module entries now name this beta base. All 41 published package files matched their recorded hashes after rebuilding.

## Migrated sets on the 0.3 release candidate

The MKII RAM-booted base 0.7.11 `a2ae64eb82bcb93430ef62b80e4b80b738fb982c4a4594e50b051dcb6aed868f`. The native and browser-built OS had SHA-256 `cb5779ae78920845e4dd467eee45155eb7a93a4ea863401bade6db2368efce52`. The default 0.3.0-experimental module had SHA-256 `0ac4d6a58a437706e85ab8b577da26dfe88c5c866c5d7a008665fbe2fefcf11f`. Each trial used the installer to encode a saved 0.2 configuration into that module. The live preset, module inventory and host USB descriptor matched both saved configurations.

Software checks imported all six saved 0.2 layouts, including Outbox assignments with a duplicated source and an Off pair. USB and card preparation produced the same configured module bytes. Regression cases separately check classic sets without a USB settings block, Undo to the previous preset, and two saved sets that use the same layout with different routing. A legacy base identifies its layout. Recovering its Outbox assignments requires the saved set or the matching successful sync in the browser.

| Saved configuration | Installed preset | Core Audio on macOS at 44.1 kHz | Undo |
| --- | --- | --- | --- |
| Outbox 8 with Main, Main, Off, Cue | `80a09940` | 89,600 eight-channel frames. Both Main pairs matched sample for sample and the Off pair was silent. Playback was stopped. | The original four interfaces and empty trial baseline returned. |
| Computer with eight post-LEVEL stereo stems | `80432124` | 89,600 sixteen-channel frames. | **Failed.** Rollback and leaving upload mode were acknowledged. The stable set checksum returned to the empty baseline, then the device disappeared from USB and its panel froze. |

Boot 725 retained freeze event 6477 at 191 seconds. The UI tick stopped for at least five seconds while the audio frame interrupt continued. The recorded loads were CPU 38.4%, DSP tracks 1–4 39.3%, and DSP tracks 5–8 38.1%. On the successful eight-channel Undo the Mac saw a disconnect and re-enumerated the device in 0.77 seconds. During the failed sixteen-channel Undo the macOS mass-storage driver requested a port reset. The hub reported that the reset failed to enable the port. The device log identifies a stalled UI tick and the host log identifies a failed reset. Neither locates the instruction that stalled.

The owner cold-started with USB disconnected, confirmed that the panel responded, then reconnected USB. The flashed base, all ten module identities, and the complete saved-set checksum matched the pre-trial record. Both trials ran in RAM. The Keep and power-on persistence tests for the candidate are pending. A physical Outbox 8 was unavailable. This candidate failed qualification.

### Reconnect regression in the controller model

On the failed build, only the UI tick could turn the USB controller back on after the descriptor change. A host test removed the module, withheld UI ticks while continuing audio frames, and observed that the controller stayed disconnected. With a one-second fallback in the existing audio-frame interrupt, the same test restored the pull-up and original configuration. The host reset and a subsequent vendor request settled the reconnect exactly once, including when UI ticks resumed. This covers the controller state machine. The rebuilt 0.7.11 base identity is `e0cbd7173d0bc1bc5e9ba2f297c104b886035531c05cb93f070a61f7ba07fa9c`. The native and browser-built OS are byte-identical (SHA-256 `b14ff34b3628aa3dc4d694f77f3cc435737f542242cb81eac151794ecf997336`). The five configured module fixtures, including both hardware trial presets, retain their original SHA-256. On that image a single emulator boot installed and undid the Outbox eight-channel set, the sixteen-channel post-LEVEL set, and the same sixteen-channel set again with the streaming alternate still selected. All three used the installer’s whole-set format. Each time, the host received 16 complete audio packets. Undo acknowledged the empty set checksum, then the controller disconnected and reattached with the original four-interface configuration. On the MKII, the rebuilt base completed six RAM trials with macOS at 44.1 kHz. The confirmed live preset and USB channel count matched each set. Outbox 8, 16-channel POST, classic 20, Main + Cue 4, and Main 2 each recorded 88,576 frames. A second 16-channel POST trial recorded 90,112 frames. In the eight-channel capture the duplicate Main pairs matched throughout and the Off pair stayed silent. Playback was stopped. Every Undo restored the complete empty trial baseline and the original four-interface USB configuration. The UI tick advanced for six seconds after each reconnect (360–362 ticks). The retained incident log contained no new freeze for this boot. The hardware runs establish normal reconnection after the original failure. They do not establish that macOS issued the same mass-storage reset on the rebuilt base.

### Track 8/Master reconnect failure on the rebuilt base

A further migrated 16-channel PRE LEVEL trial recorded 91,648 frames and completed Undo with 361 UI ticks in six seconds. The subsequent Track 8/Master trial acknowledged installation of its set. Before any recording, while the host was waiting for the two-channel descriptor, the Octatrack disappeared from the Mac's USB tree. The hub repeatedly reported that a port reset failed to enable the port. The test could not confirm rollback. No Keep or flash was performed. This failure blocks the rebuilt candidate as well. The passing two-channel Main trial used a different preset.

The owner confirmed that an arrow key still responded while the Mac could not see the unit. After a cold start with USB disconnected, the owner reconnected USB. The flashed base, ten module identities and complete saved-set checksum matched the starting record byte for byte. The retained log for trial boot 734 contained no new freeze, crash or DSP stall. The failed USB reconnection remains unexplained.

### A second attachment attempt on a powered link

The two-channel Main and Track 8/Master presets use the same descriptor profile. On the previous base, setting the controller's run bit started the twenty-second host deadline. The base did not consult the controller's attachment status during that interval. The host log alone cannot establish the value of that register on the failed unit.

Base `dd7e684c9540e50f5eadaaf090983acadcdb984b59281d7abeac0763952caa01` checks the powered session and the device's attach, suspend and reset indications after three seconds. If attachment has still not completed, it offers the same descriptors once more within the original deadline. A controller-model regression checks a powered link without attachment, an absent cable, a successful attachment, suspend and reset. The previous code failed the missing-attachment checks. Both the USB function and package test suites passed on the new code. Register semantics follow the [MCF54455 reference manual, sections 10.3.4.1 and 10.3.4.14–15](https://www.nxp.com/docs/en/reference-manual/MCF54455RM.pdf).

The native and browser builders produced identical OS bytes, SHA-256 `b1c88d62b606518e188129d54c0ce005c00318881283b256bf4c4c3ba1d0d0bb`. All seven saved-set fixtures gave the same module bytes through the USB and card installers. On this exact OS the emulator installed the migrated sixteen-channel PRE set, then the Track 8/Master set twice. Each trial streamed sixteen complete packets and Undo restored the original four USB interfaces. These tests exercise ordinary successful enumeration. Hardware qualification follows separately.

## Remaining verification

A physical full-speed host, Windows/WASAPI after a channel-count change, and a Keep/removal lifecycle remain open. The full-set regression, soak and listening stages also remain open. The published site continues to use its existing base variants.
