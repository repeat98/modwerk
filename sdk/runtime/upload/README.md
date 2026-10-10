# Stopped upload controller (development only)

This is original, freestanding ColdFire C for the first Elekloader runtime
loader. It manages a bounded update transaction, decodes a bounded request
frame and carries frames over an EP0 vendor transport. It is **not connected
to USB or the stock firmware**, has no shipping
catalogue entry, does not execute modules and is not a flash candidate. The
production Octatrack builder remains unchanged. Keep the whole migration on
`codex/octatrack-elekloader-migration` until its implementation and hardware
qualification are stable; the foundation-only PR was closed at the owner's
request on 9 October 2026.

## Implemented contract

The caller supplies an exclusively owned staging region, exact base identity,
fresh session identity, current module-set digest/generation and a complete
device backend. There is no default memory address or free-memory assumption.
The protocol maximum is 1 MiB; it is not an OT reservation or a measured RAM
budget. SHA-256 integrity is not module authorization or an execution sandbox.

1. Enter upload mode. The backend must hold transport and live recording and
   quiesce callbacks. Safety is read from the device, never accepted from a
   host flag. These holds must persist until the backend releases them.
2. Begin a complete proposed set, bound to base, session, generation, length
   and digest. Transactions increase monotonically in a session. Exact begin
   and chunk retries are idempotent; changed retries, gaps, overlaps and
   overflow are refused before mutation.
3. Hash the complete received region, then ask the backend to parse/admit and
   prepare the candidate separately. Failed or partial preparation releases
   candidate resources only. Failed cleanup keeps upload mode held.
4. Rehash staging and recheck stopped/quiescent state before publication. A
   backend must positively acknowledge the new dispatch, or positively report
   that old dispatch is unchanged. A missing, invalid or uncertain result
   enters recovery and reports the active identity as unknown.
5. Leave into trial playback with the previous set retained. No new staging
   is allowed during trial. Re-enter stopped upload mode to accept the tested
   set and retire old references, or to restore the previous set. A failed
   retirement keeps the previous resources; a failed restoration blocks
   leaving upload mode. Publication, restoration and retirement need actual
   acknowledgement from both DSP cores when either core is affected.
6. Disconnect during staging discards the candidate. Disconnect after
   publication attempts a stopped restoration and then exits. If recording
   or callbacks prevent a hold, or restoration is unconfirmed, recovery
   remains pending. The real device adapter must expose and retry that state;
   a disconnect alone cannot prove rollback.

One engine-task owner serializes requests. USB interrupts must queue bounded
frames for that owner; hashing, admission and callbacks never run in an audio
or USB interrupt. Control holds, backend results, cache handling, dispatch
publication and acknowledgement deadlines still require real adapters and
emulator/hardware verification. A backend may not claim success on a timeout.

## Wire envelope, version 1

All integers are big-endian. C structures are never sent over USB. A future
vendor transport delivers one complete frame; it may not expose raw memory
addresses. `wire.c` rejects a short output buffer before performing any action.

| Request offset | Field |
| --- | --- |
| 0 | `MWUP`, four ASCII bytes |
| 4 | Version, u16 = 1 |
| 6 | Command, u16 |
| 8 | Transaction, u32 |
| 12 | Body length, u32; must equal actual received length minus 48 |
| 16 | Fresh session identity, 32 bytes; mandatory for every mutating command |
| 48 | Body |

Commands in `wire.h`: HELLO (0), ENTER (1), BEGIN (2), CHUNK (3), VERIFY (4),
COMMIT (5), ACCEPT (6), ROLLBACK (7), ABORT (8), LEAVE (9), DISCONNECT (10).
HELLO and ENTER use transaction zero. LEAVE/DISCONNECT require the current
transaction (zero before any begin). Other actions use the offered transaction.
HELLO accepts no body and can discover the current session without knowing it.
The USB connection's authorization remains the transport's responsibility.

BEGIN's 72-byte body is base digest (32), proposed package digest (32), current
generation (u32), package length (u32). CHUNK's body is offset (u32) then 1–4096
bytes. Every other command has no body. Maximum frame size is 4148 bytes.

