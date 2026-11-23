# MS-70CDR ZDL stream probe

D005 targets the original MS-70CDR with the pinned 2.10 updater and
MIDISTOMP V2.0.1. Source `6af58d609`, Main SHA-256
`d1a2b0c4ba583abf3a45e9e8ec9b56c086f35721dce026473fe7c8e96525ca6c`.
The preset bytes matched D004 and the released base. These are static observations from the privately built
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

| Local verification | Result |
| --- | --- |
| Pinned updater and patch sites | The full build changed the guarded instruction words and added one private probe section. Other loaded bytes and the preset matched the baseline. |
| Assembled C674x probe | Ziddle's CPU core (archive `1793487371`) ran the exact linked probe with stand-ins for the original callees and MIDI sender. All five wrappers preserved their original arguments, return value, B3, stack and callee-saved registers. Initially enabled and disabled interrupts returned to their original state. |
| MIDI and trace ring | The same exercise made 13 calls, verified all eight wrapped slots and both wire replies, accepted interleaved MIDI clock, rejected malformed commands and omitted a snapshot interrupted by a publication. |
| Host tools | 97 focused tests passed, including the CLI dispatch, old identity and counter behavior, trace ordering and invalid replies. TypeScript and targeted lint passed. |
| Base test procedure | The SDK checks and exact-build identification passed with the unit disabled. |

Hardware trace and branch coverage are pending. The first run must
observe the real seek and read results and find a cleanup path that calls
close. [TI C674x instruction set, including interrupt control](https://www.ti.com/lit/ug/sprufe8b/sprufe8b.pdf)
