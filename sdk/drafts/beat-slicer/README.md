# Beat Slicer

Version: `0.1.66-experimental` · author: @twwwy · **author-approved public-beta candidate; pending Modwerk review**.

## Beat Slicer: Recording Workflow

Beat Slicer allows users to record audio freely without having to determine the recording length in advance.

1. **Start recording on a downbeat.** Begin recording on the first beat of a bar so the audio is aligned with the musical grid.

2. **Record for as long as you like.** Perform, improvise, or capture live audio without worrying about recording an exact number of bars. Stop recording whenever you're finished, even in the middle of a bar.

3. **Set the original BPM.** Enter the tempo at which the audio was recorded so Beat Slicer can calculate the duration of each beat.

4. **Choose the number of beats per slice.** For example, selecting 4 beats per slice divides the recording into 4-beat segments. Any remaining audio becomes a shorter final slice.

5. **Sequence and play back the slices.** Trigger the slices at the appropriate beat intervals to reconstruct the original performance, preserving its musical timing without manually trimming the recording.

**The key advantage:** You only need to start recording on a downbeat and know the original BPM. There's no need to plan the recording length, stop on a bar boundary, or trim the audio to fit a fixed number of slices.

Recording duration remains subject to available recorder memory, and a grid can contain at most 64 slices. A final fragment shorter than the stock 64-frame minimum is included in the preceding slice. The grid is anchored at trim start; for the workflow above, retain the original downbeat as that start. Choose SAMPLE BPM after entering the recording's original BPM in ATTR, or PROJECT BPM if it matches that original tempo.

**Time-stretch when using PROJECT BPM:** the chosen BPM determines grid spacing;
stock playback still follows the track's time-stretch setting and sample ATTR
BPM. If the sample and project tempos differ, turn off track time-stretch or
set the sample ATTR BPM to the audio's actual recorded tempo to avoid
unintended stretching. Beat Slicer does not change those playback settings.

## Public-beta candidate and compatibility

