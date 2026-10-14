# Tuner

A guitar-tuner readout of the current audio track. Hold **UP** and press
**TEMPO**: a window opens over the page (the TEMPO window's size class,
96 x 56 px) with the track number, the note name and octave in the big
font (A4 = 440 Hz; `C`..`B`, sharps as `#`), a +-50 cent scale with a
needle, the cents as a signed number and the frequency in Hz. About seven
readings a second. When the signal drops below -54 dBFS, or the detector
is not confident, the last reading stays with **HOLD** in the header; `--`
until the first reading. The window follows the UI's current audio track
(the byte `0x80000000`, what T1-T8 select; in MIDI mode it keeps the audio
track). Close it with **TEMPO**, **YES**, **NO** or **UP + TEMPO** again.

What stays stock: TEMPO alone opens the stock TEMPO window, FUNC + TEMPO
is tap tempo, UP alone is UP. The order matters: **UP first, then TEMPO**.
TEMPO pressed first opens the stock window at once (that is what the key
does), and UP then steps its BPM, as stock.

The audio it reads is the track's post-FX, pre-fader signal from the
read-back arena (`0x80003190`, the same memory USB AUDIO streams), L and R
summed to mono. Track level, the crossfader and MAIN volume are downstream
of it, so a muted or faded track still tunes; a track whose sample has no
pitch (drums) gives a wandering reading, as any tuner would.

## Where it hooks

A DRAM unit (`tuner.s`, 2,846 B of code and tables, 19,500 B of data in
the platform reserve, no ROM cave) and three detours:

| site | stock instruction | stub | what |
|---|---|---|---|
| `0x40059ef0` | `tstl 0x460d16a0` (the TEMPO opener's first instruction; the key's press handler in both keymaps, code `0x18`) | `tu_tempo` | UP held (`0x46100b18[6]` bit 3) -> the tuner toggles; else the stock opener runs |
| `0x4000d99a` | `movel %d1,0x80004800` (frame_isr's tail, the instruction before USB AUDIO's site `0x4000d9a0`) | `tu_frame` | window open: the current track's 16 frames of this block, `(L + R) >> 1`, top 16 bits, into a 4,096-sample ring (93 ms). Closed: three instructions |
| `0x40056c72` | `pea 0x460d1664` (the UI task `0x40056c40`, before every `queue_receive`) | `tu_tick` | window open and 400 blocks (145 ms) since the last: analyse the ring and redraw, in the UI task. Closed: two instructions |

