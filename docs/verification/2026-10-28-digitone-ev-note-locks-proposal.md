# Digitone core: `ev_note_locks` proposal (28 October 2026)

A proposal under [Propose a hook on the Digitakt, Digitone or Digitakt II](../module-guides/README.md#propose-a-hook-on-the-digitakt-digitone-or-digitakt-ii), written before the module that needs it, `midi-step-locks`. The entry is in the `proposed` list of [sdk/digitone/core/interface.json](../../sdk/digitone/core/interface.json), which no tool reads as an event: a module cannot subscribe to it yet.

## What the module needs

With the sequencer playing, an external MIDI note-on on a synth track plays the sound of that track's last-stepped step (its parameter locks, and its pitch when the player chooses), a trigless trig included, with the MIDI velocity. Stopped, it plays as stock does. The module sends nothing, takes no key and claims no SysEx id. It needs, at one site, the note event of every source and a way to give a MIDI note's event the locks the sequencer last gave that track.

## The hook

`ev_note_locks(track, event)`, in the render where the OS applies an event's parameter locks. The handler may replace the event's lock list pointer (`event+0x38`). It runs for every note event, so the module copies each sequencer event's locks per track, then hands the copy to a MIDI event of that track. Other mods subscribe to the same site: a mod that scales or randomises locks, or that shows the locks a note played with.

| | |
| --- | --- |
| OS 1.44 | `0x4009eae0`, 2 instructions (8 bytes: a load of the list pointer and its test), SHA-256 `a70b8c71…1d6b` (full value in the interface file) |
| OS 1.43 | not located |
| Context | the render on the main CPU, once per note event |
| Result | none; the handler edits the event |
| Order | ascending, each sees the pointer the one before left |

## What was observed, and what was not

Everything below is from the digiemu emulator running the OS 1.44 file, never from a unit.

- The 1.44 image's SHA-256 matches the target of the vendored `core-dn1-2.0a-os1.44`.
- The site is the load of the lock list from the event, just before the call that applies it (`0x4009bee8`, whose arguments are the track and that list). The call is made once, from the render function (`0x4009d120`); the disassembly shows the event's register (`a3`) and the track in the frame, not a run.
- Sequencer playback queues note events through `0x40100178`, each of type 1 with a lock list.
- A MIDI note on the DIN port reaches the OS's byte parser and is passed on to a worker task. No event reached the render queue within about 700 ms for notes on channels 1, 2 and 14 with INPUT FROM set to MIDI+USB.

Not known: a MIDI note's event (type, flags, lock list), whether a trigless trig reaches the site, and every result on a unit. The module cannot be written against these until they are observed; the first step after the core carries the hook is to log them on a unit through the hook.

## Which mods hold this today

None. No Digitone mod patches or reads this site. `digitables` patches the voice start (`ev_voice_on`) only.

Where it lands: the module guide now puts a new hook into the machine's Modwerk base, started from the pinned core's source, and not into an upstream core release ([the guide](../module-guides/README.md#propose-a-hook-on-the-digitakt-digitone-or-digitakt-ii)). The Digitone's base is not started ([Modwerk stack](../../sdk/machines/digitone/README.md#modwerk-stack)), so this entry waits for it, and no unit can run the hook before it. The only 1.44 core pinned today is `core-dn1-2.0a`, which has no voice or lock hooks.

Hook indices are an ABI: a released one is never renumbered, and this entry is appended after the existing hooks.
