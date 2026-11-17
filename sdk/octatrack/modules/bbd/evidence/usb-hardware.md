# BBD Delay 0.1.1 over USB on an Octatrack MKII

The owner's MKII, 15 October 2026, about 19:45 to 20:15, driven over USB by
Claude Code with the owner's permission (`docs/OCTATRACK_DRIVING.md`). The owner
was not asked to listen; the audio below is a USB recording of the unit's outputs.

## What ran

- **Base.** A development twin of the beta base with `ev_tail_kill`
  (`build_core.py` with the beta base's flags and `--dev`, from this branch's
  base sources): identity `e429b787771b5755…`, MAIN.raw SHA-256
  `bf2ab8a545421109740dbd28553ae04fad4724c87bd22ccd063bbe381b34b591`, RAM-booted
  (`device boot DIR 4096`), never flashed. The published tester base
  `ba89721d…` is the same source without `--dev`.
- **Package.** `public/octatrack-modules/bbd/0.1.1-experimental.mwrm`, 5,322
  bytes, SHA-256 `614bf23b7d8e6811d096d1d3f5934ace9829cef7a2c1026b1bcbccbe59b6a5c9`
  (ABI 8, pinned to effect id 14, subscribes to `ev_tail_kill`), built from
  source commit `ef7e1aa362af829a2479385769d6987390f55ccd`.
- **Project.** The owner's project, stopped. Tests ran on Parts whose working
  copy equalled the saved copy (bank A Part 4, bank B Parts 2 and 3); each was
  put back by picking the original effect and compared with its saved copy
  afterwards (0 bytes differ). Nothing was saved.

## Results

| check | result |
|---|---|
| Install over USB (stage, trial, keep) | accepted; inventory `BBD Delay`, handle 14 |
| Pick on T1 (DSP core 1), T5 (core 0), T2 (a second instance on core 1) | all three running 114-118 ms after YES |
| Pick on T6 (a second instance on core 0) | refused (DSP budget: 2 x 700 + 6 x 342 > 3,120), as admission predicts |
| Pick on T5 in bank A, whose Part 3 keeps DARK REV on core 0 | refused, DSP MEMORY FULL: core 0's arena is 2,361 words, FILTER and DARK REV hold 1,508, the largest free run is 853 < 1,112 |
| Chip load, default settings, transport stopped | core 1: 518 fewer idle passes a frame per instance (469 cycles a sample); core 0: 363 (453 cycles a sample) |
| Chip load, dearest settings (TIME 0, FDBK 127, TONE 0, FREQ 127, MIX 64, STGS 4096, HPF 64) | core 1: 583 passes (527 cycles a sample) |
| Part switch away and back | T1 runs DELAY in the other Part and BBD again on return, every knob as set |
| Remove while T1 runs it | refused (loader refusal 7), still installed |
| Remove while no track runs it, then the Part that names it | removed; T1 falls back to NONE (dry) and BBD is listed missing |
| Reinstall | T1 runs BBD again at once, every knob as set |
| Self-test | passed: 1/1 intact, ran; peaks CPU 45.7 %, T1-4 45.3 %, T5-8 44.3 %; longest frame 427 us |
| STOP, STOP, STOP | kill mask `0xff`; T1's frame record (FX2 id `0x000e`): slot 11 127 -> 0, its other bytes unchanged; T2 (DELAY) untouched |
| Release | the mask bit clears on the track's next trig (stock's trig path, as for the reverbs); T1's slot 11 back to 127 |
| Audio, single STOP (T3, FDBK 100, MIX 64, the project's own loop) | the repeats ring on: -36 dBFS falling to -117 dBFS over about 4.5 s |
| Audio, STOP, STOP, STOP | the tail rings through the first two presses (-39 to -49 dBFS), then -132 dBFS (2 LSB) from the third on |

Cycles come from the base's idle counters (`status.c`: 14.48 cycles an idle
pass on core 1, 20.0 on core 0, calibrated on this unit on 11 October 2026)
against `perf.py`'s executed instructions at the same settings (326.44
defaults, 361.49 dearest): 1.44 and 1.46 chip cycles an instruction. With the
same ratio the worst case with trig splits, 399.31 instructions, is about 583
cycles; the base charges it 700 (7/4) against the 726 one instance may take.

## Not covered

- Project save and reload and a power cycle: the owner's project was not
  saved, and a RAM-booted base does not survive a power cycle.
- The card build's ColdFire hook (`bbd_kill_hook`) did not run on hardware;
  the event subscriber did, at the same site, on the same record.
- MKI, MIDI load, more than two instances on a core, a trig split measured on
  the chip, and listening by a person.
- The recordings (`stop1.wav` `2bdc1c14…`, `stop3.wav` `8baef86c…`, 20
  channels, 10 s each) stay private: they carry the owner's sample.
