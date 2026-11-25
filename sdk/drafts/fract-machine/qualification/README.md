# Offline measurement preparation

Current preparation is `0.1.3-experimental` on released base 0.8.1, identity
`eb6679620d0c9ed7ad277598fc0df185e767dfbd0e7eb99bb1518ade9df8a4f0`.
The normal package reproduces SHA-256
`c56e79076b170e76c53f46286a3d31aa8d8c51f9d52070836b1ca75fa37f8e29`.
The base prerequisites #1418 and #1165 have merged; final preparation can proceed.
Hardware timing, stress, rendered controls and lifecycle tests on this named
build remain open. [Earlier functional evidence](../release/hardware-20261110.md)
belongs to package6ff/base72 only. Nothing here grants release approval.

## Private probe build

For historical reproduction, `build_probe.py` takes a private archive of source commit `c2671568` preserving
the named base72 inputs, the author's original 1.40C and reviewed Elekloader
tools. Run it in the pinned isolated native toolchain, with source, stock and
upstream mounted read-only, no network, dropped capabilities, and a new private
output directory. It never opens a device:

Before mounting a source archive read-only, use Node 24 to run `npm run prepare`
in that archive. This recreates ignored catalogue/changelog metadata needed by
the site's guarded base linker. Keep the original historical snapshot unchanged;
prepare a private copy when reproducing an older build.

```sh
python3 -B sdk/drafts/fract-machine/qualification/build_probe.py \
  --base-tree /private/base72-source --stock /private/OCTATRACK_OS1.40C.syx \
  --upstream /private/reviewed-elekloader --output /private/new-probe-output
```

The tool first reproduces exact normal package6ff and runs both original-stock
scans. A copied registration unit redirects the descriptor to `fract_probe_render`;
the copied tick subscription points to `fract_probe_tick`. Every executable
section in all eleven original compilation units must remain byte-identical.
The added wrapper calls the unchanged renderer, including native FLEX. It reads
five named base counters and the timer; it never resets them, patches a base
site or changes the frame guard. No profile define changes the original renderer.
The separate probe reproduces SHA-256
`6020e04633f670e34123e221b44c38ad7ed3ea873081e35ff9994fb0d0a58cbe`.
Keep its upload receipt: a diagnostic protocol marker does not prove that hash.
Neither this probe nor any firmware/built project belongs in Git or a public download.

