# MIDISC2.0 emulator measurement report

Measured on 3 October 2026 for the `0.2.4-experimental` metadata/evidence
revision. The author release remains MIDISC2.0 at
`4f9a89453fdcdd39a3cd57f010ffa489cac721cd`; no firmware instructions changed
from the preceding candidate. MAIN SHA-256:
`debb24090cada4be00bc70880136f14e813b0d3a9018b516f922d33671bd9b87`.
See [emulator.json](emulator.json) for recipe, tool, native source/library,
original emulator and instrumented executable fingerprints.

## Focused helper measurements

[focused.json](focused.json) retains each synthetic fixture's counts, return
and guard results. All 360 fixtures returned with the expected stack pointer,
intact MSC edge guards and an intact distant stack guard. The 270 clamp cases
also matched their expected output. The other 90 cases check termination and
guards; they do **not** assert complete storage round trips or MIDI message
correctness. Instrumented and original-machine probes produced identical
results for every case.

| Helper / entry | Cases | Maximum instructions | Maximum modeled cycles | Maximum observed stack bytes |
| --- | ---: | ---: | ---: | ---: |
| Parameter clamp / `0x400d2522` | 270 | 24 | 34 | 0 |
| Sparse pack / `0x400d2592` | 5 | 25,670 | 37,817 | 68 |
| Sparse unpack / `0x400d268c` | 24 | 1,995 | 2,483 | 44 |
| Crossfader apply / `0x400d28c8` | 60 | 31,863 | 47,642 | 156 |
| ACT Part commit / `0x400c4704` | 1 | 28 | 83 | 16 |

Clamp cases cover pages 0–4, parameter indices 12–17 and values -1, 0, 1,
6, 7, 95, 127, 128 and 255. The checked ARP boundary maxima are 1, 6, 95
and 7 for its four restricted fields, with 0–127 for the other fixture fields.
Pack cases cover empty, 46 locks near the beginning/middle/end of the 4,096-byte
state and fully populated state. The 46-lock late-position cases force the
complete state scan; full state alone is not its most expensive case. Unpack
covers counts 0, 1, 32, 46, 47 and 255 at Part indices 0, 1, 3 and 15.
The latter index is a synthetic robustness fixture, not a valid OT Part.
Crossfader cases cover 0/1/16/32/46 sparse locks, positions 0/1/63/64/126/127,
values 0/127 and controller slots distributed over eight MIDI tracks.
The ACT probe enters the real sync helper directly.

These are observed maxima for the declared fixtures. They do not constitute
branch-complete worst-case bounds. In particular, the clamp matrix is not a
complete parameter-page matrix, and the crossfader fixtures do not cover all
active trig-lock, MIDI LFO, arpeggiator, SCNCTRL5, copy/paste, Part reload or
project reload paths.

## Actual panel and playback

The 97-command stopped MKII panel scenario sends real keys/encoders, assigns
controller 74, enables CC1, edits scenes A/B and releases the scene keys.
The unchanged native emulator and earlier instrumented build produced matching
command/frame/LCD/state/panel-UART observations. The retained final run repeats
the scenario with instrumentation enabled and disabled in the same executable.
The final eight-track run repeats this comparison through real playback,
pattern changes, crossfader sweeps and MIDI UART injection. Every command reply,
LCD/state fingerprint, sample/frame progression and audio hash must agree.
The final eight-track scenario sends 795 commands and captures 401,316
audio frames (9.10 seconds at 44.1 kHz). All eight stems are nonzero, with
16-bit peaks 371–388, and the audio status reports zero dropped frames.
MIDI UART0 output grows to 103 bytes. These counters do not prove the receiver
or message ordering. See the JSON report for each track and pattern observation.

The first staging attempt used an incorrect project-relative WAV path and
produced silent stems. That run is excluded from the final evidence. The path
was corrected to `../AUDIO/STRESS_LOOP.wav`; the runner now rejects any silent
stem or dropped-frame status.

The private project fixture uses eight FLEX audio tracks, 24 audio LFOs,
a deterministic two-second stereo sample and four patterns with 16/32/64 dense
steps followed by a 64-step trigless-lock pattern. Both FX slots are NONE.
Each of eight MIDI tracks is configured through the panel for an output
channel, controller 74 and scene values. Four pattern selections exercise
Part transitions. UART input sends `B0 01 00`, `B0 01 7F` and `B0 4A 40`
between seven crossfader positions per pattern.

Audio metrics use the emulator's actual per-track mixdown stem taps. A captured
frame count alone cannot prove active audio. The report records each track's
peak and nonzero sample count, captured audio hash, dropped-frame counter and
MIDI UART0 output byte count. Panel UART bytes are labelled separately and
are not MIDI output. No raw audio/UART/LCD/RAM, project or card is published.

