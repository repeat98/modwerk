"""SYNTH MACHINE -- phases 2+3: a FLEX track whose sample is named SYNTH* plays a
two-operator FM voice instead of the sample. The ColdFire generates the
track's SOURCE sample data every frame, at the track's final pitch, and the
DSP does the rest exactly as for a sample -- RATE, the AMP envelope, filter,
FX1/FX2, level, pan, mute, cue -- while PTCH (with locks, LFOs, scenes,
chromatic keys, the quantizer) is folded into the voice's own phase
increments with the stock renderer's rate arithmetic. Nothing changes for a
track whose sample is not named SYNTH*.

THE VOICE: carrier = sin(phi_c + INDEX * sin(phi_m + FEEDBACK * m_prev)),
phi_m at RATIO times the pitch. The FLEX PLAYBACK page's other slots are its
parameters, read per frame from the DSP parameter record (halfwords, raw <<
8): STRT = RATIO (32-step table 0.25..16), LEN = INDEX (0..8 rad), RTRG =
FEEDBACK (0..0.25 cycle), RTIM = DECAY of the index toward 1/16 (time
constant 2 s * (raw/127)^2; 127 = hold, 0 = the shortest). Phase 3
relabels the slots.

WHERE IT HOOKS. The per-frame record packer (0x4000d3fc) renders each track's
audio through a per-track renderer pointer copied from the kind table
0x400d6434 (kind = machine type; 0 STATIC, 1 FLEX, 2 THRU, 3 NEIGHBOR,
4 PICKUP, 5-7 silent). The FLEX entry 0x400d6438 (stock: the sample renderer
0x40004008) -- and since OCTATRICK2.8 the STATIC entry 0x400d6434 (the same
stock renderer) -- is repointed to sy_render, which, on a sample track with
LEG MONO and GLIDE, slides the record's PTCH word toward its target before
the stock call (poly.s sy_sample; a sample START snaps), and, for a synth track,
writes PTCH := 0 semitones and RATE := 1.0 into the record around the stock
call (so the voice lifecycle, streaming, positions and the record's headers
stay stock's, at 16 source samples a frame), restores them, clears the retrig
count the packer latched at a voice start (RTRG is FEEDBACK, not a retrig),
and overwrites the source pairs the stock renderer shipped. One 4-byte poke,
no displaced instructions.

THE MARKER. The voice struct (0x800049d8 + 0xa8 * track) holds the slot's
settings record at +8 (0x100b14f0 + 0x448 * slot, its path string at +0);
on the frame a voice starts (bit 4 of 0x46104d0c + track, the packer's
event byte) the file name after the last '/' is compared with "SYNTH" and
the result cached per track. Any WAV named SYNTH*.wav in any FLEX slot is
the machine; sample locks choose it per step. A stock unit plays the file
itself (the shipped SYNTH.wav is silence).

THE PAGE (phase 3). The page-descriptor resolver 0x40031da4 is detoured at
its PLAYBACK-page table load (0x40031ece): for a track whose assigned FLEX
slot's sample is named SYNTH* -- by the settings record's path, loaded into
flex RAM or not -- it returns a clone of the FLEX descriptor whose slots read
PTCH RATO INDX FINE FDBK DEC, whose title makes the footer read FM SYNTH>FLEX,
whose formatters print the ratio table's value, 0..127 and ms/s/HOLD, and
whose widgets draw the M->C operator diagram, a sideband spectrum, the
modulator with its feedback loop and the index envelope over the stock dial.
THE TUNING SYSTEM (27 Sep 2026): on a synth track PTCH is semitones, raw 64
= 0, one unit a semitone, -64..+63 (the clone's range 0..127, a signed whole
number on the page, the plain one-a-detent knob handler), and RATE is FINE,
-64..+63 cents (raw 64 = 0, printed "+12c", default 64); the engine (poly.s
sy_word) reads both so and folds any pitch into the stock curve by octaves.
The quantizer module follows the same units on synth tracks (its PTCH knob,
p-lock and CHROMATIC key hooks; the CHROMATIC octave runs -4..+4 there).
Sample tracks are untouched.
The clone is built AT RUNTIME, on first use, by the DRAM unit (poly.s
po_pgdesc: the stock record copied out of the image into the unit's RAM,
then the fields page.s lists -- title, the four names, four formatter and
four widget pointers, the enable nibbles -- written over the copy; the stock
record is never touched, a non-synth track gets it as before, and the flag
and buffer are zero after every boot). The pinned page cave (page.s,
0x400d24d0) holds the resolver stub, the override list, the formatters, the
widgets and the icon data, and reaches the builder through the long
published before sy_render (whose address the kind table's FLEX entry
holds) -- so no stock bytes are in the repository (26 Sep 2026; until then
page.s carried a patched copy of the 402-byte stock record). Ranges,
defaults and knob handlers are the stock record's; every other page and
every non-synth track draws as stock.

THE ENGINE IN DRAM, AND PARAPHONIC CHORDS (phase 5, 24 Sep 2026). The
voice engine is a DRAM unit now, modules/synth/poly.s (`Linked(dram=True)`:
linked into the platform runtime at the arena reserve's base, appended
behind the loader, depacked at boot; the unit gives up 10 MB of sample
memory); the kind table's FLEX entry is pointed at its sy_render by a
SymbolRef (octabam's 4-byte stock pointer rewritten to a symbol; the fork
had added a Detour of kind "ptr" for the same job). On a synth track the LFO page is always a clone
(built from the stock record on first use, a detour at the page resolver's
LFO-descriptor load) whose slot 2 is VOIC (1..4, default 1; SPD3's byte, a
stock or out-of-range byte reads 1) and slot 5 CHRD (the chord shape, "----"
while VOIC is 1); LFO 3 is muted on a synth track (two detours at the LFO
engine's depth read -- the routine and its copy inlined in the frame
builder; its default PMTR is PTCH). VOIC is the switch: 1 = the mono synth
of phase 4, bit for bit (GLIDE legato, the stock lifecycle); 2..4 = that
many voices playing the chord shape at every trig or live key, per-voice
release from the AMP REL byte, per-voice glide, live keys held together
(the quantizer's key hooks feed the engine through a pinned mailbox), every
chord note snapped onto the quantizer's SCALE (its mask through the pinned
trampoline SCALE_AT).

CLICKS AND CRACKLE (28 Sep 2026, poly.s po_fill / po_st_note / po_fade): the
peak limiter's gain and every paraphonic voice's gain ramp linearly across
the 16-sample frame from last frame's value to this frame's (the per-frame
steps were a click at each of the 8 attack frames and a beat-rate crackle
while a chord was held: Tim's MKI, 2.3 .. 2.9); a silent voice starts both
operators at phase 0 with a 16-frame (5.8 ms) attack ramp; a retriggered,
stolen or chord-memory-cut voice is phase-continuous and fades over one
frame instead of being cut. The level law is unchanged (T_GMAX = 32768 /
sqrt(VOIC), chords held at the mono voice's peak). README "Clicks and crackle".
The mono voice (VOIC 1; poly.s sy_render's marker block, sy_mono / sy_loop)
got the same treatment in the next commit: its gain ramps linearly per sample
across each render call (S_GPREV -> S_GAIN, one divs.l a call, a 16 x 16
multiply on gain / 2 -- bit for bit the old output at full gain), a 16-frame
attack (RAMP_STEP 2048), both operators at phase 0 from silence, phase-
the safety-net cut a one-frame fade. OCTATRIK11's pop on every note.
BUILD 25: T_MLEG (MIDI IN's legato flag, po_mon / po_mrec) moved +126 -> +37 --
it aliased S_LASTF's word (the warm rule's frame stamp).
BUILD 26: EVERY START IS COLD -- the warm rule (S_GPREV != 0 and S_LASTF within a
frame: keep the phases and the gain) and S_LASTF are gone; every START clears
S_PHC / S_PHM / S_LASTM / S_GAIN / S_GPREV, both operators at phase 0 and the
gain ramps from 0 over 16 frames. The DSP's AMP envelope restarts at full on the
start frame's first sample at EVERY start, so a warm start after the envelope had
released the note (a re-press, REL 20) exposed the CF's full continuous gain as a
bare step (x22 .. x25 the steady slope) and the CF cannot see that envelope (no
release event covers every path: a sequencer HOLD ends inside the DSP). A phase
reset at gain 0 is inaudible; a retrigger while sounding gets a short dip (the
normal retrigger character); LEG MONO hand-overs never START. The paraphonic
voices keep their warm rule (phase kept, gain ramped from where it is: clean).
PLAN B (28 Sep 2026, BUILD 31): THE ENGINE OWNS THE AMP ENVELOPE. On a synth
track the DSP is presented with an always-open envelope -- sy_render writes the
DSP voice record's halfwords 0/1/2 (0x80000110 + (ping << 9) + 64 t: ATK / HOLD /
REL) := 0 / 0x7f00 / 0x7f00 every synth call, after the copier, the scene morph
and the LFO stage and before the DMA, the live lane the UI shows untouched (the
shape of the PTCH / RATE override) -- and applies ATK / HOLD / REL from the live
lane itself (locks, scenes, LFOs included) with the DSP's laws as measured in
stage 1: ATK a linear ramp to full in 3.85 ms x 2^(v/8.53) (the 16-frame ramp
the floor), HOLD the DSP's timer from the START (po_hold128 steps x frames a
step; 127 = INF) for live keys and trigs alike, ending the note by itself, REL
exponential with tau = 0.295 ms x 2^(v/8.53) floored at 1 ms (a ~2 ms minimum
fade even at REL 0; 127 = INF). THE START RULE replaces BUILD 27/28's four
conditions: a voice that still sounds (S_GPREV / V_GPREV != 0) continues the
SAME oscillator phase-continuously from its current level (the attack re-runs
from there); a silent one starts at phase 0 from 0. Note ends: every note-off
path (po_rel), the HOLD timer, MIDI note-off, the key mask, the sequencer trig,
and STOP (BUILD 31's po_stop, a detour at the frame builder's consumption of
0x46c80350 taken for the sequencer's STOP word; that word is the metronome's
click, and 2.12 removes po_stop -- see BUILD 33 and 2.12 below). Voice
stealing and chord-memory cuts fade over 8 frames (2.9 ms, state 3). The
per-frame peak limiter is REMOVED: the sum is clamped (saturated) only; the
level law 1/sqrt(VOIC) is unchanged. README "The engine owns the envelope".
BUILD 32 (round 2): a START across a VOIC change never cuts the sounding tone
(VOIC 1 -> 2..4: po_carry moves the mono voice into a fading paraphonic voice;
2..4 -> 1: the voices fade over 8 frames under the mono voice, po_fade_frame /
po_fill_add); STOP ends every voice (S_ON bit 2: REL INF takes the 1 ms floor,
so the level reaches 0 and the next START is cold); T_AK moved off T_POS.
BUILD 37 (29 Sep 2026): SEQUENCER TRIGS ON A STILL-SOUNDING NOTE NO LONGER BUMP.
The frame builder's sequencer path posts a trig on a sounding track to the DSP as
the command byte 0x10 | n (the CF START bit with the trig's sub-frame position n;
0x46104d15[t], copied into the packer's nibble byte at 0x4000c642); the DSP
crossfades its old voice under the new one for ~26 samples, and since both are
the engine's one continuous stream (the warm START rule) the sum is a +5.6 dB /
1.8 ms bump at every trig (BUILD 33's take a: per-frame amplitude 1.85 1.58 1.32
1.13). The panel key's START reaches the DSP as 0x30 (bits 4 and 5, nibble 0)
and is clean. po_retrig, a detour at the copy (0x4000c634), rewrites every START
byte on a synth track whose engine voice is on (S_ON) to that clean form; the
trig lands a frame boundary early (at most 0.34 ms). Measured (BUILD 37's log,
a trig on every step at 120 BPM, VOIC 1 C4, ATK 0 HOLD INF REL 60 INDX 0): max
|step| / the tone's slope x1.01, max |d2| 9, per-frame amplitude 1.00 on every
frame of every trig, the fix fired on every trig (po_rtlog: 39 rewrites, the
bytes 0x14 0x1c 0x15 0x1d ... -> 0x30). po_rtlog (po_clock + 32) stays: 272 B
of counters and a ring, cheap and peekable.

BUILD 38 (29 Sep 2026): A WARM START RAMPS THE INDEX ENVELOPE. With a non-zero
INDX the START rule's instant restart of the FM index envelope (S_ENV / V_ENV :=
ENV_ONE while the carrier continued) was a hard step at every sequencer trig on a
sounding note (BUILD 37 take b: x7.45 the tone's slope, |d2| 4961, 2008 -> 4786
in one sample, the centroid 322 -> 498 Hz in a frame). Now sy_cold / po_st_note
arm a 16-frame ramp (S_ERAMP +81 / V_ERAMP +62): the envelope climbs linearly
from its current value to ENV_ONE in 5.8 ms (sy_env_ramp / po_fr_envk: the
remaining distance over the remaining frames), then the DEC decay runs from the
peak as before; a cold START (a silent voice) keeps the instant restart. And the
per-sample multiplier I * E is interpolated across every frame: S_IEFF / V_IEFF
are the running value, sy_loop / po_fi_loop step them by S_ISTEP (+126, the
word S_HOLD / S_KEYED held) / V_ISTEP (+38), (target - running) / 16, once a
frame -- no frame-edge step for the ramp, the decay or a knob. V_GPREV is a word
at +60. Measured (BUILD 38's log, take b: HOLD INF REL 60 INDX 40 DEC 40,
a trig every step): max |step| / the tone's slope x1.07, max |d2| 88 against
the take's own 99.9th pct 108, the centroid moving over ~8 ms.

BUILD 33 (round 3): STOP ENDS THE ENGINE'S VOICES AT THE STOCK VOICE KILL. Round 2
measured (an independent rerun's STOP log) that po_stop's site 0x4000b2c8 never runs
on the rig for any STOP form -- the global word's writers (0x4009bbb8 / 0x4009c3a0
/ 0x400a4d8c) sit behind [0x80000060] and the pattern-state bytes 0x80006511/12,
and the frame builder's consumer behind two more gates -- so a REL INF tone kept
sounding 1.1 .. 1.6 s past STOP until the stock voice ended, S_GPREV stayed at
full, and the next START after a STOP was warm at full into a re-opened DSP
voice: a click. What every UI path uses to end a stock voice HARD is the VOICE
KILL 0x40006820(t; t >= 8 = all tracks, recursing per track): the sequencer's
STOP / pattern change 0x40043c50, the sample preview stop 0x40093ec0 /
0x40096ad4, the loaders 0x4007eb3e / 0x4008044e / 0x4000f518, the frame
builder's own 0x4000d45a. po_kill is a detour at its CF voice-byte clear
0x4000685c (interrupts masked, d1 = the track): the killed track's engine
record ends at that instant -- S_GAIN / S_GPREV / S_HTIM / S_ON := 0, the four
paraphonic voices freed with V_KEY / V_HOLD 0 -- so nothing of ours sounds
after the kill and the next START is cold. po_stop stayed as belt-and-braces (a
killed track has S_ON 0: it does nothing there) -- until 2.12.
2.12 (10 Oct 2026): A HELD NOTE OR CHORD IS NO LONGER RELEASED AT EVERY METRONOME
CLICK. The global word 0x46c80350 is the METRONOME's: while the sequencer plays,
the beat code writes 3 (the bar's first beat) or 1 (the other beats), every writer
behind METRONOME_ENABLED (0x80000060 -- the gate BUILD 33 saw closed on the rig),
and the frame builder turns it into the DSP-wide click command 0x46104d14 and
clears it at 0x4000b2c8. po_stop, hooked at that clear, therefore ran at every
click and nowhere else: every synth track's mono voice took the released flag and
STOPPED (REL INF: cut within 5 ms), every sounding paraphonic voice released, while
the keys were still held. The detour and po_stop are removed; 0x4000b2c8 is
stock; STOP stays po_kill's (above).
History, BUILD 27: WARM ONLY WHEN THE DSP IS PROVABLY SUSTAINING AT FULL -- BUILD 26's
cold start made a new key while the old note still sounds (LEG OFF, HOLD INF) a
hard cut at the frame edge (a -12 dB 5 ms click). sy_cold keeps the phases and
the gain (the pitch changes, no ramp) only when (a) the HOLD the lane held at the
sounding note's START was INF (S_HOLD, +126, stored at every START, locks
applied), (b) no release reached the frame builder since (S_ON bit 1: po_rel, a
detour at the builder's mailbox-0x40 consumer 0x4000b51a, one site for the panel
release, the MIDI note-off and the sequencer; not set when the same word carries
the START, bit 2 -- the panel's key-while-held), (c) S_GPREV != 0; else cold.
BUILD 28: (d) THE START IS A LIVE KEY'S OR A MIDI NOTE'S -- a sequencer trig
STARTs the mono voice with no note-off anywhere (at HOLD INF the flag is never
set), and the DSP restarts something at each trig the CF cannot see: warm there
layered (+5.75 dB over the mono voice, a bare step a trig, BUILD 27 measured).
sy_cold reads qz_pkey[t] (KEYS_AT, the identity the quantizer posts for a
CHROMATIC key, index + 1, and po_mon for a MIDI note, 0x80 | note; 0 for a
sequencer trig -- what po_start takes as d7) before the mono path clears it,
stores it at S_KEYED (+127, the record's last byte, peekable) and the START is
warm only when it is nonzero as well; a sequencer START is always cold.
Also BUILD 26: the ramp's step a sample is (target - previous) / 16, the FRAME's
slope, and S_GPREV takes the gain the ramp reached -- a sequencer trig splits
every frame at its sub-frame offset, so dividing by the call's samples put the
frame's whole step into the short second call (a stair on every sequencer note,
103/s; BUILD 25's warm rule made those notes a bare step each, x14 .. x24).
Measured BUILD 26: onset x0.99, re-press 50 / 200 / 600 ms x1.07 / x1.02 / x1.07,
16th trigs HOLD 6 max |d2| 24 (was 4769), the retrigger while sounding a cut to
0 then the 16-frame attack (the cost, -15 dB for 6 ms); README.

MIDI IN (30 Sep 2026, poly.s "MIDI IN"): MIDI notes into a synth track
behave like the panel keys. The STANDARD note map's chromatic block
(0x4000e6e2; AUDIO NOTE IN = STANDARD, or FOLLOW TM in the TRACKS trig
mode) posted a voice command and a PTCH lock byte per listening track with
no identity: the engine took every note as a sequencer trig. Five detours,
synth tracks only, sample tracks byte for byte stock: the voice command
0x4000e746 (po_mon: raw = note - 20, semitones, 84 = 0, 20..127 = -64..+43,
0..19 clamp, stored as the lock byte before the START; the note joins the track's held-note list, its (identity 0x80
| note, raw) is queued for the engine's START, which starts one voice per
queued note-on at its own pitch with the engine's key rules -- "----": one
voice a note, VOIC the polyphony, a repeated note-on absorbed; a shape:
chord memory), the note-off's compare 0x4000dfd4 and its octave switch 0x4000de10 (po_moff, po_mogate: the note leaves
the list; a paraphonic track releases that note's voice alone and only the
last note's release posts the stock AMP release), the octave switch
0x4000e452 (po_mgate: a note outside 72..96 whose channel addresses a
synth track goes to the chromatic block for the channel's synth tracks
alone; the STANDARD functions of 24..71 do not run for such a channel),
the 0x41 event's live recorder 0x400625e0 (po_mrec: the note goes through
po_keyrec as a key of its own -- fingered chords from a MIDI keyboard are
recognised and locked as PTCH / CHRD / VOIC on the first note's step; a
single note records its trig and a PTCH lock in semitones) and its
trig-held branch 0x4006262a (po_mtrig: the held trig's PTCH lock in
semitones). Velocity is ignored (stock keeps none for audio tracks), MIDI
note OUT and the panel keys are untouched; FOLLOW TM with the CHROMATIC
trig mode is the key handler's own path (key = note - 72, 25 keys) and is
unchanged.

TRANSPOSING A HELD STEP (4 Oct 2026). FUNC + UP / DOWN with a [TRIG] key
held for locking on a synth track in GRID RECORDING (any trig mode: the
keys edit steps whatever the mode there) moves every held step's PTCH lock
an octave (12 semitones) up or down, clamped -64..+63, a step without a
lock starting from the Part's PTCH; one detour at the trig-mode selector's
window test 0x40051fce (po_octave), which stores as the lock editor does
and redraws the page. No trig held, a sample track, GRID RECORDING off:
the selector, byte for byte.

FINE DEFAULTS TO 0c (28 Sep 2026, poly.s po_assign / po_machwin /
po_machlist). FINE is the stock RATE byte, whose default is 127 (+63c), so a
fresh synth track read +63c until the user turned it down (Tim's report).
Three 8-byte jmp detours at the stock sites that make a track a FLEX track
of a slot -- the slot assigner's slot-byte write 0x400795ba (both the
machine window and the sample-list window call the assigner 0x40079424
when the slot differs) and the two windows' machine-only writes 0x40079816
/ 0x4005a848 (the slot equal, the machine changed) -- reset RATE := 64 in
the Part's FLEX PLAYBACK bytes, their battery-RAM shadow and the live lane
when the track IS a synth track after the write (FLEX, the FLEX slot's
sample named FMSYNTH* / SYNTH*) and WAS NOT one before it (the machine not
FLEX, or the slot not a marker). A synth track already keeps its FINE
(re-assignments, project load, Part reload, pattern change, warm boot: no
site runs), a sample track is never written, RATE p-locks are untouched.
THE NEW-PROJECT CASE (BUILD 22, poly.s po_loadsel): Tim's MKI still read
+63c on the FIRST FM machine of a project -- in a fresh project every track
already owns its slot in both columns (T1 = slot 1 .. T8 = slot 8, every slot
empty; the port boots them STATIC), the first marker is loaded INTO the
track's own slot, and neither the machine nor the
slot byte changes (the assigner takes its same-slot exit; the sample-list
window's LOAD FILE never touches the Part): none of the three sites runs.
The fourth site is the file browser's select 0x40022610, whose `jsr
0x40013a08` (sprintf) writes the chosen path into the slot's settings record
-- `jsr po_loadsel` reads the slot's marker state before and after the
write and, when it went non-marker -> marker, resets FINE on every FLEX
track whose FLEX slot is that slot. A marker over a marker, a sample over a
marker, a STATIC slot, a recorder buffer: untouched.

A MACHINE CHANGE RESETS THE TRACK TO THE NEW MACHINE'S INIT (2.12, machine.s
ml_reset). To or from FM SYNTH / SY DRUM -- through the lists (fm_choose), the
slot assigner (po_assign -> ml_became) or the file browser (po_loadsel) -- the
track's PLAYBACK and SETUP, AMP and AMP SETUP, LFO page and LFO SETUP take the
new machine's init (a stock machine's: the stock page descriptors' defaults, as
the stock Part initialiser writes them); step and scene locks are kept, as in
the stock firmware (SY DRUM's lock rows too); FX1 / FX2 stay. The browser's select unloads the slot (0x40025288 clears its
settings record) before the path write -- twice: the browser's load callback
0x400226f4 unloads it, then calls the select, which unloads it again -- so the
file the slot had is read at the callback's call: one more jsr detour,
0x40022732 -> po_unload.

FM SYNTH IN THE MACHINE LIST (2.10, 8 Oct 2026, machine.s; adapted from
Modwerk's FM Synth module, MIT, Modwerk contributors). FM SYNTH is the sixth
row of SELECT MACHINE TYPE (the track key twice, then LEFT) and of SRC SETUP
(FUNC + SRC). Choosing it stores the track as FLEX with "F", "M", 1 in the
first three bytes of its NEIGHBOR PLAYBACK column (the bank blob + part *
6322 + 0x8edbc + 30 * track, and the battery-RAM shadow): no marker file, no
sample. Fourteen detours (the machine window's commit shares MACHWIN_HOOK),
six pokes (the lists' bound 5 -> 6) and one SymbolRef (the kind table's FLEX
START callback -> po_fmstart: the voice starts without a sample; the frame
builder's second supplier call -> po_fmsource: its source is sy_render). The
page cave gained fm_descriptor (pg_resolve moved to +16) and the signature
test; the quantizer's qz_is_synth tests the signature too. The marker files
still select the engine.

THE MACHINE LIST FOR MORE THAN ONE MACHINE (2.11, machine.s): the rows after
PICKUP are a table (ml_rows) assembled per remix -- FM SYNTH always, SY DRUM
(sy-drum/) when the remix carries it -- and the six pokes became six detours
that take the remix's row count (6 with FM SYNTH alone, 7 with SY DRUM), so
a second machine module adds a row without a site of its own. The units
include a per-remix remix.inc (remix_include below): HAVE_SYDRUM and the
equates shared with SY DRUM (engine_abi.inc); with HAVE_SYDRUM 0 the engine
(poly.s) is byte for byte 2.10's. ANALOG BD is a declared conflict (it owns
the same chooser sites).

Verified in ot_emu through the virtual panel and the pipe (README);
flashed as OCTATRICK9 on an MKI, 26 Sep 2026 (emulator-verified since).
"""

