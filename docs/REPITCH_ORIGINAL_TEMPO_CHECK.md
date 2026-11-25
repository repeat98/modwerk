# Repitch ORIGINAL TEMPO check — 8 October 2026

The reported failure is **not reproduced** in the current Repitch code. No
firmware fix or new release is claimed. The failing device build, project BPM,
sample original tempo and TSTR setting were unavailable. Keep the device report
open until that configuration can be reproduced.

The change adds [a native regression probe](../scripts/repitch-original-tempo-probe.cpp)
for live sample-tempo edits. The shipped SDK, Repitch source/version, catalog and
compiled packages remain unchanged. [The sanitized results](verification/repitch-original-tempo-2026-10-08.json)
bind the tests to the exact module source, local image, emulator and toolchain.
Firmware, cards/projects, raw RAM/LCD captures and generated test audio stay local.

## What was tested

A disposable MKII emulator project used two simultaneous instances: T1 FLEX with
TSTR = RPCH, a 120 BPM 440 Hz loop; and T5 STATIC with TSTR = AUTO, sample
TIMESTRETCH = REPITCH, a 90 BPM 660 Hz loop. Project tempo stayed at 120 BPM.
Both loops were newly generated two-second stereo PCM files, in distinct slots.

Changing T1's actual AED > ATTR > ORIGINAL TEMPO from 120 to 121 with four RIGHT
presses changed its Q26 playback increment from `0x04000000` to `0x03f78985`.
T5's increment stayed `0x05555555`. The actual LCD and loaded sample heading were
inspected privately; the selected editor sample matched the playing track.

A separate DSP run called the same stock sample-tempo setter used by ATTR,
`0x40099090`, to change T1's original tempo from 120 to 240 during playback.
The main output contained these independently identified frequencies:

| Signal | Before | After | Expected |
| --- | ---: | ---: | --- |
| T1 FLEX | 439.992 Hz | 219.978 Hz | 440 → 220 Hz |
| T5 STATIC | 880.008 Hz | 879.979 Hz | 880 Hz throughout |

The measurements use a Hann-window FFT and three-bin log-magnitude peak
interpolation, with a 1 Hz acceptance tolerance. This is rendered emulator audio,
not hardware pitch/timing evidence.

The existing `repitch_probe.cpp` contracts passed: 8,520 stock-identical and 480
scaled increments, renderer resolution, PTCH behavior, formatter and sample
TIMESTRETCH controls, with zero failures. Its matrix constructs a fresh machine
for each source tempo and therefore does not exercise a live edit on existing
instances.

The new standalone probe retains two voices in one machine, with distinct
settings, and exercises both access-route pairs:

- FLEX RPCH with STATIC AUTO/sample REPITCH.
- FLEX AUTO/sample REPITCH with STATIC RPCH.

It makes 16 calls through the real stock attribute setter, using original tempos
240, 60, 121 and 90 BPM. It checks the next playback increment, the 2× ceiling,
inactive PTCH with different pitch settings, and the other instance's unchanged
settings, binding, parameters, voice and rate state. Both route pairs pass. Stock firmware without Repitch fails
this probe with exit 1, so the check does not accept an unpatched image.

## Persistence and usable audio

The saved baseline has original tempos 121 and 90 BPM, RATE 127 on both tracks,
and distinct machine/sample/TSTR assignments. Expected audio is approximately
436.364 Hz on T1 and 880 Hz on T5.

- Native Part save/reload restored both machines, sample selections and source
  parameters after unsaved edits to machine, sample, TSTR and RATE fields. Sample
  attributes remain project-wide stock state. Both expected tones were present
  after Part reload.
- Actual PROJECT SAVE and RELOAD PROJECT panel confirmations restored both
  original tempos and source parameters after later unsaved edits on both tracks.
  A separate DSP-enabled panel reload repeated those edits and rendered both
  expected tones afterward (436.371 and 880.005 Hz).
- A fresh emulator that explicitly loaded the saved card restored both instances
  and rendered both expected tones. This is recorded separately from restart.
- A separate restart retained only the saved card and 1 MiB battery-backed RAM.
  No `--mount`, `--set`, `--project`, `--sequencer` or project-load call was used.
  After boot/frame processing, PLAY rendered both expected tones and the saved
  assignments, sample selections, parameters and tempos matched the baseline.

The initial batch restart remained stopped and produced no useful test audio.
The subsequent panel-driven PLAY capture supplies the restart audio evidence;
silence while stopped is not recorded as a playback pass.

## Reproduction

Run the probe only inside the reviewed, network-disabled native toolchain
container, with matching `ot_emu` headers/libraries and a private Repitch MAIN OS
image. It is deliberately excluded from ordinary app checks and CI. For the local
qualification-tools layout, compile in a private writable directory:

```sh
emu_lib=/opt/toolchain/emu-build
emu_vendor=/opt/toolchain/vendor
c++ -O2 -DNDEBUG -std=c++17 -DASMJIT_STATIC -DDSP56300_DEBUGGER=0 \
  -DDSP56K_USE_PERF_JIT_PROFILING -DDSP56K_USE_VTUNE_JIT_PROFILING_API \
  -I"$emu_vendor" -I"$emu_vendor/dsp56300/source" \
  -I"$emu_vendor/dsp56300/source/asmjit/src" \
  -I/opt/toolchain/tools/emu/ot_emu \
  /repo/scripts/repitch-original-tempo-probe.cpp \
  "$emu_lib/libot_machine.a" "$emu_lib/mc68k/lib68kEmu.a" \
  "$emu_lib/dsp56300/dsp56kEmu/libdsp56kEmu.a" \
  "$emu_lib/dsp56300/dsp56kBase/libdsp56kBase.a" \
  "$emu_lib/dsp56300/vtuneSdk/libvtuneSdk.a" \
  "$emu_lib/dsp56300/asmjit/libasmjit.a" \
  -ldl -lpthread -lrt -o repitch-original-tempo-probe
./repitch-original-tempo-probe /private-work/repitch-main.bin
```

This run used container image
`sha256:3a5861370c0f3d4eb2507af6a20821ab6ad20569c9fb22f4dfce9d93d4fd93e2`.
DSP runs require `--shm-size=1g`: Docker's default 64 MiB shared memory caused
SIGBUS during DSP initialization. Raising the container limit resolved that
startup failure; no firmware/emulator source change was needed.

The authored probe uses octabam's native probe approach; Sam Banks' MIT notice is
retained in [the SDK licence](../sdk/octabam/LICENSE). The test contains no extracted
firmware instructions or sample content.

## Limits and remaining issue

No physical unit was flashed or rebooted. Core 0 supplied the measured main output
for both tracks; core 1 produced no ESAI capture, so independent audio on that core
remains unverified. Repitch adds ColdFire hooks and no DSP executable code. This
run did not cover MKI controls, slices, recorder buffers, instance replacement/reset
or maximum audio load, and does not upgrade historical hardware qualification.

Before changing firmware, reproduce the reported failure with its actual build,
project tempo, original-tempo change, sample pool/slot and TSTR route. The editor
can retain a different sample/pool selection: this session initially opened an
empty STATIC slot while T1 was playing a FLEX sample. Editing that different slot
would not alter the active voice. That is an observed setup hazard, **not a proven
explanation of the device report**.
