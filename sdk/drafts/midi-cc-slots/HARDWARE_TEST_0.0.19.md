# Midi Mode 2 0.0.19 hardware trial

The candidate targets base `462fbd2b2ee95dd71c02778ef3b17aacba945bac9b6206688d8ef8995003826e`. No hardware test has yet been observed on this combination. Do not treat the old 0.0.18 results as its qualification.

1. Back up projects and both saved module-set files; use a disposable project. Finish or cancel any INIT, save manually, stop playback and leave USB DISK MODE.
2. Refresh `http://127.0.0.1:5173/?preview=midi-cc-slots`, connect, and check the displayed base identity. The trial page refuses an older base. If the base is older, stop here: plan the base update and full selected-module set together before sending anything. Never force the MIDI package onto a mismatched base.
3. Build/read modules and review the complete installed list, including every companion. Start the temporary trial. Confirm the trial and self-test complete before continuing. Do not Keep yet.
4. Check numeric CC labels, both extra CC assignments and native PB/AT restoration, NAME editor placement, existing Bank A/B names and channels, ordinary bank/Part changes and playback. Avoid INIT during this reversible code test: Undo does not reverse a completed project setup. Check every companion remains present and works.
5. Undo the trial and confirm the original module set returns. Report any refusal or freeze before another attempt.
6. Only after a successful reversible test, trial again and Keep installed. Wait for Card save confirmed; save the test project manually, power-cycle normally, reconnect and Check after restart. Confirm all companions, names/channels/CC controls and normal playback. Report the exact result.

The card installer supports Midi Mode 2 alone or with subsets of Sidechain Compressor, Play Modes and Mute Modes. It replaces the complete saved set. Do not use a four-module ZIP on a unit carrying other modules expecting it to preserve them. The historical label-only MIDI2 TEST 17 page is a separate fixture and must not be used for this base.
