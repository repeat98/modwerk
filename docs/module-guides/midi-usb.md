# MIDI and USB

Read [the module guides index](README.md) first. A module that sends or reacts to MIDI clock or notes in time also follows [sequencing.md](sequencing.md).

**Applies to** modules with manifest `category: midi-usb`. [CC Map](../../sdk/octabam/modules/cc-map/README.md) maps MIDI CC 68–73 to FX1 SETUP controls. [USB Audio](../../sdk/octabam/modules/usb-audio-out-tracks-main-cue/README.md) sends eight stereo tracks, MAIN and CUE over USB.

## Behave like the instrument

- [ ] **A complete message map in the README:** every CC, note, channel and SysEx value you read or send, what it does, and the range. CC Map lists CC 68–73 and what each one controls.
- [ ] **Say what you consume.** CC Map's limitation list says CC 62–73 are consumed even when AUDIO CC IN is disabled. State for every message whether it is passed through to stock handling, consumed, or both.
- [ ] **Do not break common messages.** CC 64–67 overlap sustain, portamento, sostenuto and soft pedal. List overlaps with common controllers, and what a musician loses.
- [ ] **Use the stock enable and channel settings.** CC Map is enabled with the stock AUDIO CC IN checkbox and follows the track's TRIG CH. Do not add a private channel setting. State the default, and what happens when the setting is off.
- [ ] **Feedback.** When a MIDI message changes a value, the panel shows it (`verify_ccfeedback.py`), including values that are parameter-locked or LFO-modulated at that moment. **Verify** the interaction and record the result.
- [ ] **Parameter locks and LFOs.** A CC-driven parameter and a lock or LFO on the same parameter: say which wins, and test it.
- [ ] **USB:** the device enumerates as the instrument's own identity, with the interfaces the host expects (`verify_usb.py` checks the Elektron 1935:0002 identity, the MSC interface and the INQUIRY and CSW responses). Sample alignment and channel layout are tested (`verify_usb_align.py`, `verify_usb_in.py`), startup behaviour is stated (USB Audio reports a reordering burst 0.5–1.5 s after the stream opens), and the hosts you measured are named: "Windows and Linux hosts have not been measured" is a legitimate sentence, an omission is not.
- [ ] **Dependencies are explicit.** USB Audio brings the internal USB MIDI module; only one USB output layout can be composed.

## Integrate

- [ ] Conflicts and dependencies are declared in `compatibility`; USB Audio needs USB MIDI and the composer adds it.
- [ ] `sdk/catalog.json` entry, thumbnail, `resources.impact`, README sections, tutorial and screenshots of the setting that enables it (`PROJ` → `MIDI` → `CONTROL` for CC Map).
- [ ] A module with no Octatrack page of its own (an automatic USB module) uses the narrow `access.noUiReason` and still documents the host connection and routing. See [MODULE_UI_CAPTURES.md](../MODULE_UI_CAPTURES.md).
- [ ] `npm run module:verify -- <id> --os <your 1.40C>` and `npm run module:doctor -- <id>` are green.

## Test

`verify_midi.py`, `verify_ccmap.py`, `verify_usb.py`, `verify_usb_align.py` and `verify_usb_in.py` are the patterns. A host-side test is part of the work: name the operating system, the USB speed and the software you used, or say "not tested".

## Digitakt and Digitone

SysEx ids are resources: claim them (`sysex:0x7d` in `platform.claims`), because two mods may never claim the same one ([Digitakt guide](../../sdk/machines/digitakt/README.md)). The core delivers key and encoder events to your handler (`ev_key`, `ev_enc`); return nonzero only when you take the event.
