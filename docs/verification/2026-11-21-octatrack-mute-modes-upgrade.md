# Mute Modes package compatibility on Octatrack base 0.7.13

Tested on a unit: Octatrack MKII, OS 1.40C, candidate base `80ef13b8ea3351ea112b925cf4c8a0d4d4437133ba9fc227f39d5be7dff60b94`, 21 November 2026. The browser and native builders produced identical OS files (SHA-256 `5bf5aca3c46c2f0b9a08f51f6235053c3624d0b9d39aca8bd9d8136fb3544876`). The unit started on base `254c5a75` with an empty inventory. All boots and trials used USB and RAM.

## Edge cases

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| Published Mute Modes 0.2.2 (`d8b871e3`) | Updating the table declaration could refuse an existing package. | Five-second standalone trial on the candidate, followed by Undo. | Pass. The installed package ran, the original active identity returned and the inventory was empty. |
| Mute Modes 0.2.3 (`d460c7e2`) | A second declaration has different table offsets. | Same trial on the same candidate. | Pass. No crash, stall, frozen UI or skipped track logged. Undo restored the active identity and inventory. |
| FM Synth 0.1.4-experimental.1 (`f91f7bbf`) alone | FM Synth uses the shared mute query and must install on its own. | Five-second standalone trial. | Pass for installation and Undo. |
| FM Synth with Mute Modes 0.2.3 | Muted note starts and STOP need both packages live. | Submitted the exact pair as one set on the candidate and on audio development build `3d009d3b`. | Set verification refused both submissions. The development build reported no mounted card. Neither package was installed by either transaction. Physical DT-T and OTFX-T audio checks remain open. |
| Restore the incoming base | A trial or RAM boot could change the active set. | Compared all four working and saved Parts and the selected pattern before and after on the development build. RAM-booted the original base and compared its full base and active identities and inventory. | Pass. Both comparisons matched. |

The candidate was tested with no kept packages. A card-backed saved-set upgrade, an all-package trial, playback soak and an at-rest price run for every package remain open. The earlier staging diagnostics hardware run in the cumulative draft used a different build.
