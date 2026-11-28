Module checks: a module that slows the Octatrack while nothing uses it is refused.

- CI now refuses a new release that adds more than 2 points to the CPU meter installed and used nowhere, where tick, draw and edit work shows. The frame interrupt's cost-at-rest limit, until now only in `module:doctor`, is held in CI too.
- The module guide gains a short list of what keeps ColdFire code cheap.