The window is the stock TEMPO window's shape: `0x4005829c(96, 56, 0, 0,
5, tu_close)` + `0x40056f4c(handle)`, an input layer of its own pushed by
`0x40031494` (TEMPO / YES / NO -> `tu_close`, UP and DOWN swallowed,
everything else falls through: track keys, page keys, encoders reach the
page underneath), destroyed by `0x40055db4(&tu_win)`. Class 5 means the
stock TEMPO window and this one evict each other, and a menu (class 1)
evicts it through the closed callback, which pops the layer.

## The detector (`tu_analyse`)

Integer only, `mulsw` / `divsl`; no EMAC, so no accumulator state to lose
to a task switch (the scheduler saves no EMAC registers, and stock tasks
do set MACSR). A Python model of the same arithmetic was the reference
while it was written (not part of this repository).

1. Snapshot the ring oldest-first; peak gate at 64 (16-bit units,
   -54 dBFS): below it, HOLD.
2. Scale so the peak lies in [384, 768): every sum below fits a signed
   long (W x 768^2 = 3.9e8; W2 x 768^2 = 1.2e9).
3. Decimate by 4 with an 8-tap boxcar (11,025 Hz, 1,024 samples).
4. McLeod's normalised square difference, `n(t) = 2 r(t) / (m0 + m_t)`,
   lags 1..368 (30 Hz) over W = 656 products, Q15, `m_t` slid per lag.
5. Key maxima: the highest value of each positive lobe after the first
   negative crossing (a lobe open at lag 1 is lag 0's and is dropped);
   the first lobe within 0.80 of the best wins; best < 0.5 -> HOLD.
   0.80 rather than McLeod's 0.9 because at 2 kHz the coarse lag is 5.5
   and the sampled peak of the true lobe can be as low as cos(pi/5.5) =
   0.84 of the interpolated one.
6. Parabolic interpolation on the coarse lobe, then the YIN difference
   `d(t) = m0 + m_t - 2 r(t)` at 44.1 kHz for seven lags around 4x the
   coarse lag over W2 = 2,048 products (kept unsigned, compared unsigned),
   its minimum interpolated. The difference function, not the
   autocorrelation: on a finite window the autocorrelation's peak is
   biased by the window's ripple (-9 cents at 82 Hz in the model), the
   difference's minimum is not.
7. Period in Q8 samples -> `f x 10 = 112,896,000 / period`; octave by
   doubling the period into the C0..B0 band, note by the quarter-tone
   edges, cents by the nearest `4096 x 2^(c/1200)` (a 12-bit ratio,
   0.42 cents per unit).

Cost, static: ~1.0 M instructions per analysis (the lag loop is 368 x
656 x 3), ~190 per block for the copy (16 x 11 + the bank arithmetic).

## Measured (ColdFire port, 26 Sep 2026)

The panel rig (three servers with sound, the OTLIVE card copy and two
USBSIG-style cards whose tracks play mono tones); the cost rig on the pipe
(`--interactive --dsp`, `cfstatus` over 2 s windows).

- **Steady tones, one per track** (each read four times 0.35 s apart,
  every reading identical): 300 Hz -> D4 +37c 300.0 Hz (true +37.0);
  400 -> G4 +35c (+35.0); 500 -> B4 +21c (+21.3); 600 -> D5 +37c; 700 ->
  F5 +4c (+3.8); 800 -> G5 +35c; 900 -> A5 +39c (+38.9); 1000 -> B5 +21c
  (+21.3); 82.41 -> E2 +0c 82.4 Hz; 110 -> A2 -1c 109.9 Hz; 350 -> F4 +4c;
  1050 -> C6 +5c (+5.8); 1500 -> F#6 +23c (+23.3); 2000 -> B6 +21c
  2000.2 Hz (+21.3); 55 -> A1 +0c/-1c; 1318.51 -> E6 +0c 1318.5 Hz.
  Largest error 1.0 cent (110 Hz, 55 Hz), typical 0.3.
- **The FM synth (OTLIVE T2, `[TRIG 10]` held while stopped):** PTCH +12.0
  -> C5 +0c 523.2 Hz; +9.0 -> A4 +0c 440.0; +7.0 -> G4 -1c 391.9; +5.0 ->
  F4 +0c 349.2; 0.0 -> C4 -1c 261.6; -9.0 -> D#3 +0c 155.5; -12.0 -> C3
  +0c 130.8. (The rig's encoder reports are accelerated by the firmware,
  so the values landed on whole semitones; the page showed each value.)
- **Silence:** after STOP the last reading stays with HOLD (B5 +21c on the
  tone card, the synth's last note on OTLIVE); a fresh window shows `--`.
- **Keys** (screenshots `k01`..`k09`): TEMPO alone -> the stock TEMPO
  window; FUNC + TEMPO -> TAP TEMPO; UP alone -> nothing; UP + TEMPO ->
  the tuner, the TEMPO handle `0x460d16a0` stays 0; NO, YES, TEMPO and
  UP + TEMPO each close it; TEMPO held then UP -> the stock window (BPM
  120.0 -> 120.1). Page keys, track keys (the header follows) and MIDI
  mode leave it open; FUNC + MIXER (the PROJECT menu) evicts it cleanly
  and it reopens afterwards.
- **Audio with the window open:** 1.9 s captures of MAIN through the panel
  while a 300 Hz track played, tuner closed / open / open / closed: RMS
  2536 / 2536 / 2541 / 2536, no zero run longer than 1 sample, no sample
  step above 8x the 99th percentile, `/audio/status dropped` 0 throughout.
- **Instruction cost** (lockstep `--dsp`, OTLIVE, T2 playing): closed
  and stopped 73.6 k/ms; open and stopped 74.6 k/ms (+1.0 M/s: the copy
  at ~190 per block x 2,756 blocks/s plus the gated snapshot of each
  update); closed and playing 87.8-88.4 k/ms; open and playing 96.2-96.3
  k/ms (+8.1 M/s at 7 draws per second = ~1.15 M instructions per update,
  the analysis and the redraw). On a 266 MHz V4e that is a few percent
  of the core while the window is open, nothing while it is closed; the
  emulator's real-time ratio fell (0.90 -> 0.76 with one server) because
  the host pays for those instructions too.
- `make check REMIX=octatrick-tuner`: see the commit.

## Open

- Inharmonic and sub-harmonic sounds read as what they are: the FM synth
  at RATO 1.25 with INDX 40..127 wanders C4..D4 (its spectrum has no
  single period), at RATO 0.25 with INDX 127 it reads C2 65.4 Hz (the
  waveform's true period is four carrier cycles). A drum loop wanders.
  No octave error was seen on a harmonic tone from 55 Hz to 2 kHz.
- The frequency prints one decimal; the cents are quantised to 1 (the
  12-bit ratio gives 0.42 cents per unit, so a reading can sit one cent
  off at the boundary: 110 Hz read -1c).
- On hardware: UP + TEMPO opens the window and tunes on the author's MKI
  (octabam test build 3.0 b40, 29 Sep 2026); the readings are not measured
  against a reference there. The hooks are read from the image and the
  stubs replay the displaced instructions; the arena read is USB AUDIO's,
  hardware-proven on the MKI.
- One reading is one 93 ms window; there is no averaging. A tuner that
  averaged two or three would sit stiller on noisy inputs (the model puts
  a 15 % white-noise tone within +-10 cents).
