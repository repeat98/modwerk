# Kit A/B (Digitakt MKI, OS 1.54)

Compare the sound you're tweaking against the sound you last saved, without losing either.

## How to use it

| Do this | What happens |
|---|---|
| **FUNC + YES** (stock) | Temp-saves the pattern and its kit. This is your "B". |
| Tweak sounds | Normal editing. This is your "A". |
| **Hold TRK, press NO** | You hear **B** (the temp-saved kit). A small **B** shows in the top-right corner. Your edits are kept aside. |
| **Hold TRK, press NO** again | Your edits (**A**) come back. |

- The temp-saved copy is never overwritten, so FUNC+YES and FUNC+NO still work as before.
- If you change pattern while you're hearing B, your edits are put back into the pattern you left
  ("KIT A KEPT").
- Anything you change *while* on B is thrown away when you go back to A, as on the Rytm.
- Only the kit (sounds) switches. Trigs and p-locks stay as they are.

## Messages

- **KIT B: SAVED** / **KIT A: YOUR EDITS**: it switched.
- **NO TEMP SAVE YET**: the box had no temp copy to load. Press FUNC+YES once first.
- **KIT A/B: NO KIT FOUND**: a safety check failed (see below), so nothing was touched.
  Please tell me if you ever see this.

## How it works (plain version)

The Digitakt already has a "reload only the kit from the saved copy" routine. It's used by the KIT
menu's RELOAD KIT FROM SAVED and by FUNC+NO. When you press TRK+NO, the mod first copies your
current kit into a spare piece of memory. Then it calls that stock reload, so you hear the saved
kit. Pressing TRK+NO again copies your kit back. Then it gives the same "kit changed" signal the
stock reload gives, so the sound engine and the screen pick it up.

**Safety check.** Before doing anything, the mod checks that the kit address it worked out is the
same one the sequencer is actually playing. If they don't match, it does nothing and shows
"NO KIT FOUND". That way it can't scribble over the wrong memory.

Firmware addresses (OS 1.54): Project::instance 0x40138882, active pattern 0x40092890(0x401389c4()),
kit = project->vtable[10]() + 0xf6341c + 2334 × pattern, reload 0x40017c16 (project, temp=1,
pattern, seq=0, kit=1), kit-changed 0x4013c42c (project+0xec, pattern, 0).
