# Zero-crossing findings — 30 October 2026

Primary reference: the developer's private original 1.40C MAIN,
SHA-256 `164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`.
Firmware/disassembly remain outside Git. The implementation is original C
using native PCM readers; no extracted instruction body is copied.

The earlier investigation executed 80 directional searches and seven boundary
chooser fixtures. This pass additionally ran 32 synthetic grid flows through
the actual stock grid producer, engine dispatcher/search, deferred callbacks
and marker publisher. Message presentation/final redraw were omitted and UI
callbacks were pumped by the fixture; this is not a full UI/scheduler or
hardware test.

The bounded search was then run against the actual native Flex PCM reader on
the same authored PCM. All 28 valid stock results matched, across 16/24-bit
mono/stereo, silence, sign changes, exact zeros, split stereo crossings,
channel selection, longer-than-2-ms shifts, selected page boundaries and a
final end outside trim. PCM write watches remained zero. Four DC cases demonstrated
the defensive difference below. Source hashes/results bind the observations
in `native-evidence.json`; private fixture inputs/logs are retained locally.

- Stock searches forward and backward around each boundary, then chooses the
  nearer admitted result. Ties choose backward. A crossing is an exact zero
  in either frame, or a sign change. No one-frame correction is added.
- Initial trim start is retained. Subsequent shared boundaries and the final
  end are processed. Adjacent records receive the same end/start boundary.
- The stock selector values are 0 = left, 1 = right, 2 = both. BOTH accepts
  either selected channel's crossing; it does not require simultaneous zeros.
  Mono uses its single channel regardless of the stereo selector.
- With anchors 0/200/400/600/800 in 1,024 frames, silence produces boundaries
  0/199/399/599/799. An authored crossing at 803 produces a final end of 802,
  beyond trim end 800 but inside audio. These are synthetic native observations.
- In four constant-DC fixtures, the stock forward reader error -2 reached the
  final table as unsigned 4,294,967,294. This is an isolated synthetic result,
  not a hardware bug report. The candidate never admits a negative/error
  result as a position; no crossing retains the ideal boundary.

The candidate also enforces actual sample bounds, the existing minimum slice
length, a work limit, source lifetime and atomic publication. Invalid whole
results are refused, never silently repaired or reduced in count. At a full
sample edge without a complete comparison pair the boundary remains unchanged.
Read errors inside an admitted region abort the edit.

Native Static file IO, recorder/allocator concurrency, whole-OS scheduling,
audio, saves and physical reboot remain unverified. These are required device
checks, not conclusions of the synthetic Flex experiments.
