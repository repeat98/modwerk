# T3 + T4 clicking investigation — 9 October 2026

The owner relayed a report against published Air Chorus 0.1.0: one instance
on T3 and one on T4; loud rhythmic clicking appears as MIX is raised. No
original project, SPD/RNG settings, FX1 companions or recording is available.
Air Chorus is paused in the frontend. The owner has offered to test the
existing optimized AIRC011T2 image. No hardware result has arrived yet.

**Status: unresolved.** Do not label the optimization a clicking fix or
restore public availability from the measurements below. The 35.8% reduction
in measured instructions could help if the physical failure is load-related;
that cause has not been established.

## What the investigation establishes

- T3/T4 are payload B's last two FX2 slots, at Y:0x38000/0x3c000.
  Synthetic `verify_instances.py` covers their allocator/state addresses but
  does not run stock dispatch or ColdFire control delivery.
- `dsp_host` maps shared X and shared Y separately. The full `ot_emu` models
  the shared P/X/Y alias. A clean synthetic guard is not proof against all
  integration failures.
- The apparent overlap with stock's communication words is **not by itself
  a collision**. Inspection of the verified original 1.40C payloads shows
  that stock saves/restores those words around its communication/FX phases.
  No memory relocation or reduced delay range was introduced on that theory.
- A generated project now exercises actual ColdFire playback, actual DSP
  dispatch, both shared-buffer slots, stereo audio and the second instance's
  MIX ramp. The published and optimized images completed 8,192 blocks each:
  131,072 frames / 2.9722 simulated seconds, crossing many ring wraps.
- The captured records confirm T3 SPD/RNG/MIX 64/64/64 and T4 SPD/RNG 64/64,
  with T4 MIX increasing monotonically from 0 through 127 and settling there.
  Only T3/T4 produce audio. The other six tracks remain silent.
- Both images produce **bit-identical input and output on all eight tracks**,
  with identical real control blocks. That compares 262,144 active stereo
  frames. No output sample rails. This fixture did not expose the reported
  large discontinuities; adjacent-step measurements are retained as diagnostics,
  not a universal click detector or a physical listening result.

Reports: [published playback](evidence/published-playback.json) and
[optimized playback](evidence/optimized-playback.json). They identify exact
MAIN images, emulator and private raw capture hashes. No raw captures,
stock code, audio, projects or firmware enter Git.

## Reproduce privately

Use the reviewed `octamod-tapehead-qualification-tools:local` image from
the existing test record (image prefix `3a5861370c0f`), network disabled,
read-only root, temporary writable scratch and `--shm-size 256m`.
The emulator is `/opt/toolchain/emu-build/ot_emu`. Mount this checkout at
`/source`, the generated Air Chorus stress project at `/template`, the
two private MAIN images at `/images`, and a new private output at `/output`.
The template is the earlier SDK `stress_project.py` output, with looping
FLEX slot 1, neutral pitch/rate and timestretch off. It is copied and never
modified. The preparation helper checks those assumptions.

```sh
python3 -B /source/sdk/drafts/airwindows-chorus-efficiency/prepare_playback.py \
  --template /template --output /output/fixture
mkdir /output/published /output/optimized
```

Run each image with the following arguments, changing the image and the run
directory for the candidate. The baseline is the original published private
MAIN (`8ecec31e…`); AIRC011T2 is `cf75abd4…`. Full identities are in the reports.

```sh
/opt/toolchain/emu-build/ot_emu \
  --image /images/baseline-published-main.bin \
  --card /output/fixture/card.img --set CHORUS --project CLICK \
  --sequencer --internal-clock --frames 8192 --load-ms 90000 \
  --dsp --main-level 64 --midi /output/fixture/mix.midi --mkii \
  --block-dump /output/published/blocks.dump \
  --audio-out /output/published/main.wav \
  --mem-dump 0x80000ec4,16=/output/published/ids.bin \
  > /output/published/full.log 2>&1

python3 -B /source/sdk/drafts/airwindows-chorus-efficiency/analyze_playback.py \
  --run /output/published --image /images/baseline-published-main.bin \
  --emulator /opt/toolchain/emu-build/ot_emu \
  --output /output/published-playback.json
python3 -B /source/sdk/drafts/airwindows-chorus-efficiency/analyze_playback.py \
  --run /output/optimized --image /images/air-chorus-optimized-main.bin \
  --emulator /opt/toolchain/emu-build/ot_emu \
  --reference-run /output/published --reference-image /images/baseline-published-main.bin \
  --output /output/optimized-playback.json
```

The generated sample is a continuous 441 Hz left / 882 Hz right tone,
two seconds long with seamless loop points. FX1 is NONE. LFOs and locks are
cleared; only T3/T4 have a step-1 sample trigger. T3 MIX stays 64. The real
MIDI UART receives CC45 on channel 4 at frame `512 + 32*value` for every
value 0..127. The preparation helper recreated the original fixture's card
and MIDI file byte for byte before being committed.

The full emulator does not model physical memory stalls/deadlines well
enough to establish hardware headroom. The exact reporter configuration is
still unknown. Part reload, project reload and physical reboot acceptance
remain required. Follow [HARDWARE.md](HARDWARE.md), recording actual results
against AIRC011T2 without extending the old 0.1.0 waiver.
