# MS-70CDR ZDL stream probe

D005 targets the original MS-70CDR with the pinned 2.10 updater and
MIDISTOMP V2.0.1. These are static observations from the privately built
image. The probe adds no file or patch operation.

| Operation | Loader sites | Static result |
| --- | --- | --- |
| Copy read | `0xc00a5518`, `0xc00a5934`, `0xc00a5944` | Destination, item width, requested count and stream. Copies up to the remaining bytes, advances the cursor and returns the count of whole items. |
| View read | `0xc00a55c4`, `0xc00a5800`, `0xc00a5900`, `0xc00a59ac` | Output pointer, item width, requested count and stream. Returns a pointer into the backing bytes through the output argument and advances by the returned whole items. |
| Seek | `0xc00a55a0`, `0xc00a57ec`, `0xc00a58e0`, `0xc00a5920`, `0xc00a5988`, `0xc00a5be8` | Stream, signed byte offset and origin. Updates the cursor and returns a status. |
| Close | `0xc00a6a70` | Called on the conditional cleanup path when the stream differs from the incoming one. The memory-backed callback returns zero. The loader owns the remaining teardown. |

The probe is limited to these ELF-loader call sites. It leaves unrelated
uses of the stream adapters alone. The ring keeps eight completion-order
records. It publishes each record before advancing its count. A USB read
that races publication is discarded; an idle retry returns a coherent
snapshot. Firmware and extracted stock bytes stay on the developer's
computer.

Hardware trace and branch coverage are pending.
