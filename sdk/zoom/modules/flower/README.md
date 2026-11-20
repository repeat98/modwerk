# Flower

## Overview

A Korg-style random sample-and-hold step filter: the "Digital Bath" sound.

## Controls

| Control | Default | Function |
| --- | ---: | --- |
| Rate | 45 | params[5]. Random step speed (~0.5..14 Hz). Range 0–100. |
| Mix | 50 | Mix default 1 (quiet-safe). The editor materialises patches on load (full-patch send), so audible-on-load no longer needs a hot default. Range 0–100. |

## Usage

Hold a chord and listen for its filter movement.

### Quick tutorial

1. Add Flower from the Delay group to a spare patch.
2. Hold a chord and listen for its filter movement.
3. Compare the effect with bypass using the footswitch.

## Compatibility and limitations

Hardware untested on the original MS-70CDR with OS 2.10. This build has startup knob initialization disabled. Check saved settings after recalling a patch.

## Tests and measurements

Ziddle passed the loader check and rendered 22,050 stereo frames. The compiled file passed the stock-code scan and MS-70CDR size limits. Hardware untested. [Verification](TESTING.md)

## Authorship and licences

Roman Rusinov and the ZoomMultistompZDL contributors. [Source](https://github.com/themanro/ZoomMultistompZDL/tree/aee98c53d7b568cbb55bb927aefbdc9b4e739f3e/src/custom/flower) · [Licences](LICENSE)

## Screens and audio

![Embedded effect cover](media/cover.png)
