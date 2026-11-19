# Octatrack 0.7.10 Analog BD Undo and BBD Delay buffer checks

19 November 2026. Release candidate `cb8ecabce56d07eaf689c848b04b6e73801c3aa32419019462a694d314197cc4`. [Cumulative release draft #1757](https://github.com/repeat98/modwerk/pull/1757)

## Analog BD Undo on an MKII

The release candidate ran from RAM on an Octatrack MKII with OS 1.40C and Dev21 on a spare CF card. Analog BD 0.1.7-experimental was the only saved module. The developer played a step-1 trig on T4 and reported hearing the kick. The USB capture measured a peak of **−19.3 dBFS** on the stereo T4 output.

With transport stopped and T4 switched to FLEX, a 60-second whole-set trial removed Analog BD and added Vibrato 0.1.0-experimental. Undo returned to the original active set identity, live inventory and saved module count. The trial reported no crash, stall, freeze or skipped track.

The developer reselected Analog BD and played the same pattern without restarting. They reported hearing the kick again, and the USB capture measured **−19.3 dBFS** on T4. [Analog BD Undo report #1736](https://github.com/repeat98/modwerk/issues/1736)

## BBD Delay buffer in the native DSP host

The BBD Delay 0.1.2-experimental isolation run used `-guard 0x203a -guard-shared -dirty 0x5a`. At the 8,250-word bound, eight simultaneous FX2 instances across both cores matched their standalone renders. A 12,000-block sweep exercised both stage lengths, feedback, bandpass and freeze across the eight instances. The guard reported zero stray write regions and zero module clobbers. [Buffer admission change #1776](https://github.com/repeat98/modwerk/pull/1776)

Extended MKII qualification of the cumulative release candidate is pending.
