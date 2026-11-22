# RFC (draft) — Octatrack sequencer hooks for CLYPS
**For Modwerk base maintainers and contributors. Not an approved ABI.**

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
