# Beat Slicer

Version: `0.1.57-experimental` · author: @twwwy · **unlisted development draft**.

## Basic device version in development

Beat Slicer creates exact beat-spaced slice starts from sample ATTR BPM or
captured project BPM. The first usable version targets **both file-backed Flex
and Static samples** through their shared AED slicing workflow. It uses ordinary
stock playback, with no effect slot, PCM analysis or new DSP fades. Quiet-boundary
search and enhanced playback processing are later work, not prerequisites for
this basic version. Click-free playback is not claimed.

An independent controller package and a proposed base-owned sample-editor service
now build from source. Host tests exercise the actual controller/grid/service,
both native metadata paths, confirmation and failed-write rollback. The service
also executes on the MCF54455 CPU emulator. A private base passes native/browser
byte parity and normal-boot USB/menu/confirmation emulator tests for both kinds.
The 0.1.55 candidate RAM-boots on the owner's MKII, opens its AED options and
passes a 12-module self-test. The 0.1.56 trial also passed that self-test; the owner
reported initial successful slicing followed by failures after repeated clearing
and step changes. The 0.1.57 correction has not run on hardware; full lifecycle
qualification continues. The service is enabled
only by a private `--sample-editor` base build and needs owner review. It is not
released capability, and the draft remains absent from the public catalogue.

## Controls and workflow

Private candidate access: select a file-backed Flex or Static sample → AED →
AMP (SLICE) → YES → BEAT SLICER. Stop playback and recording for this first
candidate; recorder buffers and slots 128 onward are excluded.

| Control | Behavior |
| --- | --- |
| Encoder A | SAMPLE or PROJECT BPM; refuse missing/invalid tempo, with no silent fallback. |
| Encoder B / UP / DOWN | 1, 4, 16, 32 or 64 beats per slice. |
| YES | Request the base-owned stock confirmation. A busy source waits for a fresh snapshot; NO or changing a control cancels that request. Markers change only after the stock YES. |
| NO / BACK | Close the options or decline confirmation without changing markers. |
| After creation | Use stock DELETE SLICE or DELETE ALL SLICES. No separate slice Undo/history is added. |

In 4/4, choose **16 BEATS** for four bars. The status line warns `REPLACE n SLICES` when a table already exists.

New boundaries that would leave fewer than the shared writer's minimum 64 frames at the end are omitted; the last valid slice still ends at the original trim end. Existing starts change only after the explicit replacement confirmation. An entirely shorter source uses its full length as the minimum; a shorter trimmed range is refused explicitly.

The grid starts at trim start. One beat is a quarter note of the chosen BPM;
track speed and swing do not move offline markers. The core accepts 30–300 BPM
in 1/24-BPM units. Later tempo changes never rewrite slices automatically.

With existing slices, YES opens **REPLACE SLICES?** using the stock question
style. A second YES replaces the active table with the chosen grid; NO leaves
all old records unchanged. Without slices the question is **CREATE SLICES?**.
Replacement can change slice numbers used by locks on any track sharing the
sample. Refuse more than 64 starts instead of truncating the grid. Settings affect every track using that sample
slot. Installing the module itself must change no sample.

The base copies source metadata and owns source/loader retirement, confirmation,
atomic publication and verified failure rollback. The package receives no sample
or PCM pointer and contains no native sample-writing code. NO cancels our create
question; stock's existing zero-cross question retains its own meaning (NO there
accepts an unaligned stock grid).

If the source is busy after the stock YES, the base waits and revalidates before
applying once. NO or another stock gesture cancels that wait; an actual source
or owner change still refuses the edit. The optional replacement extension
requires a revised private base; older preservation-only callers retain their
existing API behavior.

No project or sample-settings save is implicit. Saving/reloading through the
stock workflow, physical reboot persistence, removal, companions and audible
playback remain qualification gates on the exact candidate. The older 0.1.53
fixed-input USB probe passed physical self-test and Undo; it did not access
samples and does not qualify this source. See [USB_TEST.md](USB_TEST.md),
[TESTING.md](TESTING.md) and [integration requirements](INTEGRATION.md).

## Retained research (through 0.1.54)

The [typed menu contribution prototype](MENU_PACKAGE.md) checks a bounded
package descriptor against its exact published loader owner and copies the
accepted label/action into base-owned storage. It supplies a tested component
for the shared editor proposal; production table admission and USB integration
remain pending.

The portable planner, staged PCM reader, preview guard/session, marker
candidate and transaction coordinator have host and compiled ColdFire tests.
The transaction's failed-write rollback remains internal; its older explicit
Undo API is retained research, not the planned player workflow.

