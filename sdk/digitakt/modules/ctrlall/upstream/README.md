# Ctrl All (Digitakt MKI, OS 1.54)

Set a p-lock on one track and have the same lock land on that step for every track that has a trig there.

## How to use it

| Do this | What happens |
|---|---|
| **Hold TRK, press YES** | CTRL ALL turns on. **ALL** shows in the top-right corner. |
| Hold a trig, turn a knob | The lock goes on that step as usual, **and** on the same step of every other track with a trig there. |
| **Hold TRK, press YES** again | CTRL ALL turns off. |

- From an **audio** track it copies to the other audio tracks (1–8). From a **MIDI** track it copies
  to the other MIDI tracks.
- Steps with no trig are skipped, so it doesn't use up lock memory on locks that would never play.
- Only **knob turns** are copied. Copy/paste, clearing locks and CREATE RANDOM LOCKS are never
  copied to other tracks.
- Live-recording knob moves while the pattern plays are copied too (when CTRL ALL is on).
- If the box runs out of lock memory you'll see the stock "Lock mem full!" message.
- CTRL ALL is off every time you power on.

## Messages

- **CTRL ALL ON / OFF**: toggled.
- **CTRL ALL: NO PATTERN**: a safety check failed (see below), so nothing was copied. Please tell me
  if you see this.

## How it works (plain version)

Every p-lock the Digitakt stores goes through one firmware routine ("set this lock on this track,
step and parameter"). That routine is called from exactly one place. The mod points that one call
at its own code. Its code runs the original routine first, so your lock is set exactly as before.
Then, only if CTRL ALL is on **and** a knob was just turned, it runs the same routine for the other
tracks that have a trig on that step.

**Safety check.** To see which tracks have trigs, it reads the pattern's step data (the same layout
the seq-events mod reads). First it checks that the pattern it found is the one the sequencer is
playing. If not, it copies nothing and says "NO PATTERN".

Firmware addresses (OS 1.54): PatternParamLocks::set 0x40013ee4, hooked at its only caller
0x4002479a (Track::setLock). The lock area is locks->vtable[10](), 0x38f0 bytes after the pattern
start. Step words are at pattern + 911 × track + 2 × step (bit 0 = trig). The playing pattern
pointer is at 0x4199ec38.

## Mixing with other mods

It hooks one spot in the firmware (0x4002479a). If another mod hooks the same spot, elekloader
will refuse the combination and tell you. It won't build a broken file.
