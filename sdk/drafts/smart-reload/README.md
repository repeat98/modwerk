# Smart Reload

Version 0.1.0 · by @Andrey-Sidorkin · a draft, not tested yet.

## Overview

What it does to the sound or the workflow, in two or three sentences.

## Controls

Each control: its name, range and default, and what it does. Keep the controls in octamod.module.json the same.

## Usage

Where a musician finds it on the unit, key by key.

## Quick tutorial

1. Set it up.
2. Change a control and hear what it does.
3. Get back to where you started.

## Compatibility and limitations

What it cannot run beside, and why. Not known yet.

## Tests and measurements

See [TESTING.md](TESTING.md).

## Authorship and licences

Your own code under the licence in LICENSE. Name anyone whose work it builds on.

## Screens and audio

None yet.

## Develop

- Hear it: `npm run module:dev -- smart-reload` builds it and tries it on your unit over USB; `--watch` does that again on every save.
- Check it: `npm run module:doctor -- --draft smart-reload`. Its experimental lines must be green to share the draft; its release lines say what listing it needs.
- Before you write ColdFire code: the traps in sdk/octabam/AGENTS.md, and docs/OCTATRACK_API.md for the hooks a module can use.
