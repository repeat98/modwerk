# Improved Mod Assign

An Analog Rytm MKII mod by Nathaniel Pavel (@npp1993). Version 0.4.0-experimental, OS 1.74 with core-ar2 0.7.

## Overview

Linking velocity or aftertouch to a parameter on stock takes a trip through SOUND SETTINGS: FUNC + FLTR, down to VELOCITY MOD, YES, scroll a long list for the destination, turn the amount, then NO, NO back to the page. Quick Mod Assign does it from the page you are playing:

- **Hold FIX and turn a knob**: that parameter is linked to velocity, and the turn sets the amount.
- **Hold SAMPLER and turn a knob**: the same for aftertouch.
- **Hold LFO and turn a knob**: that parameter becomes the LFO's destination, and further turns set its depth.
- **Hold SCENE and turn a knob**: that parameter is locked in the active scene (with none engaged, the scene engaged last), as scene edit does with the scene's pad held, without leaving the page. Tap pads while SCENE is held to move between tracks and lock each.

While either key is held, every knob already linked shows its amount the way stock shows a performance or scene lock (an inverted box with +n), since an amount is an offset as theirs are. Envelope graphics follow the amount as they do for a lock. The mod fills stock's own four velocity and four aftertouch slots of the selected sound, so the links save with the kit, show in SOUND SETTINGS as usual and keep playing on a unit without the mod.

## Controls

