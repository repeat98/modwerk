# Vibrato testing

Source: octabam `e85f54e0d570bd74bfd70b9d5467b35c01b9c468`, `modules/vibrato` and `tools/verify/verify_vibrato.py`, with Modwerk's changes listed in README.md. OS 1.40C.

## On the unit

Not tested on the Modwerk base yet.

### USB package build, 17 November 2026

`npm run module:dev -- vibrato --build-only` from `sdk/drafts/vibrato` (Modwerk `c60cceb46` plus this draft): module `d4582ab2`, DSP effect 11, 696 DSP words, 7 relocations, no ColdFire code, no hooks, no stock-code sites. Built with the default draft budget (600 modeled cycles, 132 state words); measured figures still to come.

Not tested yet: install, Keep/Undo, both slots, both cores, several instances, knobs, parameter locks, LFOs, scenes, Part and project reload, power cycle, CPU and DSP price, screenshots.

## In dsp_host (emulated DSP, not hardware)

All runs in the `modwerk-source-tools` image with dsp_host built in it, on a private copy of Modwerk's `sdk/octabam` (tools, platform, dsp, licences), every module of `sdk/octatrack/modules` and this draft as `modules/vibrato`, with the owner's own verified 1.40C MAIN OS (`164f3122…`), `--shm-size=2g`. Payload A only for the gate (dsp_host renders one payload); both payloads for the benchmark and the stress run.

### Render gate, 17 November 2026

