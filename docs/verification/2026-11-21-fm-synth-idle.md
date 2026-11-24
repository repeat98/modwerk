# FM Synth 0.1.5 idle cost and first-note playback

On 21 November 2026 an Octatrack MKII running OS 1.40C and the 0.7.13 development twin `1d880c5a5e9fea28dd8e31665a19b420b99597cde8d931fef2cb8aecdbe5232e` ran the private FM Synth USB package `b904a852fa2cd0dc9b2aef39969ba77637fe05a394adc06c2833b93df1d15f02`. Two builds reproduced the 30,760-byte package.

## Installed and unused

MWREPROB/TARGET played A01 at 140 BPM with a step-one trig on T1 and T5. None of its working or saved Parts selected FM. Each FM-only install was bracketed by empty-base playback on the same Part. The host summed three raw frame-guard readings per window without recording audio. Each delta uses the mean of the two adjacent empty readings. The seven windows covered 247,897 frames with zero skips.

| Install | Empty before | FM installed | Empty after Undo | Added percentage points |
| --- | ---: | ---: | ---: | ---: |
| 1 | 32.267% | 33.027% | 32.436% | +0.675 |
| 2 | 32.436% | 33.024% | 32.437% | +0.587 |
| 3 | 32.437% | 33.031% | 32.437% | +0.594 |

The mean increase was **0.619 percentage points**. All three exceeded the original +0.2 target. The owner accepted this measured idle cost for 0.1.5. The same package averaged +0.192 in four ColdFire emulator trials.

## Playback

- The first T1 audition after idle sounded at 261.6 Hz. T1 was the only track with a measured machine render in that interval.
- At 140 BPM eight consecutive steady bars averaged 1.71423 s against 1.71429 s expected. The second onset overlapped the first note, so its individual timing is unresolved.
- With LEG MONO, raising PTCH by an octave stepped from 261.6 to 523.3 Hz with GLIDE OFF. At GLIDE 96, the same move passed through 313, 450 and 512 Hz in windows starting 0.10, 0.50 and 1.15 s after the up command. Lowering PTCH returned smoothly to the original pitch. The hardware setting was restored to OFF.
- The MKII loaded a saved plain FLEX project with a silent `FMSYNTH_OLD.WAV` assigned to T1 and no dedicated-machine signature. In the direct USB recording T1 was digitally silent on the empty base, sounded at 271.3 Hz on the first sequenced note with FM installed, and returned to digital silence after Undo. The sample-locked marker path was exercised in the emulator only.

## Restoration and limits

All five trials rolled back. The original project, pattern hash, selection, four working and saved Parts, and stopped transport matched. The temporary legacy fixture was removed. The original 0.7.12 base returned with the same saved and live set. Thirteen initial USB file reads failed their bank checksums. Repeat small-block reads of those files agreed and passed the checksums at the end. Exact parity with those initial reads remains unverified.

The playback observations come from the instrument's 44.1 kHz USB output. External clock, swing, alternate track speeds, cold-start persistence, worst-case chip cycles and complete memory bounds remain open on this build.
