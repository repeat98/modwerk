# Direct Jump Kyoti: prerequisites for a Modwerk port

Status: source investigation and proposal, 24 October 2026. No runtime changes,
firmware build or hardware qualification. The intended test unit is the
contributor's Octatrack MKII over USB; its connection and base identity have not
yet been verified.

## Proposed player behaviour

Module id `direct-jump-kyoti`, credited to Zac Kyoti, with Sam Banks credited for
octabam integration. Hold PTN, press YES, then release the keys to toggle the
feature. While playing, hold PTN and press a pattern's TRIG key to cue it normally:
with Direct Jump enabled, it should take over on the next step at the position
derived from the master clock. Hold PTN and press YES again to return to stock
pattern changes. OFF at every boot; no effect slot or new encoder control.

These are the upstream controls and intended behaviour, not observations on a
Modwerk build. The runtime must declare `key:PATTERN+YES` (the manifest's name
for PTN), and tests must verify the
MKI and MKII gestures, chooser suppression and toggle feedback separately.

## Exact upstream sources

- [sambanks/octabam b725fb1a20e77bea37930be4f934a13ba53abc23](https://github.com/sambanks/octabam/tree/b725fb1a20e77bea37930be4f934a13ba53abc23/modules/direct-jump-kyoti)
  wraps the author's module and pins its submodule to
  `329b801cf90f32cbca97c6699a908908968e4df6`.
- [Author's Direct Jump manifest and README](https://github.com/Zac-Kyoti/octatrack-kyoti-fw/tree/329b801cf90f32cbca97c6699a908908968e4df6/octabam-modules/direct-jump-kyoti)
  declare `requires=("BATCH_BUGFIXES",)` and explain the two relevant fixes.
- [Author's batch fixes](https://github.com/Zac-Kyoti/octatrack-kyoti-fw/tree/77f132f9a60c6afa98ea4486540f6107398bdad3/octabam-modules/batch-bugfixes)
  are pinned separately by octabam's batch-bugfixes submodule to
  `77f132f9a60c6afa98ea4486540f6107398bdad3`. Do not assume both submodules
  use the same author revision.

The author offers these patch sources under MIT. Preserve the full applicable
licence texts and every author's notice when importing. No upstream files have
been copied into this proposal. A later import must record each copied file,
source path, source commit, original hash and any local transformation in
`sdk/imports/`, including the octabam wrapper and author sources separately.
Guard constants below are SHA-256 hashes of the upstream manifest's expected
stock spans; they have not been checked against the contributor's own OS.

## Remove the dependency through shared fixes

Modwerk refuses modules that need another module. Merely deleting `requires`
would conceal the upstream prerequisite. Propose these two fixes as shared
SDK/base work, in an owner-reviewed PR before the module PR:

| Fix | Reason for Direct Jump | Stock 1.40C sites |
| --- | --- | --- |
| MIDI Plays-Free scale initialization | Direct Jump reads each track's live scale; stock can seed the MIDI scale incorrectly in PER TRACK mode. Keep the module's existing out-of-range scale guard too. | `0x4009b6f2`, 18 bytes |
| Part-change carryover | A jump posts stock's select-Part message. Upstream reports stale PICKUP-to-FLEX voice state and recorder-cache state on that path. | `0x400621da` and `0x40062216`, 6 bytes each |

The bundle's empty-pattern LED fix is unrelated and outside this proposal.
The Part fix also improves ordinary stock pattern-driven Part changes; it is
not an additional timing engine. Upstream describes it as independent of Direct
Jump's timing. Do not describe its upstream measurements as Modwerk evidence.

Expected guards, derived from the pinned batch manifest:

| Site | SHA-256 |
| --- | --- |
| `0x4009b6f2` | `1737cfa861055a533a8a63f6ee4a007de11433354ad97185fba8e79c7a06ac43` |
| `0x400621da` | `2632ff0358536cd6b85e363a80fd9c9e33f2f117dbfc65e8e23debdb91ddcb79` |
| `0x40062216` | `1240ac0416e043919eaedd12200e392705724809c194c889241b438966804513` |

Source search at Modwerk `8cd96240` found no declarations at these addresses in
the Octatrack machine integration. This is a static search result, not a full
ledger result or proof that another path does not implement similar behaviour.
Before changing anything, enumerate the final base and every active module's
claims, including generated writes. The shared fixes must work for both the
card/native builder and the USB base, with one owner per site in each build.
If another consumer needs a site, use the base's event mechanism rather than
another detour. Do not publish a module that only works on one build path.

## Shared entry points for the port

The pinned Direct Jump source has these integration points:

| Site | Span | Role | Expected guard SHA-256 |
| --- | --- | --- | --- |
| `0x400a1f72` | 6 bytes | phase-D countdown read / landing preparation | `4aaaa6d9488b552fc485627001a1f1b8b4fc72156809c7f9750050c787869e56` |
| `0x400a221c` | 6 bytes | suppress MIDI START for a jump | `6d3f127d6f8c27521bb383e06dae4599364ceb88426d80464a0cdffdc7d71cda` |
| `0x40043418` | 6 bytes | suppress PTN-release chooser after the toggle | `b229662bc9a5d09d0d4613dc32ce8de200fbda85d81dd13630451d0b780946e2` |
| `0x400bf0c0` | 4 bytes | PTN-layer YES press pointer | not yet derived; surrounding YES record starts at `0x400bf0be` |

Use the existing core key event for PTN+YES if it can consume this chord and its
release correctly; otherwise propose a shared keymap service. Open PR #845,
“Octatrack base: ev_keymap_built, free encoders in stock windows”, needs review
for overlap before proposing another service. Do not overwrite the stock pointer
from an independently installed package while the base owns its keymap.

For landing and the MIDI START gate, propose base-owned events after inspecting
incoming branches, flags, live registers and exact interrupt context under the
native port. A raw-register take event is a candidate when upstream assembly
must keep its site-entry convention; a generic frame tick is not a substitute
for the sequencer's phase-D boundary. The event names, C prototypes, order and
consumption rules remain open until that inspection. No event indices or ABI
are allocated by this document. Follow [Propose an event](module-guides/README.md#propose-an-event)
to submit the actual registry entries; never renumber released indices.

Keep the toggle in module-owned initialized state, outside the battery-restored
word used by the standalone upstream build. Removal and Undo must retire every
callback and reference before reclaiming the unit, and reinstall must start OFF.
The native/card build may replay guarded stock instructions from the user's OS;
committed runtime sources/packages must follow Modwerk's stock-free rules.

## Verification and release gates

1. Build stock and the shared fixes from the contributor's own OS 1.40C. Verify
   guards and incoming branches; reproduce the MIDI Plays-Free failure and the
   Part carryover cases, then show the fixes remove them. Compare recorder
   settings, slot/voice state and affected Part dirty flags as well as transport.
2. Test the fixes alone and beside existing machine/Part handlers. Include
   Analog BD, Mute Modes, Play Modes and MIDI Scenes. Address agreement alone
   does not establish behavioural compatibility.
3. After shared changes are reviewed and merged, import into
   `sdk/drafts/direct-jump-kyoti/`, preserving attribution, licences and per-file
   provenance. Compare native octabam and Modwerk with the same selected fixes;
   upstream requires the whole batch, so explicitly account for its unrelated
   LED fix when comparing whole images. Keep the authored-unit byte comparison
   separate from intentional integration differences.
4. Exercise OFF/stock equivalence, ON/OFF, differing lengths (including 16/7),
   every supported track scale, swing, internal/external clock and tempo changes,
   STOP/restart, rapid re-cues and final Program Change, START SILENT, conditions,
   arranger/chains and pattern-driven Part changes. Measure worst event time
   and frame/idle impact; do not substitute average CPU load.
5. Qualify the exact packages on the contributor's MKII over USB: baseline
   identity/inventory, review, trial, self-test, Undo, removal and reinstall.
   Verify Part/project reload and default OFF after an explicitly authorized
   physical power cycle. Preserve the owner's project and kept module set;
   follow [Driving the Octatrack](OCTATRACK_DRIVING.md). Hardware tests remain
   **not tested**, including audible behaviour and power-cycle survival.
6. Only then prepare the module's first-review PR with screenshots, tutorial,
   release notes, performance/memory evidence, native comparison and doctor
   results. Owner review precedes release; afterwards verify the deployed version
   and a saved compatible download. A green build is not release evidence.

Source investigation used Node 24, `npm ci`, the frontend MCP's
`site_catalogue` query for `jump` with beta modules included (no matches), the
fetched upstream main catalogue, module folders and drafts, and GitHub's open-PR
API (no Direct Jump port found on 24 October 2026). Guard hashes above were
computed from the pinned manifests without executing those manifests or
publishing their stock byte constants. No native build, ledger run or device
test has been performed for this proposal.
