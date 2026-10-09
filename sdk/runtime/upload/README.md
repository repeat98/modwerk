# Stopped upload controller (development only)

This is original, freestanding ColdFire C for the first Elekloader runtime
loader. It manages a bounded update transaction and decodes a bounded request
frame. It is **not connected to USB or the stock firmware**, has no shipping
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

## Verification

```sh
sh sdk/runtime/upload/tests/run_host.sh
python3 -B sdk/runtime/upload/compile.py --output /private/NEW-source-build
```

The host tests exercise the real C controller and wire decoder against a fault
backend. Twelve groups cover retries, recording/callback changes, hash
corruption, partial preparation, split-core publication, failed restoration,
retirement, trial audio, disconnects, exhaustion and malformed requests. They
refuse 20,000 malformed chunks/frames and compare 115 SHA-256 vectors, including
padding boundaries and the maximum package size, with Python's independent
hash implementation. These are controller proofs, not hardware audio tests.

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
by the test backend. The base also needs mandatory logger/startup integration,
fresh session generation and bounded vendor USB queues/descriptors compatible
with MIDI/audio/storage. Only then can the first no-reboot physical test run.