The [Flex source backend](FLEX_SOURCE.md) composes complete metadata capture and
bounded copied PCM reads. [Full-boot source tests](BOOT_SOURCE.md) exercise real
stock-loaded PCM and invalidation by normal edits. Ownership and admission remain
fixture-controlled. Stock counters and dirty flags do not cover every writer;
see [writer coverage](WRITER_COVERAGE.md).

Recorder research now includes ordinary panel start/retrigger/STOP in a stock
full boot, plus isolated pending-bank transitions. It distinguishes a pending
start from an old inactive bank that retains its recorded state. A separate
[compiled recorder-boundary prototype](RECORDER_BOUNDARY.md) preserves stock
behavior in paired isolated calls, including terminal observer faults. A later
full boot composes recorder and engine guards during normal recording and
cleanup. The latest composition also brackets whole preparation calls and
covers those previously unguarded stores in the named ordinary-recording
fixtures. Complete source ownership remains open; the production reader stays
disabled. A later fixed-lifetime read-only fixture connects that shared guard
to Flex previews: recording invalidates RUNNING/READY work before another PCM
copy, old tokens stay retired after Stop, and fresh previews match the original
source. The latest composition runs its single consumer on the stock engine
task, with copied requests/results from a borrowed-main producer. It remains a
private fixed-lifetime service, not a production source API or USB package.
Native lifecycle checks distinguish identical foreign/owned wake payloads,
keep WAITING cancellation in force after unblocking, and refuse new work after
fixed-owner retirement.

The [copied UI/engine exchange](PREVIEW_ASYNC.md) gives one engine consumer
ownership of the mutable session. UI callbacks submit tagged intents and read
copied results. The private native budget is one work call per engine callback:
up to eight owned reader transitions and one revalidated live copy, plus optional
setup/publication. Long-source and synthetic cost probes measure total work and
the longest callback separately. Instructions and emulated elapsed time are not
hardware cycles, physical latency or audible-headroom measurements.

[Native UI fixtures](NATIVE_UI.md) cover both stock menu layouts, all control
combinations, waiting cancellation and owner retirement. The
[selection-context guard](SELECTION_CONTEXT.md) binds each callback to the actual
captured task/table/row/callback/owner/epoch. Separate original-versus-wrapped
stock-dispatch probes check registers, SR, stack and caller-visible effects.

The [resident-menu variant](RESIDENT_MENU.md) supports repeated openings using
two immutable, pinned layouts. A separate 90 BPM run verifies captured project tempo against the unchanged
sample tempo. Normal stock grid creation/clearing can change
between those layouts in one session. It preserves options and advances UI and
request identities. Retiring the fixed owner withdraws the contribution, but
its tables remain pinned; replacement and memory reclamation are not implemented.

The [runtime-owner helper](MENU_OWNER.md) distinguishes current publication from
intact images retained for staging or rollback. Tests use the actual loader on the host and as compiled ColdFire code with
synthetic machine services. Production transition-time retirement and typed
contribution admission remain separate work.

The [full-owner menu backend](MENU_OWNER_BACKEND.md) now connects those leases
to the compositor through copied action allowlists and a trusted base dispatcher.
Its host tests cover coexisting owners and actual loader transitions. Newer
ColdFire execution links the actual SDK loader; machine services and menu
models remain synthetic. It does not admit packages,
resolve module entry points or install native transition hooks.

The isolated loader fixture also executes the real upload controller and whole-set
backend through replacement/removal, disconnect at every two-row publication
boundary and complete-set acceptance. An unchanged companion stays usable,
while retired activations require fresh admission even after restoration. This
uses explicit test-side retirement, synthetic machine services and no USB IO.

Recorder-stop research now follows the actual queued cleanup command after
shortages and length-limited stops, including two independently queued recorders.
The compiled worker observer covers each command’s
map-tail stores and retires before an unmasked queue wait. These isolated tests
retain synthetic active state; they do not enable a live source provider.

[Stock observations](BOOT_OBSERVATION.md) also cover normal slicing, clearing,
sample-settings saving and project reloads on disposable fixtures. A fresh
emulator process does not prove physical reboot persistence. Exact results,
source revisions, counters and remaining limits are in [TESTING.md](TESTING.md).

Run `python3 -B sdk/drafts/beat-slicer/audit_evidence.py` to verify retained report
source bindings. It neither reruns binaries nor qualifies hardware. `verify.py`
deliberately refuses publication; the draft is absent from `sdk/catalog.json`
and changes no released download.

## Screens, audio and authorship

Private emulator LCD dumps verify the exercised native layouts; they are not
physical-unit captures or published module media. No audio or hardware
qualification is claimed.

Original MIT core, helpers and test extensions by twwwy and contributors. The
runtime-owner host test includes the repository's unchanged GPL loader fixture;
its licence and attribution remain in the original files, and the combined test
binary is not published. No Elektron firmware, extracted routines/tables,
factory samples, memory dumps or built firmware images are committed.
