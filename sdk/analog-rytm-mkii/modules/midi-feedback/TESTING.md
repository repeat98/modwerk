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
  workspace outside this repository. See the hardware report below for MF02.

## Hardware report, 2026-11-06

The developer reports that MF02 boots on an Analog Rytm MKII previously running
stock 1.74, reaches the pattern screen, and responds to buttons and knobs.
SEND FEEDBACK displays, but the selectable row immediately above it is blank.
Feedback operation has not yet been tested on hardware.

Inspection of the pinned compiler's emitted code shows mf_label_text returning
the text pointer in d0 while labels.s reads a0. The development compiler's ABI
differs. The fix uses an integer enabled result in d0 and selects static label
strings in assembly, avoiding pointer-return ABI differences. This correction
was rebuilt twice from commit d3c2aa967c56 with identical outputs. The private
MF03 image SHA-256 is e9a1ee45d0335177c78f98f962ab03a012ddabd359cf676842942db44471813e.
Exact-image emulator output passed (673 CCs, 84 assignments, six automatic
refreshes), and all nine lifecycle checks passed. Exact MF03 LCD captures were
visually inspected: both MIDI FEEDBACK: OFF and MIDI FEEDBACK: ON display.
MF03 hardware results reported by the developer: the toggle label displays;
feedback was enabled; on Track 1/channel 1, changing the Rytm's LEVEL to 96
updated the USB-powered PC12's CC95 pickup target automatically without SEND.
The pot held the Rytm at 96 until crossing pickup, then followed smoothly.
The developer reports smooth movement for a further approximately 15 seconds
through repeated automatic refreshes, without jumps or renewed pickup blocking.
Routing was two-way DIN between PC12 port 1 and the Rytm, with temporary PC12
USB/DIN forwarding disabled. The developer subsequently reports automatic
target refresh and smooth pickup passing on Track 1 for filter frequency CC74,
filter resonance CC75, amp attack CC78, amp decay CC80, delay send CC82 and
reverb send CC83. Together with Track LEVEL CC95, all seven parameters have
reported Track 1 hardware coverage. Further developer-reported MF03 results:

- Track 12/channel 12 CC95 refresh and pickup passed independently; Track 1's
  level stayed unchanged.
- Opening another project initially stopped pickup; enabling MIDI FEEDBACK in
  that project restored it, consistent with the per-project OFF default.
- Saving a spare kit, editing Track 1 LEVEL and filter frequency, and reloading
  with NO + PLAY MODE restored both PC12 targets automatically.
- After saving the test project with feedback ON and power cycling, ON remained
  displayed and automatic pickup worked without SEND FEEDBACK.
- With feedback switched OFF, the developer reports target updates stopped.

These are developer observations, not a captured hardware MIDI byte trace.
Subsequent busy-playback testing FAILED: the developer reports filter frequency
and resonance pickup stopping on tracks without known modulation; Track LEVEL
was unaffected. A freeze occurred while changing tracks (the developer corrected
an initial association with stopping playback). Power cycling with both DIN
cables disconnected restored normal startup. With feedback OFF and DIN still
disconnected, repeated track switching worked normally. The freeze's cause is
unresolved; MF03 must not be treated as hardware-qualified or release-ready.
Investigation found the previous enqueue admission checked block size and
pending bytes but not the sender's ring-span/remaining-count coherence. A
candidate guard now defers special or inconsistent states and requires room
for every possible active DMA progress/reload count. New host cases cover
idle stale descriptors, mismatched spans, special state, boundary capacity and
the sender occupancy model. This hardening is not yet built/tested and is not
claimed to explain or fix the reported freeze. MF04 was built twice from
a82ff483d0e3 with matching outputs. Exact private image SHA-256:
52f4d1774a09c5b56732a890973a00465fad14b3e41f9e56b868be7d4ce78e24.
The host queue tests passed as reported by the developer's helper completion.
Saved MF04 emulator results show 673 CCs/84 assignments, all nine lifecycle
checks passing, and 60 panel track-select chords during playback with concurrent
filter edits passing (final CC74=53, CC75=71). None establishes that the hardware
freeze is fixed. Pickup interruptions are a
separate unresolved failure; the refresh interval has not been changed.
MF04 hardware reports: normal boot; feedback ON with DIN disconnected stayed
responsive during playback and track switching; with two-way PC12 DIN restored,
filter movement and track switching passed while stopped. During playback the
developer reports no freeze, but the PC12 stopped controlling the filters;
stopping playback did not restore pickup. Fast knob movement appeared to reset
snap. This is a FAILED pickup test, not a passing performance qualification.

A candidate scheduler change now withholds a parameter's feedback until its
sampled value is unchanged for ten UI ticks (approximately 0.5 seconds). Moving
values are coalesced, including previously blocked sends, and neither periodic
nor manual refresh can bypass the per-parameter gate. Other stable parameters
continue independently. It does not identify the physical input source and
cannot retract a message already sent to the wire. New host regressions exercise
rapid simultaneous filter sweeps, refresh during movement, final-value delivery
and blocked-output recovery. This change is not yet built or qualified.

MF05 (source eab72d2231cd) passed its host tests, repeat builds and nine standard
emulator lifecycle checks, but FAILED the new rapid-sweep-with-track-switch
output assertion: intermediate CC74 values including 26, 31, 40, 44, 58, 71 and
76 escaped the settling gate. MF05 was not installed on hardware. Focused exact
MF05 traces show only initial/final values during a sweep alone; adding track
switching produces intermediate values. Over the same 2.5G-instruction duration,
the UI callback count increased from 250 to 297. UI invocations are therefore
unsuitable as a fixed-duration clock.

The next candidate counts the instrument's existing 32-frame/48-kHz render-out
events, with only an aligned 32-bit increment in that hook. Settling requires
750 elapsed blocks; background refresh requires 3000. UI does the parameter
reads and MIDI work. Host regressions include 1000 callbacks at an unchanged
audio time and unsigned counter wrap. This candidate is not yet built/tested;
the clock change is a hypothesis to test, not a confirmed hardware pickup fix.
Busy playback/audio/timing, NRPN/USB-only suppression, kit changes, controller
setup changes and measured hardware CPU/IRQ/queue behavior remain unqualified.

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
