Module checks: a module that slows the Octatrack while nothing uses it is refused.

- CI now refuses a new release that adds more than 2 points to the CPU meter installed and used nowhere, where tick, draw and edit work shows. The frame interrupt's cost-at-rest limit, until now only in `module:doctor`, is held in CI too.
- Agents now refuse a module design that is heavy on the Octatrack's processor before any code, and offer a light version: audio work on the DSP, work on a key press or once a step, and no render dearer than a stock track. The first prototype is measured on the unit.
