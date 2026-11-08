# Proposed Digitakt II sequencer note hook

`ev_seq_note` is a pitch-only callback for the OS 1.17 sequencer. The base would call it after stock resolves the note and its deadline and before handing the event to the stock queue. PLAY and subsequent steps use the same callback contract. The base passes the sounding pattern and track, the stock step, root and a twelve-bit scale mask relative to that root. The base sets `DT2_SEQ_NOTE_EUCLIDEAN` only when it can identify a generated Euclidean note.

Subscribers receive a read-only context and the current pitch. The linker orders the callbacks by subscription order. Each receives the previous callback's accepted result. A result outside 0–127 retains the current pitch. There are four slots, and an empty collection preserves the incoming pitch. The dispatcher does no allocation or timing work and changes no pattern records.

The source in this directory is a draft beside the imported core. Connecting it to firmware requires a guarded bridge that supplies the verified playback context and preserves the stock calling convention. Note provenance, note locks, pattern changes, and the exact interrupt and register requirements remain to verify before exposing the ABI. The module's menu and behavior will use the reviewed base hook.

Local Windows C11 checks exercised empty and full subscriber collections. They verified the eight-byte context layout on the host, callback order, handling of invalid pitches, and that pitch zero is accepted. The firmware bridge and target ABI still need a ColdFire build and emulator verification.
