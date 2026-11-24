/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Linked voices (OS 1.17): a lead track plays its notes on the tracks after it.
 *
 * SETTINGS > VOICES sets how many tracks, from the active track on, play the active track's notes: 1 (stock) to 8.
 * Every note the stock OS plays reaches the frame interrupt as a 0x6c-byte note record on the scheduler's list:
 * sequencer trigs, the keyboard and MIDI alike. The base looks at each record as the frame takes it
 * (core_voice_event_entry, at 0x4002dff4) and moves a lead's note-on to the next free track of its group, and a
 * note-off to the track that holds that note. The record already names the lead's sound (+0x3c, or a sound lock's),
 * so the voice track plays the lead's sound with that trig's own locks.
 *
 * While linked, a voice track belongs to its lead: its sound in the kit is a copy of the lead's (machine, filter, amp,
 * effects, everything), kept up to date each frame and saved with the kit, and it plays the notes its lead sends,
 * always with the lead's machine (machine-frame.c sends the sound chip the lead's type for it). Its own steps play
 * too, so chords recorded across the group play back as recorded with the lead's sound; its own key presses go to no
 * track. It keeps the copied sound once VOICES puts it back on its own. (Pointing a step's note record at the lead's
 * sound instead was tried: part of a note's settings come from its own track, so it played louder and unfiltered.)
 *
 * Notes from the keys and MIDI fill the group from the lead up (the first note on the lead, the next on the next
 * track), whatever the pattern plays there; the pattern's notes of the lead play on the lead, or, while it holds a
 * note, on a voice track with no steps of its own, so they never land on recorded chord notes.
 *
 * Live recording: the sequencer's live-record routine (0x40048fb2, core_voice_record_entry) records a lead's note
 * from the keys or MIDI on the track that will play it, so each note of a chord lands as an ordinary step on its own
 * track (editable afterwards like any step). The routine runs before the frame plays the note, so it picks the track
 * and leaves a pending entry; the frame then sends that note to the same track.
 *
 * Record fields used (read from the sequencer's constructor at 0x400d6d24 and the frame's note handling from
 * 0x4002e1b2): +0x00 kind (0 and 1 take the note path), +0x04 1 for a note-on, +0x10 the track, +0x14 the note's
 * source (1 for the sequencer), +0x1c/+0x20 the trig's lock rows and row index, +0x24 the record's own row,
 * +0x2c the pattern track. Stock keeps, per track, the source and pitch of the note it holds (0x47db4310 and
 * 0x47db4560); a note-off ends the note only where both match, so the base sends it to that track.
 *
 * Knob turns on the lead reach its voices: once a frame, before the transfer, the base compares the lead's 71
 * parameter targets (int16 from 0x80003362, 142 bytes a track, which the stock smoother at 0x400d9406 follows) with
 * the last frame's and copies the values that changed to each voice track. A frame in which a sequencer note started
 * on the lead itself only takes the lead's new values (its trig locks) without copying them, and each frame one voice
 * track holding no note is copied from the lead in full.
 *
 * The setting is the project's (core_project_archive, tag VOC1), saved with the project and reset by a project
 * saved without it. With every track at 1 nothing here changes a note. Emulator-checked only; see VOICES.md.
 */
#include <stdint.h>
#include "mk2/core.h"
#include "project-archive.h"

enum {
    TRACKS = 16,
    MAX_VOICES = 8,
    VALUES = 71,
    PATTERN_TRACK_VIEW = 0x30,
    NONE = 0xff,
    SEQUENCER = 1,           /* a record's source (+0x14) for the sequencer's notes */
    SOUND_STRIDE = 0x450,
    SOUND_WORDS = SOUND_STRIDE / 4,
    PENDING = 8,             /* recorded notes the frame has not played yet */
    PENDING_FRAMES = 64,     /* after which a pending entry is dropped (the frame plays it within a few) */
    FRESH_FRAMES = 64,       /* how long a note the frame played first waits for live recording */
    SOUND_SLICES = 6,        /* the idle copy compares a voice's sound with the lead's a sixth at a time */
    SLICE_WORDS = SOUND_WORDS / SOUND_SLICES,
    TRACK_STRIDE = 0x6a5,    /* a pattern's track data; its step words first, two bytes a step */
    STEPS = 128,
    TRACK_SETTINGS = 0x480,  /* a pattern track's settings after its steps */
    TRACK_SETTINGS_BYTES = 16,
};

#define KIT_SOUNDS 0x426532ecu /* the kit's track sounds (a record's +0x3c without a sound lock), SOUND_STRIDE apart */
#define CURRENT_PATTERN (*(const volatile uint32_t *)0x4316501cu)

#define TARGETS ((volatile int16_t *)0x80003362u)          /* track t's value j at [VALUES * t + j] */
#define NOTE_SOURCE ((const volatile uint32_t *)0x47db4310u) /* the source of the note each track holds, 0 none */
#define NOTE_PITCH ((const volatile int32_t *)0x47db4560u)   /* its pitch, -1 none */
#define MUTES (*(const volatile uint32_t *)0x8000467cu)
#define MUTES_OVERRIDE (*(const volatile uint32_t *)0x80004680u) /* nonzero: the inverse of the mutes in force */

static uint8_t voices[TRACKS];      /* the project's setting, 0 or 1 for a track that plays only its own notes */
static uint8_t lead_of[TRACKS];     /* each track's lead, NONE outside a group */
static uint8_t next_voice[TRACKS];  /* per lead: where the search for a free voice starts */
static uint8_t sync_next[TRACKS];   /* per lead: the voice track the idle copy looks at next */
static uint8_t sync_slice[TRACKS];  /* per lead: the part of the sound the idle copy compares */
static volatile uint16_t absorb;    /* leads whose own note set its targets this frame */
static volatile uint16_t leads;     /* leads with a group; written last by regroup */
static int16_t last[TRACKS][VALUES];

/* A note the live-record routine put on a track of its group, for the frame to play there. The task writes an entry
 * and sets `used` last; the frame interrupt clears it when it plays the note or the entry ages out. */
static struct {
    volatile uint8_t used;
    uint8_t lead;
    uint8_t track;
    int8_t pitch;
    uint16_t age;
} pending[PENDING];

/* Per track: a note from the keys or MIDI the frame put there without a pending entry, so before live recording saw
 * it (on a unit with the pattern running the frame can come first). Its recording then lands on this track. The frame
 * interrupt writes it; the task clears it when it records the note. */
static struct {
    volatile uint8_t age;    /* frames since the note started, 0 for none */
    int8_t pitch;
} fresh[TRACKS];

static int reserved(unsigned int track)
{
    for (unsigned int k = 0; k < PENDING; ++k) {
        if (pending[k].used && pending[k].track == track) {
            return 1;
        }
    }
    return 0;
}

/* Words `first` to `end` of a track's sound in the kit made a copy of another's, a word at a time and only where they
 * differ. Its own function, indexed, so the compiler does not reuse a post-incremented address register in one
 * instruction (sdk/runtime/m68k_codegen.py refuses that). */
static __attribute__((noinline)) void copy_sound(unsigned int to, unsigned int from, unsigned int first,
                                                 unsigned int end)
{
    volatile uint32_t *const d = (volatile uint32_t *)(KIT_SOUNDS + SOUND_STRIDE * to);
    const volatile uint32_t *const s = (const volatile uint32_t *)(KIT_SOUNDS + SOUND_STRIDE * from);
    for (unsigned int k = first; k < end; ++k) {
        const uint32_t w = s[k];
        if (d[k] != w) {
            d[k] = w;
        }
    }
}

/* A track's settings in the current pattern made the lead's: the TRIG page defaults its steps fall back on (the note
 * record's constructor at 0x400d6d24 reads them from +0x480 to +0x48b when a step sets no value of its own), then its
 * length, swing and speed (+0x48c to +0x48f), so the voice's own steps play as the lead's would and stay in time with
 * them. Without this a recorded chord note on a voice track took that track's own defaults (emulator: 9 dB louder and
 * no envelope). */
static void copy_track_settings(unsigned int to, unsigned int from)
{
    const uint32_t pattern = CURRENT_PATTERN;
    if (!pattern) {
        return;
    }
    volatile uint8_t *const d = (volatile uint8_t *)(pattern + TRACK_STRIDE * to + TRACK_SETTINGS);
    const volatile uint8_t *const s = (const volatile uint8_t *)(pattern + TRACK_STRIDE * from + TRACK_SETTINGS);
    for (unsigned int k = 0; k < TRACK_SETTINGS_BYTES; ++k) {
        const uint8_t b = s[k];
        if (d[k] != b) {
            d[k] = b;
        }
    }
}

/* Whether a track has steps of its own in the current pattern (a trig on any step). */
static int has_steps(unsigned int track)
{
    const uint32_t pattern = CURRENT_PATTERN;
    if (!pattern) {
        return 0;
    }
    const volatile uint8_t *const trigs = (const volatile uint8_t *)(pattern + TRACK_STRIDE * track);
    for (unsigned int s = 0; s < STEPS; ++s) {
        if (trigs[2 * s + 1] & 5u) {
            return 1;
        }
    }
    return 0;
}

static void regroup(void)
{
    uint16_t found = 0;
    /* The frame interrupt reads the groups: route nothing while they change (the menu and a project load run in
     * tasks), and publish the leads last. */
    leads = 0;
    for (unsigned int t = 0; t < TRACKS; ++t) {
        lead_of[t] = NONE;
    }
    /* A track that is already another lead's voice leads nothing; a group ends at track 16. */
    for (unsigned int lead = 0; lead < TRACKS; ++lead) {
        const unsigned int count = voices[lead];
        if (count < 2 || lead_of[lead] != NONE) {
            continue;
        }
        unsigned int t = lead;
        for (; t < TRACKS && t < lead + count && lead_of[t] == NONE; ++t) {
            lead_of[t] = (uint8_t)lead;
        }
        if (t - lead < 2) {
            lead_of[lead] = NONE;
            continue;
        }
        found |= (uint16_t)(1u << lead);
        next_voice[lead] = (uint8_t)lead;
        /* The voices start as exact copies of the lead, their sounds in the kit and their parameter targets (every
         * parameter, its sample slot included), so each note of a chord sounds alike whichever track plays it; later
         * turns on the lead follow in core_voice_frame. */
        for (unsigned int v = lead + 1; v < t; ++v) {
            copy_sound(v, lead, 0, SOUND_WORDS);
            copy_track_settings(v, lead);
        }
        for (unsigned int j = 0; j < VALUES; ++j) {
            const int16_t value = TARGETS[VALUES * lead + j];
            last[lead][j] = value;
            for (unsigned int v = lead + 1; v < t; ++v) {
                TARGETS[VALUES * v + j] = value;
            }
        }
    }
    leads = found;
}

static unsigned int group_size(unsigned int lead)
{
    unsigned int size = 0;
    while (lead + size < TRACKS && lead_of[lead + size] == lead) {
        ++size;
    }
    return size;
}

/* The track a note-on of `lead` from the keys or MIDI goes to: the first track of the group from the lead on that holds
 * no note from the keys or MIDI (a pattern note there gives way), is not taken by a note just recorded and is not
 * muted, so the lead takes the first note of a chord (the trig keys and most MIDI senders send a chord's notes from the
 * lowest up) and each next track the next; with every track busy, the next one in turn that is not muted, which ends
 * its note as stock ends a track's note for a new one. */
static unsigned int pick(unsigned int lead, uint32_t mutes)
{
    const unsigned int size = group_size(lead);
    for (unsigned int t = lead; t < lead + size; ++t) {
        const uint32_t held = NOTE_SOURCE[t];
        if (!((mutes >> t) & 1u) && (!held || held == SEQUENCER) && !reserved(t)) {
            return t;
        }
    }
    const unsigned int start = next_voice[lead] - lead;
    for (unsigned int k = 0; k < size; ++k) {
        const unsigned int t = lead + (start + k) % size;
        if (!((mutes >> t) & 1u)) {
            next_voice[lead] = (uint8_t)(lead + ((t - lead + 1u) % size));
            return t;
        }
    }
    return lead;
}

/* The track a pattern note of `lead` goes to: the lead, or, while the lead holds a note, the first free voice track
 * with no steps of its own (recorded chord notes there keep their track to themselves), so a long note rings on; with
 * none, the lead, which ends its note as stock does. */
static unsigned int pick_pattern(unsigned int lead, uint32_t mutes)
{
    if (!NOTE_SOURCE[lead]) {
        return lead;
    }
    const unsigned int size = group_size(lead);
    for (unsigned int t = lead + 1; t < lead + size; ++t) {
        if (!((mutes >> t) & 1u) && !NOTE_SOURCE[t] && !reserved(t) && !has_steps(t)) {
            return t;
        }
    }
    return lead;
}

/* The pitch a record's note-off names, read as the frame's note-off path compares it with the held pitch
 * (0x4002e670): byte 2 of the trig's lock row, or of the record's own row (+0x24) when it has none. */
static int32_t record_pitch(const uint8_t *record)
{
    const int32_t row = *(const int32_t *)(record + 0x20);
    const uint8_t *lock = row >= 0 ? *(const uint8_t *const *)(record + 0x1c) + 6 * row : record + 0x24;
    return (int8_t)lock[2];
}

void core_voice_event(uint8_t *record)
{
    if (!leads || *(const uint32_t *)record > 1u) {
        return;
    }
    const uint32_t lead = *(const uint32_t *)(record + 0x10);
    if (lead >= TRACKS) {
        return;
    }
    if (!((leads >> lead) & 1u)) {
        if (lead_of[lead] == NONE) {
            return;
        }
        /* A linked voice track's own steps (chord notes recorded there) play as they are: its sound is the lead's
         * copy. Its own key presses go to no track (16). */
        if (*(const uint32_t *)(record + 0x14) != SEQUENCER) {
            *(uint32_t *)(record + 0x10) = TRACKS;
        }
        return;
    }
    const uint32_t mutes = MUTES_OVERRIDE ? ~MUTES_OVERRIDE : MUTES;
    if ((mutes >> lead) & 1u) {
        return; /* a muted lead stays muted: stock drops the note */
    }
    unsigned int to = lead;
    if (*(const uint32_t *)(record + 4) == 1u) {
        /* The keys play one note at a time: letting go of a key while another is held sends the held note again.
         * In a group that note is still ringing on its own track, so a note-on from the keys or MIDI (any source but
         * the sequencer, whose repeated notes should ring over) for a pitch a track of the group holds goes nowhere. */
        const uint32_t source = *(const uint32_t *)(record + 0x14);
        to = NONE;
        if (source != SEQUENCER) {
            const int32_t pitch = record_pitch(record);
            for (unsigned int t = lead; t < TRACKS && lead_of[t] == lead; ++t) {
                if (NOTE_SOURCE[t] == source && NOTE_PITCH[t] == pitch) {
                    *(uint32_t *)(record + 0x10) = TRACKS;
                    return;
                }
            }
            /* A note live recording has just put on a track of the group plays on that track. */
            for (unsigned int k = 0; k < PENDING; ++k) {
                if (pending[k].used && pending[k].lead == lead && pending[k].pitch == pitch) {
                    to = pending[k].track;
                    pending[k].used = 0;
                    break;
                }
            }
            if (to == NONE) {
                /* Not recorded yet: if live recording sees it later, it records it on the track it plays on. */
                to = pick(lead, mutes);
                fresh[to].pitch = (int8_t)pitch;
                fresh[to].age = 1;
            }
        }
        if (to == NONE) {
            to = pick_pattern(lead, mutes);
        }
    } else {
        const uint32_t source = *(const uint32_t *)(record + 0x14);
        const int32_t pitch = record_pitch(record);
        for (unsigned int t = lead; t < TRACKS && lead_of[t] == lead; ++t) {
            if (NOTE_SOURCE[t] == source && NOTE_PITCH[t] == pitch) {
                to = t;
                break;
            }
        }
    }
    if (to == lead) {
        /* A sequencer note on the lead loads its trig locks into the lead's targets: take them without copying them
         * to the voices. A note from the keys or MIDI carries no locks, so a knob turned in the same frame still
         * reaches the voices. */
        if (*(const uint32_t *)(record + 4) == 1u && *(const uint32_t *)(record + 0x14) == SEQUENCER) {
            absorb |= (uint16_t)(1u << lead);
        }
    } else {
        *(uint32_t *)(record + 0x10) = to;
    }
}

/* Live recording of a lead's note (core_voice_record_entry, the live-record routine at 0x40048fb2): args points at
 * its arguments (sequencer, track, note, velocity, flag, step, ...). The note is recorded on the track of the group it
 * will play on, chosen as the frame will choose it, and a pending entry tells the frame so. A note the frame has
 * already played (a fresh entry) is recorded on the track playing it. Any other note the group already holds (the keys
 * sending a held note again) is not recorded (track 16: the routine returns at once). */
void core_voice_record(uint32_t *args)
{
    const uint32_t lead = args[1];
    if (!leads || lead >= TRACKS || !((leads >> lead) & 1u)) {
        return;
    }
    const int32_t pitch = (int32_t)args[2];
    for (unsigned int t = lead; t < TRACKS && lead_of[t] == lead; ++t) {
        if (fresh[t].age && fresh[t].pitch == pitch) {
            fresh[t].age = 0;
            args[1] = t;
            return;
        }
    }
    for (unsigned int t = lead; t < TRACKS && lead_of[t] == lead; ++t) {
        if (NOTE_SOURCE[t] && NOTE_SOURCE[t] != SEQUENCER && NOTE_PITCH[t] == pitch) {
            args[1] = TRACKS;
            return;
        }
    }
    unsigned int free = PENDING;
    for (unsigned int k = 0; k < PENDING; ++k) {
        if (!pending[k].used) {
            free = k;
        } else if (pending[k].lead == lead && pending[k].pitch == pitch) {
            args[1] = TRACKS; /* recorded already, not played yet */
            return;
        }
    }
    const uint32_t mutes = MUTES_OVERRIDE ? ~MUTES_OVERRIDE : MUTES;
    if ((mutes >> lead) & 1u) {
        return; /* a muted lead plays nothing: record as stock does */
    }
    const unsigned int to = pick(lead, mutes);
    args[1] = to;
    if (free < PENDING) {
        pending[free].lead = (uint8_t)lead;
        pending[free].track = (uint8_t)to;
        pending[free].pitch = (int8_t)pitch;
        pending[free].age = 0;
        pending[free].used = 1;
    }
}

/* A whole track's targets from a lead's last values, writing only those that differ. Its own function, indexed, so
 * the compiler does not reuse a post-incremented address register in one instruction (sdk/runtime/m68k_codegen.py
 * refuses that). */
static __attribute__((noinline)) void copy_values(volatile int16_t *to, const volatile int16_t *from)
{
    for (unsigned int j = 0; j < VALUES; ++j) {
        const int16_t value = from[j];
        if (to[j] != value) {
            to[j] = value;
        }
    }
}

void core_voice_frame(void)
{
    const uint16_t taken = absorb;
    absorb = 0;
    for (unsigned int k = 0; k < PENDING; ++k) {
        if (pending[k].used && ++pending[k].age > PENDING_FRAMES) {
            pending[k].used = 0;
        }
    }
    for (unsigned int t = 0; t < TRACKS; ++t) {
        if (fresh[t].age && ++fresh[t].age > FRESH_FRAMES) {
            fresh[t].age = 0;
        }
    }
    for (unsigned int lead = 0; lead < TRACKS; ++lead) {
        if (!((leads >> lead) & 1u)) {
            continue;
        }
        volatile int16_t *const from = TARGETS + VALUES * lead;
        if ((taken >> lead) & 1u) {
            for (unsigned int j = 0; j < VALUES; ++j) {
                last[lead][j] = from[j];
            }
        } else {
            for (unsigned int j = 0; j < VALUES; ++j) {
                const int16_t value = from[j];
                if (value == last[lead][j]) {
                    continue;
                }
                last[lead][j] = value;
                for (unsigned int t = lead + 1; t < TRACKS && lead_of[t] == lead; ++t) {
                    TARGETS[VALUES * t + j] = value;
                }
            }
        }
        /* A safety net: each frame one voice track of the group that holds no note becomes an exact copy of the lead
         * again, so the next note there starts from the lead's settings even if a change was missed. */
        unsigned int end = lead + 1;
        while (end < TRACKS && lead_of[end] == lead) {
            ++end;
        }
        unsigned int v = sync_next[lead];
        if (v <= lead || v >= end) {
            v = lead + 1;
        }
        unsigned int slice = sync_slice[lead];
        if (slice >= SOUND_SLICES) {
            slice = 0;
        }
        if (v + 1 < end) {
            sync_next[lead] = (uint8_t)(v + 1);
        } else {
            /* Every voice had this part of its sound compared: the next part from the first voice on. */
            sync_next[lead] = (uint8_t)(lead + 1);
            sync_slice[lead] = (uint8_t)((slice + 1) % SOUND_SLICES);
        }
        if (v < end) {
            /* The voice's sound in the kit and its pattern track's settings follow the lead's (its own steps load them
             * when they play). A sixth of the sound a frame, so a change reaches every voice within a few dozen
             * frames and the frame interrupt stays short. (On a unit with the whole sound compared every frame, page
             * changes on a linked track grew slow while the pattern ran; the cause is not yet confirmed.) */
            copy_sound(v, lead, SLICE_WORDS * slice, SLICE_WORDS * (slice + 1));
            copy_track_settings(v, lead);
            if (!NOTE_SOURCE[v]) {
                copy_values(TARGETS + VALUES * v, last[lead]);
            }
        }
    }
}

/* The track whose machine a track plays: its lead while it is linked, else itself (machine-frame.c sends that track's
 * machine type for the sound chip's player dispatch). */
unsigned int core_voice_lead(unsigned int track)
{
    return track < TRACKS && lead_of[track] != NONE ? lead_of[track] : track;
}

/* ---- SETTINGS > VOICES ------------------------------------------------------------------------------------------ */

static unsigned int active_track(void)
{
    const uint8_t *const ui = fw_pattern_ui;
    const unsigned int track = ui ? fw_track_at(ui + PATTERN_TRACK_VIEW) : TRACKS;
    return track < TRACKS ? track : 0;
}

static const char *const counts[MAX_VOICES] = { "1", "2", "3", "4", "5", "6", "7", "8" };
/* core_addvalue draws the value right-aligned at the row's x + 19, where PERSONALIZE leaves room for it. A SETTINGS
 * row has its icon there and the label after it (panel probe: the value landed on the label's second character), so
 * the label starts with spaces and the value takes the icon's place. */
#define LABEL_INDENT 3
static char label[16] = "   T1 VOICES";

static uint32_t get_voices(void)
{
    const unsigned int v = voices[active_track()];
    return v ? v - 1u : 0;
}

static void set_voices(uint32_t value)
{
    if (value < MAX_VOICES) {
        voices[active_track()] = (uint8_t)(value + 1u);
        regroup();
    }
}

static const core_value_t voices_row = { label, counts, MAX_VOICES, get_voices, set_voices };

void core_voice_settings(void *menu)
{
    const unsigned int track = active_track() + 1u;
    unsigned int i = LABEL_INDENT + 1u;
    if (track >= 10) {
        label[i++] = '1';
        label[i++] = (char)('0' + track - 10u);
    } else {
        label[i++] = (char)('0' + track);
    }
    const char *const rest = " VOICES";
    for (unsigned int k = 0; rest[k]; ++k) {
        label[i++] = rest[k];
    }
    label[i] = 0;
    core_addvalue(menu, &voices_row);
}

/* ---- the project's setting ---------------------------------------------------------------------------------------- */

static void save_voices(void *data)
{
    fw_memcpy(data, voices, sizeof voices);
}

static void load_voices(const void *data)
{
    for (unsigned int t = 0; t < TRACKS; ++t) {
        const uint8_t v = data ? ((const uint8_t *)data)[t] : 0;
        voices[t] = v <= MAX_VOICES ? v : 0;
    }
#ifdef MODWERK_VOICES_TEST
    voices[0] = MODWERK_VOICES_TEST; /* emulator test images only: track 1 leads from the first load */
#endif
    regroup();
}

const dt2_project_archive_t core_voice_archive = {
    UINT32_C(0x564f4331), sizeof voices, save_voices, load_voices, /* VOC1 */
};
