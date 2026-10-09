# Analog BD: follow a machine change in the playing track

Private candidate **0.1.6-experimental**, based on published **0.1.5-experimental**, a follow-up to [issue #363](https://github.com/repeat98/modwerk/issues/363) and [PR #373](https://github.com/repeat98/modwerk/pull/373). The public manifest, catalogue pin, approval and packages stay at 0.1.5.

## What 0.1.5 leaves open

ANALOG BD is FLEX to stock, so a change between the two is no machine change. 0.1.5 makes the saved Part valid; it does not touch what is playing.

1. **Stock keeps the engine's copy of the track** (`0x80000810 + 72 × track`, `+0` and `+0x20`).
   - Analog BD → FLEX: the track keeps playing with the drum values as FLEX settings until the bank is loaded again.
   - Plain FLEX → Analog BD: the playing track keeps the FLEX values (DECAY 0). This is also in 0.1.4. Seen in the emulator as bytes only; not tried on hardware with 0.1.4 or 0.1.5. On an earlier private build that reset the engine's copy on leaving but did not seed it on assignment, an MKII track was silent after Analog BD → FLEX → Analog BD until SRC + PLAY, which is the same state.
2. **Every trig on an Analog BD track also starts stock's FLEX voice**, from the drum's bytes read as FLEX settings. After a change to FLEX with the sequencer running the track plays that voice until its next trig. On an MKII, on a private build with the engine's copy already handled, this was a short burst of wrong sample data.

## Change

`machine.s` only, in the signature writer, for the active Part:

- leaving Analog BD also writes the stock FLEX defaults into the engine's copy of the track;
- a new Analog BD assignment also writes the drum's defaults there;
- leaving Analog BD clears the track's stock voice flag (`0x800049d8 + 168 × track`). Stock's sample fetch at `0x40007960` writes silence while it is 0 and the trig start at `0x4000f450` sets it again, so the track is silent until its next trig.

Other Parts, plain FLEX tracks and a reselect of Analog BD are not touched. The Part handling of 0.1.5 is unchanged. Addresses were read from the user's own 1.40C image; no stock bytes are in this folder.

## Evidence

- [evidence/engine-copy.json](evidence/engine-copy.json): build identity, the regression result and the emulator comparison against 0.1.4 and 0.1.5.
- [evidence/hardware-npp1993.json](evidence/hardware-npp1993.json): one reported MKII functional pass on image **AB015FX4**, with the two earlier builds and what failed on them.
- [TESTING.md](TESTING.md): hardware steps and how to reproduce.

## Known limits of this change

- The voice flag is cleared after the twelve engine bytes are written, and the hook does not run in the audio interrupt, so a frame can fall between the two. No click was reported on hardware. Clearing first would close the window; it was left as tested so the hardware report matches this exact source.
- The engine's copy is assumed to hold the Part's base values. That matched in the emulator with no scenes, locks or LFOs on the SRC page; it was not checked with them.
- Stock's FLEX trig start still runs on every Analog BD trig with the drum's bytes as FLEX settings. This change stops the resulting voice at the machine change; it does not remove that work.

## Before promotion

Build this source with `build.py` in the isolated container, record the image and saved-upgrade identity, rerun `verify.py` and the power-cycle regression, compile the packages and repeat the native/browser comparison. Then apply `machine.s` to the public module with a new version, catalogue pin, imported fingerprint, release notes ([release-notes.json](release-notes.json)), captures and generated metadata under [ADD_A_MODULE.md](../../../docs/ADD_A_MODULE.md). The 0.1.5 approval names its exact source and does not cover this one.
