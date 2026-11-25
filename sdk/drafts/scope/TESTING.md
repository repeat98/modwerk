# SCOPE testing

Draft Modwerk port of octabam `modules/scope` at
`3fcf4fe45d8f0754828f5f2ef9b11935ac0dd9f9`.

## Commands

```sh
npm run module:doctor -- --draft scope
npm run modules:compat -- --with scope
npm run module:dev -- scope --build-only
```

Native behaviour gate (once the draft is staged for a package build):

```sh
python3 modules/scope/verify.py
```

`verify.py` is still a stub. Replace it with a Modwerk/ot_emu check of
DOWN+TEMPO open/close and a quiet closed path before listing.

## Octabam evidence (not Modwerk USB)

Recorded against octabam images, not a Modwerk package:

- Author MKII, `LSCOPE BJ`, 24 Oct 2026: OSC / XY / ALL, clip `!`, G/P HUD,
  DOWN+TEMPO. Busy 8-track + CF METER: ISR mean 291 µs open / 288 µs closed
  (TUE 0, ROE 0). Several minutes ALL, no glitch reported.
- OCTA S2 flashed image, 15 Nov 2026: SCOPE closed vs open across 30 loader
  transitions on `SFX_01`. Zero bad DSP records either side. Median audio gap
  340 ms in both states. Details in upstream README.

## Modwerk status

| Check | Result |
| --- | --- |
| `module:doctor -- --draft scope` | run on this branch |
| USB trial / Keep / power cycle | not run |
| `device:qualify` | not run |
| Monochrome UI captures | not taken |
| Beside Tuner | refused by site overlap until a base hook |

## Source pin

| File | Role |
| --- | --- |
| `unit.s` | octabam `modules/scope/scope.s` at the pin above |
| `upstream/modules/scope/` | unchanged octabam README, manifest, scope.s |
