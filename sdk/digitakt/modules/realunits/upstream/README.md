# Real Units 0.2 (Digitakt MKI, OS 1.54)

Knob values in hertz, milliseconds and note lengths. **Replaces Filter Hz.**

**New in 0.2: works together with machine-pages.** Both mods change how a knob's value is written
out. 0.1 hooked the very start of those firmware routines, the same spot machine-pages takes, so
the two couldn't be in one build. 0.2 hooks a few instructions later in the same routines.
machine-pages handles its own parameters first and passes everything else on, so Real Units now
sees every other knob. With a machine-pages machine loaded, its own knobs keep machine-pages' text;
FREQ and the envelopes still show Hz and ms.

| Page | Knob | Shows |
|---|---|---|
| FLTR | FREQ | Cutoff in Hz: 5.0 ... 333 (at 64) ... 20.8k |
| FLTR | ATK | 0.67 ms ... 601 ms (at 64) ... 10.0 s |
| FLTR | DEC, REL | The same scale; **INF** at 127 (never falls) |
| FLTR | env DEL | 0 ... 383 ms (at 64) ... 3.00 s |
| AMP | ATK | 0.02 ms ... 184 ms (at 64) ... 1.00 s |
| AMP | HOLD, DEC | 0.04 ms ... 1.84 s (at 64) ... 9.81 s; **INF** at 127 |
| LFO | SPD, MULT | The pop-up adds the LFO's cycle length (audio tracks) |

The LFO pop-up, for example: `Speed=32.00 1/8` or `Multiplier=... 2bar`.
- With the tempo: bars (`1bar`, `4bar`), note values (`1/4`, `1/16`, dotted `1/8.`), otherwise in
  16th steps (`5.33st`).
- Free-running MULT values: in Hz (`0.50Hz`).
- LFO+'s slow MULT values (/2 /4 /8 /16) are counted in.

**Delay TIME is not changed**: the stock firmware already names the note values in its pop-up
(1/16, 1/8., 1/4 ...).

## Where the numbers come from

Each one is read from the table the sound engine itself uses (OS 1.54):
- **Amp envelope** runs once per sample. HOLD counts samples from a table. DEC is a fade whose "time
  to fall to a tenth" matches that same table entry for entry, so that's the time shown. ATK is a
  straight ramp ten times faster.
- **Filter envelope** runs once per 32 samples. ATK is a straight ramp (127 = 10.0 s exactly).
  DEC/REL are fades whose time to a tenth matches the ATK table.
- **Decay times mean "time to fall to 10 %"** (the fade is a curve, so it never has a hard end).
- **LFO**: the engine's own speed maths gives one cycle = 2048 / (SPD x MULT) sixteenth steps (so
  SPD x MULT = 128 is one bar), and SPD x MULT / 256 Hz when free-running.

Only the text changes. Sounds, locks and saving are untouched.
