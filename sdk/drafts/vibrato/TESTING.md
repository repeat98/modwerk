# Vibrato testing

Source: octabam `e85f54e0d570bd74bfd70b9d5467b35c01b9c468`, `modules/vibrato` and `tools/verify/verify_vibrato.py`, with Modwerk's changes listed in README.md. OS 1.40C.

## On the unit

Not tested on the Modwerk base yet.

### USB package build, 17 November 2026

`npm run module:dev -- vibrato --build-only` from `sdk/drafts/vibrato` (Modwerk `c60cceb46` plus this draft): module `d4582ab2`, DSP effect 11, 696 DSP words, 7 relocations, no ColdFire code, no hooks, no stock-code sites. Built with the default draft budget (600 modeled cycles, 132 state words); measured figures still to come.

Not tested yet: install, Keep/Undo, both slots, both cores, several instances, knobs, parameter locks, LFOs, scenes, Part and project reload, power cycle, CPU and DSP price, the render gate in Modwerk's tree, screenshots.

## The author's results on octabam's build

Bryan T's results, reported in his README (`upstream/modules/vibrato/README.md`) for octabam's build. They were not repeated here.

- `verify_vibrato` (octabam's form: the FX1-only build plus the `vibrato-fx2` remix): FX1 MIX 0 a bit-exact passthrough in all shapes; DEP 0 a pure 2-sample delay; every shape against the float reference; DEP's cents, SQR's trill and SPD's period measured on the DSP's output; the SHP duck without a click; SPD and DEP swept fast without a pitch step over 10 cents; FX2 live and bit-identical to FX1 in the FX1+FX2 build; eight instances on one core each bit-identical to one alone; `-guard` clean on every slot.
- `verify_dirty_state` (-138.5 dBFS from a garbage-filled block), `verify_init_regs`, `verify_menu`, `verify_replaces`, `norep`, the selftest, `verify_docs`.
- Cost on his MKII, 4 November 2026: 4.50 % of a DSP frame a slot at the defaults, 4.41 % at the dearest (SHP RND, every knob 127), the busiest single slot 5.5 %, read with LOAD METER over USB with VIBRATO on FX1 of tracks 1-4. Static count 108 cycles a sample (`cycle_count.py`). In the FX1+FX2 build, sixteen instances (FX1 and FX2 of all eight tracks) ran with both cores at 59 % and 51 %.
- By ear on his MKII: "performing quite nicely" after the walk's limit; defaults moved to SPD 80, DEP 48.

## Stock flows

Not tested.

## Sound quality

Not tested. `npm run fx:audit` checks aliasing, DC, clipping and idle behaviour (docs/module-guides/effects.md, Sound quality).

## Performance

Not measured on the Modwerk base.