The author approves **0.1.66-experimental** for public-beta review. Earlier .66
MKII self-tests passed alone and with fifteen companions excluding Recorder Loop
Fix. On 27 October, a new event-35 build passed a singleton self-test and the
contributor reported flawless slicing, re-slicing and playback with Flex file
slots, Static file slots and a completed recorder buffer, across more than 20
minutes overall. The exact build, settings and limits are in [TESTING.md](TESTING.md).
The author later powered off and unplugged USB, then reported Beat Grid absent
and the other modules restored on the next power-on. A subsequent fresh trial
of the identical private build passed self-test and USB Undo, with the exact
empty RAM baseline independently verified. The interrupted run remains separate. This does not publish the module:
the shared base/API proposal [#914](https://github.com/repeat98/modwerk/pull/914)
and first release still need Modwerk owner review. The draft remains unlisted
until that integration is accepted.

**Recorder Loop Fix 0.1.0:** the first-slice miss was reproduced with that module alone and stock CREATE SLICE GRID, without Beat Slicer. The same Beat Slicer build had no misses reported so far when isolated, and the miss returned when only Recorder Loop Fix was added. Exclude Recorder Loop Fix for this workflow; the report is [sambanks/octabam#908](https://github.com/sambanks/octabam/issues/908). No fix to that module is claimed here.

The implementation creates exact metadata grids for file-backed Flex, Static and inactive recorder-buffer sources while pattern playback may continue. It uses ordinary stock playback, without an effect slot, PCM analysis or new DSP fades. Physical short-commit timing, the extended emulator stress cancellation and complete save/reboot qualification remain open. Earlier failed self-test track restorations and unverified historical Undo outcomes remain recorded in [TESTING.md](TESTING.md); they are not relabelled as passing evidence. No click-free playback or implicit save is claimed.

## Emulator UI captures

![SLICE action menu](media/ot-beat-grid-menu.png)

![Two-beat setup popup](media/ot-create-beat-grid.png)

Actual 0.1.66 emulator LCD captures, not hardware audio evidence. See [capture provenance](media/capture.json).

## Controls and workflow

Access with the compatible candidate base: select a Flex/Static sample or recorder buffer → AED →
AMP (SLICE) → YES → CREATE BEAT GRID. Playback may continue. Only recording
into the buffer being edited blocks that source; the playback track and its
recorder are independent. Empty recorder-buffer edits leave an empty result.
The popup shows EMPTY when the buffer has neither audio nor slice
entries. YES then leaves the popup open without a confirmation or write. Existing
zero-length entries still require explicit replacement confirmation to clear.

| Control | Behavior |
| --- | --- |
| Encoder A | SAMPLE or PROJECT BPM; refuse missing/invalid tempo, with no silent fallback. |
| Encoder B | 1, 2, 4, 16, 32 or 64 beats per slice. |
| YES | Validate the opening snapshot and request stock confirmation. NO or changing a control cancels a pending request. Markers change only after the stock YES. |
| Encoders C–F | Unassigned; leave the popup and parameters unchanged. |
| NO / BACK | Close the options or decline confirmation without changing markers. |
| After creation | Use stock DELETE SLICE or DELETE ALL SLICES. No separate slice Undo/history is added. |

In 4/4, choose **16 BEATS** for four bars. The information block shows the slice count and REPLACE when a table already exists.

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

The options retain the opening snapshot throughout setup. Encoder counts
accumulate four per discrete setting step, with clamped endpoints; UP/DOWN do
not change settings. Slot location and kind stay internal. Source metadata is
checked at confirmation, not on display ticks or parameter changes.
PLEASE WAIT is limited to a pending operation, rather than exposing internal
waveform-worker readiness during normal setup.

The base copies source metadata and owns source/loader retirement, confirmation,
atomic publication and verified failure rollback. The package receives no sample
or PCM pointer and contains no native sample-writing code. NO cancels our create
question; stock's existing zero-cross question retains its own meaning (NO there
accepts an unaligned stock grid).

If the source is busy after the stock YES, the base waits and revalidates before
applying once. NO or another stock gesture cancels that wait; an actual source
or owner change still refuses the edit. The frame-preserving metadata boundary and optional replacement extension
require a revised private base; older preservation-only callers retain their
existing API behavior.

No project or sample-settings save is implicit. Saving/reloading through the
stock workflow, physical reboot persistence, removal, companions and audible
playback remain qualification gates on the exact candidate. The older 0.1.53
fixed-input USB probe passed physical self-test and Undo; it did not access
samples and does not qualify this source. See [USB_TEST.md](USB_TEST.md),
[TESTING.md](TESTING.md) and [integration requirements](INTEGRATION.md).

## Device verification checklist

Use the exact reviewed candidate and a disposable project/sample copy. Keep an audible pattern running during edits and
report any sound interruption or unexpected marker change.

1. Open an empty recorder buffer and create a beat grid. It should remain empty.
2. Record audio, stop recording, then create a grid in that buffer during pattern
   playback. Check preview, NO, YES and the stock slice-clearing commands.
3. With a file loaded on a Flex track, record into that track's separate buffer.
   Reopen AED for the file: beat-grid editing should remain available. Repeat
   with a Static file and with buffer A while recorder B runs.
4. Open the buffer currently being recorded. A new beat-grid edit must refuse.
   Starting recording from an open edit must cancel it; stopping must not apply
   that old edit automatically.
5. Create several markers in a longer recording. Record shorter: out-of-range
   starts collapse near its new end, with the slice count unchanged. Record
   longer again: those resulting positions remain. Nothing creates a fresh grid
   until explicitly requested.
6. Finish with playback and recording stopped for verified USB Undo/removal.

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

## UI revision and returning to the tested version

0.1.59 calls the AED action **CREATE BEAT GRID**, directly before stock
**CREATE SLICE GRID**. Its compact popup leaves the AED edge visible. Six
parameter positions follow the panel's A–C / D–F layout: A selects SAMPLE or
PROJECT tempo and B selects beat spacing. C–F are unassigned and inert. The
right side shows captured BPM, planned slices and CREATE/REPLACE (or a refusal
status); the footer shows 0.1.59. Native YES/NO confirmation is unchanged.

0.1.58-experimental remains the previous tested version at source `60abcc53`
(runtime inputs matched its original `686906da` build). Its exact module SHA-256
is `8164829b315c822b72073f341085dc1aaef4f5a62636f4f53f9da4ffa75639ce`;
private base `2732acbb336ca4300235b91d8a5ca143f540e0120e2860e964b1ad233108dd67`
and packages are retained outside Git. Do not overwrite them with a new build.
Returning to 0.1.58 means using those exact retained trial artifacts after a
fresh baseline review, not rebuilding a new package with the old version label.
Neither revision is a released module or qualified for Keep/save/persistence.

0.1.60 refines that popup: encoder letters are removed because field position identifies the encoder. The window is nearly the full display height so the AED heading and tabs do not distract. The popup footer identifies 0.1.60; 0.1.59 artifacts remain retained separately.

## Approved 0.1.63 layout

The module author approved this design on 25 October 2026. The nearly full-height
CREATE BEAT GRID popup uses a dashed two-row, three-column control form.
Function labels and values are centered: BPM selects SAMPLE/PROJ and BEATS
selects spacing; unused fields are blank. The right summary is centered
vertically with one aligned right edge: BPM number, count first (3 SLICE),
and CREATE/REPLACE. No version is shown in the popup; the package and release
notes retain the version. This UI approval is not hardware qualification.
