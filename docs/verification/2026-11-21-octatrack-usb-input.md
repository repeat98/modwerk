# Octatrack USB input RAM trials, 21 November 2026

## Cumulative 0.7.13 draft on the MKII

The browser and native builders produced the same 821,072-byte OS image, SHA-256
`996e5ab55bc1f4c783b90c9b63230a2b088c0f074430c479894cc7959167fafc`.
The cumulative base identifies as `8cd1320411a62dad70e3248387f8b61655af3ae739f4ebdf0088b3144c88ac24`.
Its optional USB Audio package `0cb56b0c269cb2f3b355a3116f00cd951ed060961813486da76f3c3665c03c3f`
reproduced byte-for-byte from the stock-free recipe and from the owner's OS 1.40C file.

The exact cumulative base ran from RAM. With the canonical package and INPUTS set to OFF, macOS recorded
352,800 frames over eight seconds on Main/Cue at 44.1 kHz. The 32-second trial ended in normal mode.
Its empty starting inventory and complete set digest matched after Undo.

### Timed Undo

The earlier 90-second trial failed on ENTER, before the host could send ROLLBACK. The host had retained
its last USB submission sequence throughout the trial. A host regression reproduced the same symptom
when a status client sent HELLO during the hold. The corrected uploader reads the latest device sequence
before each command. It still validates the command, transaction, session and base in the reply.

On the exact draft, the trial owner's last submission before the wait was LEAVE at sequence 14.
At timeout the unit reported a completed HELLO at sequence 15. The owner's bridge had sent no such frame.
The owner sent ENTER at 16, ROLLBACK at 17 and LEAVE at 18. All three received matching replies.
The trace identifies the intervening command. It does not identify the process that sent it.

### Panel routing

The instrumented build `9ff0c2892385c424bf58feb470656f75ebfa1f2bab6a665f2f9a2e3eff06ef88` ran
the same canonical USB Audio package with Vibrato 0.1.0-experimental. On B01, with the sequencer stopped,
each five-second take used the physical INPUTS menu and a single CoreAudio device. Each row with input
used one take with only DIR AB at 80 and another with only DIR CD at 80. The source tones were
433, 1,009, 2,017 and 4,001 Hz at 0.075 peak. Main returned the selected tones at 0.029295 peak.

| INPUTS | Channels from Mac / to Mac | Measured routing |
| --- | --- | --- |
| OFF | 0 / 4 | CoreAudio captured 220,500 output frames. |
| AB | 2 / 4 | Host 1/2 returned on A/B. The C/D take had no test tones. |
| CD | 2 / 4 | Host 1/2 returned on C/D. The A/B take had no test tones. |
| ABCD | 4 / 4 | Host 1/2 returned on A/B and host 3/4 on C/D, in channel order. |

### Sustained duplex recording with FX

The owner requested the unit for the waiting Grain session during the 20-minute run.
The Mac captured **17 min 33.814 s**, 46,473,216 four-channel frames at 44.1 kHz. The sequencer
played B01 throughout. A/B passed through T1 THRU, FILTER and VIBRATO with the FX mix at maximum.
C/D went directly to Main at level 80. The six-second dry and wet controls distinguished the
pitch modulation from a plain return. Both A/B tones had modulation sidebands in every interior
one-second window. The two C/D reference tones remained on their assigned Main channels.

CoreAudio reported zero callback faults. Across the interior whole-second windows on Main,
the analysis found no simultaneous digital zeros and no repeated 16-, 32- or 64-sample blocks.
Between the 1.01-second and 1,020-second device readings, the MKII retired 4,076,080 input packets
and drained 44,936,029 output frames. Input underruns held at five, the value at the first reading.
Input overruns and packet errors, output over- and underruns, and repeated output banks stayed at zero.
Sampled CPU was 53.8–54.7%. The trial logged no crash, stall, freeze or skipped track.

During the host recording, the MKII also took two four-step stereo recordings. All 18,900
16-bit frames of R1 contained the A/B tones on their expected channels. All 18,900 frames of R2
contained the C/D tones. Each measured 0.075 peak with less than 0.000009 RMS residual per channel.
The long recording is the Mac's return from the instrument. The two shorter recordings are the MKII's own buffers.

The scratch Part, original A01 selection, T1, original working and saved Part digests, mixer levels
and USB settings were restored. Undo returned the instrumented build to its empty inventory.
A USB disconnect interrupted the first RAM upload back to the starting base. The supported recovery
command cleared that incomplete upload. The retry returned to `254c5a75a139255e` with SCREEN-OFF and
USB AUDIO and the original whole-set digest `cb128faffab75dfa435829f13ef797849299fc0dad4b279045ed59edd22c8eaa`.
Grain then acquired the unit. The release stays on hold. No Keep or flash was performed.

[Build and recording hashes, full-buffer measurements and device counter readings](2026-11-21-octatrack-usb-input.json)

## Private USB input RAM trial on an Octatrack MKII, 21 November 2026

Source `182846bc2`, OS 1.40C, development base `3e4fa8ce43706259942ebeba14b041e07576fe52f0fcb5f2f9773bf9525ce1c4`.
The trial used package `bdad3889b242388cc66a4910b91ead3fecc5da6c568487c9efc21f68ad955b63`.
It differs from the OFF-default private package `35f2a26cf5eb406b2ca80206a10281c279fd179d3c241535684afccfefb124f0`
only in its ABCD input and Main/Cue output preset. Both directions were open on the same macOS CoreAudio device at 44.1 kHz.

- In a 75-second duplex run, the host sent A/B/C/D at 433, 1,009, 2,017 and 4,001 Hz respectively, each at 0.075 peak. On stopped B01 the MKII recorded A/B into R1 (86,656 frames) and C/D into R2 (77,824 frames). The first 18,432 stereo frames of each 16-bit recorder buffer contained its two tones in the expected channels. CoreAudio captured 3,307,500 return frames and reported no callback underflow or overflow.
- A second 24-second run used direct-monitor levels of 80 for both pairs. USB Main carried A and C on the left and B and D on the right through a new A/B recording in R1 (113,104 frames). Its first 18,432 frames matched the A/B frequencies. The measured return amplitude of each tone was 0.02929 peak. Across a 5.14-second window spanning the recording, 20,569 input packets arrived and 226,803 output frames drained. Neither direction added an underrun or overrun, and the input error and output repeated-bank counters stayed flat. The counters already held one input underrun and two output overruns at the start of that window. Their timing was not isolated.
- With the host sending silence and both direct-monitor levels back at zero, previewing R1 from the Flex slot list returned the 433 and 1,009 Hz tones separately on USB Main and USB Cue. An earlier R2 audio-editor audition produced no identifiable tones. Its reported length later differed from the verified C/D take. The C/D evidence comes from the PCM read before that audition.
- The five-minute trial rolled back to the development base. Its log recorded one second at or above 90% CPU and no fault. The 90-second playback trial ended with an unconfirmed host acknowledgement and one live module. The supported recovery command rolled it back to the empty development inventory. The original pattern, track, working and saved Part hashes, direct-monitor levels and USB settings matched their baseline. A one-shot RAM boot returned the unit to shipping base `254c5a75a139255e` with the original screen-off and USB Audio modules, both saved and live.

The run sampled the recorder data through the supported development memory window. Full-buffer byte verification, a loaded-project soak, MKI hardware and musician listening remain open.
