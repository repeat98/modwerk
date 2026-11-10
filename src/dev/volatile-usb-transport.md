# Private volatile USB adapter

`src/dev/volatile-usb-transport.ts` prepares fixed MWVB submit (34), MWVS result
(35) and cached state (36) transfers for the proposed capability-64 service.
It is not imported by the public site or MCP and neither claims nor releases
a USB interface. It adds no persistent, generic vendor or memory operation.

The caller must already hold the exact vendor interface exclusively and obtain
the real base, boot-session identity and capabilities through a separately
qualified device connection. A supplied capability is not board qualification.
Unsupported capability, zero/malformed identity or invalid configuration is
refused before any USB call. Only bounded, immutable MWVB frames bound to those
identities reach request 34; structural status parsing grants no ownership.
Copies use plain `Uint8Array` construction so Node Buffer inputs cannot retain
their parent slab or share mutable bytes through Buffer's `slice()` behavior.

One complete EP0 transfer runs at a time. Concurrent calls are refused before
a second packet is sent. There is no internal queue, automatic retry, cached
result adoption or hidden renewal. OUT needs an exact positive byte count;
IN needs exactly 212 bytes with the expected complete status framing.

Cancellation, timeout, lost/short/stalled or malformed replies permanently
poison the adapter and block all future packets. WebUSB/native USB may complete
an already submitted transfer after host cancellation; a late positive reply
cannot revive the adapter. Keep exclusive device ownership until the qualified
recovery path resolves unknown work. A new client must not adopt that work from
cached status. The device's independent expiry and retained journal remain
required and unqualified by these host fixtures.

The adapter exposes the structural `submit`, `result` and `state` contract for
the private session client. Integration still needs real interface arbitration,
device disconnect/visibility handling, exact board source/resource admission
and full physical rollback. Synthetic transport regressions establish only
host request bounds and failure behavior, not board execution or persistence.
