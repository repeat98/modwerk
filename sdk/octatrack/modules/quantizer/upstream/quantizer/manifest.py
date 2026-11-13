"""SCALE QUANTIZER -- a per-project SCALE setting (OFF plus 24 scales) and,
since Octatrick 2.9, its ROOT (C .. B), that quantize the audio tracks'
pitch, as the Digitakt / Digitone do. With a
scale on, the PTCH knob on the PLAYBACK page steps to the next scale degree
in the turn direction instead of one raw unit (from 0 up in PHRYGIAN: 1, 3,
5, 7, 8, 10, 12 ...; below the root the same degrees an octave down), and a
[TRIG] key in CHROMATIC trig mode snaps to the nearest degree (ties to the
lower) before it becomes the pitch the voice, the lock and the screen see.
OFF is stock: every detour replays what it displaced.

MIDI TRACKS, PART TWO (15 Oct 2026, Octatrick 2.15). What a MIDI track PLAYS
follows the scale too: qz_mnote (a jmp at 0x4009fb80, the sequencer's MIDI note
stage 0x4009f794, after TRAN, the MIDI transpose and stock's ARP SETUP KEY,
before the active-note test and the note-on) snaps every note the stage sends --
NOTE, the chord notes NOTE + NOT2..4, NOTE locks, TRAN, the arpeggiator's notes
and RANGE octaves -- to the nearest note of the ROOT-rotated scale (qz_msnap, ties
down), in place, so the note-on, the note the stage stores for its note-off and
its active-note table agree (nothing can hang); two notes of one trig that snap
to the same note sound once (stock's active-note test skips a note the track
already holds). The offsets stay semitones; a chord can lose a note on a tie.
qz_mprev (a jmp at 0x400439d6) snaps the chord a held [TRIG] key previews in GRID
RECORDING the same way, press and release. And a per-track switch: SEQUENCER rows
7..14, "MIDI 1 SCALE" .. "MIDI 8 SCALE" (since 2.22: TRACK = MIDI n, then FOLLOW),
ON (default) / OFF; OFF makes that MIDI
track stock in every path (the NOTE knob, NOTE locks, the CHROMATIC keys and their
readout, the note stage, the preview), as SCALE OFF would. The switch is one
battery-RAM byte, MOFF_NV 0x100b14ef (bit t = MIDI track t+1 is OFF; the last
byte of the padding SCALE / GLIDE / ROOT use), cleared by qz_defaults and a
storing load, saved as "#SEQUENCER_MIDI_SCALE_OFF=n" after the GLIDE line. MIDI
IN thru and the auto channel's direct play (arpeggiator off) stay stock.

MIDI TRACKS (12 Oct 2026, Octatrick 2.13). With a scale on, a MIDI track's
NOTE knob (qz_mknob at 0x40055382, the knob handler's MIDI clamp just before
its store 0x4005538a, which stays stock: octabam's MIDI SCENES detours that
store and composes with this hook) and its
NOTE locks (qz_mplock at 0x40050b98, the MIDI p-lock editor's store; a LIVE
REC lock reads the knob's value) step to the next note of the ROOT-rotated
scale in the turn direction (pitch class = note mod 12; qz_quant's MIDI
mode), and a MIDI CHROMATIC key (qz_mkey at 0x400436a8, the press path of
0x40043664) plays note + ROOT snapped to the nearest scale note (qz_msnap,
ties down): the note-on, the arpeggiator's add, the held note its release
turns off and the live recorder all take it. The drawer's number reads
"<ROOT> <octave>" (qz_octnum). NOT2..4, TRAN, the arpeggiator's output, MIDI
IN, VEL / LEN and the sequencer are stock (editing only: stock's ARP SETUP
KEY forces a track's every note into a key); SCALE OFF replays every
displaced instruction. qz_octnum moved from 0x400449b8 to the drawer's
common push 0x400449be (Modwerk #264): stock's MIDI branch jumps to
0x400449be, so the 2.9 .. 2.12 detour skipped the octave push there and
the drawer's call ran one argument short -- CHROMATIC on a MIDI track froze
the unit.

ROOT (28 Sep 2026, Octatrick 2.9). One per project, a fifth SEQUENCER row
right under SCALE: C C# D D# E F F# G G# A A# B (C = 2.8's behaviour: the
pitches, the knob and the locks byte for byte; the keyboard's number reads
"C 0" with a scale on where 2.8 read "0"). The scale is built on the root:
every snap -- the PTCH knob, a PTCH lock in either editor, a CHROMATIC key,
and the chord notes the synth engine snaps through SCALE_AT -- tests a note's
pitch class against ONE mask, core.s qz_scale_mask = the scale's pitch
classes rotated by ROOT. The CHROMATIC keyboard is transposed so that key 1
sounds the root (a synth track: n = key - 12 + ROOT + 12 * octave; a sample
track: index + ROOT within stock's -12..+12 st), and the number beside the
keyboard reads the root's name too ("A -1"). A SAMPLE track keeps stock's two
keyboard positions (one word, FUNC + LEFT / RIGHT toggles it; 0 at boot):
the default position plays the one complete root-to-root octave the stock
range holds, r-12 .. r st on keys 1..13 (key 1 = the root below the sample's
pitch, key 13 = the root above), and the other position is the partial octave
on the side that clamps fewer keys -- r .. r+12 with the top r keys clamped at
+12 st for ROOT C..F#, r-24 .. r-12 with the bottom 12 - r keys clamped at
-12 st for ROOT G..B ("when the root is high, the whole keyboard drops an
octave"; the number then reads "-1"). SCALE = OFF ignores ROOT. Stored in the next battery-RAM byte,
0x100b14ee (no absolute reference to 0x100b14e2..ef anywhere in the OS;
outside both blocks the boot memcpy's), clamped 0..11 by qz_boot and set to
C by qz_defaults, saved as "#SEQUENCER_ROOT=n" after the SCALE line by the
same writer and loader detours; the SEQUENCER tables are grown 3 + 3.

THE DRAM SPLIT (28 Sep 2026). quantizer.s is a DRAM unit of octabam's
platform runtime (Linked(dram=True), with the synth's poly.s); the OS image
keeps core.s -- qz_boot, qz_defaults, qz_scale_mask and the 24 masks, 192 B
-- and the two pinned stubs. The boot order under the port (--watch-pc):
the boot redirect 0x4000050c runs the loader (the runtime depacked) before
the .data copy 0x4000f938 and main 0x40000db0, and the sanitiser site
0x40010212 / the defaults site 0x40025ac2 run from main, so no detour of
the DRAM unit can be reached before it is there; the core is in ROM because
the pinned trampoline scale.s must resolve qz_scale_mask at link time (a
ROM unit cannot name a DRAM symbol) and so that the three bytes are sane
whether or not a runtime was depacked. The quantizer's ROM footprint went
from 3,268 + 45 + 6 B to 192 + 45 + 6 B.

WHERE THE SETTING LIVES. PROJECT > CONTROL > SEQUENCER gains a fourth row,
SCALE, under CHAIN AFTER / SILENCE TRACKS / LFO AUTO CHANGE: the window is a
generic list (state 0x460e43d8, init 0x40065c7c, draw 0x40065b14, keys
0x40065cec, LEVEL knob 0x40065c98) over three parallel pointer tables --
labels 0x400b27d0, getters 0x400b27dc, setters 0x400b282c -- which the
build grows to six entries (fourteen since 2.15: MIDI 1..8 SCALE; twenty-two in 2.19; eight since 2.22: SCALE, ROOT, GLIDE, TRACK, FOLLOW) (TableGrow) and repoints. The list is created
with count 3 / visible 3 (two pushes of 3 at 0x40065c7c); the count becomes
4 (poke) and the three visible rows scroll, as the firmware's longer lists
do, once the draw loop indexes the tables from the scroll offset instead of
0 (qz_draw). The value byte lives in the unit (qz_scale), OFF in the image.

PERSISTENCE. The project file is text (project.work, KEY=value lines); the
loader 0x400866c4 is a strcmp chain that REJECTS an unknown key (0x40086d3a,
error -51), but skips any line starting with '#' at 0x400867a2 before the
chain -- on stock firmware too. So the setting is written as
"#SEQUENCER_SCALE=n" right after PATTERN_CHANGE_CHAIN_BEHAVIOR (qz_wr,
in the writer 0x40088882..), read back by a detour on the '#' check
(qz_ld_line), and reset to OFF at the start of every storing load
(qz_ld_entry; the loader's parse-only pass leaves it alone). A stock unit
loads such a project unchanged. Every path that writes a project file goes
through that one serializer 0x40088288 (SYNC TO CARD and SAVE write
project.work with it, 0x4008fe40; SAVE then copies .work to .strd file by
file, 0x4008ee74; RELOAD copies .strd back and loads it, 0x4008f180) and
every path that reads one goes through that one loader (0x4009000c, a
parse-only pass then a storing pass, both on project.work).

WHERE THE VALUE LIVES (26 Sep 2026, Tim's MKI report: SAVE, power off, SCALE
and GLIDE gone). A POWER CYCLE READS NO PROJECT FILE. The unit comes back
from its battery-backed RAM (CS1, 0x10000000..): the boot (0x4001fb3c..)
sanitises the settings block 0x100b1480..0x100b14e1 (0x4000fec8) and
memcpy's it to the live copy 0x80000000.. (CHAIN AFTER 0x8000004e <-
0x100b14ae, the mirror every setter writes); project.work is read only by
PROJECT > CHANGE and RELOAD -- which is why the emulator, whose RAM is
empty at every start and whose rig loads the project through the loader,
never showed it. Until then the two bytes lived in the OS image (this unit
and the pinned glide.s), copied fresh from flash at every boot: OFF. Now the
setting IS a battery byte -- SCALE at 0x100b14ec, GLIDE at 0x100b14ed, the
linker's padding between the block's last long 0x100b14de..e1 and the
16-byte-aligned project record 0x100b14f0 (no reference in the OS, outside
both memcpy'd blocks, never written by stock in a boot + load + play + SAVE
+ SYNC session under watchmem) -- read and written in place, clamped at boot
where stock clamps its own bytes (qz_boot, a jsr at 0x40010212 in the
sanitiser, garbage -> OFF) and set to OFF with the block by the project
defaults (qz_defaults, a jsr at 0x40025ac2 in 0x40025848: a cold boot, a
boot with no project, the loader before its storing pass, a new project).
The synth engine reads GLIDE at the same address (GLIDE_AT).

THE KNOB. 0x40055008(slot, delta) resolves the Part byte, calls the slot's
own handler (PTCH: 0x40032d08, a fractional accumulator), clamps to the
descriptor's [min, min+count-1] and stores at 0x40055170 -- the hook. A
turn with a [TRIG] key held never reaches it: the p-lock editor (the store
at 0x40050e60, found with ot_emu's watchmem) starts from the step's lock
byte, or the Part's value when there is none, and writes the lock and its
SRAM mirror; it is hooked the same way, with the same rule. With
a scale on, for slot A of a kind-0 (PLAYBACK) page whose slot A is named
"PTCH" (STATIC 0x400d301c, FLEX 0x400d31ae, PICKUP 0x400d3664; THRU and
NEIGHBOR have no PTCH), the stored value is recomputed from the value the
knob was turned from: |delta| steps to the next raw on a scale semitone
(raw = 64 + 5 * semitones, 4..124; a value between degrees -- set with the
scale off, or a fraction -- snaps to the nearest degree in the turn
direction), unchanged at the ends, which is the stock clamp. The screen,
the SRAM mirror, a held trig's lock (0x40042158) and the MIDI CC echo all
take the stored value after the hook. RATE (slot D) is a playback rate
(-63..+63 per the manual, 0 = stopped, negative = backwards), not a
semitone quantity, and is left alone.

CHROMATIC. 0x4004fb94(track, key index 0..24, press) turns the index into
the raw pitch at 0x4004fc58 (an address computation, 5*idx + 4, root =
index 12 = TRIG 13), writes it as the lock byte 0x46c7dfda + t*32, trigs the
voice (0x40005030 / 0x46c80354) and, in LIVE RECORDING or with a trig held,
records it as the trig's PTCH lock (0x40042158 with a2). The detour snaps
the index before the lea. The MIDI note the key sends stays the key's own
(it is matched on release).

GLIDE (24 Sep 2026). A fifth SEQUENCER row, GLIDE: OFF / 1..127, the synth
machine's glide time (modules/synth/synth.s slews a synth voice's PTCH word
toward its target with a first-order lag, 10 ms at 1 .. 1 s at 127), saved
as "#SYNTH_GLIDE=n" after the SCALE line by the same writer and loader
detours (a storing load starts from OFF). The byte, qz_glide, is a battery
RAM byte at GLIDE_AT (see PERSISTENCE) because the synth engine reads it as
an absolute too; this unit reaches it through one accessor (qz_glide_of).
THE LEG GATE (2 Oct 2026): what a CHROMATIC key pressed while another key of
the track is held does is the synth track's LEG setting -- OFF / MONO / POLY
on the AMP SETUP page's sixth box, a Part byte saved with the project
(modules/synth) -- read through the engine's po_legmode (its pointer block,
-24 of sy_render; qz_legmode). Two jmp detours in the key handler 0x4004fb94
(qz_leg1 at 0x4004fbfe, qz_leg2 at 0x4004fc94): mono legato (VOIC 1, LEG
MONO or POLY) takes the stock's FUNC + key trigless path -- no voice
restart, no envelope retrigger, the pitch changes and glides over GLIDE --
suppresses the old key's voice note-off (its MIDI note-off still goes out)
and makes the new key the held key: releasing the first key does nothing,
releasing the last releases the note (the 303 rule); LEG OFF, FUNC held, a
release or nothing held: stock, byte for byte, and a sample track is stock
(until 2 Oct 2026 GLIDE != 0 was the legato switch, on any audio track;
GLIDE is the slide time only now).

PARAPHONIC KEYS (24 Sep 2026). On a FLEX track whose assigned slot holds a
SYNTH* sample (2.15: a track with FM SYNTH chosen in the machine list; the
marker selects nothing) and whose Part's VOIC byte (the synth's LFO page slot 2, 2..4
= paraphonic, modules/synth/poly.s) says so, the CHROMATIC keys are
polyphonic: a third detour on the handler's release path (qz_leg0,
0x4004fbde) and the two legato detours keep a per-track held-key mask and
post each key for the engine (keys.s, pinned at KEYS_AT: qz_pkey, qz_pmask);
a press ends nothing, a release ends only its own key, the last release
takes the stock note-off path. With LEG POLY the keys are legato here too
(paraphonic legato): the key joins the held set, the engine is told through
po_legkey (the block's -28) and the trigless path follows -- the sounding
chord slides to the key's voicing, "----" the newest voice (poly.s
po_handover); VOIC 1 and every other track are stock. A fourth detour,
qz_leg3 at 0x4004fce0, makes the LIVE RECORDER record a legato press (mono
or paraphonic) as a
trigless trig with its PTCH lock, as FUNC + key does, so playback slides
too (the OCTATRICK6 report); everything else records as stock. A fifth,
qz_leg4 at 0x4004fd06, notes the step a press recorded and the engine's tick
count; the key's release (or the stock note-off that ends it) writes the
played length as the step's HOLD lock through the stock writer 0x40042158
(flat slot 13), a legato chain getting its whole length on every step (the
OCTATRICK7 report). The synth
snaps chord notes onto SCALE through qz_scale_mask, reached by the six-byte
trampoline scale.s pinned at SCALE_AT.

THE TUNING SYSTEM (27 Sep 2026, synth tracks only; modules/synth gives the
synth page's PTCH the range -64..+63 at one raw unit a semitone and turns
RATE into FINE). This unit follows: qz_quant steps PTCH by scale degree over
raw = 64 + semitones on a synth track (qz_pcof), qz_chrom turns a key into
raw = 64 + (key - 12) + 12 * octave with the octave qz_oct, -4..+4, stepped
by FUNC + LEFT / RIGHT (qz_octkey at 0x40045918) while stock's 0/1 octave
word is held at 0 on such a track (qz_keyidx at the handler's caller
0x40050254, qz_octdraw in the drawer 0x40044968) and the number beside the
keyboard prints qz_oct (qz_octnum, 0x400449be since 2.13, stock's "%d"). MIDI IN on
a synth track is modules/synth's (30 Sep 2026: its po_mon at the block's
START 0x4000e746 replaced this module's qz_midi at 0x4000e74c). Sample tracks: the displaced
instructions, byte for byte.

Verified in ot_emu through the virtual panel (README);
flashed as OCTATRICK9 on an MKI, 26 Sep 2026 (emulator-verified since).
"""