| Control | Where | What it does |
| --- | --- | --- |
| FIX held | SYNTH, SAMPLE, FILTER, AMP and LFO pages of a sound track, also in PERF, SCNE, MUTE and CHRO | Shows the velocity links: each linked knob as a box with its amount. Turning a knob links it, or changes its amount, -128 to +127. The parameter's own value does not move. |
| FIX or SAMPLER held, press a knob | as above | Sets that link's amount to 0, as a press clears a lock on stock, so its slot is free for another parameter. |
| SAMPLER held | as above | The same for aftertouch. A new kit links aftertouch to FILT FRQ at +16, so that box shows on the FILTER page. |
| FIX tap | anywhere stock takes it | Toggles fixed velocity as on stock, on the release instead of the press. A hold of about half a second or more is a look at the amounts and does not toggle. |
| SAMPLER tap | anywhere | Opens the recorder, as on stock. After a hold with a turn, or of about half a second or more, it does not. |
| LFO held | SYNTH, SAMPLE, FILTER and AMP pages of a sound track and the FX track's pages, also in PERF, SCNE, MUTE and CHRO | Shows the LFO's destination knob as a box with its depth, written as the LFO page writes DEP (+1.96, and (0) at 0). The box fills the knob's column, one width whatever the digits, as the LFO page's value does; on a knob shown as a widget (OVR, DEL, REV, PAN, VOL) it sits over the widget, as stock's lock box does. Turning a knob makes that parameter the LFO's destination (DST) at depth 0; further turns of the same knob set the depth (DEP), with the same steps and speed as stock's DEP knob. The parameter's own value does not move. |
| LFO held, press the destination's knob | as above | Sets the LFO's depth to 0. |
| LFO tap | anywhere | Opens the LFO page, as on stock, on the release instead of the press. After a hold with a turn, or of about half a second or more, the page stays. |
| SCENE held, turn a knob | a track's pages (the FX track's too), PERF, SCNE, MUTE and CHRO, and scene edit with no scene pad held (there the scene it shows) | Locks that parameter in the active scene, or with none engaged in the scene engaged last (scene 1 until one has been since power-on; the module keeps it across kit loads, so a new kit's locks go to that scene number), without engaging it, as stock's scene edit does with the scene's pad held: the first turn makes the lock at the knob's value plus the turn, and every knob the scene locks shows as stock's inverted box with the lock's value. The page stays, and neither scene edit nor scene mode opens when SCENE is let go. With all 48 of the kit's scene locks in use, `SCENE LOCKS FULL`. |
| SCENE held, press a knob | as above | Removes that parameter's lock from that scene, as a press does in scene edit. |
| SCENE held a moment | as above | The scene's locks show as boxes about 0.2 s into the hold, before any knob is turned. |
| SCENE held, REC, STOP or PLAY | as above | Copies, pastes or clears that scene's locks with stock's own routines, as FUNC + REC, STOP and PLAY do in scene edit: `COPY SCENE n`, `PASTE SCENE`, `CLEAR SCENE`, and a second STOP or PLAY undoes (`UNDO PASTE`, `UNDO CLEAR`). The transport does nothing then. |
| SCENE held, tap a pad | as above | Ends the hold as a knob does: scene edit does not open on the release. On the pages the pad plays and, with AUTO TRK SWITCH on, selects its track as on stock, so the next turns lock that track. In scene mode (SCNE) it selects its track the same way instead of engaging its scene. In PERF, MUTE and CHRO the pad does what stock does there. |
| SCENE held and let go, no knob or pad | anywhere stock takes it | Opens scene edit, as on stock, when SCENE is let go instead of while it is held. A tap toggles scene mode as before. |
| LFO on the LFO page | a sound's or the FX track's LFO page, also in PERF, SCNE, MUTE and CHRO (not while a pad is held to set a performance or scene lock) | Stock's: holding it shows the page's values, as any page key does, and a tap steps to a module's page behind LFO. |

A parameter already linked keeps its mod slot. A new one takes the first slot, left to right, with no destination or an amount of 0; turning a link back to 0 frees its slot. A link at 0 still shows as 0 while the key is held (a new kit links FILT FRQ and FILT RES to velocity at 0, so those are the first taken). With all four slots holding other parameters a popup says `VELOCITY MODS FULL` (`AFTERTOUCH MODS FULL`) and nothing changes. A parameter that is not in stock's destination list says `NOT A VELOCITY DEST` (`NOT AN AFTERTOUCH DEST`, `NOT AN LFO DEST`) and nothing changes; the LFO's own parameters are no LFO destination. Each knob event moves the amount at least one step, more when turned fast, whatever the parameter's own resolution.

FUNC + FIX (stock's FIXED VELOCITY), the FX track (FIX and SAMPLER there are stock's, and selecting it during a hold hands its knobs back to stock), and a performance pad or a trig that holds stock's lock edit keep stock's behaviour: a pad held in PERF (or in scene edit) during a hold makes a performance (or scene) lock as usual, and the links show again when it is let go. During a hold the other two keys do nothing. FUNC + LFO, and LFO while a pad, a trig or QPER holds stock's lock edit, stay stock's.

## Usage

Hold FIX or SAMPLER on any sound page and turn the knob you want to move with velocity or pad pressure. SOUND SETTINGS, VELOCITY MOD and AFTERTOUCH show the same links for fine-tuning. Hold LFO and turn a knob to send the LFO there; keep turning it to set how far.

### Quick tutorial

1. Select a sound track and press FLTR. Hold FIX: FRQ and RES show 0 boxes, the new kit's velocity links.
2. Keep FIX held and turn FRQ to the right: its box counts up and FRQ itself does not move. Play soft and hard hits: harder ones open the filter.
3. Press AMP, hold SAMPLER and turn DEC: pad pressure now lengthens the decay.
4. Hold FIX and press FRQ's knob: the link goes back to 0, and its slot is free for another parameter.
5. Press FLTR, hold LFO and turn FRQ: the LFO now moves the filter. Keep turning to set the depth, then let go and tap LFO: the LFO page shows DST FRQ.
6. Press SCENE, BD's pad and SCENE again: scene 1 is active. Hold SCENE and turn SWT: SWT becomes a lock in scene 1, shown as a box with the scene's other locks, and the page stays.

## Changes to stock flows

- **FIX's toggle moves to the release.** What changes: on the pages and pad screens of a sound track, a FIX press is held back until the release, so a hold with a turn, or of about half a second or more, leaves fixed velocity as it was (holding just to look at the amounts). Why: the press cannot know whether a turn follows; stock toggles at the press. What you see: the FIX state changes when you let go. Elsewhere, and with FUNC held, FIX is stock's. Checked: a tap, two taps, a hold with a turn, FUNC + FIX, in rytm-emu; the half-second look's cutoff on LFO and SAMPLER, which take the same check (FIX's toggle shows nothing on the screen).
- **SAMPLER held with a turn does not open the recorder.** Stock opens it on SAMPLER's release, also after a knob turn; with this mod a turn during the hold makes it an assignment instead, and a hold of about half a second or more with no turn is a look at the amounts: neither opens the recorder. A tap opens the recorder as before, and on the FX track SAMPLER is stock's. Checked in rytm-emu.
- **FIX or SAMPLER held changes what a knob turn does.** What changes: on a sound page, a turn sets a mod slot instead of the parameter, drawn as a performance lock. Why: that is the mod. Stock does nothing special with FIX or SAMPLER held and a knob turned (checked in rytm-emu: the knob edits as normal). It applies while the key is held only.
- **During a hold, some knobs do nothing.** What changes: with FIX or SAMPLER held, the TRIG page's knobs, a knob turned with a trig held, and FUNC + a knob no longer edit (stock's lock edit, which the hold switches on, refuses TRIG parameters, and the mod refuses a link with a trig held so none is made by accident). Why: the hold is for links; a trig edit or a fine FUNC edit can wait until the key is let go. What you see: the knob does not move. Considered: passing these turns to stock, which stock's lock edit does not allow without a patch of its own. Checked in rytm-emu: TRIG page, a trig held, both key orders.
- **LFO's page opens on the release.** What changes: on the other pages and pad screens of a sound or the FX track, an LFO press is held back until the release; a tap then plays the press and the release to stock and to every other mod, so the LFO page opens as before, a little later. A hold with a turn, or of about half a second or more (a look at the amounts, also when a page key is pressed during it), leaves the page where it is. On the LFO page itself the key stays stock's, in any pad mode too. Why: as for FIX, the press cannot know whether a turn follows. Checked: on the author's unit by the test rig (plain taps from the FILTER, LFO and SAMPLE pages give stock's screens, and Loop Sync sees the page change), and in rytm-emu with LFO RND's page behind LFO.
- **LFO held changes what a knob turn does.** What changes: a turn sets the LFO's destination and depth instead of the parameter. Stock does nothing special with LFO held: its press has already opened the LFO page. It applies while the key is held only.
- **SCENE's scene edit opens on the release.** What changes: on the pages and the PERF, SCNE, MUTE and CHRO screens, SCENE's key repeats are held back while it is held, so a hold opens scene edit when SCENE is let go, not about 0.2 s into the hold. A tap still toggles scene mode; FUNC + SCENE (PATTERN), YES or NO + SCENE (quick save, reload) and SCENE in scene or performance edit are stock's. Why: the module must wait to see whether a knob follows, and a hand needs longer than 0.2 s to reach one. What you see: scene edit appears as you let go.
- **SCENE held with a knob changes what a knob does.** What changes: a turn makes a scene lock (in the active scene, or with none engaged the scene engaged last) instead of moving the parameter, in LIVE RECORDING too (no p-lock is recorded), and the TRIG page's knobs do nothing; a trig held makes its p-lock as on stock. Stock does nothing special with SCENE held and a knob turned before scene edit opens: the knob edits as normal. The first knob event ends SCENE's hold as stock does when its scene edit opens, so SCENE's release does nothing, and any other key held at that moment loses its clean release (a CHRO pad's release, say). On a module voice's type knob, the base's tap still steps the type when it is pressed with SCENE held.
- **SCENE held makes a scene-mode pad pick its track.** What changes: in scene mode, a pad pressed while SCENE is held selects its track (with AUTO TRK SWITCH on; with it off, nothing) and does not engage or disengage its scene, and a pad during any SCENE hold keeps scene edit from opening on the release. Why: a hold is for setting up locks on several tracks without leaving the page. Stock opens scene edit 0.2 s into the hold, so a pad there picks the edited scene; here scene edit is not open yet. What you see: the pad's track's page, the scene unchanged. A tap of a pad without SCENE held is stock's.
- **The other key does nothing during a hold.** What changes: FIX pressed during a SAMPLER hold does not toggle fixed velocity, and SAMPLER pressed during a FIX hold does not open the recorder. The same holds between SCENE and FIX, SAMPLER or LFO: with one held the others do nothing (SCENE does not toggle scene mode or open scene edit). Why: a key brushed mid-assignment should not change the sound or leave the page. Checked in rytm-emu.

