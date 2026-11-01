# MIDI Feedback testing

Development record, 2026-11-01. Not hardware-qualified. Do not infer release
readiness from compilation or from a read-only emulator probe.

## Environment

- Windows host; Ubuntu under WSL, commands executed by the developer because
  this agent's shell receives Wsl/E_ACCESSDENIED.
- Developer-built analog-emu/rytm-emu, local source checkout.
- Analog Rytm MKII stock OS 1.74, SysEx SHA-256
  `cb0f99d620edde994fb860c0e79cc2464e427d06882828cfdfb00fc53700e123`.
- Modwerk's imported core-ar2 0.7, compiled locally with m68k-linux-gnu tools.
  This is a development toolchain, not the pinned release compiler.
- Firmware, card, snapshots, build receipts and symbol maps stay in the private
  workspace outside this repository. No real instrument has received a build.

## Results observed

The private host scheduler test compiled with `cc -std=c99 -Wall -Wextra
-Werror` and passed. It exercises all 84 channel/CC assignments, four-message
batches, no repeated unchanged values, blocked-output retry with the latest
value, channel reassignment and disabling, value clamping and reset.

The first local linked build combined the module and core 0.7 without patch
overlap, verified unchanged non-main firmware sections and ran for 8 billion
emulated instructions. Its read-only diagnostic recorded 707 UI ticks, default
OFF, and zero module MIDI messages. Six sound parameter reads returned the
instrument's initial values. The developer reported that the stock OS 1.74
emulator window had reached its ordinary main screen before this build.

A subsequent named local probe, stored privately as `feedback-probe.syx` with
its build receipt, injected channel 1 messages at instruction counts 7303M to
7603M. The sound reads matched: CC74=61, CC75=23, CC78=11, CC80=73, CC82=29,
CC83=41. Its generic parameter getter did not read Track LEVEL correctly. The
local snapshot instead held LEVEL=37*256 in the kit's separate level array,
matching injected CC95=37. This caught the distinction before output enabled.
The adapter now reads that separate array. These are emulator observations,
not proof of analog audio, controller pickup or hardware timing.

A further private probe compiled the output adapter and ran it with core 0.7.
After the initial stopped boot, emulator RAM was configured for feedback ON,
ENCODER DEST INT+EXT, CC output and the existing MIDI+USB destination. This
does not test the menu callbacks. Over a further 3 billion instructions it
emitted exactly 85 complete CC messages: one for each of 84 assignments on
channels 1–12, then one additional channel-1 CC95 when LEVEL changed from 37
to 55. Diagnostic `sent` was 85 and the final seven values were
55, 61, 23, 11, 73, 29, 41. The test observed no unexpected MIDI message type.
Physical DIN transmission and saturated-queue behavior remain unqualified.

Windows WinMM enumeration found the connected Faderfox PC12 and a separate
Analog Rytm MKII. Only the PC12 input was opened for the initial monitor:
541 received messages, all channel 1 CC95, zero monitor queue drops. The
developer identified the moved pot as Track Level. The real Rytm ports were
not opened.

For the end-to-end test, the developer ran that private build's GUI in WSL
with its DIN TCP port on loopback 7322. A Windows bridge opened only the
PC12 WinMM input/output. A channel-1 CC95=96 test change sent to the emulator
returned as CC95=96 and was written successfully to the physical PC12 USB
output at 0.063 seconds. With the physical pot fully left and snap mode on,
the developer reported the pickup target/arrow at 96 and no change while
moving halfway; the input log contained no outgoing pot CC during that part.
The first subsequent received pot CC was exactly 96, at 88.828 seconds.
The emulator then returned changing values 97 through 100. When the pot was
turned back left, the log recorded decreasing CC95 feedback down to zero,
and the developer confirmed the emulator's bottom BD LEV bar shrank. The
agent also observed that bar empty in the modified emulator window.

This passes the tested Track Level pickup path with the physical PC12 over
USB and an emulated instrument. It is not a test of firmware installed on a
physical Rytm, physical Rytm DIN latency, other PC12 assignments, recalls,
persistence or a busy MIDI link. The real Rytm's Windows MIDI ports were not
opened. No instrument firmware was transferred.

The developer subsequently reported seeing both module rows below SYSTEM in
GLOBAL. Selecting MIDI FEEDBACK and pressing YES changed ON to OFF; pressing
YES again returned it to ON. This is developer-reported emulator UI evidence;
an automated capture is still pending. With the bridge connected and pots
still, the developer then selected SEND FEEDBACK once. The Windows log
recorded exactly 84 output CCs, 84 distinct channel/CC assignments: channels
1 through 12 and CC74, 75, 78, 80, 82, 83, 95. The first-to-last message span
was 1.000 seconds. Every WinMM output call returned success. This passes
the manual-refresh output check on this emulator/PC12 USB setup.

The developer then reported setting MIDI FEEDBACK to OFF and selecting SEND
FEEDBACK once. The same live bridge log stayed at 84 output messages, with
no messages after the prior refresh ended. The bridge process was still
running when checked. This passes disabled manual-refresh silence for this
run; disabled behavior during incoming edits remains a separate check.

## Automatic-refresh update