import os

from remix.stock_guard import stock_guard
from remix.schema import Detour, Kind, Linked, Module, SymbolRef

# This module's own directory, relative to the build's cwd (octabam's repo
# root): "modules/synth" when the module is checked out directly, and
# "modules/synth/upstream/synth" when it is octabam's submodule of
# timhastie/octatrick-modules. Every source path below is built from it,
# so one manifest serves both layouts.
_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__)))


def engine_abi():
    """synth/engine_abi.inc: the equates SYNTH MACHINE's units share with the machine
    modules that run on its engine (sy-drum). Read from disk, so one file is the truth."""
    with open(os.path.join(os.path.dirname(os.path.realpath(__file__)), "engine_abi.inc"),
              encoding="utf-8") as source:
        return source.read()


def remix_include(modules):
    """The `remix.inc` each unit of this module includes (octabam's Linked.include, written
    per remix): HAVE_SYDRUM -- 1 when SY DRUM (sy-drum/) is in the remix: its machine-list row
    and the engine's calls into its unit are assembled; 0 assembles nothing of it, byte for
    byte the 2.10 engine (poly.s) -- then the shared equates."""
    return f".set HAVE_SYDRUM, {int('SY DRUM' in modules)}\n" + engine_abi()

# The kind table: kind -> renderer, 8 longs at 0x400d6434 (0 STATIC, 1 FLEX,
# 2 THRU, 3 NEIGHBOR, 4 PICKUP). STATIC and FLEX share the stock sample
# renderer 0x40004008; both entries point at sy_render since OCTATRICK2.8
# (the STATIC one for the pitch slides of poly.s sy_sample; no marker scan
# on a STATIC track, whose voice is always a sample). PICKUP keeps stock's.
KIND_TABLE_STATIC = 0x400d6434
KIND_TABLE_FLEX = 0x400d6438
STOCK_RENDERER = 0x40004008
# Phase 5 (24 Sep 2026, poly.s): the LFO engine's depth read `mvsw %a2@(0x12,
# %d2:l:2),%d0; lea %a0@(0,%d4:l:2),%a1` (LFO 3 is muted on a synth track)
# and the page resolver's LFO-descriptor load `movel #0x400d37f6,%d0; bras
# 0x40031ed6` (the VOIC/CHRD page for a synth track).
LFO_DEPTH_HOOK = 0x40003ca4              # the routine 0x40003b90
LFO_DEPTH_HOOK2 = 0x4000d03e             # its copy inlined in the frame builder (0x4000cf40..)
LFO_DEPTH_STOCK = stock_guard(0x40003ca4, 8, "affe75cc6a50fffd392b3e1045e18d0fbf846ff2f30fe75be1e445e634f96cf9")
LFO_PAGE_HOOK = 0x40031e62
LFO_PAGE_STOCK = stock_guard(0x40031e62, 8, "e959e9faafc44ea9c6bfdd092ecc23526495873cc4bb235455ee04d45d4c7c4b")
# MIDI IN (30 Sep 2026, poly.s "MIDI IN"): the STANDARD map's chromatic block
# and the note-off, the octave switch of the audio-track note-on, and the 0x41
# event handler's live recorder (docs/firmware/MIDI.md appendix B).
MIDI_MAP_HOOK = 0x4000e746               # `moveq #29,%d1; movel %d1,%a5@(0,%d2:l:4)`: the START, posted before the lock byte
MIDI_MAP_STOCK = stock_guard(0x4000e746, 6, "c1891b97a86df058cd89d4808e381ecdcf3303e96b08c5e0fd525ea46ffe4d69")
MIDI_OFF_HOOK = 0x4000dfd4               # `mvsb %a0@,%d1; mvsb %a3@,%d0; cmpl %d1,%d0; bnes 0x4000dff8`
MIDI_OFF_STOCK = stock_guard(0x4000dfd4, 8, "85d5478797bd0d879fe58aa4de88956a8f8fbacdd65ac8faa8a28da95e9c14f4")
MIDI_GATE_HOOK = 0x4000e452              # `movel %d6,%d0; subql #2,%d0; moveq #5,%d2; cmpl %d0,%d2`
MIDI_GATE_STOCK = stock_guard(0x4000e452, 8, "1e3f89d63562977cf6928c72536e014118c40df97d7f5f3d80c78b10ed4c0448")
RETRIG_HOOK = 0x4000c634                 # the frame builder's per-track copy of the DSP command byte 0x46104d15[t] into the packer's nibble byte 0x46104d0c[t]: `moveal 114(sp),a1; moveb (a0,a1.l),d0` (a0 = 0x46104d15; BUILD 37: po_retrig turns a sequencer START on a sounding synth voice, 0x10 | n, into the key's clean 0x30)
RETRIG_STOCK = stock_guard(0x4000c634, 8, "59609fac3f03905ee63fde6f557553d44e997fc6e02eb6c8aa4c475715ff2662")
KILL_HOOK = 0x4000685c                   # the stock VOICE KILL 0x40006820(t): `clrb %d0; moveb %d0,%a1@(0,%a0:l)`, the CF voice byte 0x800049d8 + 168 t := 0, interrupts masked; d1 = t (BUILD 33: po_kill ends the engine's voices of the track at that instant)
KILL_STOCK = stock_guard(0x4000685c, 6, "98e9488a15bc1e186e25540bc49839ccd37ffcb4a835ab2c26ec17362380b922")
REL_HOOK = 0x4000b51a                    # `moveal %sp@(114),%a3; movel %a1@(0,%a3:l:4),%d0` (the frame builder's AMP-release consumer, mailbox bit 6: every note-off path)
REL_STOCK = stock_guard(0x4000b51a, 8, "4aec4ef01824a0bd3e42321ef4c36e0fd1e2003924c72308dfa8bc1db84d38fc")
MIDI_OFFGATE_HOOK = 0x4000de10           # `subql #2,%d0; moveq #5,%d3; cmpl %d0,%d3` (the note-off's octave switch)
MIDI_OFFGATE_STOCK = stock_guard(0x4000de10, 6, "4a1708d81bb2f20ab51c41d28145e52f09c94f248bbdde8e63a7f08524734e89")
MIDI_REC_HOOK = 0x400625e0               # `movel %a2@(4),%d0; movel %d0,0x46c7e956`
MIDI_REC_STOCK = stock_guard(0x400625e0, 10, "5c6bbcd0f1e2dd2ae81a5e24e88e3b98e08a127430e90904a746d7eaaac10004")
MIDI_TRIG_HOOK = 0x4006262a              # `mvsb %a2@(2),%d2; moveal %d2,%a0; lea %a0@(0,%d2:l:4),%a0`
MIDI_TRIG_STOCK = stock_guard(0x4006262a, 10, "77eaafa68e06beb974f9ba8fec19804e7601a2e326dbdf2aa5a6a62341741898")
# LEG (2 Oct 2026): the AMP SETUP window (FUNC + AMP) stages, draws and edits
# the STOCK AMP descriptor by address; five detours hand every audio track the
# clone with LEG in the sixth box (poly.s po_amp_desc: OFF / MONO / POLY on a
# synth track, OFF / MONO on any other audio track since 3 Oct 2026; the
# master track keeps the stock record).
AMP_STAGE_HOOK = 0x40059d56              # `pea 0x400d3988` (the window's staging of page 2)
AMP_STAGE_STOCK = stock_guard(0x40059d56, 6, "6e1b853823706fee366208281c3d01a27c06e219d8ff5e6145b06a450e3e25fa")
AMP_DRAW1_HOOK = 0x4003685a              # `lea 0x400d39c2,%a4; lea 0x400d3a6a,%a3` (the drawer: names, formatters)
AMP_DRAW1_STOCK = stock_guard(0x4003685a, 12, "9d2d6a8b11265cf919a3cf246ebf74e7ff2379d1ce4b15b310edffed55f665fb")
AMP_DRAW2_HOOK = 0x400368ac              # `movel 0x400d3b16,%sp@-; movel 0x400d3b12,%sp@-` (the enable pair, the widget pass)
AMP_DRAW2_STOCK = stock_guard(0x400368ac, 12, "b1ae4e00765b28aecf9f4e1be20a3a2b0ef1def51a5e47acbb01d84804231cbc")
AMP_DRAW3_HOOK = 0x40036946              # the same pair, the name pass
AMP_DRAW3_STOCK = stock_guard(0x40036946, 12, "b1ae4e00765b28aecf9f4e1be20a3a2b0ef1def51a5e47acbb01d84804231cbc")
AMP_EDIT_HOOK = 0x4003ae40               # `addil #0x400d3988,%d0; moveal %d0,%a1; moveal %a1@(298),%a0` (the page-2 editor's handler read)
AMP_EDIT_STOCK = stock_guard(0x4003ae40, 12, "3e401f14e70d67d18fcec37faf084580fd6bfa25426424788fe2828eb89f5c53")
AMP_LANE_HOOK = 0x4003af0a               # `lea 0x8000083c,%a0; moveb %d2,%a0@(0,%d0:l)` (the page-2 editor's live-lane write)
AMP_LANE_STOCK = stock_guard(0x4003af0a, 10, "d248085685bfc02ef8676cdf2e954840efc741ef3957382256f9dbd35c208e65")
# Transposing a held step (4 Oct 2026, poly.s po_octave): the FUNC + UP/DOWN
# handler 0x40051fc4 (the trig-mode selector; both keys' records in the FUNC
# layer's tables 0x400bf628 / 0x400bf2b4 name it) tests its window here.
OCT_HOOK = 0x40051fce                    # `tstl 0x400bebae` (the selector window's handle: closed, a press opens it; open, presses step the mode)
OCT_STOCK = stock_guard(0x40051fce, 6, "48029903d5d445adefcbc67dd2771ecaeac44c1000bfa1743f16f1665ed837ca")
# FINE defaults to 0c when a track becomes a synth track (28 Sep 2026, poly.s
# po_assign / po_machwin / po_machlist): the slot assigner's slot-byte write and
# the two windows' machine-only writes.
ASSIGN_HOOK = 0x400795ba                 # `addal #0x8f04a,%a0; moveb %d1,%a0@` (the assigner 0x40079424: the Part's slot byte of the new machine)
ASSIGN_STOCK = stock_guard(0x400795ba, 8, "246f05f28fccbec27678548be76fabfb68813a155739cc82b928cb08f35dbb52")
MACHWIN_HOOK = 0x40079816                # `addal #0x8eda2,%a0; mvsb %a0@,%d3` (the machine window's apply path 0x400797cc: the machine byte, the slot equal)
MACHWIN_STOCK = stock_guard(0x40079816, 8, "45a9bc540eb5c34d7b8a12fa454a789212fdb4130e252b4e2b9d54f75849b0e3")
LISTWIN_HOOK = 0x4005a848                # `addal #0x8eda2,%a0; mvsb %a0@,%d4` (the sample-list window's apply path 0x4005a826: the same)
LISTWIN_STOCK = stock_guard(0x4005a848, 8, "0e7c7d36b68c48dceaae800ce1f22cbac9a888c121739368ba12458bab9cbe93")
# The new-project case (Tim, MKI: the FIRST FM machine of a project read +63c;
# poly.s po_loadsel): the file browser's select 0x40022610 writes the chosen path
# into the slot's settings record -- the only way a FLEX slot's FILE changes
# under a track that already has that slot (a fresh project: T1 = FLEX slot 1 ..
# T8 = slot 8, every slot empty; the assigner then takes its same-slot exit and
# the sample-list window's LOAD FILE never touches the Part).
LOADSEL_HOOK = 0x40022686                # `jsr 0x40013a08` (sprintf: record, "%s..", path) in the browser's select 0x40022610
LOADSEL_STOCK = stock_guard(0x40022686, 6, "ffcc36e1a4e00547dfdf889bb0fa8d8eccd4ca4166d097f5f79689712cd0cb07")
UNLOAD_HOOK = 0x40022732                 # `jsr 0x40025288` (the slot unload: machine, slot) in the browser's load callback 0x400226f4, before its call of the select
UNLOAD_STOCK = stock_guard(0x40022732, 6, "1828d38aca11808e502a8f12cd4843db42612d2a1317d5ed1225d617cfc5b5e4")

