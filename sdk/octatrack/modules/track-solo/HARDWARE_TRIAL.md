# Track Solo MKII hardware trial plan

**Status:** trials ran on 6 November 2026; results are in
[TESTING.md](TESTING.md#hardware-results--6-november-2026). The identities below
are the older `0.2.2` plan, kept for its unfinished coverage.

**Keep the link active.** A trial needs a USB request at least every 10 s or the
base rolls it back. Use `npm run device -- try FILE --seconds N` without
`--accept`, or the developer MCP's review, trial and Undo; a client that waits
silently loses the trial. The transport gate that suspended this plan concerned
`opening()` in `octatrack-link.ts`, which `scripts/device.mjs` does not call. The
session form of `try` accepts at once, so never use it here.

## Exact candidate and evidence boundary

| Item | Identity |
| --- | --- |
| Module | Track Solo `0.2.2-experimental` |
| Review source commit (input-hash comparison only) | `7acb980a07ebef61b98b791e85b098175438d8c3` |
| Recorded package-build source commit | `1d2b93234b7e834187c68c74522ebf10ef52cb82` |
| Original plan source revision | `e7858af5a26e11123064e6a756e94522f95a8df1` |
| Original plan source tree fingerprint | `7aaea0a2dd788dfd150ecd4d2a49684c52c54fd7a7a05b5b74aab8f6a3e6af1f` |
| Package SHA-256 | `6b7a9d2cb30ceef7d69aedd5cfe5f2ea45fdaa46f6d16069952b8ad93286a2fd` |
| Intended unit | Octatrack MKII, OS 1.40C; verify the live model and OS before a run |

The 3 November historical record in [DEVICE_TRIAL.md](DEVICE_TRIAL.md)
establishes only admission of this package into an earlier 20-module RAM set
and verified Undo to the original 17-module inventory. The separate 5 November
attempt used a fresh 20-module baseline; its Undo receipt was uncertain and
device state was UNKNOWN at that time. The owner later confirmed Undo complete
and no restoration needed, without a device readback or current identity. Neither
record tests function, audio, LEDs, CPU, DSP cycles, self-test, save, Keep or
persistence. The 3 November base identity
`9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc`, prior
active digest
`951766ebfe1ef23a3b9055475036ff7726b7a381ca457d1a12c162bdb057d9d2`, and
whole-set identity
`51a06498432d819e85131ca0ba27eb8ba7223b639e9318c830e94c1eaa62aaba` are
historical reference values only; the next live baseline may differ in base,
inventory and module count. The historical Pattern Sample Locks and Beat Slicer
additions were not part of that earlier baseline; do not add them just
because they appeared in the previous 20-module trial.

The behavior to observe is the current contract: a lone TRACK hold activates
after 30 instrument UI ticks (about 0.5 seconds); editing remains available;
the held anchor is hidden from stock shortcut combinations; unmodified member
taps toggle once; excluded TRACK lamps are dim but lit; MIXER shows underlying
mute/solo state; releasing the anchor reveals the latest underlying state; the
default is OFF and session-only. No long-hold selection workaround is part of
the contract. See [README.md](README.md) and the open cases in
[INTERACTION_CASES.md](INTERACTION_CASES.md).

## Preflight and project

1. The owner schedules and explicitly authorizes one supervised RAM trial on
   the physical MKII. Use one connected instrument and one device client. Do
   not start a second USB client or change the base. Confirm the unit is not
   playing before any self-test or state transition.
2. Verify the source revision, source tree fingerprint and package hash above
   immediately before staging. A source or package change supersedes this
   plan and all results; rebuild, bind a new plan and test only that package.
3. **Suspended — do not access the device through this step.** Do not call
   `device_status`, `device_review`, or a gateway path as a read-only or
   diagnostic baseline. In the current source, `opening()` may perform HELLO
   and call `cleanUp()` for an unfinished phase before returning status;
   `cleanUp()` may adopt, cancel, roll back or leave upload mode. `baseline_only`,
   `writes=false`, and endpoint labels do not guarantee passive opening. The
   exact executable client/connection path and operation scope have not been
   cleared for use. Any future access requires source review of that exact
   path and separate, specific owner authorization.
4. Use an owner-supplied disposable project prepared for this test. It must
   contain repeatable audio on the tracks under test, known mute/solo states,
   a saved Part with working and saved copies equal, and a documented route
   for MAIN/CUE listening. If T8 is configured as master, include its source
   tracks; T8 alone has no source audio. Do not use the owner's project or
   change its Parts. Creating/saving a disposable project is a separate
   authorized setup action, not part of this RAM trial.
5. **Suspended with the transport gate.** The listed `device_status`,
   inventory, `ui`, and `png` observations depend on an unreviewed connection
   path; calling them “read-only” does not make opening passive. Do not make
   these device readbacks under this plan. The project, bank, Part, pattern,
   transport, displayed page, input signal, mute/solo state and companion set
   remain useful manual observations for a separately authorized future trial.

## Staged no-save functional trial

**Suspended with the transport gate:** do not invoke `device_review`,
`device_trial`, or another endpoint from this section. The manual interaction
cases below are planned observations only; no installation or device session
is authorized here.

The earlier plan specified `device_review` and `device_trial` against a fresh
baseline plus only Track Solo at the exact package hash above. It assumed the
review binds base, active-set digest and inventory and that trial rechecks them
before staging; these checks do not establish a passive connection path. This
flow is suspended and must not be run under the current gate. In this checkout,
`device_trial` starts a RAM trial and does not run self-test. The earlier plan
excluded `try FILE`, card-backed `remove FILE`, Keep, Flash, SAVE, SAVE ALL and
SYNC TO CARD.

The prior manual interaction sequence is retained as intended coverage only;
do not execute it under this plan. It was ordered with transport stopped where
playback was not required and called for recording exact observations rather
than a general “works” statement:

1. **OFF and enable:** with the default OFF, make a short TRACK press and
   confirm stock behavior with no temporary group. Select HOLD in the
   documented menu, close it and let any stock notification clear. Do not
   save the project. Check that PROJECT entry cancels an active gesture and
   that a held anchor must be released before a fresh hold.
2. **Hold, join and release:** check the 30-tick boundary, cancellation before
   threshold, one member tap to join, another tap to remove, member release
   without a second toggle, repeat/held-key behavior, all eight anchors, and
   release of a joined key before releasing the original anchor. Confirm that
   joined tracks do not become new anchors and do not select an editing track.
3. **Anchor and editing:** while holding the active anchor, exercise PLAY,
   STOP, REC and representative stock modifier combinations, including both
   modifier-first and TRACK-first FUNC/CUE ordering (open case K09). Confirm
   the held anchor is hidden and ordinary editing, pages, encoders, MIXER and
   transport continue. Do not claim exactly-once stock handling for K09 if
   either ordering is ambiguous.
4. **Audio, lamps and companions:** audition the prepared signal on the anchor
   and joined tracks; listen to MAIN and CUE for unexpected cuts, clicks,
   tails or routing changes. Check members at normal brightness and excluded
   TRACK lamps dim but visibly lit; check that MIXER indicators continue to
   show the underlying state. Repeat the controlled route with unchanged
   baseline companions present. The user listens and judges physical lamp
   brightness; a screenshot or meter cannot establish either.
5. **Underlying changes and latest state:** while the group stays active,
   change mute/solo through the real mixer and quick-mute/stock-solo paths,
   then through a real external MIDI source. Exercise an actual arranger
   change that updates mute/solo state. Confirm the temporary membership does
   not change, MIXER reflects the underlying state, and release reveals the
   latest observed underlying state. Record each before/after state and the
   specific arranger/MIDI source. Do not use a synthetic memory write to
   stand in for a real event.
Stop on a crash, unexpected audio loss, unknown set identity, unexpected
module-ID inventory, unexplained panel state, or ambiguous Undo/recovery
state. Preserve the exact observation and ask the owner; do not retry a write
or power-cycle.

## Matched load observations

Compare the same project, base, page, transport, pattern, signal, displayed
screen and unchanged freshly reviewed baseline in these conditions:

| Condition | Installed set | Track Solo state |
| --- | --- | --- |
| No Track Solo | Freshly reviewed baseline | Absent |
| OFF | Fresh baseline plus exact Track Solo package | OFF |
| Idle | Same staged set | HOLD enabled, no group active |
| Active 1 | Same staged set | One anchor active |
| Active 8 | Same staged set | All eight audio TRACKs in the group |

Collect repeated readings from the supported cached `device_load` path while
its load panel is active; retain timestamps and mark unsupported or stale
windows as unavailable, never zero. The direct `stats` command's guide calls
for ten readings per state because CPU varies with page and time, but use only
one device client at a time; do not attach `device-send.py` beside an open MCP
session. If the approved session cannot provide repeated fresh readings, mark
the comparison incomplete and ask the owner for a supported measurement
handoff. `profile:15` is optional and only if this exact base supports it; it
measures base hook time in microseconds, not Track Solo DSP cycles. `guard`
can record frame timing/skips before and after a condition, but is not a
module-cycle meter.

Do not record USB audio while taking CPU readings: the documented `rec` tool
adds about 15 CPU points while active. `cfmeter.py` decodes the separate CF
METER probe's T8 signal (or an emulator block dump); it does not isolate Track
Solo cycles. Do not add that probe or an instrumentation module to this trial.
CPU/DSP percentages and cached peaks are comparative observations only, not
Track Solo cycle counts or a numeric pass threshold.

The developer's current requested key-press scope is the slowest observed
press timing and 20 presses while the sequencer is playing. Record the exact
build, timing method and each observed result; both are **not tested** on the
current candidate. Do not run long MIDI floods or seek stock-firmware bounds
for this request. The older repository guidance below has a broader measurement
scope; its reconciliation with this request remains open.

The qualification record still needs source-bound worst-case cycle counts for
each processor used, with a documented cycle basis, real-time budget and
maximum supported configuration, plus exact memory-region totals and bounds.
Current qualification policy requires expensive parameter/modulation/mode/
load/input conditions and real-hardware evidence; it does not set a required
duration or eight-active-track stress minimum. Relative CPU/DSP/memory gauges
are ordinal estimates with a source or comparison basis and do not substitute
for those measurements. Do not fill cycle, memory or hardware fields from
these load observations.

## Future self-test and Undo-driven active unload — suspended

No self-test, Undo, or other device action is authorized by this plan. The
steps below preserve the original intended coverage only; the transport gate
above remains controlling.

The original future plan called for stopping transport after functional/load
observations, then running the instrument's existing SELF TEST only as a
separate, specifically authorized step. `device_trial` itself does not run
self-test. A self-test is not proof of Track Solo audio, physical LED
brightness, cycles or persistence.

The original future plan also described an Undo-driven unload observation:
keep a fresh Track Solo anchor held, call `device_undo` with the trial token,
and compare the returned baseline identity and physical TRACK lamps before
input release or redraw. The connection path and that procedure are suspended;
do not execute them under this plan. The intended evidence would distinguish
the response's set/status fields from direct physical lamp observation and
would not test the card-backed `remove FILE` command. Any future execution
requires the exact client/connection path and operation scope to be reviewed
and specifically authorized first.

If a future, separately authorized `device_undo` call returns an error instead
of a completed snapshot, its outcome and device state are uncertain. Preserve
the receipt and stop; do not open a new connection or use `device_status` as a
diagnostic under this plan. Do not resend the token or start another review,
Undo, Keep, install or reboot. The exact client/connection path and scope must
be reviewed and specifically authorized before any further access.

## Separately authorized durable work and finish

Project SAVE/SAVE ALL/SYNC, device Keep, and power-cycle/reboot are separate
durable phases and need separate, explicit owner authorization each time. Use
only the disposable project for any authorized save/reload check, record both
working and saved copies, and do not combine it with this no-save functional
trial. Keep writes the card module-set slots and can replace the kept set;
never infer permission from a successful RAM trial. Never Flash. A power
cycle is not an Undo mechanism and is never performed by the tester without
the owner's explicit instruction.

The approved interaction matrix includes a no-edit project-save/reload case
that must leave project data unchanged. The owner later confirmed that the
5 November Undo completed and no restoration was needed; this was not followed
by a device readback. The physical regression remains a future plan only with
separate owner authorization and a disposable project. It has not run and has
no hardware result. This plan does not authorize Keep, reboot or broader
persistence tests.

In a future, separately authorized RAM trial, the Undo-driven active unload
would be its finish; do not start a second review or invoke card-backed
`remove FILE`. The previously described `device_undo`, status/inventory
readbacks, MCP close, and bridge/controller cleanup steps are suspended with
the transport gate and are not current executable instructions. Do not open a
new client or endpoint under this plan. Any future access requires source
review of the exact executable client/connection path and specific owner
authorization.

Prior source notes describe the intended Undo handler and runtime redraw
behavior. They do not verify a concrete executable client's full connection
path, make any endpoint passive, establish current device state, or authorize
an operation. These notes support no current device access or physical LED
verdict. See
[`scripts/frontend-mcp.mjs`](../../../../scripts/frontend-mcp.mjs),
[`octatrack-link.ts`](../../../../src/engine/elekloader/octatrack-link.ts),
[`upload-session.ts`](../../../../src/engine/elekloader/upload-session.ts),
[`loader.c`](../../../../sdk/runtime/loader/loader.c),
[`loader README`](../../../../sdk/runtime/loader/README.md), and
[`runtime.c`](../../../../sdk/machines/octatrack/elekloader/runtime.c).

The original plan listed base identity, active-set digest, module-ID inventory,
status, cached load readings, self-test status and `ui`/`png` readbacks. That
list is not a safe current diagnostic recipe; all such access remains suspended
until the exact executable client/connection path and scope are reviewed and
specifically authorized. UI/PNG output would not report physical lamp
brightness. Manual observation of panel response, lamp brightness and audible
routing remains intended future coverage, not a result. Any future evidence
must bind to the exact source/package/base, date, tester and observed baseline;
keep private raw evidence local and publish only reviewed, sanitized report
text.
