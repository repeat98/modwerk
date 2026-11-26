# PROGRAM PROBE (development fixture)

Never published. It exercises the base's program areas (`events.json` `ot_dsp_effects`, base 0.8.3's cumulative draft)
on a unit: knob A of FX2 picks one of eight programs, each a DO loop of 100 + 500 × program cycles a call written by the
base into the area its slot does not run, then named in the slot's record between two frames. The DSP meter of the
slot's core (`npm run device -- stats`) tells which program runs; the audio passes untouched. With the stream (a twin built with `stream_probe.py --stream-channel`, T5-T8) it echoes each frame's number, which `fill` sent, back through its out-block, and `take` counts the frames that came back right and wrong: `good << 16 | bad` in the value `try` prints.

Build (a development twin of that base on the unit):

```sh
npm run module:dev -- program-probe --build-only --slots fx2 --cycles 240 --cycles-kind modeled --state 1 --out /tmp/pp.mwrm
python3 -B sdk/runtime/loader/abi9.py /tmp/pp.mwrm --requires programs -o /tmp/program-probe.mwrm
```

The host side is `sdk/tests/test_dsp_programs.py` (the base's areas and the contract's proc under the vendored
interpreter). Unit runs are recorded in the cumulative base pull request.
