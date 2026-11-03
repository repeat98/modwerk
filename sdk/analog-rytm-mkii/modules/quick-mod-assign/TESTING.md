# Quick Mod Assign testing

The rytm-emu runs below were observed on the named build; the emulator is not hardware evidence. The unit results are the author's reports, labelled as reported.

- Stock OS 1.74: `.syx` `cb0f99d6…e123`, the owner's file. Base: Modwerk base for core-ar2 0.7, `0c92aa45`.
- Build QM03 (core + Quick Mod Assign, FIX and RTRG, amount popups): `.syx` `13a7016fb97323374f1a1a8e422f0c9c5d0d52c393c23fd675f11feff9a76c7a`.
- Build QM04 (after a review: any turn during a FIX hold keeps fixed velocity; a missed release frees the knobs; a pad held in PERF or SCNE leaves the turn to stock): `.syx` `d8d093d9624e2be570ee157265f35e2bdfd1c8c63eeea3472c9a7642705da395`.
- Build QM05 (after a second review: a fresh press always starts a new hold; slot matching uses the stored index; top_view stops at the list's end): `.syx` `1091da0e3fb555d566bf8ae0c8f50d8a8e1bb6f1f7768fe469e1010e12e692bf`.
- Build QM06 (one pad scan per knob event): `.syx` `14eb5448616b9fc2622591f653f994260713396f442ba57570e5fe0bb6511606`. In combo RC17 (`b1179a85…`).
- Build QM09 (SAMPLER replaces RTRG for aftertouch; stock's lock-style display with a V or A marker instead of the amount popup; PERF and SCNE edit screens; the other key ignored during a hold; the locker kept with the hold by the tick): `.syx` `c94a8b7b160764343861aec67fc08f65a631cf4f200f3b79d5ce93fe184921f4`.
- Emulator: rytm-emu `2ac0f1f`, headless `dtboot`, a fresh card, the default kit (BD PLASTIC on track 1), the SYNTH page unless named. Events off the `--every` grid. Slots read on stock's MODULATION SETUP screen; fixed velocity read from stock's flag in RAM.

## rytm-emu (QM09)

| Check | Result |
| --- | --- |
| Boot | to the main screen, 0 faults in every run |
| FIX held, SWT turned 10 detents | V at the top left; SWT drawn as stock's lock box `+8`; SWT's own value unchanged; MODULATION SETUP VEL slot 1 BDPL SWT 8 |
| FIX released, held again | SWT still shown `+8` |
| SAMPLER held, SWD turned | A at the top left; SWD `+8`; aftertouch slot written |
| FIX + TUN, 6 detents (a fine parameter) | TUN `+5` |
| AMP page, FIX + ATK, 12 detents | ATK `+10`; the envelope graphic draws the longer attack |
| FIX + SWT, SWD, DEC, TUN, then MOD | four boxes `+2`; MOD gives `VEL SLOTS FULL` and changes nothing |
| SAMPLER tap | stock's recorder opens |
| SAMPLER held with a turn, released | no recorder; a later tap opens it |
| SAMPLER held 3 s with turns (key repeat) | no recorder during or after |
| FUNC + FIX | stock's FIXED VELOCITY popup, fixed velocity unchanged |
| PERF, FIX + SWT | V, SWT `+5` |
| PERF, FIX held, BD pad + SWT | stock's performance lock (LOCKS 13 to 14); after the pad, V comes back and SWD turns as a velocity link |
| SCNE, SAMPLER + DEC | A, DEC `+3` |
| SAMPLER held, FIX tapped | fixed velocity unchanged, nothing else |
| FIX held, SAMPLER tapped | no recorder |
| FIX tap / two taps / held past repeat | toggles on release / on then off / toggles |
| FIX held with a turn, with LEVEL turned, on the TRIG page with a turn | fixed velocity unchanged |
| TRIG page, FIX + VEL | VEL unchanged (stock's lock edit refuses TRIG parameters) |
| A trig held with FIX, either order | the knob does nothing |
| FIX + LFO DST | nothing |
| FILTER page, FIX held | the new kit's FRQ and RES links at 0 shown as `0` boxes |

Earlier builds (QM03 to QM06, RTRG and popups): the same slot writes, TUN, SLOTS FULL, FIX key, LFO DEP accumulation and popup throttling checks passed; QM01 left fine knobs at 0 and QM02 never toggled FIX (both fixed).

Not tested: kit save, reload and power cycle on QM07 or later; SOUND MANAGER; the sequencer running; MUTE and CHRO screens; a sample machine; beside Ctrl All and Velocity Humanise; a missed key release (the emulator always delivers it).

## Hardware

**RC17 (QM06 inside), reported by the author, 3 Nov 2026:**
- FIX + knob: the link works (popup build); `VEL SLOTS FULL` shown.
- RTRG + knob for aftertouch: first did not seem to work (the RETRIG popup appears), later reported working; the author found RTRG a poor key and SAMPLER replaces it from QM07.
- FIX tap, FIX held with a turn, FUNC + FIX: pass.
- FIX on the FX track: edits as normal.
- Kit save and power cycle: the links were kept. Sound normal.

QM07 and later (SAMPLER, the lock-style display) have not run on a unit. Steps for the author's unit, on QM09 or a combined image with it:

1. FILTER page, hold FIX: a V at the top left, FRQ and RES shown as `0` boxes. Turn FRQ: its box counts up, FRQ itself does not move. Soft and hard pad hits differ. SOUND SETTINGS, VELOCITY MOD shows FILT FRQ.
2. AMP page, hold SAMPLER: an A. Turn DEC: pad pressure changes the decay. Tap SAMPLER alone: the recorder opens; hold it with a turn: it does not.
3. Fill four slots, try a fifth: SLOTS FULL. Turn one back to 0, the fifth now fits.
4. FIX tap: fixed velocity toggles on the release. FUNC + FIX: stock's popup. Hold SAMPLER and tap FIX: nothing.
5. PERF mode: hold FIX and turn a knob (a V and the box), then with FIX still held press a pad and turn (a performance lock, as stock).
6. Save the kit, power cycle: the links are kept.
