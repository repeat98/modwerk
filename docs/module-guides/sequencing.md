# Sequencing: use the instrument's own timing

Applies to every module that does something in time: rhythms, gates, envelopes, echoes, arpeggios, scene changes, retriggers, anything tied to steps, tempo or the transport. It is not a category; it adds to the guide for your module's category.

**The rule.** Never build a second clock. Follow the Octatrack's transport, tempo, track speed, track scale and length, swing and trig masks, read from the sequencer's own records. A module that keeps its own timing drifts against the pattern, ignores the swing the musician set and breaks when the tempo or a track speed changes.

[Euclid](../../sdk/octabam/modules/euclid/README.md) is the worked example. It "follows the Octatrack transport, track speed and swing grid".

## What to follow

| Instrument timing | What your module must do |
| --- | --- |
| Transport (PLAY, STOP, restart) | Both PLAY paths call one reset routine. PLAY resets phase. STOP returns every modulated value to its base. Anything captured survives a restart if the README says it does, and is said to be runtime state, not project data. |
| Tempo | Read stock's tempo word from the sequencer record (tempo24, record halfword 31: `verify_tempo.py`). Do not derive tempo from audio. A tempo change while playing is followed live: Repitch's gate drives `--tempo 120 --to 90` mid-playback. |
| Track speed | Express your rate relative to it. Euclid's RATE offers 1/32 to 1/2 "relative to track speed; 1/16 is one track step". |
| Track scale and length | Read once per track, even when the module occupies both FX slots. |
| Swing | Use the track's swing mask and amount, including Swing All changes. Rotation or odd lengths in your own pattern must not rotate the track's swing grid. A finer subdivision than the track step interpolates the neighbouring track-step offsets. |
| Pattern loops | Say whether your phase keeps rolling across loops (Euclid's does) or restarts, and test both the loop point and a pattern change. |
| Parameter locks and LFOs | Whatever you publish is processed by the stock scene and LFO code after you. Euclid's frame hook "publishes the modulated FREQ value after stock scene and LFO processing, which otherwise overwrites it". Publish after them or your value is lost. |

When a rate changes, join the next point on the new grid. Do not replay a backlog (Euclid: "a RATE change joins the next point on the new grid without replaying a backlog").

## Checklist

- [ ] No timer, counter or phase of your own advances without the sequencer's clock. Where one is unavoidable, say why in the README.
- [ ] Your timing is expressed in track steps and subdivisions, so it follows track speed and tempo.
- [ ] Swing is honoured through the track's own mask and amount, including Swing All.
- [ ] PLAY resets phase, STOP returns to base, and a restart does not leave stale state. Both PLAY paths reach the same reset.
- [ ] A tempo change, a track speed change and a pattern change while playing are followed without a gap, a double hit or a replayed backlog.
- [ ] Pattern length and scale are read from the track, once per track.
- [ ] Where you modulate a value, you publish it after stock scene and LFO processing.
- [ ] Idle or stopped instances do no timing work (Euclid derives envelope timing only for the active output mode, and skips stopped and inactive instances).
- [ ] The README lists which of the above you follow, and TESTING.md the combinations you tested.

## Test

Octabam's gates are the pattern to copy.

- `verify_euclid.py` checks exact pulse deadlines for 7 track speeds × 5 rates × 3 swing amounts, including clock wrap, and that odd cycles and custom swing masks keep the track grid's phase.
- `verify_tempo.py` checks a tempo-derived value against the tempo word at several tempos, including one with no matching division.
- `verify_repitch.py` runs a loop that must follow a live tempo change.
- **Verify** on the emulator or a unit: a pattern with swing set, a track speed other than 1x, a tempo change during play, and a pattern change at the loop point. Build it with `ot_spec.py` (track speed, scale, length, trigs and locks by name) and the headless emulator, and record the result.

Do not hard-code one tempo, one speed or zero swing in a test and call the timing verified.

## Digitakt and Digitone

The core delivers events to your handler (`ev_tick`, `ev_render_in`, `ev_render_out`: [Digitakt guide](../../sdk/machines/digitakt/README.md)). Take timing from what the core and the OS provide at those events; do not count your own. No sequencer-timing contract is documented for these machines yet, so record what you read and how you tested tempo and swing changes in TESTING.md.
