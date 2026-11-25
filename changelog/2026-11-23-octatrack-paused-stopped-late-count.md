Octatrack base 0.8: a unit paused by PLAY or stopped by a MIDI STOP from a computer now counts as stopped. Before, it counted as playing until a panel STOP, so a Part the brake had silenced stayed silent and the CPU check took the paused unit's light readings as playing ones.

The base now also counts frame entries later than its late-entry wait can hold (190 µs or more), which can stall the DSP. The diagnostics log records them and a trial fails on one.
