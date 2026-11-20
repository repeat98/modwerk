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

## Remaining verification

A direct change from one installed layout to another, a physical full-speed host, Windows/WASAPI after a channel-count change, and a Keep/removal lifecycle remain open. The full-set regression, soak and listening stages also remain open. The published site continues to use its existing base variants.
