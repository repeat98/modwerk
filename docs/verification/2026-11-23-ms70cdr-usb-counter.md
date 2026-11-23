# MS-70CDR System counter over USB

D004, source `949265d78`, built on 23 November 2026 from the original
MS-70CDR 2.10 updater and pinned MIDISTOMP V2.0.1. Main SHA-256
`e2d266c7bd9ef3ea33829637987ed010e9bfd22b9ab7c29b2682db530c6548e6`.
The private CLI build and the local installer build matched. The preset
hash matched the released base.

| Check | Result |
| --- | --- |
| Guarded header, draw and MIDI branches | The private-updater test verified the three original hashes, the packet-continuation bits and the single new AIS section. |
| MIDI return path | C674x disassembly showed the stock MIDI sender, the original MIDISTOMP diagnostics target and the preserved return address. |
| Host USB protocol | Zero and the full unsigned counter range decoded correctly. Other reply types and nonces were ignored, and older builds omitted the field. |
| CLI and shared MCP status | Both returned the counter through ZoomLink against a simulated pedal. 95 focused tests passed. |
| Base test procedure | The SDK checks and exact-build identification passed. The procedure has no MS-70CDR device adapter. |
| Original pedal | D004 boot and counter read pending. A read-only identity request confirmed the pedal was still on D003 and the owner reported `00000030` on System. |
| Header read during an effect load | Pending on D004. Record two stable idle reads, then compare before and after a normal effect load. |