# 2.10 (8 Oct 2026): FM SYNTH IN THE MACHINE LIST (machine.s; after Modwerk's FM Synth
# module, MIT, Modwerk contributors -- its dedicated chooser, Part validation and
# sample-free transport). FM SYNTH is the sixth row of the machine window (FUNC + SRC)
# and of SRC SETUP; a chosen track is stored as FLEX with "FM", 1 in its NEIGHBOR
# PLAYBACK bytes (the Part + 0x8edbc + 30 * track, and the battery-RAM shadow), so it
# needs no marker file and no sample. The marker files still select the engine.
# The machine window's commit shares MACHWIN_HOOK (fm_main_commit, then po_machwin).
FM_NAME_HOOK = 0x400334d8                # `movel %d2,%sp@-; movel %sp@(8),%d1` (the machine-name formatter name(row))
FM_NAME_STOCK = stock_guard(0x400334d8, 6, "d6c9f1f60272197a17511f496fc19dd21ddd7df5f1f1ec0cab7a16cad60b0609")
FM_NAMES_HOOK = 0x4003c928               # `lea 0x400a78c8,%a5` (SRC SETUP's name table: five pointers)
FM_NAMES_STOCK = stock_guard(0x4003c928, 6, "237cd1acd4da7acb61dc7fda7c88e648a5186b36732f433b4dd91966c5a669af")
FM_NAME_A_HOOK = 0x4003d718              # `lea 0x400a78c8,%a0` (a track's machine name, a0 = its machine byte)
FM_NAME_A_STOCK = stock_guard(0x4003d718, 6, "53b8d23acf2c3fe0f794c0a5f37475b17c3433bc6a466e0e1861515989cfecda")
FM_SETUP_ROW_HOOK = 0x4003c980           # `mvsb %a0@,%d0; lea %sp@(24),%sp` (SRC SETUP's row highlight)
FM_SETUP_ROW_STOCK = stock_guard(0x4003c980, 6, "237e017ccd95444195ca390a3e6ca6076fbfa1f0931f2e7dfbdbee8c5ec72ca3")
FM_CHOOSER_ROW_HOOK = 0x400786c8         # `mvsb %a0@,%d0; cmpl %d0,%d2; bnes 0x400786fc` (the machine window's row highlight)
FM_CHOOSER_ROW_STOCK = stock_guard(0x400786c8, 6, "c611970befafba97f882ab297bd19f0efe0c7d927bfd6110c53f03ad4b7da1c7")
FM_SETUP_OPEN_HOOK = 0x400585dc          # `moveb %a0@,%d3; mvsb %d3,%d4; pea 0x400bb704` (SRC SETUP opens on the track's row)
FM_SETUP_OPEN_STOCK = stock_guard(0x400585dc, 10, "22fb6e2bea4520003d2fae7035c0cd57bcd6fe6f2cfdd5b70580a3f6f2a68034")
FM_CHOOSER_OPEN_HOOK = 0x40078886        # `mvsb %a0@,%d0; movel %d0,%sp@-; pea 0x460e7386` (the machine window opens on it)
FM_CHOOSER_OPEN_STOCK = stock_guard(0x40078886, 10, "fe6cb52458c7d968dc467c1cd7721d832baf6bc2fac1826c8c10ed07fee2e7f8")
FM_EDIT6_HOOK = 0x4003a52e               # `movel %d2,%d0; lsll #3,%d0; addl %d2,%d2; subl %d2,%d0` (SRC SETUP's editor: row * 6)
FM_EDIT6_STOCK = stock_guard(0x4003a52e, 8, "cae34bf50383462ed4f92d8044e3021247edb8bf69c17a9c7ead62f6edf79510")
FM_DRAW6_HOOK = 0x4003cd98               # `movel %d6,%d7; lsll #3,%d7; addl %d6,%d6; subl %d6,%d7` (its drawer: the same)
FM_DRAW6_STOCK = stock_guard(0x4003cd98, 8, "ed71ef874312890edc87cef7e19cd8c0f8ac4ac9b90182c2364f78d3a4567f45")
FM_TICK_HOOK = 0x4005221e                # `jsr %pc@(0x4005213c); jsr 0x4007e940` (the UI tick)
FM_TICK_STOCK = stock_guard(0x4005221e, 10, "8f0fa4f7d6db857f695996b185b38b788fa6af0eacd86d7dd01e2ff61201ffed")
FM_SRC_COMMIT_HOOK = 0x4005a616          # `movel 0x460d5c30,%d1` (SRC SETUP's machine-byte write: the chosen row)
FM_SRC_COMMIT_STOCK = stock_guard(0x4005a616, 6, "7a7350a69423ec41ec468a189ba167059626cb7f499d9862394d2388a23c8b59")
FM_SRC_COMMIT2_HOOK = 0x4005a850         # the same instruction on its second path (after LISTWIN_HOOK, which returns here)
FM_SRC_COMMIT2_STOCK = stock_guard(0x4005a850, 6, "7a7350a69423ec41ec468a189ba167059626cb7f499d9862394d2388a23c8b59")
FM_VALIDATE_HOOK = 0x40002318            # `lea %sp@(-96),%sp; moveml %d2-%d7/%a2-%fp,%sp@` (the Part validator's prologue)
FM_VALIDATE_STOCK = stock_guard(0x40002318, 8, "3d25d06bf11f3a7bccef894d0016b52adbb4ae468a0f475dd497d7b5966e2694")
FM_SOURCE_HOOK = 0x4000d514              # `moveal %a4@+,%a0; movel %a0,%a3@+; pea 0x10` (the frame builder's second supplier call)
FM_SOURCE_STOCK = stock_guard(0x4000d514, 8, "39173055fb04ac0a6c355f89561b48834bc5b31ad67609e3fe53efbff7de1866")
# 2.11: the machine list's six row-count / row-bound sites (machine.s ml_*; pokes 5 -> 6 until 2.10)
ML_WIN_COUNT_HOOK = 0x40079248            # `pea 5; pea 6` (the machine window's list init: rows, visible)
ML_WIN_COUNT_STOCK = stock_guard(ML_WIN_COUNT_HOOK, 8, "3ec3e33dc9eae9cfbe075a2a5e2697563293203896e3649ae7e7a718a6d7f34c")
ML_SRC_COUNT_HOOK = 0x400585fa            # `pea 5; pea 5` (SRC SETUP's list init: rows, visible)
ML_SRC_COUNT_STOCK = stock_guard(ML_SRC_COUNT_HOOK, 8, "28992093b4deda97ffa595ce8acd14c8a2a391c67871c1e8dd3421d97467a29d")
ML_NAME_BOUND_HOOK = 0x4003c950           # `moveq #4,%d1; cmpl %d2,%d1; bcss 0x4003c95a` (SRC SETUP's name lookup)
ML_NAME_BOUND_STOCK = stock_guard(ML_NAME_BOUND_HOOK, 6, "6fa1f2f2fc3d83f1e1917364e374491dd04fc060d1beea8b77f03bdd332e2b75")
ML_DRAW_BOUND_HOOK = 0x40078678           # `moveq #4,%d0; cmpl %d2,%d0; blts 0x400786a2` (the machine window's drawer)
ML_DRAW_BOUND_STOCK = stock_guard(ML_DRAW_BOUND_HOOK, 12, "d0853f882affa9f487c3a82a5e08c3b3bc4c3082692c8af90dd2949eb191a733")  # ... movel %d2,%sp@-; moveal %d3,%a0; jsr %a0@ (12 B)
ML_HI_BOUND_HOOK = 0x400786ce             # `moveq #4,%d0; cmpl %d2,%d0; blts 0x400786fc` (its highlight)
ML_HI_BOUND_STOCK = stock_guard(ML_HI_BOUND_HOOK, 6, "2c62e6999a40a15016ea1fe57b7ca93f9d4fe1558127921ae736814a30b5455b")
ML_CUR_BOUND_HOOK = 0x40079904            # `moveq #4,%d3; cmpl %d4,%d3; bgew 0x400797cc` (its cursor)
ML_CUR_BOUND_STOCK = stock_guard(ML_CUR_BOUND_HOOK, 8, "845ca10fcd33861c3a74cd9bb5f9da1fd78bb0cf44e30f2fc0ae43db045a633e")
ML_CLAMP_HOOKS = (0x40078c22, 0x40078cb0, 0x40078d2e, 0x40078dee, 0x40078e7c)  # the machine window's row clamp after a list move
ML_CLAMP_SHA256 = "d749208f2ebf1e144a87c325281e533ef582759f54549234fcc92c90dc89a595"   # `moveq #5,%d1; cmpl %d0,%d1; bges +2; moveq #5,%d0`
ML_CLAMP1_STOCK = stock_guard(0x40078c22, 8, ML_CLAMP_SHA256)
ML_CLAMP2_STOCK = stock_guard(0x40078cb0, 8, ML_CLAMP_SHA256)
ML_CLAMP3_STOCK = stock_guard(0x40078d2e, 8, ML_CLAMP_SHA256)
ML_CLAMP4_STOCK = stock_guard(0x40078dee, 8, ML_CLAMP_SHA256)
ML_CLAMP5_STOCK = stock_guard(0x40078e7c, 8, ML_CLAMP_SHA256)
ML_CLAMP_GUARDS = (ML_CLAMP1_STOCK, ML_CLAMP2_STOCK, ML_CLAMP3_STOCK, ML_CLAMP4_STOCK, ML_CLAMP5_STOCK)  # the same 8 stock bytes at each site
KIND_TABLE_FLEX_START = 0x400d6458       # the kind table's FLEX START callback (stock 0x4000f450)
FLEX_START = 0x4000f450