The next implementation requests a full refresh every 40 UI ticks while
enabled, preserving the output cursor. Its host test also exercises repeated
refresh requests arriving faster than a full batch can drain, verifying later
tracks remain reachable. In the first private automatic-refresh build
(`b649b16bc9d99248c8035dfda467422737282422d9e4b6bcd07020d423d30818`,
the SHA-256 of the full local SysEx), the 15-second enabled output probe
recorded 673 messages covering all 84 assignments and six repeats of the
changed channel-1 Track Level value. No SEND FEEDBACK action was used.

That build's nine lifecycle checks passed: module OFF, ENCODER DEST INT,
NRPN mode and USB-only output each emitted zero bytes while stock CC input
still changed Track Level; channel OFF suppressed that track's assignments;
reassigning Track 1 to channel 16 moved its output; stock quick-save/reload
restored all seven tested values; a virtual power-off followed by a cold
card boot retained feedback ON; and a 60-second DIN-rate flood completed.
The flood injected 187,538 bytes and recorded 5,269 new feedback messages,
7,878 coalesced pending updates and zero deferred sends. It establishes
progress without a hang, not audible output, absence of stuck notes or
hardware timing. The input contained paired note-on/velocity-zero note-off,
CC, clock, active sensing and stop; the stock tempo word was set to 240 BPM.

A subsequent code review made DIN admission more conservative: reserve the
whole active DMA block plus pending bytes, rather than relying on the
hardware's changing remaining count. The final private build's full SysEx
SHA-256 is `7bb7fb434981d0d5f144cfdb7c8e6bf29c10c849fcdb6207a5d72e17796c2b05`.
Its host tests, automatic output probe and all nine lifecycle checks passed
again with the figures above. The development package has 1,974 bytes of
`.run`, 688 bytes of `.bss` and zero fast bytes; this excludes core 0.7 and is
not a pinned-release-toolchain measurement.

For the updated PC12 test, a separate GUI restored this build's active
snapshot and exposed DIN TCP on loopback 7323. Without SEND FEEDBACK or a
test-target message, the Windows PC12 bridge recorded repeated channel-1
CC95=55 at two-second intervals. The first received PC12 pot value was 55;
later emulator feedback covered values 21 through 109. The developer
reported smooth control for the requested ten-second back-and-forth test,
without repeated stopping or needing pickup again. Thus the measured
background refresh and developer-reported smooth pickup passed together
for Track Level on the physical USB PC12 plus the emulated Rytm.

## Pinned candidate MF02

The source at commit `1bf73478ada7` was compiled twice in isolated containers
using GCC 16.2.0, Binutils 2.47.20260726 and Node 24.21.0. Both complete build
directories matched byte for byte. The source-only export checker reproduced
29 committed exports, including this module. Its package SHA-256 is
`95ef570f6d9ca0704dfa03a852fdfbf93ae67f4ff28464245c7a758a0c206b6f`.
It contains 1,914 bytes of `.run`, 688 bytes of `.bss` and no fast section;
2,602 bytes total, excluding core 0.7.

The exact exported package was linked locally with the reviewed core-ar2 0.7
package. The linker found no overlaps, verified each core patch against stock,
and verified unchanged firmware sections 1, 2, 5 and 8. The full private MF02
image SHA-256 is
`362313ce6f35dc3ae54126f1d3dac108b3e4c787f9087d41130261a85d7cc84b`.
That image passed the host/output probe (673 messages, 84 assignments, six
automatic repeats of the changed Track Level value) and all nine lifecycle
checks, including virtual power-cycle retention and the 60-second MIDI flood.
Details and compiler identities are in `evidence/pinned-candidate.json`.

MF02 has not run on a physical Rytm. The PC12 pickup and menu captures above
remain evidence from their explicitly named development images. No physical
Rytm qualification or owner approval is implied by reproducible compilation.

## Outstanding release qualification

- Physical Rytm DIN output and timing; the emulator output and disabled
  silence checks passed.
- Screenshot provenance; toggle labels were reported working and manual
  refresh output was measured on the emulator/PC12 bridge.
- Duplicate channel handling and all PC12 pot assignments; emulator channel
  OFF and reassignment checks passed.
- Other kit/project transitions and real-device reboot/persistence; emulator
  kit quick-save/reload and virtual power-cycle checks passed.
- Stock input/output comparison for notes, velocity-zero note-off, running
  status, pressure, pitch bend, programs, system common, clock and SysEx.
- Locks, LFOs, scenes and performances compared against unchanged baseline
  pickup values; incoming CC feedback visible on the panel.
- Queue-full execution in ColdFire and project/pattern changes under flood;
  the stopped 60-second wire-rate flood and output progress check passed.
- Real-time headroom, worst-event duration and maximum IRQ-masked enqueue
  time, compared with the same stock image. No performance figures invented.
- Other PC12 controls, controller reconnect/setup changes, and physical DIN;
  USB PC12 Track Level pickup through the Windows/WSL bridge passed.
- Combination builds through the repository's browser package workflow,
  pinned compiler, module doctor and release checks.

No audible, physical instrument reboot/persistence or Rytm hardware result
is claimed. PC12 hardware results above are limited to the tested USB path.