Every response is 144 bytes: `MWUR`, version u16, echoed command u16, echoed
transaction u32, body length u32 = 128, then result, phase, active-known flag,
generation, last transaction, current transaction, received bytes and capacity
(eight u32 fields), followed by base/session/active digests (32 bytes each).
An unknown active identity is encoded as zero, with active-known zero. Hosts
must check result, phase, session and active-known rather than treating a
successful transfer or reconnect as successful activation.

## EP0 vendor transport, version 1

`vendor.c` carries one wire frame at a time over vendor control requests to
a Modwerk interface with no endpoints (class `0xFF`, subclass `0x4D`,
protocol 1). EP3 OUT, the only free endpoint, stays available for USB Audio
In. The transport is **not connected to the USB stack**; see the
[migration record](../../../docs/OCTATRACK_ELEKLOADER_MIGRATION.md#what-the-imported-usb-stack-leaves-for-the-vendor-interface)
for the glue still missing.

| Request | bmRequestType | bRequest | wValue | wIndex | Data |
| --- | --- | --- | --- | --- | --- |
| SUBMIT | `0x41` | 1 | sequence | interface | one complete frame, 48–4,148 bytes |
| RESULT | `0xC1` | 2 | 0 | interface | wLength 152; 8 bytes back, or 152 when ready |
| IDENTIFY | `0xC1` | 3 | 0 | interface | wLength 72; the identity block below |

IDENTIFY is read-only and answered by the USB interrupt from a block built
once at start-up: `MWUI`, transport and wire versions, capabilities, the
maximum frame and result lengths, four reserved zero bytes, the base digest
a model name of 1–16 printable ASCII characters and eight reserved zero
bytes. No reply is a multiple of 64 bytes, EP0's packet size: on the OT the
controller then queues a zero-length packet the host never reads, which
answers the next IN request and leaves stock's EP0 handler looping until
another request arrives (measured on hardware). Capability bit 0 means
the glue can receive SUBMIT data stages. Without it SUBMIT and RESULT stall
and only IDENTIFY answers, which is the first firmware milestone: it needs
no control OUT data stage. The browser refuses an identity whose versions,
limits, reserved bytes or model it does not recognise.

A result starts with `MWUT`, version 1, a status (0 none, 1 pending, 2 ready,
3 refused) and the device's latest sequence (u16, big-endian). A ready
result appends the controller's 144-byte response. Refused means never
executed.

- An invalid identity at start-up leaves a transport that stalls every
  request to its interface and passes all others to the existing handlers.
- The USB ISR only receives a complete data stage into the one frame slot
  and answers RESULT. The controller's engine-task owner executes the frame
  (`mv_service`). A queued frame is never overwritten: SUBMIT stalls while
  one waits.
- A sequence executes at most once. SUBMIT stalls for the current sequence,
  for lengths outside the frame bounds and after a bus reset the owner has
  not yet handled. A stalled SETUP receives no data.
- A short data stage, a new SETUP during the data stage (`mv_abandon` for one
  the stock stack handles itself) or a reset marks that sequence refused.
- A bus reset or unplug becomes the controller's disconnect, after any frame
  queued before it. That aborts staging, rolls back an unaccepted set and
  leaves upload mode, as the contract above defines.
- A host that goes quiet without a reset (an app or driver hang, a cable
  that still carries power) is handled the same way: the machine's tick
  calls `mv_tick`, and after its limit without any request to the vendor
  interface while an upload or trial is open, the engine runs the
  disconnect. If playback prevents the rollback, the next lapse retries it.
- Reading RESULT has no side effects. The browser transport
  ([`upload-usb.ts`](../../../src/engine/elekloader/upload-usb.ts)) continues
  from the device's latest sequence and never reuses one. It reconciles an
  unconfirmed SUBMIT by reading RESULT, retries only a positively refused
  frame under a new sequence, and otherwise rejects, so the session marks the
  connection unconfirmed.

The glue must keep the structure on the uncached alias and each reply
within one transfer-descriptor page. The ISR functions use at most 28 bytes
of stack in the compiler's report; that is not an interrupt-stack proof.

## Verification

```sh
npm run upload:verify
python3 -B sdk/runtime/upload/compile.py --output /private/NEW-source-build
```

The host tests exercise the real C controller and wire decoder against a fault
backend. Twelve groups cover retries, recording/callback changes, hash
corruption, partial preparation, split-core publication, failed restoration,
retirement, trial audio, disconnects, exhaustion and malformed requests. They
refuse 20,000 malformed chunks/frames and compare 115 SHA-256 vectors, including
padding boundaries and the maximum package size, with Python's independent
hash implementation. These are controller proofs, not hardware audio tests.

The browser's [wire codec](../../../src/engine/elekloader/upload-wire.ts) and
[session client](../../../src/engine/elekloader/upload-session.ts) use TypeScript
and the same Elekloader SHA-256 implementation as the builder. The client binds
the exact base, fresh session, transaction, generation and module-set digests.
It copies and pin-checks the proposed package before entering upload mode,
stages in bounded chunks, then leaves activation, trial playback, acceptance
and rollback as separate actions. Positive staging refusals/cancellation
discard the candidate and exit an upload hold that this operation entered.
Acceptance never runs automatically.

A missing, late, malformed or inconsistent acknowledgement stops the connection.
The client preserves its **last confirmed** status, marks the connection
untrusted and sends no further commands on it. That snapshot is not the
current device state after an unconfirmed command. In particular, a lost
publication acknowledgement cannot be reported as a successful update or a
confirmed rollback. A fresh transport can identify the device read-only;
cross-connection recovery and the real USB adapter remain to be implemented.
Each exchange has a bounded deadline; operations cannot overlap. Cancellation
is checked between acknowledged chunks rather than racing an in-flight command.

`tests/wire_probe.c` runs the real C controller and decoder with an authored,
synthetic backend. `scripts/verify-upload-wire.mjs` drives it with the actual
browser client in **23 scenarios**, including the 1 MiB protocol maximum,
trial/accept/rollback, a second transaction without process restart, rejected
package pins, cancellation, preparation/publication/retirement/restoration
faults, stale or malformed acknowledgements, a lost publication reply and
deadline/concurrency limits. The codec has 19 independent header/boundary tests.
Use Node 24, a host C compiler and Python for this developer test command;
none is a browser-user dependency. The peer executes no module code and these
results do not qualify device audio, memory ownership or USB operation.

The same command tests the EP0 transport. `vendor_test.c` compiles
`vendor.c` with its controller calls renamed to counters, then checks request
routing, the identity block and its refusals, bounds, busy and duplicate
refusals, incomplete data stages, reset
ordering and 400,000 random host, bus and engine events: every accepted frame
executes exactly once and in order, and nothing else executes. Removing any
one of seven safety rules fails it. `verify-upload-usb.mjs` then runs the
browser transport and session client against the real C transport and
controller through a byte-stream stand-in for EP0: read-only identity, a
device without a data stage, a full upload with one execution per exchange, a lost status stage, an unhandled reset, a short data
stage, repeated refusals, another client's submission and a frame that never
completes. These exercise no USB controller, descriptors or timing.

Native compilation uses GNU `m68k-elf` for MCF54455, strict warnings, no libc
assumptions and no unresolved symbols. Compiler stack reports are recorded
privately; they are not chip timing or complete call/interrupt-stack bounds.
Objects contain only authored code and standard SHA constants. No stock,
firmware or device is read by either command. Authored code is GPL-3.0-or-later.

## Remaining integration

The backend still needs a trusted runtime-bundle parser, dependency/ABI and
legacy-state validation, resource admission for ColdFire and both DSP cores,
independent code/state regions, cache maintenance, permanent dispatch and
confirmed restore/retirement. No module lifecycle implementation is supplied
by the test backend. The private base now includes logger/startup source ports;
they still need exact selected-module identity and broader qualification.
The private base's EP0 glue (`sdk/machines/octatrack/elekloader`) already
carries frames to a read-only controller in the emulator; it still has to be
combined with USB MIDI and USB Audio in one base. Only then can the first
no-reboot physical test run.
