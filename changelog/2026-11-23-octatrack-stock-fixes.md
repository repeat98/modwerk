Octatrack base 0.8 fixes four stock OS bugs, three of them with Zac-Kyoti's code (MIT, via octabam):

- A pattern holding only parameter locks now shows as used under [PTN], and a bank of such patterns lights under [BANK]. KITS no longer copies over such a pattern when it looks for an empty one.
- After a pattern change into another Part, a track going from PICKUP to FLEX plays the new Part's sample, and the recorder page shows the new Part's settings.
- Erasing a trigless lock's last parameter lock removes the lock, on audio and MIDI tracks.
- A Plays-Free MIDI track with trig quantize DIRECT no longer stalls after its first step in a PER TRACK pattern.
