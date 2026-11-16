# Working on MIDI Scenes

MIDI Scenes is a port of Sam Banks' octabam module (`modules/midi-scenes` at f7d72906, MIT), after bkkbrls-del's MIDISC. Modwerk's changes are the
base's hooks in place of octabam's STORE, the file read and the battery-RAM copy; README.md and TESTING.md say which.

**Findings that octabam has too go to octabam as issues, for this module only** (owner, 16 November 2026, following
Sam's terms of 13 November 2026: issues and pull requests are welcome upstream, but he does not respond to reports that
did not originate from or were not tested against octabam). Open one on
[sambanks/octabam](https://github.com/sambanks/octabam/issues), besides fixing it here, only when:

- you confirmed it against octabam itself: reproduced with octabam's own build of `modules/midi-scenes` (its image under
  ot_emu, or on a unit), or shown in octabam's current source at the same lines. Say how you confirmed it;
- it is a bug, not a feature request.

Write what goes wrong and how to make it happen on octabam, the stock sites or routines involved (addresses, never
stock bytes), and the fix Modwerk made, if any. **Mention nobody**: no `@` before any name or handle, so GitHub notifies
no one; write names plainly or leave them out. Do not forward a Modwerk user's report as such (reports from Modwerk
users stay with Modwerk), and write nothing about Modwerk's plans for octabam.

`gh issue create -R sambanks/octabam --title "…" --body-file issue.md`. Bugs only in what Modwerk changed (the hooks,
the storage, the battery-RAM copy) stay in Modwerk's own issues. This rule does not cover any other module.
