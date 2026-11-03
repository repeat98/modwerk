# Quick Mod Assign (Analog Rytm MKII, OS 1.74): design

Design agreed with Nathaniel Pavel (@npp1993) on 2 Nov 2026. The module is in `sdk/analog-rytm-mkii/modules/quick-mod-assign/` (build QM03, rytm-emu only).

Hold a key and turn a knob to link that parameter to velocity or aftertouch, in the
way QPERF links a performance: hold QPER and turn. It is meant to be fast enough to
use mid-jam.

## What stock does today

Seen in rytm-emu on the owner-supplied OS 1.74 image:

- **Where it lives.** SOUND settings (FUNC + FLTR) has the rows VELOCITY MOD and
  AFTERTOUCH. Each opens MODULATION SETUP (VelocitySetupView, AfterTouchSetupView).
  The settings belong to the sound, so they are saved with the kit.
- **Four slots each.** Knobs A to D choose each slot's destination from a long
  list (ModDestListView: META:None, LFO:Multiplier, ... AMP:Reverb Send). Knobs E to
  H set each slot's amount, from -128 to +127. A new kit's BD PLASTIC sound has
  META:None, FILT FRQ, FILT RES and META:None, all at 0.
- **Steps today.** FUNC + FLTR, then DOWN to VELOCITY MOD (how many depends on
  where the cursor was left), YES, turn a knob through the destination list, turn
  the amount knob, then NO, NO to get back to the page. That is seven or more
  actions plus a scroll through the list, and the page you were tweaking is gone
  while you do it.

## The design

| Gesture | Effect |
| --- | --- |
| FIX held + turn a knob | Links that parameter to velocity; the turn sets the amount |
| RTRG held + turn a knob, no pad played during this hold | Links that parameter to aftertouch; the turn sets the amount |

Rules:

- **Pages.** It works on the SYNTH, SAMPLE, FILTER, AMP and LFO pages of a sound
  track. The FX track, the TRIG page and a held trig key stay stock.
- **The knob's own value stays.** While the key is held the turn goes to the slot's
  amount, not to the parameter.
- **The slot.** A parameter already in one of the sound's four slots keeps that
  slot, and the turn continues from its amount, as QPERF continues from the shown
  value. Otherwise it takes the first free slot: META:None, or an amount of 0.
- **Full.** When all four slots hold other parameters at amounts other than 0, a
  stock-style popup says VEL SLOTS FULL (AT SLOTS FULL) and nothing changes. Turning
  a slot back to 0 frees it.
- **No destination.** A parameter that is not in stock's destination list gets a
  popup and no change.
- **Feedback.** While the key is held, a stock popup shows the link, for example
  `VEL  FILT FRQ  +64`. It closes when the key is released.
- **FIX keeps its job.** FIX pressed and released with no turn toggles fixed velocity
  as on stock.
- **The pad guard.** Once a pad is played while RTRG is held, knobs act stock for
  the rest of that hold, so pad retrigs plus a knob tweak still work. LEVEL still sets
  the retrig rate in stock's RETRIG popup.
- **Storage.** It writes stock's own slots through stock's setter. The module
  stores nothing, the links save with the kit, and they keep playing on a unit
  without the module.

## Why these keys

Each key was tested in rytm-emu: hold it, turn knob B on the SYNTH page, compare
with no key held.

| Key | Stock while held | Verdict |
| --- | --- | --- |
| FIX | Momentary; the knob edits as normal | Velocity. FIX is already the velocity key |
| RTRG | Momentary; RETRIG popup; LEVEL sets the rate; knobs A-H edit as normal | Aftertouch, with the pad guard |
| TRK | Momentary, nothing shown | Taken: Ctrl All (TRK + knob = every track) |
| QPER | | Taken: QPERF |
| PERF, SCNE, MUTE, CHRO | A press latches a pad mode | Every assign would flip the mode |
| FILL | Momentary fill | Fill plus a tweak is a jam move; Quick Fill Trig Condition uses trig + FILL |
| YES, NO | Free on sound pages | Hidden, and menu keys |
| Knob push + turn | Stock changes the value its own way | Taken by stock; Sample Playback Rate uses the knob B tap |
| FUNC + FIX | FIXED VELOCITY popup | Stock |
| FX, SONG, CHAIN, SAMPLER, TEMPO, GLOBAL, PAGE, BANK | Open a screen or switch a mode | No |

## Beside other modules

- **UI claims:** `FIX + knob on sound pages`; `RTRG + knob on sound pages when no
  pad was played during the hold`.
- **No new site.** core-ar2 already owns the knob turn (param_apply_delta) and asks its `core_params` table first. One entry covering every id, with only a delta function, takes the turn while FIX or RTRG is held and passes otherwise. Ctrl All and Velocity Humanise hook deeper in the same routine, so a taken turn never reaches them: FIX + TRK + turn links velocity, not every track.

## Read from the code (2 Nov 2026)

- Slots: the sound object (`0x400a67ca(kit, track)`) holds the velocity config at +44 and the aftertouch config at +176; their sets (+36, +44) have count (+8), dest (+36), amount (+44), set amount (+40, clamped, change notice) and set dest (+32, takes the logical id, stores its row +4 index). Each slot is a 16-bit 8.8 amount and a destination byte, 0 for none.
- Destinations: stock's list keeps a sound's parameter index p when the sound set's +76 maps p to a logical id with flag 0x200 (0x40007234).
- FIX: stock toggles at the press, through 0x400b7724 (a C++ bool) and 0x400b7702 on project + 48.

## Cost (estimate)

UI code only, with no audio-path work and no storage bits. The estimate is about 1.5
to 2.5 KB of `.run` in the shared 128 KiB mod area, which the core already uses
about 12 KB of, and under 64 bytes of `.bss`. It runs on key events and knob turns
only, a few hundred cycles each. The linker's sizes and a unit run will give the
real figures.

## Later

- **Breath.** Stock has no breath setup. One way is to treat breath (CC 2 in) as
  aftertouch so it drives the AT slots. That is still to be decided.
- **OXI E16.** E16 knobs could send the amount for a held parameter. This belongs
  with the planned E16 LINK for the Rytm.

## Testing

The emulator is for fast iteration only; the unit qualifies the module. Test
assigning, continuing a turn, freeing a slot, the full popup, FIX with no turn,
the pad guard during retrigs, kit save and reload, and running beside Ctrl All,
Velocity Humanise and QPERF.
