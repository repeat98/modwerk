# Private native editor integration

These fixtures exercise original Beat Slicer code through the actual stock
menus in a full 1.40C emulator boot. They are not installable modules, an
exported editor ABI, a production scheduler or hardware qualification.

## SLICE contribution

`test_menu_boot.c` composes the six-row unsliced and nine-row selected-slice
menus, retaining every stock label, callback and order. It appends one
`BEAT GRID` action whose callback posts a preview intent. It returns promptly;
the driver later borrows a bounded main service to begin the preview. Owner
generation is checked both at selection and before consuming that intent.

The native remembered selection is restored to an original stock index before
dispatching the added action. Otherwise a later stock-only menu could inherit
an out-of-range appended index. The fixture admits only one contribution per
boot. Later opens retire its token and use the stock menu. All old storage
stays pinned forever: neither hiding a window nor replacing its global pointers
establishes safe package reclamation or re-admission.

The runner verifies labels/callbacks, scrolls and selects through normal panel
events, compares the resulting preview with the host oracle, and checks cancel,
stale selection and owner retirement after queuing. It explicitly prepares the
required marker state using stock clearing/grid creation; the saved test sample
already has four slices and must not be assumed unsliced merely because its
audio file was loaded again.

## Configuration and read-only results

`test_grid_ui_boot.c` adds a private configuration dialog with SAMPLE/PROJECT
BPM, 1/4/16/32/64-beat spacing and SMOOTH/EXACT boundaries. Selecting an option
advances a configuration epoch; changing it during a preview cancels the old
request before another read. Fixed label/callback arrays remain alive throughout
the run. The callback only changes intent/state; source reads and planning occur
in the bounded main service, with private planning outside the source lock.

The four-row result shows total slices and the captured BPM, existing/new
counts, whether the planner flags a need for fades, and BACK. Tempo is displayed
to the nearest hundredth from its actual 1/24-BPM value; the configuration still
selects SAMPLE or PROJECT. A quiet-boundary result is not audible qualification. READY results are
revalidated, and a stale result becomes unavailable. BACK and stock NO cancel;
owner retirement cancels and closes only this fixture's own popup. None of the
dialogs offers Apply or writes markers/PCM.

For cancellation, the fixture checks the observed stock window pointer and its
own label-table identity. Stock close clears the window pointer while retaining
other table pointers. That observation may retire a read-only job, but it does
not authorize freeing/reusing any storage. The native UI/loader serialization
boundary, queued-event retirement and real package removal remain unqualified.

## Automatic UI experiment

`ui_tick_native.py` extends the private fixture with the existing base's UI-tick
topology, guarded against the exact external core recipe and stock image. Its
test callback runs before the stock tick tail and preserves the incoming
register/return stack. This is a private hook experiment, not a module taking
its own production hook or a released runtime subscription.

`test_ui_tick.c` invokes at most eight UI-service calls per ordinary tick.
A pending source yields after the first call. No independent clock or busy
wait is introduced. `boot_ui_tick.py` advances normal execution and panel input,
rather than invoking the UI service. It compares the observed task identities
of the tick, menu dispatch and PCM queries. It also uses zero-argument borrowed
entrypoints and checks main's stack before/after the scenario. These checks do
not qualify the production base's whole-chain stack or physical latency.

The coarse all-command observer exposed recurring stock waveform work during
an open editor: it retired previews even though the sample was unchanged.
The isolated `waveform_probe.cpp` executes the ordinary Flex renderer's fresh
and cached paths across four packed formats, slots 0/127 and page/end boundaries,
plus unavailable/busy sources and a complete worker dispatch. It checks source
write watches, an independent extrema oracle and fixed display/progress writes.
No inherited display mock is reached in those cases. A slot's busy flag does
not by itself stop stock waveform reads; the preview provider must still refuse
a busy source independently.

