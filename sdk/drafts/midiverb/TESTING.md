# Midiverb testing

Record what you ran, on which build and which unit, and what you saw. "Not tested" is a valid answer; never write a result you did not observe, and keep emulator runs apart from hardware ones.

## On the unit

Not tested.

## Stock flows

Not tested. List the stock flows you compared with and without the module (docs/module-guides/README.md, Leave stock flows alone).

## Sound quality

Not tested. npm run fx:audit checks aliasing, DC, clipping and idle behaviour (docs/module-guides/effects.md, Sound quality).

## Performance

Not measured. Listing it needs evidence/performance.json: npm run perf:audit -- template dsp (docs/MODULE_PERFORMANCE.md).