## Compatibility and limitations

- OS 1.74 only, with core-ar2 0.7. No other module is needed.
- The LFO's DST and DEP are the sound's own (the FX track's on the FX track), written through stock's own writers, so they save with the kit and play on a unit without the mod. A tap's replay goes through the core's `core_key`, so every key mod sees it.
- After a knob press in an LFO hold, the other knobs do nothing until LFO is let go.
- A turn that reaches the LFO hold through stock's locker interface without a Rytm encoder event (MIDI through a module that uses stock's locker, for one) sets the depth by the change in the value it passes (one value step moves DEP by 1.00); from 0.3.0. Earlier, only the Rytm's encoder set the depth there.
- SCENE + knob writes through stock's own scene locker routines on an object of the module's own, so the lock is stock's: absolute, among the kit's 48 scene locks, saved with the kit, and shown in scene edit as usual. It never takes a scene pad's own locker.
- It patches no stock site. It sets its own locker in stock's parameter UI while a key is held, as QPER Live Rec does with QPER, and adds a `core_params` entry for every parameter id with only a turn function (order 5) for a turn that reaches stock's parameter edit. It subscribes to `ev_key`, `ev_enc`, `ev_tick` and `ev_draw` (the LFO depth's box, in stock's label font). No storage.
- A performance or scene pad, or a trig, that holds stock's locker when FIX or SAMPLER goes down or during the hold keeps it; the mod shows its amounts again within a tick of it letting go.
- Stock's LFO DST knob opens its list rather than turning, so FIX + DST does nothing.
- On a unit, 0.2.0: the package's own image beside LFO RND (QP02, flashed) passed the author's hand checks, kit save and power cycle included, and the test rig's six cases passed in QL13 (with Loop Sync): see [TESTING.md](TESTING.md).
- On a unit, by the author's report: QM06 (FIX + knob, the FIX key, save and power cycle) RC18's QM10 (SAMPLER aftertouch links, the lock-style display, envelopes following, mods full, kit save and reload, power cycle) RC19's QM11 and QM12 alone (the FX track, and the checks above again) pass: see [TESTING.md](TESTING.md).

