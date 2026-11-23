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
| Boot and USB status | The owner installed D004 locally on the original MS-70CDR. The CLI confirmed D004 and returned 2. The shared MCP subsequently returned D004, counter 8 and 166 files through CoreMIDI. |
| Header read on editor exit | The counter stayed at 5 and 6 through the idle and MIDI patch queries, then returned 6 and 7 after the respective editor exits. |
| Patch state | Before and after the two checks, the selected program and the MIDI readbacks of both the active edit buffer and its saved slot matched their respective baselines. |

The USB check followed the pedal's documented editor session. It opened
editor mode with `50`, read the program and the two patch payloads with
`33`, `29` and `09`, then closed editor mode with `51`. The last
verification read closed another editor session, taking the count to 8.
[MS-70CDR MIDI measurements and implementation](https://github.com/sixeight7/VController_v3/blob/master/Firmware/VController_v3/MD_ZMS70.ino)
