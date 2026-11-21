# Octatrack USB input RAM trials, 21 November 2026

## Private USB input RAM trial on an Octatrack MKII, 21 November 2026

Source `96c932b50`, OS 1.40C, development base `3e4fa8ce43706259942ebeba14b041e07576fe52f0fcb5f2f9773bf9525ce1c4`.
The trial used package `bdad3889b242388cc66a4910b91ead3fecc5da6c568487c9efc21f68ad955b63`.
It differs from the OFF-default private package `35f2a26cf5eb406b2ca80206a10281c279fd179d3c241535684afccfefb124f0`
only in its ABCD input and Main/Cue output preset. Both directions were open on the same macOS CoreAudio device at 44.1 kHz.

- In a 75-second duplex run, the host sent A/B/C/D at 433, 1,009, 2,017 and 4,001 Hz respectively, each at 0.075 peak. On stopped B01 the MKII recorded A/B into R1 (86,656 frames) and C/D into R2 (77,824 frames). The first 18,432 stereo frames of each 16-bit recorder buffer contained its two tones in the expected channels. CoreAudio captured 3,307,500 return frames and reported no callback underflow or overflow.
- A second 24-second run used direct-monitor levels of 80 for both pairs. USB Main carried A and C on the left and B and D on the right through a new A/B recording in R1 (113,104 frames). Its first 18,432 frames matched the A/B frequencies. The measured return amplitude of each tone was 0.02929 peak. Across a 5.14-second window spanning the recording, 20,569 input packets arrived and 226,803 output frames drained. Neither direction added an underrun or overrun, and the input error and output repeated-bank counters stayed flat. The counters already held one input underrun and two output overruns at the start of that window. Their timing was not isolated.
- With the host sending silence and both direct-monitor levels back at zero, previewing R1 from the Flex slot list returned the 433 and 1,009 Hz tones separately on USB Main and USB Cue. An earlier R2 audio-editor audition produced no identifiable tones. Its reported length later differed from the verified C/D take. The C/D evidence comes from the PCM read before that audition.
- The five-minute trial rolled back to the development base. Its log recorded one second at or above 90% CPU and no fault. The 90-second playback trial ended with an unconfirmed host acknowledgement and one live module. The supported recovery command rolled it back to the empty development inventory. The original pattern, track, working and saved Part hashes, direct-monitor levels and USB settings matched their baseline. A one-shot RAM boot returned the unit to shipping base `254c5a75a139255e` with the original screen-off and USB Audio modules, both saved and live.

The run sampled the recorder data through the supported development memory window. Full-buffer byte verification, a loaded-project soak, MKI hardware and musician listening remain open.