Helper intervals in the RTOS run are **inclusive**. They can include stock
callees, interrupts and scheduling; they are not isolated module self costs.
The crossfader interval reaches 377,226 instructions / 465,454 modeled cycles
under this sounding workload, including stock and interrupt work; its observed
stack use is 620 bytes. The largest recorded stack use across tracked helpers
is 624 bytes. No tracked calls remain unfinished at shutdown. Observed stack
minima can include interrupt frames. The report retains all
tracked completed-helper maxima and unfinished-call counts without presenting them
as static bounds. This short emulator run is not a physical stress test or
maximum-effects workload, and it does not verify MIDI receiver behavior or
CC/note ordering.

## Timing model and remaining bounds

The native machine selects `M68K_CPU_TYPE_MCF5206E`. Its
`m68kcfcycles.h` uses MCF5206E zero-wait/cache-hit core timing and retains
68020 estimates for unsupported instructions and exceptions. V4e semantics
are supplied by compatibility callbacks; A-line instructions do not receive
an exact V4e price in the raw cycle counter. The focused fixtures report the
number of V4e instructions as well as unpriced A-line instructions.
Zero observed A-lines does not establish accurate V4e timing.

The emulator's sample progression is instruction paced. It cannot turn this
hybrid counter into actual MCF54454 wall-clock cycles, or establish contention,
stock scheduling reserve and a real-time deadline. No defensible complete
cycle budget or maximum modulation/control branch bound has been established.
`chipWorstCaseCycles`, qualification `worstCase` and `budget` therefore remain
null. DSP code is unchanged by this author patch; the full-DSP run exercises
both emulated cores but supplies no physical cycle/stack canaries.

## Memory measured from this exact build

Two independent firmware boundary operands, at `0x4000046c` and `0x4009700e`,
move the stock scratch boundary from `0x40a955e0` to `0x40aa75e0`.
The difference is exactly **0x12000 / 73,728 bytes**. This reservation covers
live scene storage and checkpoints and is distinct from the 9,027-byte patch.
The JSON report records both boundary observations without retaining firmware
instructions or original values from other memory locations.

| New scratch partition | Start | Exclusive end | Bytes |
| --- | --- | --- | ---: |
| Live MSC: 16 scenes × 8 tracks × 32 slots | `0x40a955e0` | `0x40a965e0` | 4,096 |
| Scene clipboard partition | `0x40a965e0` | `0x40a966e0` | 256 |
| Sparse checkpoints: 16 × 144 | `0x40a966e0` | `0x40a96fe0` | 2,304 |
| Bookkeeping, trig snapshots and unassigned/padding partition | `0x40a96fe0` | `0x40a975e0` | 1,536 |
| Full checkpoints: 16 × 4,096 | `0x40a975e0` | `0x40aa75e0` | 65,536 |
| **Reserved total** | `0x40a955e0` | `0x40aa75e0` | **73,728** |

The 1,536-byte partition includes observed 256-byte trig snapshot writes
at `0x40a97060`–`0x40a9715f`. Its remaining bytes are not fully attributed.
The table partitions the verified reservation; it is not a complete allocation
or lifetime audit. Runtime write extents are retained separately in the JSON:
a touched-byte count must not be added as though it were an allocation.

The patch overlays 85 existing firmware regions and reuses stock bank/Part
storage, controller lanes and stacks. It adds no separate firmware length or
DSP payload. The largest focused stack observation is 156 bytes; inclusive
RTOS stack observations appear in the report and can be larger. Their complete
upper bound, reused stock RAM ownership/lifetimes, code/state split and all
remaining transient/heap bounds are not yet established. Full module memory
qualification remains null rather than equating reservation or written bytes
with its total.

## Reproduction and release boundary

Run [the private harness](../../../../scripts/midi-scenes-emulator/README.md)
with the exact reviewed inputs. It reconstructs the locally verified MAIN,
links already-reviewed native libraries, runs both measurement/reference
variants and exports only aggregate JSON. Temporary firmware, native copies,
card/project files, raw observations and executables are removed afterwards.
These diagnostics never run during application checks or visitor builds.

The owner-accepted [hardware report](hardware.md), original LCD captures and
standalone browser/native MAIN/ELEK/ELUP proofs are retained. Updating the
candidate metadata to `0.2.4-experimental` changes no author instructions or
image hash; the original captures continue to identify that exact image.
Neither this report nor a successful emulator run enables public selection
or firmware download. Existing publication, qualification gates and the
frozen eleven-module baseline remain unchanged. A future promotion must
complete the missing bounds/control coverage and the constrained standalone
integration through the existing configurator and firmware builder.
