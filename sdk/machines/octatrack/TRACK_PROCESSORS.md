# Returning track processors (proposal)

This is shared Base infrastructure under review, not a released capability.
It lets a packaged DSP processor return a track's audio before both FX slots.
The first consumer is the separately developed M/S Balance module. Its DSP,
tables, controller, AMP overlay and project files do not belong in the Base.

## Route and ownership

`dsp-sites.json` keeps site 0's original two-word guard and turns that site
into a returning chain: packaged feature 16, the resident key-bus tap, the
displaced instruction, then native FX1 and FX2. Source chains retain their
existing skip exit. Post-FX Sidechain MON/commit is unchanged. This service
occupies no source voice or FX slot. There is currently room for one returning
processor owner, not an arbitrary number of these processors in series.

The ledger reserves Y:$d00..$dbf on each core for feature 16. Four 32-word
states hold its controls/reset flags; the remaining 64 words are processor
scratch. The module supplies the engine and initial data in its ABI 10 package.
The receiver accepts no caller-selected DSP address. A future layout or
control format needs an explicit ledger/contract change; this is not a general
DSP memory-write API.

## Control and publication API

Include `include/modwerk_track.h`. Call `modwerk_track_controls` from the
module's own published controller image, outside the audio interrupt. Pass a
nonzero epoch, a revision, and two packed words: T1..T4 then T5..T8, most
significant byte first. Each byte must be 0..128. Core A handles T5..T8;
core B handles T1..T4. Epoch changes reset the processor's private state.

The Base resolves the exact trusted controller identity and caller PC, reserves
both owned transport jobs before submitting either, and copies values rather
than retaining module pointers. Result 1 means both cores acknowledged the
exact epoch, revision and bytes. Zero means pending; negative means unavailable
or closed. Unknown jobs retain ownership and fail closed. A new activation
invalidates old acknowledgements, including when all values are unchanged.

`modwerk_track_publication` returns the serial of that execution image. An
unrelated module's MODULES READY event preserves it; Undo/reactivation changes
it. Zero means absent or sequence exhausted. Modules must not infer continuity
from a global owner epoch or a reused image address. The runtime owner ABI is
unchanged, including its cached-versus-execution address distinction.

## Admission and retirement

The package declares its worst-case per-core cost using existing executed or
hardware units. The Base applies the existing conservative scaling and reserves
the charge before ENABLE. Every effect admission includes it. The reservation
stays until both core hooks are known off, the exact controller is RETIRING,
and all owned jobs have drained. Release nudges a refused automatic selection.

A mandatory bank change or incoming publication can request a bounded pause
while retaining its original request/context. Ordinary uncommitted FX picks
retain their existing refusal behavior. The final reservation publication uses
a short IPL7 fence because the IPL5 sequencer can preempt an IPL4 controller
lock. Part scans, transport waits, allocation and DSP work stay outside it.
These decisions have host regression coverage; heavy-bank timing is unmeasured.

A completely published, nonpreparing temporary module set can receive MODULES
READY while its trial is active. Partial publication, rollback and volatile
journal work cannot. This does not enable saved-set writes during a trial.

## Direct action rows

`ot_settings` adds `MODWERK_SETTING_ACTIONS_ABI` (4) using the existing grouped
record shape. Its field page provides labels/values; YES calls
`choose(0, MODWERK_SETTING_FIELDS, row)` directly, stays in that list and refreshes
it. `page.label` can supply a dynamic header. It has no persistent choice and
never calls `apply` during installation/restart. Existing settings, groups and
presets retain their behavior. This keeps project edits out of settings replay.

## Checks and release requirements

`scripts/source-runtime-package.py` accepts an optional schema-2 `engine`
recipe. Assembly sources, P-table data and initialized claims belong to that
module; the shared adapter hashes every declared input, refuses traversal,
symlinks and undeclared assembler-file reads, checks the exact Base ledger,
proves relocation against six fresh assemblies and attaches the engine using
the existing ABI 10 encoder. The entry is word zero and the processor returns.
Existing schema-1 C-only recipes keep their original path and dependencies.

`test_source_runtime_engine.py` uses an original tiny assembly fixture and the
actual SDK encoder; it needs no OS, private package or unit. It covers malformed
inputs, ledger claims, file confinement, placement and stable controller digest
across DSP-only changes. These checks also cover macOS /var path aliases.

`python3 -B -m unittest discover -s sdk/tests -p test_track_processor.py -v`
runs native loader/modset, settings/status, controller and DSP admission
fixtures. The fixtures substitute native calls; they execute no firmware or
DSP audio. All helper inputs are included in the Base source identity.

Earlier private M/S/Base pairs were tried temporarily on an MKII, including
normal 20- and 300-second Undo results. Those results do not qualify this port
onto the cumulative 0.8.3 branch. An older long-trial Undo failure remains
unresolved. The current proposal needs exact-build unit testing, physical CPU
measurements with stock workloads, persistence/normal-set qualification, and
owner review of the API, resource claim and controller trust policy.

The current trust mechanism pins reviewed controller digests in a Base build.
The adapter prepares the engine-bearing package path; controller updates still
need the accepted trust/import policy so they can ship without rebuilding the
Base. Do not publish a CF-only replacement, claim an FX slot is required, or
call this a publicly installable module until that path is accepted and qualified.
