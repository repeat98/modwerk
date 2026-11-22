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

The available author-coordination record covers private experimentation. The dependent scheduling implementation, its generated assembly and full module packaging remain private pending confirmation of the scope for this public adaptation and its attribution. The base overlay and private fixtures also remain outside this PR. The existing Track Solo and Grain modules are unchanged. The public UI and its fixtures can be reviewed or compiled independently.

tests/compare_timing.py is an independently written strict comparator for the normalized eight-lane traces. The PNGs under media are original 128 × 64 CLYPS Meta drawings captured from the transmitted emulator LCD. Each complete 1,024-byte frame was regenerated from synthetic CLYPS state and matched before the PNG was included. Stock and machine screens stay local.

### Files retained locally

- live_module.c, clyps_core.s and the private rows adapter contain or compile the dependent scheduling integration. Permission evidence for public adaptation of the private work is outstanding.
- manifest.py, octamod.module.json, verify.py and tests/shared_state.c describe, build or include the complete private module. Publishing them as a working public package would falsely advertise a build path. The public control and renderer tests have a complete independent build path.
- tests/twin/protected-twin.patch, private-sequencer.json, the emulator profiles and the full private replay and fixture tree describe an incompatible, protected base experiment or depend on locally supplied emulator tooling. Shared public hook allocation and input ordering still need maintainer review.
- The private issue history, design archive, source snapshots, project/card contents, generated images and samples are outside this source contribution.