`python3 -B modules/vibrato/verify_vibrato.py` (this folder's adapted copy, scratch image of VIBRATO alone with fallback NONE): **63 passed, 0 failed.** Among them: FX1 MIX 0 a bit-exact passthrough in all four shapes; `-guard` clean on FX1 and FX2; DEP 0 the input exactly 2 samples late within 5 LSB at full scale of both signs; every shape against the float reference (audio error at most 1.45e-03 against a 2.8e-03 bar); the knob laws; the SHP duck without a click; SPD and DEP twisted in 0.25 s with no pitch step over 10 cents block to block (largest 5.8 cents); two RND instances independent; LFO fractions reaching SPD, DEP, SLEW, WID and MIX; FX2 at Y:0x4000 and in the shared window bit-identical to FX1 and live in SINE, TRI and SQR, RND the reference with each instance's own seed; eight instances on one core (FX1 and FX2 of four tracks) each bit-identical to one alone, eight distinct RND streams, the guard clean.

### DSP cost, 17 November 2026

`python3 -B modules/vibrato/perf.py bench` (Modwerk's tool, LOFI2's adapted): `benchmark_reverbs.run` as `benchmark_stock_dsp.py` runs it, one instance per core at positions 0 and 4, audio at X:0, 4,096 blocks of 16 frames, the null stub's peak subtracted. VIBRATO on the private image `a2c7001d…` (VIBRATO beside twelve stock effects), the stock effects on the original image; fixed knobs, the moving-knob pattern and a trig split at every position 1-15, plus every knob at 127 in each shape. Executed instructions a sample in dsp_host, not chip cycles:

| Effect | Worst unsplit | Worst with splits |
|---|---:|---:|
| VIBRATO (82 cases) | 131.19 | **156.25** (moving, split at frame 1) |
| VIBRATO, every knob 127, SINE / TRI / SQR / RND | 117.12 / 117.25 / 116.75 / 130.81 | 144.44 / 144.25 / 143.25 / 155.50 |
| FLANGER | 115.69 | 131.06 |
| CHORUS | 253.62 | 293.06 |
| SPRING REV (the cost target for new FX) | 257.50 | 314.19 |
| DJ EQ (the dearest stock effect) | 293.38 | 330.94 |

VIBRATO's worst is 0.50x SPRING REV, 0.53x CHORUS and 1.19x FLANGER. No VIBRATO case clipped a sample. Static count (`tools/build/cycle_count.py` on a scratch remix of VIBRATO alone): 108 cycles a sample, the author's figure; eight instances on a core, 864 of the 3,120 usable.

### Stress, 17 November 2026

`python3 -B modules/vibrato/perf.py stress /perf --seconds 32`, first layout (LOFI2's): VIBRATO on FX2 of all eight tracks (four per core) behind DJ EQ on every FX1, three LFOs per track on SPD, DEP and MIX, a new random value on every slot of both effects each sixteenth at 120 BPM (11 slots, SHP included), trig splits on six tracks, eight different stems, `-guard 0x4000 -guard-shared -dirty 0x5a`: host exit 0, no hang, VIBRATO's eight instances 0 stray write regions and 0 clobbers (the DJ EQs write their own scratch, 0 clobbers), 16 guarded instances, per-core peak 1,884.1 and 1,885.9 executed instructions a sample, 24 minutes of wall time.

Not run yet: the layout `perf:audit` needs for the eight instances a core the record claims (VIBRATO on FX1 and FX2 of every track, 12 slots changing a step). `perf.py stress` now builds that layout; the run stopped before it started when Docker's engine stopped answering.

### USB package for the unit trial

`npm run module:dev -- vibrato --build-only --slots both --buffer 2048 --cycles 157 --cycles-kind executed --state 64`: module `d4582ab2`, the same 696 DSP words, now declaring both slots, a 2,048-word slot buffer (within the base's 3,072 for FX1), the measured 157 executed cycles and the 64 state words of its r7 block.

### Screenshots, 17 November 2026

`scripts/capture-module-ui.py` with octabam's `ot_emu` (`bdbe962c…`) on the gate's native image `d0a645f2…` (VIBRATO alone), MKII panel, empty scratch card, transport stopped, on FX2: SETUP after picking VIBRATO, the main page, DEP at 127, SHP at SQR (eight encoder ticks for two steps). In that native build VIBRATO is on the FX2 list only (octabam's builder gives it an FX1 row through the SLOTS setting this port drops); on the Modwerk base the package declares both slots. Not captured: the FX1 list on the base.

### Sound quality, 17 November 2026

`npm run fx:audit` (plan, then the ten signals rendered through VIBRATO in dsp_host on the gate's scratch image, track 1 FX1, then check). Modulation off (DEP 0, MIX 127, a 2-sample delay):

| Signal | out dBFS | harmonics | aliasing | residual | DC dBFS | rails | verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| 1.1 kHz -12 / -1 dBFS | -12.0 / -1.0 | -137.0 / <-140 | <-140 | -128.5 / -139.6 | -138.5 | 0 | ok |
| 2.7 kHz -12 / -1 | -12.0 / -1.0 | -137.9 / <-140 | <-140 | -128.6 / -139.5 | -138.5 | 0 | ok |
| 5.3 kHz -12 / -1 | -12.0 / -1.0 | -139.8 / <-140 | -139.2 / <-140 | -128.5 / -139.5 | -138.5 | 0 | ok |
| 9.1 kHz -12 / -1 | -12.0 / -1.0 | <-140 | -136.2 / <-140 | -128.6 / -139.5 | -138.4 | 0 | ok |
| idle | after the input stops: digital silence | | | | | | ok |

With modulation on (the defaults; every knob 127 in SINE, SQR and RND), the audit flags aliasing on every tone, as its own note says a time-varying effect will: a vibrato moves each tone's energy into pitch sidebands, so the tone's own bin drops (to -44 dBFS for a -12 dBFS tone in SQR at DEP 127, where the pitch sits a semitone either side) and the sidebands land in the bins the audit reads as aliasing. These columns do not measure the effect there. What they do show in every modulated set: no sample on the rails, DC at -69 dBFS or lower, and digital silence after the input stops.

`compare` on the noise signal: each end of SPD, DEP, SLEW and WID, and each SHP, differs from every other render (2.6-3.0 dB difference, level within 0.15 dB); the one identical pair is SLEW 0 against WID 0, which are both the default setting. MIX 0, 32, 64, 96 and 127: neighbouring levels within 3 dB (-2.18, -1.60, +0.22, +1.83 dB); MIX 64 is 3.8 dB under the dry noise, where the pitch-moved copy and the dry partly cancel.

## The author's results on octabam's build

Bryan T's results, reported in his README (`upstream/modules/vibrato/README.md`) for octabam's build. They were not repeated here.

- `verify_vibrato` (octabam's form: the FX1-only build plus the `vibrato-fx2` remix): FX1 MIX 0 a bit-exact passthrough in all shapes; DEP 0 a pure 2-sample delay; every shape against the float reference; DEP's cents, SQR's trill and SPD's period measured on the DSP's output; the SHP duck without a click; SPD and DEP swept fast without a pitch step over 10 cents; FX2 live and bit-identical to FX1 in the FX1+FX2 build; eight instances on one core each bit-identical to one alone; `-guard` clean on every slot.
- `verify_dirty_state` (-138.5 dBFS from a garbage-filled block), `verify_init_regs`, `verify_menu`, `verify_replaces`, `norep`, the selftest, `verify_docs`.
- Cost on his MKII, 4 November 2026: 4.50 % of a DSP frame a slot at the defaults, 4.41 % at the dearest (SHP RND, every knob 127), the busiest single slot 5.5 %, read with LOAD METER over USB with VIBRATO on FX1 of tracks 1-4. Static count 108 cycles a sample (`cycle_count.py`). In the FX1+FX2 build, sixteen instances (FX1 and FX2 of all eight tracks) ran with both cores at 59 % and 51 %.
- By ear on his MKII: "performing quite nicely" after the walk's limit; defaults moved to SPD 80, DEP 48.

## Stock flows

Not tested.

## Sound quality

See "Sound quality, 17 November 2026" above (dsp_host). Not listened to on a unit yet.

## Performance

dsp_host figures above; not measured on the Modwerk base on a unit.