The automatic UI fixture therefore distinguishes only that ordinary Flex read
path; Static, recorder, unknown, fault and reentry cases remain conservative.
This classification is private to the exact stopped-source fixture. Queued
command-record stability is not yet a base-owned lifetime guarantee, and this
experiment must not be enabled as a general live source service. Production
ownership, cache behavior, complete writer coverage and physical qualification
remain required. TESTING.md records which automatic scenarios actually passed.

## Copied UI and engine experiment

`async_ui_native.py` combines the same stock menu and UI-tick topology with a
separate engine consumer. `test_async_ui.c` submits options and cancellation
through `preview_async.c`, then reads a request-tagged copied result. It never
steps, cancels or reads the engine's session/reader directly. The tick performs
one UI service call. Source capture, PCM queries and preview work belong to the
engine task, with at most one work call per callback: up to eight private reader
transitions and one PCM copy, plus optional begin/setup and result
validation/publication. The copy reacquires and revalidates source ownership.

Leaving a result also cancels its outstanding request, even though the UI is no
longer RUNNING. Waiting cancellation, owner retirement and option replacement
follow the same accepted-intent sequence rules. Every accepted intent posts a
coalesced owned wake independently of the previous service's return value.
Storage remains pinned and the menu contribution is still one-shot per boot;
this does not qualify package removal or reopening with reused callbacks.

`boot_async_ui.py` observes task identities and compares whole plans and result
labels. The default command boundary is conservative: recurring stock waveform
work may retire a result before the driver sees it. Only the explicit
`--allow-private-waveform-reads` fixed-input experiment exempts that path.
Actual run counts and limits are recorded in TESTING.md. These are full emulator
boots, not a production base chain or physical concurrency/timing evidence.

## Reproduce privately

Build with `menu_boot_native.py` or `grid_ui_boot_native.py`, supplying the private
stock MAIN and a new private output directory. These extend the compiled source
fixture and verify that it fits the same eight-page reservation. Run
`boot_menu_native.py` or `boot_grid_ui_native.py` with their documented `--help`
arguments, including explicit private-injection opt-in. `--selected` prepares
the four-slice/nine-row variant. Keep the source/card, compiled artifacts, LCD
dumps and logs private. Retained receipts contain hashes and observations only.

The runners use the actual scheduler/DSP boot and stock drawing/selection,
with no UI mocks. The configured controls run compares all 20 combinations,
restarts after an option change and invalidates a completed result. Its READY
invalidation is synthetic guard input; actual stock edit/clear invalidation has
separate full-boot tests. The original menu/configuration runners borrow service
calls from the emulator driver; the automatic UI runner uses the private tick
fixture above. These fixtures do not install a production base service. Source identities, admission and owner
generation are test-owned, with partial writer coverage and unqualified full
interrupt masking. Static reads, atomic publication, playback, source-built
browser/USB packages and physical persistence remain unfinished.


The guarded `selection_boot_native.py` / `boot_selection_native.py` variant
captures selection before stock closes, arms at its exact dispatch tail and
ends only after the callback returns. Every contributed configuration/result
callback consumes the matching context first. Direct callbacks cannot borrow a
new global epoch. The wrapper substitutes a resident return trampoline rather
than nesting the original selection call, preserving the original stack and
stock's caller-visible first-argument overwrite. Separate ABI and full-popup
execution results are in TESTING.md. Arrays remain pinned and the contribution
is still one-shot; no production loader retirement or nested-menu support is
claimed. See [selection authority](SELECTION_CONTEXT.md).


The separate `resident_boot_native.py` / `boot_resident_native.py` variant uses
immutable resident layouts for repeated openings. `boot_resident_lifecycle.py`
changes markers only through stock's normal grid/clear confirmations while
alternating the two menu layouts in one process. The guarded one-shot fixture
remains reproducible; neither fixture implements dynamic loader reclamation.
See [the fixed-owner lifetime contract](RESIDENT_MENU.md).
