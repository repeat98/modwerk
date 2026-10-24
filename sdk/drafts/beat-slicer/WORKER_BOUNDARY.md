# Whole-command worker observer

`worker_boundary.c` is a shared-base research component. It does not assign a
hook, export an ABI, install a reader, or establish complete writer coverage.
Its guard must remain disabled for live source admission until the other writer
and ownership requirements in [BASE_CONTRACT.md](BASE_CONTRACT.md) are met.

The proposed single-consumer boundary surrounds each complete engine command:

1. At the next queue receive, retire the previous command's ticket under the
   caller's serialization boundary.
2. Release that boundary before the queue can wait or schedule another task.
3. After receive returns, invalidate old previews and acquire a new writer
   ticket before handing the message to the stock dispatcher.
4. Keep that ticket through dispatch, nested writers and optional completion
   posting, until the next verified receive boundary.

This deliberately excludes previews during every command, including commands
that do not change PCM. It does not inspect an opcode allowlist or trust the
queued pointer as an identity. The dispatcher still receives the exact pointer.
Failed commands, unknown opcodes and exhausted UI completion records do not
need special completion paths. A stalled worker stays excluded: neither a
timeout nor the UI's busy flag can retire it.

The binding and callbacks must stay valid for the whole worker lifetime. All
guard users need the same serialization boundary. The queue callback is never
called with the observer's lock held. Reentrant receives, missing tickets and
identity exhaustion fail closed for previews while preserving valid queue
callback behavior. Malformed bindings are rejected before touching a possibly
unprotected guard; native installation must reject them before stock can call.

## Native investigation

The hash-bound 1.40C worker calls queue receive at `0x40084854`, passing its
queue on the stack and consuming the returned pointer in D0. The private
fixture redirects only this complete six-byte call's target operand. Its
return address and the following instructions remain stock. This is an
experimental call substitution, not a reviewed production patch guard.

`worker_native.py` compiles the original observer, guard and test binding with
the pinned ColdFire toolchain. The CPU fixture executes stock queue, dispatcher,
edit and completion code. It checks four packed-format gain paths, busy and
empty-range refusals, null/exhausted completion, release, unknown opcode, crop
refusal and two queued commands with distinct native tickets. PCM results and
completion records remain checked independently. It observes the native guard's
actual writes; the historical host guard is not the observer under test.

The initial twelve cases pass. The observer occupies 398 text bytes, with no
own data/BSS; its caller supplies the binding and guard. Its local stack report
is 28 bytes excluding callees. The largest observed observer-masked run is 49
executed instructions. This is neither cycle accounting nor physical latency.
The isolated test has a display mock and no scheduler, UI consumer or DSP.

`boot_worker_native.py` runs a separate full-boot experiment. It requires
an explicit private-injection opt-in, an exact native test receipt and the
pinned upstream arena helper. Three pages are reserved at the top of the audio
pool before boot. Original observer code goes sixteen bytes into that reserve,
leaving stock's known one-long clear overrun outside code. The test never uses
an unreserved address in stock's globals/heap or delay rings as executable
scratch. The reduced pool and code/canaries are checked. No device or saved
card is modified. The two-reversal run passes with five tracked edit/waveform commands; see
TESTING.md for its exact result and limits.

## Existing base ownership

The current base already owns the six-byte idle and job sites at `0x4008484e`
and `0x4008485e` through `sdk/runtime/logging/stock-guards.json`. Its generated
shims preserve registers and replay the displaced instructions. Shared source
ownership should extend these base-owned boundaries after review; a module
must not claim either site or add its own receive patch. The private receive
wrapper above is an experiment, not the deployment recipe.

`modwerk_idle_hook` currently services USB/module sets before the logger idle
hook. Retiring a prior command only at the receive call would keep it excluded
through that service. A future background reader scheduled there needs an
explicit ordering decision, and the service's owner/source mutations need
coverage too. The full-stock observer test runs neither that base chain nor
USB installation/removal, so it does not establish their compatibility.

## Still required

The first command already waiting inside an unwrapped receive at installation
can escape the new call boundary. Initialization must therefore start closed
and establish quiescence before admission; installing the call is insufficient.
The fixture's synthetic enabled guard authorizes no live read.

This observer does not cover recorder/interrupt writers, metadata edits on the
UI task, another caller of a writer, or a future dispatcher exit that bypasses
receive. It does not prove cache coherency, native interrupt duration, module
removal or source lifetime. Broad invalidation may also cause preview starvation
under command traffic; a full integration must measure useful progress.
Review all incoming control flow and actual command paths before proposing a
base site. The shared-base implementation and loader/resource adoption still
need their own owner-reviewed prerequisite.
