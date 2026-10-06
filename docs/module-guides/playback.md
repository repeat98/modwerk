# Playback

Read [the module guides index](README.md) first. Anything that follows tempo also follows [sequencing.md](sequencing.md).

**Applies to** modules with manifest `category: playback`: behaviour of sample playback that uses no effect slot. [Repitch](../../sdk/octabam/modules/repitch/README.md) follows project tempo by changing playback speed. [Preview Vol](../../sdk/octabam/modules/previewvol/README.md) previews samples at the default AMP volume.

## Behave like the instrument

- [ ] **It appears where a musician already looks.** Repitch is a value of the stock TSTR row in SRC SETUP (RPCH after OFF, AUTO, NORM and BEAT) and a step of the TIMESTRETCH setting on the audio editor's ATTR page. Do not add a new top-level screen for a playback option.
- [ ] **It says which tracks it covers.** Static and Flex: yes. Pickup: "does not offer REPITCH". List the others you tested.
- [ ] **It says what it overrides and what still applies.** REPITCH disables PTCH; RATE still applies. Write the same sentence for your module.
- [ ] **Parameter locks.** PLAYBACK-page locks are stored in slots 0–5 (PTCH, STRT, LEN, RATE, RTRG, RTIM on Static and Flex). Test a lock on each parameter your module touches, on a locked step and the step after. **Verify** with `ot_spec.py` playback locks.
- [ ] **Live changes.** A tempo, rate or sample change while playing is followed live. Repitch's gate runs `--tempo 120 --to 90` mid-playback. Slices, recorder buffers and loop points are tested or listed as "not measured".
- [ ] **No effect slot, no new dedicated knob** (Preview Vol "applies automatically"): the README says so, and the manifest `controls` is empty rather than inventing one.
- [ ] **Where it must restore stock state, it does,** also after an interruption. Preview Vol lists "restoration after interruption" as unqualified; do not leave that implicit.
- [ ] **MKI and MKII.** Key sequences differ (AED exists on the MKII panel). Document what you tested on which.

## Integrate

- [ ] `sdk/catalog.json` entry, thumbnail, `resources.impact`, README sections, tutorial and screenshots; the screenshots show the SRC SETUP or attribute page where the option is chosen.
- [ ] `compatibility.location` is `Flex / Static` (or what is true) and `limitations` lists what you did not measure.
- [ ] `npm run module:verify -- <id> --os <your 1.40C>` and `npm run module:doctor -- <id>` are green.

## Test

`verify_repitch.py` is the pattern: hooks on the stock and the built image, the panel (`verify_repitch_ui.py`), and playback with a generated loop that must follow a live tempo change. Say which parts you ran.

## Digitakt and Digitone

Playback behaviour sits in the core's render events (`ev_render_in`, `ev_render_out`). No playback-specific contract is documented for these machines yet. Read the [Digitakt guide](../../sdk/machines/digitakt/README.md), take what you need from the core's events, and record what you observed in TESTING.md.
