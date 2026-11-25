# Source review

| File or group | Origin and scope |
| --- | --- |
| session_view.h | Original GPL-3.0-or-later CLYPS SRC, Panorama, Zoom and row editor drawing code from the local Modwerk integration at 8e7e4b0f307c0c877786bc1d67fc78543bbf8dd0. Font columns are embedded in the source. No stock pixel data is included. |
| session_controls.h, meta_focus.h | CLYPS Modwerk UI callbacks from the same integration with the TRACK handoff change. The private full build produces identical module bytes before and after extracting the callbacks into this header. The callbacks issue requests through a sequencer adapter. |
| contracts/module.proposed.json | Identification, classification and UI claims from the local draft metadata. Presented as an excerpt until the complete package can be built publicly. |
| contracts/runtime.proposed.json | The integration's symbolic subscription requirements. The two proposed sequencer events need a maintained base contract. No new public index is assigned. |
| tests/input_fixture.c, tests/render_fixture.c, test_renderer.py | Original synthetic input and display fixtures, native frame digest comparisons and ColdFire compilation checks. |
| LICENSE | GPL-3.0-or-later licence for the published UI and test sources. |

Zac Kyoti and the OT Kyoti FW contributors developed the original CLYPS sequencing work. The private port credits their scheduling rules and the private rows overlay. The pinned [source licence](https://github.com/Zac-Kyoti/octatrack-kyoti-fw/blob/e750155a3d5c16fe2c8752413582fa61a90d97a2/LICENSE) covers the listed original code under MIT and excludes Elektron material, certain inherited files and third-party dependencies. Its Git blob is 8cd09176a276a3854ae947ab148b9b327d77e381.

## Public engine import

The donor is the artist's Modwerk integration at 6f7bdabc473e8ed8eea7d50711405f35008c76d9. Its live_module.c carries GPL-3.0-or-later and explicitly credits the scheduling rules of Zac Kyoti and the MIT row overlay. The overlay has its own MIT SPDX header, introduced by the artist's development account in a94bfc7b4. The complete Kyoti notice and its exclusions accompany the C source in LICENSE.kyoti. The pinned upstream LICENSE blob was independently checked against GitHub. This is Endrew’s Modwerk adaptation; the original authors have not endorsed this PR.

The following inventory covers every tracked file in the donor draft. IDs are Git blob prefixes. A replacement in the public draft can differ from the historical file even when the name is identical. The public verification script derives the target object directly from C; no second SDK is required.

| Donor path | Blob | Disposition |
|---|---|---|
| CHANGELOG.json | d963ebc046fe | Package or release metadata deferred until public admission exists; symbolic subscriptions already in contracts/. |
| HANDOFF.md | 92f065ad8194 | Use existing public source, documentation or licence. |
| HOOK_PROPOSAL.md | af20055e3081 | Use existing public source, documentation or licence. |
| LICENSE | f288702d2fa1 | Use existing public source, documentation or licence. |
| LICENSE.kyoti | 8cd09176a276 | Import source or notice. |
| README.md | 06f59fc222cd | Use existing public source, documentation or licence. |
| TESTING.md | 47638605f296 | Use existing public source, documentation or licence. |
| clyps_core.s | b4eb1fe0d066 | Compiler output; regenerate from C. |
| design/CLYPS_IDEAS.md | f567d0235fb3 | Historical private design record; public specification in README and HANDOFF. |
| design/CLYPS_ISSUES.md | 448b09e6c7e8 | Historical private design record; public specification in README and HANDOFF. |
| design/CLYPS_ISSUE_MAP.json | 5331079ce5a8 | Historical private design record; public specification in README and HANDOFF. |
| design/CLYPS_MODWERK_GRAIN_UI_INTEGRATION_2026-11-22.md | cac312576a07 | Historical private design record; public specification in README and HANDOFF. |
| design/CLYPS_MODWERK_HANDOFF_2026-11-21.md | 6c979e9ff809 | Historical private design record; public specification in README and HANDOFF. |
| design/CLYPS_UI_SESSION_VIEW_2026-11-22.md | 9daf17399a34 | Historical private design record; public specification in README and HANDOFF. |
| design/verification/2026-11-22-clyps-arranger-replacement.md | a87bf3cbf067 | Historical private design record; public specification in README and HANDOFF. |
| design/verification/2026-11-22-clyps-b1.md | 1becc6fbc792 | Historical private design record; public specification in README and HANDOFF. |
| design/verification/2026-11-22-clyps-performance.md | f6144c9743b3 | Historical private design record; public specification in README and HANDOFF. |
| design/verification/2026-11-22-clyps-session-frames.json | 10bce9b8fdbf | Historical private design record; public specification in README and HANDOFF. |
| design/verification/2026-11-22-clyps-session-ui.md | adb2c1d08cd4 | Historical private design record; public specification in README and HANDOFF. |
| design/verification/native-editing.md | f004852a02e3 | Historical private design record; public specification in README and HANDOFF. |
| evidence/early.phase-185.json | 95bcc559c68e | Protected-run observation; public results in TESTING. |
| evidence/early.phase-89.json | b52dc7a67799 | Protected-run observation; public results in TESTING. |
| evidence/late.phase-187.json | ece56a220863 | Protected-run observation; public results in TESTING. |
| evidence/late.phase-91.json | 36c6e30c789c | Protected-run observation; public results in TESTING. |
| evidence/native-results.json | e5b28a794c34 | Protected-run observation; public results in TESTING. |
| live_module.c | 1ad95139ad0d | Import source or notice. |
| manifest.py | 802d952d16ab | Package or release metadata deferred until public admission exists; symbolic subscriptions already in contracts/. |
| meta_focus.h | 483af91f8eb1 | Use existing public source, documentation or licence. |
| octamod.module.json | 1c9b29bc914f | Package or release metadata deferred until public admission exists; symbolic subscriptions already in contracts/. |
| runtime.json | 603817ea64f8 | Package or release metadata deferred until public admission exists; symbolic subscriptions already in contracts/. |
| session_controls.h | a762ed2e1d50 | Use existing public source, documentation or licence. |
| session_view.h | ea79267d5b62 | Use existing public source, documentation or licence. |
| test_clyps.py | 90906ff47b8c | Import source or notice. |
| tests/grade_admission.py | 07e7d19a6660 | Requires protected evidence layout. |
| tests/grade_boundary.py | a9e746a4441d | Import source or notice. |
| tests/grade_panel.py | c9fad59b66c6 | Requires protected evidence layout. |
| tests/grade_wide.py | d61f154a1736 | Import source or notice. |
| tests/platform.h | a450efd152a9 | Import source or notice. |
| tests/shared_state.c | 867adf83650f | Import and extend lifecycle and row tests. |
| tests/twin/README.md | d15657c5735a | Protected base, admission or emulator-specific fixture; unsuitable for public registry. |
| tests/twin/emulator-profile-a9980c97c.json | f0ad683cd4aa | Protected base, admission or emulator-specific fixture; unsuitable for public registry. |
| tests/twin/emulator-profile.json | 25db5daddafd | Protected base, admission or emulator-specific fixture; unsuitable for public registry. |
| tests/twin/prepare.py | e8051fbbf88f | Protected base, admission or emulator-specific fixture; unsuitable for public registry. |
| tests/twin/private-sequencer.json | 24c1e48b031b | Protected base, admission or emulator-specific fixture; unsuitable for public registry. |
| tests/twin/protected-twin.patch | b891a1f5a84b | Protected base, admission or emulator-specific fixture; unsuitable for public registry. |
| tests/twin/replay/build_live.py | 91de516c5b29 | Protected base, admission or emulator-specific fixture; unsuitable for public registry. |
| tests/twin/replay/clyps_arranger_replay.py | fd4646b372a3 | Protected base, admission or emulator-specific fixture; unsuitable for public registry. |
| tests/twin/replay/edit_lock.py | 48f229e69e74 | Protected base, admission or emulator-specific fixture; unsuitable for public registry. |
| tests/twin/replay/live_fixture.py | b33a6c16ba98 | Protected base, admission or emulator-specific fixture; unsuitable for public registry. |
| tests/twin/replay/live_replay.py | e7a2f96f76aa | Protected base, admission or emulator-specific fixture; unsuitable for public registry. |
| tests/twin/replay/pcm_stems.py | 8409a8bd6f37 | Protected base, admission or emulator-specific fixture; unsuitable for public registry. |
| tests/twin/replay/session_panel.py | 57643d045569 | Protected base, admission or emulator-specific fixture; unsuitable for public registry. |
| tests/twin/ui_fixture.py | b84b287e2930 | Protected base, admission or emulator-specific fixture; unsuitable for public registry. |
| verify.py | 90459344f4b3 | Use SDK linker and code-generation guard directly from C. |

## Shared candidate tools

build_candidate.py links the public CLYPS sources against the candidate SDK and emits the ABI 9 package. The new tests adapt the original CLYPS synthetic card, MKII interactive transport and timing assays recorded above to the coordinated registry. They generate local inputs from a separately supplied synthetic project. They contain no firmware, card images, samples or linked executables. The original GPL and Kyoti notices apply as above. evidence/shared-base.json contains hashes, counts and measured emulator results.

The shared-base replay adds a card recipe, native sequencer and panel harnesses, independently graded timing traces and the profile probe. make_fixture.py prepares project copies using the Octabam project tools. Provide the OS and project locally. The repository contains source and measured metadata only.

## Performance sprint 01

The new C panel adapter, source-generated GNU-as unit and test fixtures are original Modwerk integration work. The existing sequencing engine retains the provenance and exclusions above. The generated unit is compiler output from the C source and the contributor SDK ABI marker.
