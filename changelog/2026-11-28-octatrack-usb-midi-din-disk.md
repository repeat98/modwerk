Octatrack base: USB MIDI beside DIN, during DISK MODE and across a RAM boot (host tests only, not yet run on a unit).

- A USB message (a DAW's program change, say) arriving between a DIN sender's running-status notes no longer turns DIN's later notes into program changes, which changed patterns nobody chose.
- While USB DISK MODE is open, USB MIDI rests, so a clock or note packet cannot overwrite part of a file a computer is reading off the card.
- Before a RAM boot the base also resets the USB controller, so the new base starts with USB as after a power-on.
