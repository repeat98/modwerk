# RFC (draft) — Octatrack sequencer hooks for CLYPS
**For Modwerk base maintainers and contributors. Not an approved ABI.**

The implemented contract and source are available in [the candidate RFC](https://github.com/btzz5w8w5d-star/modwerk/blob/b3184dd5e19caaae8c88e2e002c6ab5204ac27d6/sdk/machines/octatrack/SEQUENCER_SOURCE_RFC.md). The implementation uses 63/64 for sequencing and 65 for independent modal ownership. The questions below preserve the original review context.

## Why shared hooks are requested

CLYPS is a removable performance module, not a replacement OS. It must subscribe to the stock Octatrack scheduling mechanism so that a row launch and one-track override follow the instrument's actual timing, swing, negative microtiming and queue semantics. It must not patch a stock site the public Modwerk base or another module owns.

Private R&D used two guarded sites with an isolated base build (OS 1.40C), **not the public ABI**:

- Scheduling wrap before stock re-homes tracks: `0x400a43a0`, private event `ev_seq_wrap`, historically indexed **61**.
- Audio track's source-pattern argument before the stock event builder: `0x400a2d5a`, private `ev_audio_seq_source(int *pattern, unsigned track, unsigned bank_word)`, historically indexed **62**.

**Critical collision:** public `base/octatrack-next` event **61** is `ev_audio_frame_prepare` at `0x4000cf4a`, an audio-frame interrupt hook. This is *not* the sequencer wrap. Reusing index 61 would be an ABI break. Replacing the frame callback with a wrap callback or merely renaming the index is invalid.

## Questions for Jannik / base reviewers

1. Do equivalent existing public hooks or take-sites already provide the required atomic source-selection and wrap ordering at all relevant stock paths? If yes, how are they meant to be used?
2. If not, should the minimal shared base expose a **bounded scheduling-boundary notification** plus a **validated audio source-selector hook**, or is a different ownership boundary preferable?
3. What callback context, register preservation, execution budget, subscriber count, ordering and abort semantics should the base enforce? Is a single selector owner required?
4. What is the safe way to make CLYPS's protected early key/encoder ownership cooperate with native SRC pages, ARR Meta, Track Solo, existing machine pages and other modules? Can an existing page/context dispatcher be reused rather than hijacking TRACK?
5. How should a module advertise a **minimum base capability** such that older bases refuse admission before publication of any callbacks? Existing private B1 experiment used a required-feature bit; do not reserve that private bit in public ABI by assumption.
6. Where should any shared hook implementation land given the cumulative public `base/octatrack-next` draft PR #1910? One base owner should merge/allocate indices. Do not modify another contributor's draft without coordination.

## Suggested separations of concerns

**In the Modwerk base (only if approved):** guarded stock site ownership, dispatch contracts, safe early panel routing, module admission capability.

**In the CLYPS module:** eight ordinary-track source references, requested/committed states, sixteen volatile rows, GUI, SRC list, ARR Meta, conditional edit lock, cleanup.

**Not to infer from emulator tests:** 32/64-step clock behavior, external clock, T8 Master, simultaneous MIDI clips, real-time CPU headroom, audio quality or safe hardware recovery.

## Verification criteria for proposed events

- Build with base feature off/on, matching stock and installed-empty controls.
- Refuse the new module on old bases without allocation or callback publication, verify ARR and project data afterward.
- Trace requests immediately before and after scheduling wrap and compare actual stock builder calls, all queue domains and due timestamps, including negative microtiming and swing.
- Race/queue tests: SELECT, supersede, RESTORE, STOP, restart; no stale target/duplicate events.
- Measure stack and worst callback cost, including eight-lane maximum and competitor subscribers.
- Test coexistence: native track SRC and Grain, Track Solo, UI popups, p-lock editor, crossfader, unload and original Arranger.
- Keep exact OS/build/source provenance and real native emulator witnesses; physical device test requires separate authorization.

**No current proposal should merge to a shipping base from this document alone.**

## Updated cumulative base

At f2754cbbe6e363aff38e354c7fc8e3108542e4fd the cumulative base assigns **61 to ev_audio_frame_prepare and 62 to ev_frame_deadline**. The protected emulator donor a9980c97cbd2 predates the latter assignment. Its private wire layout is incompatible with the current cumulative branch. The public draft records only symbolic requirements in contracts/runtime.proposed.json. The maintainer must decide whether to provide a pre-wrap notification and an exclusive, typed source selector; any public numbers must come from the coordinated registry. The Agent Board claim is for the module only.

## Public engine integration decision

The live PR #1910 head checked for this import was a9674ed846ebe75d2bcbced307922fe9c4cb63f1. Its events.json and the separately resolved base/octatrack-next branch both returned Git blob 71eea6a5a526af64a2a0e67becf537db4ea4696b. Event 29 (ot_sequencer_rows) contributes settings-menu rows in the UI task. Event 61 runs after staging, and event 62 supplies a deadline. None supplies a mutable source argument before stock builds each audio event.

Reset volatile rows only on the stock project-initialization event. Ordinary bank loads retain local slot references. See ROW_STORAGE.md for the completion contract required by persistence. At the pre-rehome boundary the base calls the wrap notification once; before building each ordinary lane it passes the current pattern by reference, track index and bank word to a single admitted selector. Preserve stock input for ineligible bank, track or pattern. Fail admission before callback registration unless both named contracts and protected key/encoder ownership are supported. A selector conflict must fail admission as well. Keep public numbering, register preservation and fail-closed loader implementation in the cumulative base PR. The module PR adds no index, direct site patch or alternate scheduler. Public hardware and emulator admission remain blocked until those base changes land.

## Development candidate on the cumulative base

The contributor fork now carries the implementation on integration/clyps-shared-sequencer, commit 7419b7598, based on a9674ed84. Its Board claim covers candidate slots 63–65. Source and scheduling use two call events. An independent modal-input marker allows an eligible UI to take its own controls before stock shortcuts. The versioned feature requirement prevents an equal-width loader missing that capability from publishing the package. The shipping registry and official base are subject to maintainer review. See NATIVE_REPLAY.md for the matched development build and control.

On 23 November PR #1910 head c3706472be93ff0d02a7293412ab3992b3b60be7 still ended its event registry at 62 (events.json blob c572264f6142843e6f93bfb6d08233c6f9909439). The contributor candidate's 63–65 contract remains pending.

### Project completion contract requested for maintainer review

A serialized begin notification supplies a unique token and destination
incarnation before stock can replace any referenced pattern or Part. At begin
the module retains its committed generation and suspends foreign selection.
The terminal notification correlates the token, supplies commit or abort, and
identifies the usable project incarnation, bank and stock source epoch. On
abort the base must distinguish an exactly restored previous binding from an
unknown or partially replaced binding. The latter keeps selection suspended.
The module may validate and prepare its own data on an idle task, then publish
one generation at a scheduling-safe point. A shared reader return, RELOAD
return, or project initialization cannot substitute for this terminal event.
The executable host model is in `offline/project_transition.py`. No event
index or battery storage is assigned by this proposal.
