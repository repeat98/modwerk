Remote panel commands now wait for the development base to accept a queued
button, encoder or fader event. A full queue is retried briefly instead of
silently dropping the event; a failed key sequence also releases its modifiers.
