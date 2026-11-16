# Working on MIDI Scenes

MIDI Scenes is a port of Sam Banks' octabam module (`modules/midi-scenes` at f7d72906, MIT), after bkkbrls-del's MIDISC. Modwerk's changes are the
base's hooks in place of octabam's STORE, the file read and the battery-RAM copy; README.md and TESTING.md say which.

**Bugs that are upstream's too go to octabam, for this module only.** When you find a bug in code or behaviour this
module took from octabam, and octabam's own `modules/midi-scenes` has it as well, open an issue on
[sambanks/octabam](https://github.com/sambanks/octabam/issues) (owner, 16 November 2026), besides fixing it here:

- what goes wrong and how to make it happen, the stock sites or routines involved (addresses, never stock bytes), and
  the fix Modwerk made, if any;
- **mention nobody**: no `@` before any name or handle, so GitHub notifies no one. Write names plainly, or leave them out;
- nothing about Modwerk's plans for octabam.

`gh issue create -R sambanks/octabam --title "…" --body-file issue.md`. Bugs in what Modwerk changed (the hooks, the
storage, the battery-RAM copy) stay in Modwerk's own issues. This rule does not cover any other module.