import importlib.util
import os

from remix.schema import Detour, Kind, Linked, Module, Poke, TableGrow

# This module's own directory, relative to the build's cwd (octabam's repo
# root): "modules/quantizer" when the module is checked out directly, and
# "modules/quantizer/upstream/quantizer" when it is octabam's submodule of
# timhastie/octatrick-modules. Every source path below is built from it,
# so one manifest serves both layouts.
_HERE = os.path.relpath(os.path.dirname(os.path.realpath(__file__)))
# Read every detour guard and poke expectation from the build's MAIN OS section.
# The hook notes describe the guarded operations in words; stock_guard.py is the
# same local reader used by the synth module. No stock bytes are embedded here.
_guard_spec = importlib.util.spec_from_file_location("qz_stock_guard", os.path.join(_HERE, "stock_guard.py"))
_guard_module = importlib.util.module_from_spec(_guard_spec)
_guard_spec.loader.exec_module(_guard_module)
stock_guard = _guard_module.stock_guard

# Only the authored replacement uses H; stock expectations use stock_guard.
H = bytes.fromhex

# The SCALE, GLIDE and ROOT bytes: battery-backed RAM (core.s NV_SCALE /
# NV_GLIDE / NV_ROOT, see the docstring's PERSISTENCE). modules/synth/{synth,
# poly}.s read GLIDE as GLIDE_AT -- keep the constants equal.
SCALE_NV = 0x100b14ec
GLIDE_AT = 0x100b14ed
ROOT_NV = 0x100b14ee
# (2.15) the MIDI tracks whose scale is OFF, one bit a track (core.s / quantizer.s NV_MOFF).
MOFF_NV = 0x100b14ef
# (2.19) the audio tracks whose scale is OFF, one bit a track (core.s / quantizer.s NV_AOFF):
# the padding byte below SCALE (no reference to 0x100b14e2..ef in the OS).
AOFF_NV = 0x100b14eb
# The paraphonic key mailbox's fixed address (keys.s): 40 bytes above the GLIDE
# byte, below the synth page cave's end (0x400d2c6c). modules/synth/poly.s
# reads it as KEYS_AT -- keep the two constants equal.
KEYS_AT = 0x400d2cb0
# The SCALE accessor's trampoline (scale.s, `jmp qz_scale_mask`, core.s): 6
# bytes under the mailbox; modules/synth/poly.s calls it as SCALE_AT, and so
# does the DRAM unit quantizer.s for every snap (one ROOT-rotated mask).
SCALE_AT = 0x400d2ca8

