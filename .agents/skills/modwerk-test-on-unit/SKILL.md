---
name: modwerk-test-on-unit
description: Test a Modwerk build on the developer's instrument over USB in two stages - first the tests the agent runs on the unit itself (a rolled-back trial through npm run device:test, driving, screenshots, audio), then the developer's own test of what only a person can judge - or, without a unit, in the emulator. Use when a developer wants to try, test or qualify a module or base on hardware or in the emulator, or another command needs a build tested on the unit.
---

# /modwerk-test-on-unit

The order is fixed: your tests on the unit first, then the developer's. A build that fails your stage is fixed and run again; the developer never gets it to find out.

1. **One session at a time on the unit.** Every session on a computer shares its one connected unit. Ask before using it, and stop if another session holds it. Emulators need no turn: each session may run its own, with its own socket path, card copy and MCP (`--data-dir`, `--device-socket`); never attach to one another session started. On the owner's computer, sessions share one emulator (`docs/OWNER_OPERATIONS.md`).
2. **Prepare.**
   - The software checks are green first (`npm run module:doctor -- <id>`, `npm run modules:compat -- <id>`).
   - Name the build: the source revision and each package's SHA-256. A draft's package comes from `npm run module:dev -- <id> --build-only`. Both stages are about this build only; a rebuild starts again at stage 1.
   - Tell the developer what you will run on their unit and get their OK for this run. Read `docs/OCTATRACK_DRIVING.md` and keep its rules.
   - Start one session with `npm run device -- serve --share /tmp/modwerk-share.sock` on a development base, transport stopped, on a bank and Part whose working copy equals its saved one. Read the unit before you change it: `ui` and `npm run device -- do inventory`.
3. **Stage 1: your tests on the unit** (Octatrack). Run them yourself; do not ask the developer to press anything. No Keep in this stage.
   - **The scripted pass:** `npm run device:test -- --testing-entry run.md <package>`, in the background, reading its log (`docs/ADD_A_MODULE.md#octatrack-base-and-usb-lifecycle`). It installs the package as a trial and rolls it back at the end; places it alone on T1 and T5 and on every track while playing; sweeps its knobs; switches Parts and banks; reads the load meters, loader, crash and stall counters and the self-test; then restores the Part and checks the inventory. One package a run.
   - **By hand, what it does not cover,** inside a trial (`npm run module:dev -- <id>`, undone when it ends; or the developer MCP's `device_review`, `device_trial`, `device_undo`, `docs/FRONTEND_MCP.md#then-test-the-connected-device`):
     - reach every control and screen by the button steps its README gives, and take a `png:` screenshot of each to compare with the README and its UI claims;
     - record MAIN and CUE over USB (`rec`) with a sustained sound and check for dropouts (runs of exact zeros, a block played twice). This finds faults; it does not judge the sound.
   - **Put it back** after the steps by hand: Undo, reload the Part, then check the active identity, the inventory and the Part against what you read in step 2.
   - **The release run** is `npm run device:qualify -- --keeps-ok --testing-entry run.md <package>`. It Keeps each install and removal, which rewrites the card's kept set: only with the developer's OK for exactly that, after noting the flashed set.
   - On the flashed base the driving steps are refused: run what the MCP offers (status, trial, load, Undo) and list the rest as not run.
   - A failure stops the stage: put the unit back, fix it, and start stage 1 again on the new build.
4. **Stage 2: the developer's test.** Only after stage 1 passed on this build. Say in a few lines what it showed and what it could not.
   - Then give them a short list of what only a person at the unit can judge: what `device:test`'s entry leaves for them (how it sounds and plays, timing by ear, MIDI, scenes and recording, the module beside their other installed modules, the power cycle and what survives it), plus anything particular to this module.
   - Each item has the exact button steps and what they should see or hear. Leave out what stage 1 already settled.
   - The Keep, the power cycle and listening are theirs: never Keep without their OK, never power-cycle or flash yourself. The order stays review, trial, then an explicit Keep or Undo, bound to the exact version. On a RAM-booted test base a Keep replaces the owner's kept set (`docs/OCTATRACK_DRIVING.md`).
   - Record what they report, as they report it. A fault they find is fixed, and both stages run again on the new build.
5. **A machine without a USB link yet:** stage 1 runs in the emulator and stage 2 carries all the hardware evidence. Recommend building a link, as the recipe lays out (`docs/MACHINE_RECIPE.md`, `sdk/runtime/loader/README.md#porting-to-another-machine`).
6. **The emulator** (`ot_emu` from `npm run upstream:tools`, digiemu, rytm-emu) is for fast iteration and UI captures (`docs/MODULE_UI_CAPTURES.md`), and a good place to rehearse stage 1 before touching the unit. It never counts as hardware evidence.
7. **Record** both stages in the module's `TESTING.md`, apart and on the named build: the `device:test` entry and what you did by hand, then what the developer observed. "Not tested" is a valid result.
   - Your stage is evidence for what it measured, never for the sound or for persistence across a power cycle; software tests prove neither, nor rendered pixels.
   - The hardware report and the release boxes stay the developer's: never attest for them.