For a later released base, first reproduce and stock-verify the normal package
against that source tree with `scripts/source-runtime-package.py`. Pass both
`--base-identity <full identity>` and `--normal-sha256 <normal package hash>` to
`build_probe.py`. Without both, its historical base72/package6ff defaults remain.
The builder checks the named tree and normal bytes before deriving fresh counter
addresses from that base's symbols. It still requires unchanged original code
sections and both stock scans; new output gets its own receipt. This prepares
another named build, without transferring any earlier hardware result to it.
The addresses are checked against the original-stock linker's actual layout,
including collection tables and declared BSS alignment. Base counters may have
two-byte alignment; the wrapper declares that alignment for its volatile longword
reads ([MCF54455 Reference Manual, table 3-12](https://www.nxp.com/docs/en/reference-manual/MCF54455RM.pdf)).

## Prepared project cases

`make_bench_projects.py` creates new local files from an existing private project
with a valid empty bank02. It refuses an existing output and direct mounted-card
paths; run in isolation with the template read-only and only private output writable:

```sh
python3 -B sdk/drafts/fract-machine/qualification/make_bench_projects.py \
  --template /private/project-template --upstream /private/reviewed-octabam \
  --output /private/new-benchmark-projects
```

The output has pairs `FX16M/FR16M`, `FX16S/FR16S`, `FX24M/FR24M` and
`FX24S/FR24S`. Each owns a newly generated two-second 44.1 kHz triangle sample,
at the same normalized level, in FLEX slot 1. No library sample is copied.
FX uses native FLEX; FR substitutes one FRACT on T1. All other tracks use FLEX.
FX1/FX2 are NONE, time stretch is off, MIDI clock/transport send/receive and
track mute/cue masks are off. Baseline LFO depths are zero. Current and saved
Parts agree, all sixteen banks have checksums and `.work`/`.strd` twins, and
MIDI trig masks are cleared. Arranger files are not copied: use pattern mode.
Generation is file validation, not evidence that the instrument loaded it.

| Pattern | Cases in both paired projects |
| --- | --- |
| A01 | T1, one trig in 64 steps, neutral pitch, 120 BPM, 1X |
| A02 | Same events and sample, minimum native pitch lock |
| A03 | Same, maximum native pitch lock |
| A04 | T1, one trig on every step, neutral pitch |
| A05 | All eight tracks triggered every step; FRACT replaces T1 only |
| A06 | FR only: Part 2, dense trigs, grain-control locks and three LFOs |

A01–A05 are the matched event conditions, not a claim that FLEX source controls
equal grain controls. A06 is a separate stress case. Its POS/SIZE/SHPE locks
alternate endpoints, REVS is 64, SPRD 127, PTCH 64; LFOs address POS/SIZE/SPRD.
Confirm the project, slot, pattern mode and audible output before measuring.
For further stress, repeat A06 at 240 BPM, turn controls while playing, then
STOP, change Part and reload. Do not record actions the operator did not perform.

## Later hardware capture

Follow [repeat98’s 12 November review plan](../release/review-20261112.md).
Both base prerequisites have merged. Rebuild and review the probe against the
exact current base and normal package, using both explicit identity arguments;
the historical base72 probe is retained only for reproduction.

No hardware operation is part of offline preparation. At the later session,
retain the normal package, current confirmed set and recovery receipts. Check
the exact base, stop playback and use a disposable test project before the
standard controlled RAM trial of the named probe. A different installed base
requires review/rebuild; never reuse these addresses on it. No NOR update is
needed by this kit. Do not silently Keep a measurement package as a normal release.

The read-only collector needs the explicitly opened bench socket, base, case
label, new output file and one mode:

```sh
node sdk/drafts/fract-machine/qualification/collect_probe.mjs \
  --socket /private/explicit-bench.sock --hardware \
  --base 72defb09b9d463fe62ab876f350f442d10e32ec23e55918a22b9b756c5cb3da6 \
  --label FR16M-A01-MIXER-120 --seconds 20 --output /private/new-case.json
```

`--dry-run` validates arguments without opening the socket or creating output.
The hardware path reads descriptors, identity, inventory, DIAG and LOAD; it
sends no HELLO, upload, panel keys, Keep, removal or NOR write. The emulator
path (`--emulator`) additionally initializes its simulated USB bus. Its raw
socket has one client: close the uploader before collecting, or use the
existing serialized shared bench. No direct physical-USB discovery is used.
Keep the separate exact-package upload/rollback receipts beside the capture.

Measure matched FLEX/FRACT on the same sample, pitch, tempo, track activity and
screen (MIXER for the comparison). Own MAIN drawing is a separate load case.
Use at least twenty seconds after stable playback for each case. Repeat the
FRACT-only stress pattern for at least two minutes with listening and record
the actual duration, controls, STOP/Part operations, any crackles and guard sheds.
These durations are the prepared procedure, not observations already made.

## What the counters can establish

Protocol v3 emits one coherent tagged bank at a time. It reports elapsed timer
counts, own inclusive renderer sum, per-call and summed-per-block lifetime
peaks, call/frame/idle deltas, base frame high-water since boot, whole-interrupt
guard share, sheds since boot and peak context. The probe groups split calls
by `mw_frame_count`, not by an assumption that every callback has sixteen samples.
Overlong/saturated windows, unsupported call counts and mixed banks are refused.
Hardware collection also requires timer/frame agreement within 5% of sixteen
samples at 44.1 kHz. This consistency check is not an external clock calibration.

The interval includes native FLEX and timer/call overhead; counter bookkeeping
after the second timer read is excluded. The base frame high-water includes the
whole wrapper. Neither peak is reset per collection window. Matched fresh boots
with the same load procedure can delimit comparable since-boot observations;
they do not turn the record into a steady-state window maximum. A reset-window
maximum is unavailable in this read-only production-base method. Retain that
limitation for owner review rather than pretending the requirement is closed.
Also capture the frame interrupt with `npm run device -- guard` on the
matched cases, as requested in review. Verify that the final base supports the
read; keep unsupported reads as missing evidence. Do not change the guard share
or disable it. The guard share pays for base/other-track work too: it is not
free FRACT headroom.
132 MHz timer counts are not ColdFire CPU cycles or a static worst-case bound.

The full-emulator probe test decoded six valid banks with real playback,
advancing grains and no sheds. Its timer/frame cadence differs from the physical
instrument, so its nominal microsecond values must not enter hardware performance
fields. `CAPTURED_NOT_QUALIFIED` is the collector's successful acquisition state;
it never grants a performance pass or a first-release exception. Physical values
in `evidence/performance.json` remain null until measured and reviewed.

After the later tests, restore the exact normal set through the standard
acknowledged Undo/reinstall flow, verify it and close the owned clients. Owner
approval, any exact-version waiver, catalogue promotion and publication remain
separate. There is no active catalogue row or public package in this draft.

## Host checks

```sh
node --test sdk/drafts/fract-machine/qualification/probe_decode.test.mjs \
  sdk/drafts/fract-machine/qualification/collect_probe.test.mjs
python3 -B -m unittest discover -s sdk/tests -p 'test_fract_render_probe.py'
```

These check counter wrap/split grouping, bounded flags, coherent decoding,
timer/frame consistency and CLI evidence preservation. They are software checks,
not physical timing or sound evidence.