# The FM voice engine is a DRAM unit since 24 Sep 2026 (poly.s, the
# paraphonic engine): linked into the platform runtime at the base of the
# arena reserve, depacked by the loader at boot; the kind table's FLEX entry
# is rewritten to its sy_render by a SymbolRef (the pointer's stock value
# asserted first). synth.s, the ROM cave it replaced, is kept for the record.
# ---- phase 3: the page (modules/synth/page.s) ----------------------------------
# The PLAYBACK page presents the synth: a detour in the page-descriptor
# resolver (0x40031da4, the kind-0 `tbl[machine]` load at 0x40031ece) returns a
# runtime clone of the FLEX descriptor -- names PTCH RATO INDX FINE FDBK DEC, the title
# "FM SYNTH" (the footer reads FM SYNTH>FLEX), formatters (the ratio table's
# value, 0..127, ms/s/HOLD), widgets that draw the operator diagram, the
# sideband spectrum, the feedback loop and the index envelope over the stock
# dial -- when the current track's assigned FLEX sample is named FMSYNTH* (or SYNTH*).
# The clone itself is built at runtime by poly.s (po_pgdesc, first use) from
# the stock record in the image plus the override list in page.s; the cave
# carries no stock bytes. Pinned at the second zero run: the override list
# holds absolute pointers into the cave. One 6-byte poke (`movel
# %a0@(0,%d0:l:4),%d0; bras` -> `jmp pg_resolve`).
PAGE_AT = 0x400d24d0
PAGE_LEN = 1868
PG_RESOLVE_AT = 16                       # pg_resolve's offset in the cave (fm_descriptor, 16 B, is first)
RESOLVER_HOOK = 0x40031ece
RESOLVER_STOCK = stock_guard(0x40031ece, 6, "5aed68f7498659f87e414631493741e91f3442c5319f46e6893b567c423ce24f")
# 2.10 (6 Oct 2026, poly.s "THE LFO DESTINATION LIST"): LFO SETUP's PMTR. The
# formatter 0x4003bf64 (the LFO descriptor's slot-6 formatter) picks the PLAYBACK
# names from the machine table and the LFO names from the stock descriptor
# itself, not through the page resolver; the audio edit 0x400392cc walks all 30
# destinations. On a synth track the names become the FM SYNTH page's and the
# VOIC / CHRD clone's, and the edit steps over SPD3 / DEP3 (VOIC / CHRD).
LFD_NAME_HOOK = 0x4003bff2               # `lea 0x400d5f38,%a0; bras 0x4003c054` (page 0: the machine table)
LFD_NAME_STOCK = stock_guard(0x4003bff2, 8, "646fea5c7ac7852156feed7591534de986df92af53074c25ecf54e4295d072ae")
LFD_LFO_HOOK = 0x4003bffa                # `lea 0x400d37f6,%a2; bras 0x4003c058` (page 1: the LFO descriptor)
LFD_LFO_STOCK = stock_guard(0x4003bffa, 8, "c317505c7277fb592c805f2fcf7b5c789d8d1b43735f0677697b101a75473e71")
LFD_EDIT_HOOK = 0x400392cc               # `movel %d3,%d0; moveq #6,%d2; remsl %d2,%d7,%d0` (the audio PMTR edit after its branches)
LFD_EDIT_STOCK = stock_guard(0x400392cc, 8, "a57855f641d419b81f08ce2f502a1bf18363df142106b0b0ab926fc65b1c0948")
# Ratified bytes: page.s with m68k-elf-as -mcpu=5475, linked at PAGE_AT (26 Sep 2026: the
# runtime clone -- 1,672 B, down from 1,948: the 402-byte copy of the stock descriptor is gone,
# and the "%d" formatter is the stock's own; 27 Sep 2026: 1,800 B with the tuning system's
# PTCH and FINE formatters and the range / handler overrides; 30 Sep 2026: 1812 B, the
# FMSYNTH* marker name -- a leading "FM" is skipped before the SYNTH compare; 5 Oct 2026:
# still 1812 B, DEC's HOLD moved from raw 0 to raw 127 -- short branches pay for the compare;
# 8 Oct 2026: 1868 B, the FM SYNTH machine -- fm_descriptor (16 B) first, so pg_resolve is at
# +16, and pg_resolve's test of the Part's "FM", 1 ahead of the marker scan; still inside the
# zero run 0x400d24d0..0x400d2ce0, 2064 B).
MODULE = Module(
    name="synth",
    key="SYNTH MACHINE",
    kind=Kind.CF_PATCH,
    # 2.11: ANALOG BD (octabam modules/analog-bassdrum) owns the same machine-list sites
    # (the sixth row and its hooks); the ledger refuses the pair on bytes already, this
    # names the reason.
    conflicts=(("ANALOG BD", "both own the machine list's rows after PICKUP (the same chooser sites)"),),
    doc="FM SYNTH in the machine list (FUNC + SRC, or SELECT MACHINE TYPE), or a FLEX track whose sample is named SYNTH*, plays a two-operator FM "
        "voice (STRT/LEN/RTRG/RTIM = ratio/index/feedback/decay); the DSP "
        "shapes and effects it as a sample. Its PLAYBACK page reads RATO/INDX/"
        "FDBK/DEC with icons and the title FM SYNTH; PTCH is semitones (-64..+63) "
        "and RATE is FINE (cents) on a synth track, 0c the moment a track becomes one. "
        "A FLEX or STATIC sample track with LEG MONO and GLIDE slides its pitch (2.8).",
    linked=(
        Linked("poly", os.path.join(_HERE, "poly.s"), cpu="5475", dram=True, include=remix_include),
        Linked("fmmachine", os.path.join(_HERE, "machine.s"), cpu="5475", dram=True, include=remix_include),
    ),
    # The kind table's FLEX entry is a 4-byte data pointer, not an
    # instruction: upstream octabam's SymbolRef (a stock u32 rewritten to a
    # linked symbol, the stock value asserted first) is what the fork's
    # Detour(kind="ptr") did (ported 25 Sep 2026).
    symbol_refs=(
        SymbolRef(KIND_TABLE_FLEX, STOCK_RENDERER, "poly", "sy_render",
                  "kind table FLEX renderer -> the DRAM unit's sy_render (SYNTH*-named "
                  "samples become the FM voice; a sample's PTCH slides with LEG MONO + GLIDE)"),
        SymbolRef(KIND_TABLE_STATIC, STOCK_RENDERER, "poly", "sy_render",
                  "kind table STATIC renderer -> sy_render too (2.8: a STATIC sample's PTCH slides "
                  "with LEG MONO + GLIDE; no marker scan, the stock call otherwise)"),
        SymbolRef(KIND_TABLE_FLEX_START, FLEX_START, "poly", "po_fmstart",
                  "kind table FLEX START callback -> po_fmstart (2.10): a track whose FM SYNTH is chosen in the "
                  "machine list starts its voice without a sample; every other FLEX track the stock callback"),
    ),
    detours=(
        Detour(LFO_DEPTH_HOOK, LFO_DEPTH_STOCK, "poly", "po_lfo3",
               "LFO engine (the routine) depth read: LFO 3 reads depth 0 on a synth track",
               kind="jmp", pad_to=8),
        Detour(LFO_DEPTH_HOOK2, stock_guard(0x4000d03e, 8, "affe75cc6a50fffd392b3e1045e18d0fbf846ff2f30fe75be1e445e634f96cf9"), "poly", "po_lfo3b",
               "LFO engine (the frame builder's inlined copy) depth read: the same",
               kind="jmp", pad_to=8),
        Detour(LFO_PAGE_HOOK, LFO_PAGE_STOCK, "poly", "po_lfopage",
               "page resolver LFO descriptor: a synth track gets the VOIC/CHRD clone",
               kind="jmp", pad_to=8),
        Detour(LFD_NAME_HOOK, LFD_NAME_STOCK, "poly", "po_lfdname",
               "LFO SETUP PMTR formatter, PLAYBACK names: the page resolver's descriptor (the FM SYNTH page on a synth track) instead of the machine table's; the master track and every other machine stock",
               kind="jmp", pad_to=8),
        Detour(LFD_LFO_HOOK, LFD_LFO_STOCK, "poly", "po_lfdlfo",
               "LFO SETUP PMTR formatter, LFO names: the VOIC / CHRD clone on a synth track (a stored SPD3 / DEP3 prints VOIC / CHRD); every other track stock",
               kind="jmp", pad_to=8),
        Detour(LFD_EDIT_HOOK, LFD_EDIT_STOCK, "poly", "po_lfdedit",
               "LFO SETUP PMTR edit (audio tracks): stock's display-order walk, one shown destination a detent, stepping over SPD3 / DEP3 (VOIC / CHRD) on a synth track; the Part byte or the lock as stock stores it",
               kind="jmp", pad_to=8),
        Detour(MIDI_MAP_HOOK, MIDI_MAP_STOCK, "poly", "po_mon",
               "MIDI IN note-on (the STANDARD map's chromatic block): a synth track's PTCH raw is note - 20 (semitones, 84 = 0), stored before the START, and the note is posted to the engine as a key of its own",
               kind="jmp"),
        Detour(MIDI_OFF_HOOK, MIDI_OFF_STOCK, "poly", "po_moff",
               "MIDI IN note-off: a paraphonic synth track releases that note's voice alone; the last note's release posts the stock AMP release",
               kind="jmp", pad_to=8),
        Detour(REL_HOOK, REL_STOCK, "poly", "po_rel",
               "the frame builder's AMP-release consumer (mailbox 0x40, every note-off path): a synth voice takes the released flag -- plan B: the engine's own release starts (po_mono_env)",
               kind="jmp", pad_to=8),
        Detour(RETRIG_HOOK, RETRIG_STOCK, "poly", "po_retrig",
               "the frame builder's copy of the DSP command byte into the packer's nibble byte (every START form's funnel): a START posted on a synth track whose engine voice is on (S_ON) becomes the key's clean form 0x30 -- the CF START bit with sub-frame position 0 -- so the DSP does not crossfade its old voice under the engine's one continuous stream (BUILD 37: the +5.6 dB bump at a sequencer trig on a still-sounding note)",
               kind="jmp", pad_to=8),
        Detour(KILL_HOOK, KILL_STOCK, "poly", "po_kill",
               "the stock VOICE KILL's CF voice-byte clear (STOP / pattern change 0x40043c50, the loaders, the sample preview, the frame builder's end mask): the engine's voices of the killed track end at that instant (S_GAIN / S_GPREV / S_HTIM / S_ON := 0, the paraphonic voices freed) -- the DSP voice is dead, the next START is cold (BUILD 33)",
               kind="jmp"),
        Detour(MIDI_GATE_HOOK, MIDI_GATE_STOCK, "poly", "po_mgate",
               "MIDI IN note gate: a note outside 72..96 addressed to a synth track plays it chromatically (20..127 = -64..+43 semitones)",
               kind="jmp", pad_to=8),
        Detour(MIDI_OFFGATE_HOOK, MIDI_OFFGATE_STOCK, "poly", "po_mogate",
               "MIDI IN note-off gate: a note outside 72..96 addressed to a synth track reaches the chromatic note-off (po_moff)",
               kind="jmp"),
        Detour(MIDI_REC_HOOK, MIDI_REC_STOCK, "poly", "po_mrec",
               "MIDI IN live recorder (the 0x41 event): a synth track's note records through po_keyrec (fingered chords; the PTCH lock in semitones)",
               kind="jmp", pad_to=10),
        Detour(MIDI_TRIG_HOOK, MIDI_TRIG_STOCK, "poly", "po_mtrig",
               "MIDI IN with a trig held: a synth track's held trig gets its PTCH lock in semitones",
               kind="jmp", pad_to=10),      # the whole 10-byte displaced span (the lea's extension word included)
        Detour(OCT_HOOK, OCT_STOCK, "poly", "po_octave",
               "FUNC + UP/DOWN (the trig-mode selector): with a trig held on a synth track in GRID RECORDING, any trig mode, "
               "the held steps' PTCH lock moves an octave instead (no trig held, a sample track, GRID RECORDING off: the selector)",
               kind="jmp"),
        Detour(AMP_STAGE_HOOK, AMP_STAGE_STOCK, "poly", "po_ampstage",
               "AMP SETUP window (FUNC + AMP) staging: an audio track stages the AMP clone whose sixth box is LEG (OFF / MONO / POLY on a synth track, OFF / MONO on a sample track; the master track stock)",
               kind="jmp"),
        Detour(AMP_DRAW1_HOOK, AMP_DRAW1_STOCK, "poly", "po_ampdraw1",
               "AMP SETUP drawer: the page-2 names and formatters from the clone on an audio track",
               kind="jmp", pad_to=12),
        Detour(AMP_DRAW2_HOOK, AMP_DRAW2_STOCK, "poly", "po_ampdraw2",
               "AMP SETUP drawer: the enable nibbles from the clone (the widget pass)",
               kind="jmp", pad_to=12),
        Detour(AMP_DRAW3_HOOK, AMP_DRAW3_STOCK, "poly", "po_ampdraw3",
               "AMP SETUP drawer: the enable nibbles from the clone (the name pass)",
               kind="jmp", pad_to=12),
        Detour(AMP_EDIT_HOOK, AMP_EDIT_STOCK, "poly", "po_ampedit",
               "AMP page-2 editor: slot 11 of an audio track steps LEG 0..2 (synth) or 0..1 (sample) (po_legknob); the Part byte and its battery-RAM shadow as stock writes them",
               kind="jmp", pad_to=12),
        Detour(AMP_LANE_HOOK, AMP_LANE_STOCK, "poly", "po_amplane",
               "AMP page-2 editor's live-lane write: a synth track's LEG never reaches the lane (the DSP's copy reads 0)",
               kind="jmp", pad_to=10),
        Detour(ASSIGN_HOOK, ASSIGN_STOCK, "poly", "po_assign",
               "slot assigner (both windows): a track that becomes a synth track by this slot write -- FLEX with an FMSYNTH*/SYNTH* slot, "
               "not one before -- gets FINE 0c (RATE := 64 in the Part, its shadow and the live lane); a synth track already, or a sample track: untouched",
               kind="jmp", pad_to=8),
        Detour(MACHWIN_HOOK, MACHWIN_STOCK, "fmmachine", "fm_main_commit",
               "machine window, the machine-only write (the slot equal): row 5 (FM SYNTH) is stored as FLEX with the Part's \"FM\", 1 (seeded "
               "unless the track plays the FM voice already), any other row clears it (2.10, machine.s); then po_machwin: a track that "
               "becomes a synth track by the machine change gets FINE 0c",
               kind="jmp", pad_to=8),
        Detour(LISTWIN_HOOK, LISTWIN_STOCK, "poly", "po_machlist",
               "sample-list window, the machine-only write: the same",
               kind="jmp", pad_to=8),
        Detour(LOADSEL_HOOK, LOADSEL_STOCK, "poly", "po_loadsel",
               "file browser select: the slot's path write (stock's sprintf, called from the stub) -- a FLEX slot's file going "
               "non-marker -> FMSYNTH*/SYNTH* makes every FLEX track holding that slot a synth track: FINE 0c for each (the new-project case: "
               "T1 = FLEX slot 1, the first marker loaded into slot 1, no machine or slot byte changes)",
               kind="jsr"),
        Detour(UNLOAD_HOOK, UNLOAD_STOCK, "poly", "po_unload",
               "file browser load callback: the slot unload before the select (2.12) -- the FLEX slot's marker state is kept for "
               "po_loadsel (the unload clears the slot's record), then the stock unload",
               kind="jsr"),
        # ---- FM SYNTH in the machine list (2.10, machine.s; MACHWIN_HOOK above) ----
        Detour(FM_NAME_HOOK, FM_NAME_STOCK, "fmmachine", "fm_machine_name",
               "the machine-name formatter: row 5 reads FM SYNTH (the machine window's sixth row)",
               kind="jmp"),
        Detour(FM_NAMES_HOOK, FM_NAMES_STOCK, "fmmachine", "fm_src_names",
               "SRC SETUP's machine-name table: six rows, the stock five (copied at run time) and FM SYNTH",
               kind="lea"),
        Detour(FM_NAME_A_HOOK, FM_NAME_A_STOCK, "fmmachine", "fm_name_a",
               "a track's machine name: FM SYNTH for a chosen track (FLEX with the Part's \"FM\", 1)",
               kind="jmp"),
        Detour(FM_SETUP_ROW_HOOK, FM_SETUP_ROW_STOCK, "fmmachine", "fm_setup_row",
               "SRC SETUP's row highlight: a chosen track's row is FM SYNTH",
               kind="jmp"),
        Detour(FM_CHOOSER_ROW_HOOK, FM_CHOOSER_ROW_STOCK, "fmmachine", "fm_chooser_row",
               "the machine window's row highlight: the same",
               kind="jmp"),
        Detour(FM_SETUP_OPEN_HOOK, FM_SETUP_OPEN_STOCK, "fmmachine", "fm_setup_open",
               "SRC SETUP opens on FM SYNTH for a chosen track (its page: the descriptor table's slot 5, fm_tick)",
               kind="jmp", pad_to=10),
        Detour(FM_CHOOSER_OPEN_HOOK, FM_CHOOSER_OPEN_STOCK, "fmmachine", "fm_chooser_open",
               "the machine window opens on FM SYNTH for a chosen track",
               kind="jmp", pad_to=10),
        Detour(FM_EDIT6_HOOK, FM_EDIT6_STOCK, "fmmachine", "fm_setup_edit6",
               "SRC SETUP's editor addresses row 5's Part bytes as FLEX's",
               kind="jmp", pad_to=8),
        Detour(FM_DRAW6_HOOK, FM_DRAW6_STOCK, "fmmachine", "fm_setup_draw6",
               "SRC SETUP's drawer: the same",
               kind="jmp", pad_to=8),
        Detour(FM_TICK_HOOK, FM_TICK_STOCK, "fmmachine", "fm_tick",
               "the UI tick (its two calls replayed): SRC SETUP's six names refreshed and the PLAYBACK descriptor table's "
               "spare slot 5 (0x400d5f4c) := the FM SYNTH page (page.s fm_descriptor)",
               kind="jmp", pad_to=10),
        Detour(FM_SRC_COMMIT_HOOK, FM_SRC_COMMIT_STOCK, "fmmachine", "fm_src_commit",
               "SRC SETUP's machine-byte write: row 5 is stored as FLEX with the signature, any other row clears it",
               kind="jmp"),
        Detour(FM_SRC_COMMIT2_HOOK, FM_SRC_COMMIT2_STOCK, "fmmachine", "fm_src_commit2",
               "the same on SRC SETUP's second path (po_machlist's detour returns to this site)",
               kind="jmp"),
        Detour(FM_VALIDATE_HOOK, FM_VALIDATE_STOCK, "fmmachine", "fm_validate",
               "the Part validator: a chosen track's twelve FLEX bytes sit out the stock clamps (FLEX's PTCH 4..124; FM SYNTH's is "
               "0..127) -- the stock defaults in their place while it runs, the FM bytes back after",
               kind="jmp", pad_to=8),
        Detour(FM_SOURCE_HOOK, FM_SOURCE_STOCK, "poly", "po_fmsource",
               "the frame builder's second supplier call: a chosen track's supplier is sy_render (an empty FLEX voice gets stock's "
               "silent one)",
               kind="jmp", pad_to=8),
        # ---- the machine list's row count and bounds (2.11, machine.s; 2.10 poked them to 6 rows) ----
        Detour(ML_WIN_COUNT_HOOK, ML_WIN_COUNT_STOCK, "fmmachine", "ml_win_count",
               "the machine window's list init: 5 + the remix's machine-list rows (6 with FM SYNTH, 7 with SY DRUM), six visible",
               kind="jmp", pad_to=8),
        Detour(ML_SRC_COUNT_HOOK, ML_SRC_COUNT_STOCK, "fmmachine", "ml_src_count",
               "SRC SETUP's machine selector: 5 + the machine-list rows, five visible",
               kind="jmp", pad_to=8),
        Detour(ML_NAME_BOUND_HOOK, ML_NAME_BOUND_STOCK, "fmmachine", "ml_name_bound",
               "SRC SETUP's name lookup admits the machine-list rows",
               kind="jmp"),
        Detour(ML_DRAW_BOUND_HOOK, ML_DRAW_BOUND_STOCK, "fmmachine", "ml_draw_bound",
               "the machine window's row drawer draws name(row + top) up to the last row: SELECT MACHINE TYPE scrolls like SRC SETUP",
               kind="jmp", pad_to=12),
        Detour(ML_HI_BOUND_HOOK, ML_HI_BOUND_STOCK, "fmmachine", "ml_hi_bound",
               "the machine window highlights the machine-list rows",
               kind="jmp"),
        Detour(ML_CUR_BOUND_HOOK, ML_CUR_BOUND_STOCK, "fmmachine", "ml_cur_bound",
               "the machine window applies a machine-list row under its cursor",
               kind="jmp", pad_to=8),
    ) + tuple(
        Detour(a, g, "fmmachine", f"ml_clamp{i + 1}",
               "the machine window's row clamp after a list move: 0 .. the last row (stock 0..5)",
               kind="jmp", pad_to=8)
        for i, (a, g) in enumerate(zip(ML_CLAMP_HOOKS, ML_CLAMP_GUARDS))) + (
    ),
    # 2.11: the six row-count / row-bound constants were pokes (5 -> 6) until 2.10; a poke is
    # static, the number of rows is the remix's (FM SYNTH, + SY DRUM): six detours read it.
    pokes=(),
    cf_patches=(),
)
