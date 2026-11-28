Module checks: a module that slows the Octatrack while nothing uses it is refused.

- CI now refuses a new release that adds more than 2 points to the CPU meter installed and used nowhere, where tick, draw and edit work shows. The frame interrupt's cost-at-rest limit, until now only in `module:doctor`, is held in CI too.
- A new module now plans its ColdFire budget before any code: where each piece of work runs (a key press, the DSP, once a step, or every frame) and what it may cost, steered to the cheapest place. Its first prototype is measured on the unit against that plan.