## Tests and measurements

rytm-emu on OS 1.74 ([TESTING.md](TESTING.md)), the author's unit on combined images with builds QM10 and QM11 and on QM12 alone, and for 0.2.0 the test rig and the author's hand checks on the author's unit (QL02 to QL13). Memory (0.2.0 package): 7,578 bytes of code and initialised data and 72 bytes of `.bss` in the 128 KiB shared mod area. Load: UI only, on key events and knob turns; nothing runs in the audio path.

## Authorship and licences

Original code by Nathaniel Pavel (@npp1993), GPL-3.0-or-later ([LICENSE](LICENSE)). The OS 1.74 addresses were read by the author from their own stock firmware; the build carries addresses only, no stock bytes. No Elektron firmware is included.

## Screens and audio

Screenshots are rytm-emu captures of build QM40 ([media/capture.json](media/capture.json)). No audio preview yet.

![FILTER page with FIX held: FRQ +19 and RES 0](media/fix-filter.png) ![AMP page with SAMPLER held: DEC +11](media/sampler-amp.png)

![VELOCITY MODS FULL](media/mods-full.png) ![Stock's MODULATION SETUP showing the link](media/mod-setup.png)

![FILTER page with LFO held: FRQ is the LFO's destination at depth +46.96](media/lfo-filter.png) ![The LFO page after the hold: DST FRQ](media/lfo-page.png)

![SYNTH page with SCENE held: SWT locked in scene 1 at 106, the scene's other locks boxed](media/scene-lock.png)
