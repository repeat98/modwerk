# First device test: private USB planner probe

The first 0.1.52 attempt failed on the MKII: a wrong CPU target emitted
scale-eight indexed addressing and caused vector 3 in text drawing. The unit
restarted; its original base and exact 11-module inventory were verified.
That package is rejected. The corrected 0.1.53 candidate first failed the CPU self-test at 93.7%; the
contributor reported the already playing pattern peaked at 92% without the probe.
That failed result is preserved without attributing the overload to the probe.
A separately authorized repeat on a contributor's empty pattern passed the physical
self-test (72.4% peak CPU), reported planner PASS and completed Undo with the exact
original base, active identity and 11-module inventory restored. No new crash
occurred. The contributor was not looking during the trial, so the visible display remains
unconfirmed despite the diagnostic PASS.
This qualifies the fixed-input USB planner smoke test on the named build/base.

This is the small first hardware step. It runs the existing planner on fixed,
generated silence using SAMPLE 120 BPM and PROJECT 60 BPM, retaining one marker.
It displays PLANNER PASS and reports diagnostic value `0x42534f4b`. It does not
read or edit instrument samples, slices, projects or DSP memory. The live Flex
preview remains a later integration step.

The probe is a separate private diagnostic package, not the installable Beat
Slicer module. It uses the base's existing tick/draw hooks and needs no base
rebuild. It briefly covers the display; stock key/encoder handling stays active.
No new editor interface, catalogue entry or shared hook is introduced.

## Preparation

Use the pinned m68k toolchain and build outside Git:

```sh
python3 -B sdk/drafts/beat-slicer/build_usb_probe.py \
  --output /PRIVATE/probe --sdk-revision SDK_GIT_COMMIT \
  --version 0.1.53-experimental \
  --runner /PRIVATE/build/beat_slicer_job_probe \
  --stock-main /PRIVATE/stock-main.bin
```

The stock MAIN is the privately extracted, pinned 1.40C image. The builder runs
the exact package through the real loader/CPU fixture, two install/Undo/reinstall
cycles and bounded display checks. It scans the complete saved package against
MAIN and all three reversed 24-bit alignments, using the SDK's stock-free scanner.
These are preparation results; only a physical run supplies hardware evidence.

Host failure-path checks:

```sh
python3 -B sdk/drafts/beat-slicer/test_usb_probe.py
```

## Reviewed USB trial

The developer MCP currently refuses this unlisted diagnostic package. Keep that
refusal: use MCP for read-only unit status and the private developer client below
for the probe. Do not substitute the long-lived session’s `try FILE` command:
it accepts immediately. The probe client uses the same source-built frontend package validator,
OctatrackLink, real self-test and Undo as MCP. It never Keeps and does not change
the MCP's package allowlist.

With the MKII available, stop playback/recording and connect its Modwerk USB
interface. Use a bridge/socket this session owns or is explicitly sharing;
do not stop another session's bridge. No flash or power cycle is needed.

First review only; this performs no writes:

```sh
node sdk/drafts/beat-slicer/trial_usb_probe.mjs \
  --build-dir /PRIVATE/probe --socket /PRIVATE/bridge.sock \
  --review /PRIVATE/review.json
```

After explicitly authorizing this exact trial, repeat within 60 seconds with
`--trial`. The client rechecks package/source/SDK hashes, base, active identity
and complete inventory. It refuses replacement of an existing probe. It runs
an actual device self-test, requires a passed record, checks the planner's PASS
value, shows the result for five seconds and Undoes. The self-test adds its own
runtime; the whole trial is longer than five seconds.

```sh
node sdk/drafts/beat-slicer/trial_usb_probe.mjs \
  --build-dir /PRIVATE/probe --socket /PRIVATE/bridge.sock \
  --review /PRIVATE/review.json --trial
```

Success requires the original active identity and inventory after Undo.
`hardware.private.json` records observed self-test and diagnostic results only
after that verification. Confirm PLANNER PASS on the unit separately; the value
alone does not prove rendered pixels or that the module remains installed.
An ordinary error attempts Undo. A disconnected unaccepted trial relies on the
base's existing timeout recovery and still needs baseline verification.

This first probe qualifies only package loading, planner execution, display and
trial/Undo on the named source/base. It does not qualify live source ownership,
Apply, audible slice playback, Keep, card saving or physical reboot persistence.
Those remain in [the integration requirements](INTEGRATION.md).
