# Digitone II: stock OS 1.12 installed over USB MIDI by the upgrade protocol the site's engine sends, 19 November 2026

The Elektron OS upgrade protocol of `src/engine/elektron/os-upgrade.ts` (#1762), sent to a unit. Contributor's Digitone II (@prodbysmolec), running a Modwerk development base before the run.

- **File:** `Digitone_II_OS1.12.syx`, `7e5b8a733d4ab1fd…2ceb35` (stock).
- **Sender:** a host script on macOS (mido 1.3.3, python-rtmidi 1.5.8) that sends `rytm_link.py`'s `ek_upgrade_messages` for the file, one message at a time, each after the unit's answer. These are the messages `os-upgrade.ts` builds: its tests pin them byte for byte to `ek_upgrade_messages`. The TypeScript sender and its Web MIDI line themselves did not run here.
- **Run:** the start and all 1,168 writes were answered (status 0, the last "done") in 7.7 s over USB, with Transfer closed. The unit then asked UPGRADE OS NOW?; the developer confirmed on the unit, and it installed and works, as reported by the developer.
- **Not tested:** the browser sender (`sendUpgrade` over `midiLine`), answering NO, an upgrade over MIDI DIN, other Elektron machines.