def _qz_include(modules):
    """quantizer.s's two-pass remix.inc: HAVE_SYDRUM, 1 when SY DRUM is in the remix -- its
    signature "SY", 1 counts as a synth track (semitone PTCH, the keys, MIDI), mono (VOIC is
    FM's), and its legato keys reach the engine. The panel transaction is enabled only
    with both matching modules selected; the second pass supplies its adapter source."""
    flags = (f".set HAVE_SYDRUM, {int('SY DRUM' in modules)}\n"
             f".set HAVE_PANEL_TRANSACTION, {int('SYNTH MACHINE' in modules and 'SCALE QUANTIZER' in modules)}\n")
    with open(os.path.join(_HERE, "panel_transaction.inc.s"), encoding="utf-8") as source:
        transaction = source.read()
    return "\n".join((".ifndef QZ_PASS1", ".set QZ_PASS1, 1", flags,
                      ".else", transaction, ".endif", ""))


MODULE = Module(
    name="quantizer",
    key="SCALE QUANTIZER",
    kind=Kind.CF_PATCH,
    doc="PROJECT > CONTROL > SEQUENCER > SCALE: the PTCH knob and CHROMATIC "
        "trig keys quantize to a scale (24 scales, OFF = stock); > ROOT: the note "
        "the scale is built on (C..B; key 1 of the CHROMATIC keyboard sounds it); > GLIDE: the "
        "synth's glide time (OFF, 1..127; the legato switch is the synth track's LEG setting); "
        "polyphonic chromatic keys on a synth track whose VOIC is 2..4; on a synth track "
        "PTCH is semitones (-64..+63) and the CHROMATIC octave runs -4..+4; on a MIDI track "
        "(2.13) the NOTE knob, NOTE locks and the CHROMATIC keys follow the scale and root; "
        "(2.15) so does what it plays -- chords, TRAN, the arpeggiator; (2.19) what an audio track plays follows the scale "
        "(STATIC / FLEX / FM SYNTH / SY DRUM: PTCH as the trig resolves it); > TRACK picks a track (AUDIO 1..8, "
        "MIDI 1..8) and > FOLLOW takes it out of the scale (OFF = stock) (2.22: two rows where 2.15 / 2.19 had "
        "MIDI 1..8 SCALE and AUDIO 1..8 SCALE).",
    linked=(                                   # ROM link order: qzs names core.s's qz_scale_mask
        Linked("qzk", os.path.join(_HERE, "keys.s"), cpu="5475", cave_addr=KEYS_AT),
        Linked("qzc", os.path.join(_HERE, "core.s"), cpu="5475"),
        Linked("qzs", os.path.join(_HERE, "scale.s"), cpu="5475", cave_addr=SCALE_AT),
        # the DRAM unit: the platform runtime (KEYS_AT / SCALE_AT reached as fixed addresses)
        Linked("qz", os.path.join(_HERE, "quantizer.s"), cpu="5475", dram=True, include=_qz_include),
    ),
    detours=(
        Detour(0x4004fc84, stock_guard(0x4004fc84, 16), "qz", "qz_panel_stage",
               "chromatic pitch staging: keep an FM panel publication private until its command is validated",
               kind="jmp", pad_to=16),
        Detour(0x40005162, stock_guard(0x40005162, 8), "qz", "qz_panel_commit",
               "validated command store: publish the panel pitch, identity and command together",
               kind="jmp", pad_to=8),
        Detour(0x40055170, stock_guard(0x40055170, 6), "qz", "qz_knob",
               "knob handler 0x40055008: the store -- PTCH steps by scale degree",
               kind="jsr"),
        Detour(0x40050e60, stock_guard(0x40050e60, 10), "qz", "qz_plock",
               "p-lock editor (TRIG held): the lock store -- PTCH steps by scale degree",
               kind="jsr", pad_to=10),
        Detour(0x40055382, stock_guard(0x40055382, 8), "qz", "qz_mknob",
               "knob handler, the MIDI tracks' branch: the clamp to the max just before the store 0x4005538a -- a MIDI "
               "track's NOTE steps by scale degree from ROOT (2.13; not with its MIDI n SCALE OFF, 2.15); the store stays stock, so MIDI SCENES' detour there composes",
               kind="jsr", pad_to=8),
        Detour(0x40050b98, stock_guard(0x40050b98, 10), "qz", "qz_mplock",
               "MIDI p-lock editor (TRIG held): the lock store -- a NOTE lock steps by scale degree from ROOT (2.13; not with the track's MIDI n SCALE OFF, 2.15)",
               kind="jsr", pad_to=10),
        Detour(0x400436a8, stock_guard(0x400436a8, 10), "qz", "qz_mkey",
               "MIDI track CHROMATIC key press: the note + ROOT snapped to the nearest scale note (key 1 sounds the root); the note-on, the arp, the held note (so the note-off) and the recorder take it (2.13; not with the track's MIDI n SCALE OFF, 2.15)",
               kind="jmp", pad_to=10),
        Detour(0x4009fb80, stock_guard(0x4009fb80, 6), "qz", "qz_mnote",
               "the sequencer's MIDI note stage, after TRAN and ARP SETUP KEY, before the active-note test: a note of a "
               "following MIDI track snapped to the nearest scale note -- chords, TRAN, the arpeggiator; the note-on and "
               "its stored note-off carry it (2.15)",
               kind="jmp"),
        Detour(0x4000c614, stock_guard(0x4000c614, 6), "qz", "qz_atrig",
               "the frame builder's trig path, after a trig's locks are applied: with a scale on and the track's AUDIO n "
               "SCALE ON, a STATIC / FLEX track's PTCH as the trig resolved it (lock or Part) snapped to the nearest degree "
               "and applied as a lock of that value is (2.19)",
               kind="jmp"),
        Detour(0x400439d6, stock_guard(0x400439d6, 8), "qz", "qz_mprev",
               "GRID RECORDING, a held [TRIG] key's chord preview on a MIDI track: its four notes snapped, press and "
               "release alike (2.15)",
               kind="jmp", pad_to=8),
        Detour(0x4004fc58, stock_guard(0x4004fc58, 10), "qz", "qz_chrom",
               "CHROMATIC trig key -> pitch: transpose the key index by ROOT (a sample track: within -12..+12 st, the other position an octave below for ROOT G..B) and snap it to the scale",
               kind="jsr", pad_to=10),
        Detour(0x4004fbde, stock_guard(0x4004fbde, 6), "qz", "qz_leg0",
               "CHROMATIC key release on a paraphonic synth track (VOIC 2..4): the held-key mask decides the note-off",
               kind="jmp"),
        Detour(0x4004fbfe, stock_guard(0x4004fbfe, 8), "qz", "qz_leg1",
               "CHROMATIC key held + a new key: the LEG gate (the engine's po_legmode) -- mono legato keeps the held key with no voice note-off, paraphonic ends nothing, LEG OFF ends the note as stock",
               kind="jmp", pad_to=8),
        Detour(0x4004fc94, stock_guard(0x4004fc94, 8), "qz", "qz_leg2",
               "CHROMATIC key: mono legato = the trigless trig, the new key becomes the held key; paraphonic = a fresh voice, the key posted for the engine; paraphonic legato (LEG POLY) = the key joins the held set, po_legkey, the trigless trig",
               kind="jmp", pad_to=8),
        Detour(0x4004fce0, stock_guard(0x4004fce0, 8), "qz", "qz_leg3",
               "CHROMATIC key -> the live recorder: a legato press records a trigless trig, as FUNC + key does",
               kind="jmp", pad_to=8),
        Detour(0x4004fd06, stock_guard(0x4004fd06, 6), "qz", "qz_leg4",
               "CHROMATIC key recorded: note the step and the time; the release writes the note length as the HOLD lock",
               kind="jmp"),
        Detour(0x4004fd20, stock_guard(0x4004fd20, 6), "qz", "qz_leg5",
               "CHROMATIC key recorded, after its PTCH lock: the synth engine's po_keyrec recognises a fingered chord (PTCH root, CHRD, VOIC locks on the first key's step)",
               kind="jmp"),
        Detour(0x40050254, stock_guard(0x40050254, 8), "qz", "qz_keyidx",
               "CHROMATIC key -> index: a synth track's index is the key itself (the octave is qz_oct)",
               kind="jmp", pad_to=8),
        Detour(0x40045918, stock_guard(0x40045918, 8), "qz", "qz_octkey",
               "FUNC + LEFT/RIGHT in CHROMATIC mode: a synth track's octave steps -4..+4 (qz_oct), stock's word stays 0",
               kind="jmp", pad_to=8),
        Detour(0x40044968, stock_guard(0x40044968, 8), "qz", "qz_octdraw",
               "CHROMATIC drawer: a synth track draws the keyboard at stock octave 0 (the word is cleared)",
               kind="jmp", pad_to=8),
        Detour(0x400449be, stock_guard(0x400449be, 8), "qz", "qz_octnum",
               "CHROMATIC drawer, the common push of the octave number both branches reach (2.13, Modwerk #264: the MIDI branch "
               "jumps here, so the push is never skipped): a MIDI track keeps stock's number, a synth track prints qz_oct, a sample "
               "track the position 0 / 1 / -1, with ROOT's name before it when a scale is on",
               kind="jmp", pad_to=8),
        Detour(0x40044abc, stock_guard(0x40044abc, 8), "qz", "qz_heldmark",
               "CHROMATIC drawer, an audio track's held-key mark (the byte load and the octave word load): with a scale on "
               "the mark goes on the note the key sounds (qz_chrom's rule), not the physical key (2.18)",
               kind="jmp", pad_to=8),
        Detour(0x40065bca, stock_guard(0x40065bca, 6), "qz", "qz_draw",
               "SEQUENCER window draw loop: index the row tables from the scroll offset",
               kind="jmp"),
        Detour(0x400866cc, stock_guard(0x400866cc, 8), "qz", "qz_ld_entry",
               "project loader entry: a storing load starts from SCALE = OFF, ROOT = C, GLIDE = OFF, every MIDI track following (2.15)",
               kind="jmp", pad_to=8),
        Detour(0x400867a2, stock_guard(0x400867a2, 8), "qz", "qz_ld_line",
               "project loader '#' line: read #SEQUENCER_SCALE=n / #SEQUENCER_ROOT=n / #SYNTH_GLIDE=n / #SEQUENCER_MIDI_SCALE_OFF=n (2.15)",
               kind="jmp", pad_to=8),
        Detour(0x400888aa, stock_guard(0x400888aa, 8), "qz", "qz_wr",
               "project writer: #SEQUENCER_SCALE=n, #SEQUENCER_ROOT=n, #SYNTH_GLIDE=n, #SEQUENCER_MIDI_SCALE_OFF=n (2.15) after PATTERN_CHANGE_CHAIN_BEHAVIOR",
               kind="jmp", pad_to=8),
        Detour(0x40010212, stock_guard(0x40010212, 6), "qzc", "qz_boot",
               "boot: stock's sanitiser of the battery-RAM settings block -- SCALE/GLIDE/ROOT out of range -> OFF / C (core.s, ROM)",
               kind="jsr"),
        Detour(0x40025ac2, stock_guard(0x40025ac2, 6), "qzc", "qz_defaults",
               "project defaults (cold boot, no project, before a load, new project): SCALE/GLIDE := OFF, ROOT := C, every MIDI track following (core.s, ROM)",
               kind="jsr"),
    ),
    tables=(
        # (2.22) rows 4..8: SCALE, ROOT, GLIDE, TRACK, FOLLOW (TRACK picks the audio or MIDI track
        # whose switch FOLLOW shows; the sixteen MIDI / AUDIO n SCALE rows of 2.15 / 2.19 are gone)
        TableGrow("SEQUENCER labels", old=0x400b27d0, count=3,
                  symbols=(("qz", "qz_lbl_scale"), ("qz", "qz_lbl_root"), ("qz", "qz_lbl_glide"),
                           ("qz", "qz_lbl_trk"), ("qz", "qz_lbl_fol")),
                  refs=((0x40065bd8, 0x400b27d0),)),
        TableGrow("SEQUENCER getters", old=0x400b27dc, count=3,
                  symbols=(("qz", "qz_get"), ("qz", "qz_get_root"), ("qz", "qz_get_glide"),
                           ("qz", "qz_get_trk"), ("qz", "qz_get_fol")),
                  refs=((0x40065bde, 0x400b27dc),)),
        TableGrow("SEQUENCER setters", old=0x400b282c, count=3,
                  symbols=(("qz", "qz_set"), ("qz", "qz_set_root"), ("qz", "qz_set_glide"),
                           ("qz", "qz_set_trk"), ("qz", "qz_set_fol")),
                  refs=((0x40065cc4, 0x400b282c), (0x40065d3e, 0x400b282c),
                        (0x40065d58, 0x400b282c), (0x40065d72, 0x400b282c))),
    ),
    pokes=(
        Poke(0x40065c7c, expect=stock_guard(0x40065c7c, 4), write=H("48780008"),
             note="SEQUENCER window: 3 -> 8 rows (SCALE, ROOT, GLIDE, TRACK, FOLLOW (2.22); 3 visible, scrolls)"),
    ),
)
