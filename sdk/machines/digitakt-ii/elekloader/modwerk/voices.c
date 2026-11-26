/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Linked voices (OS 1.17): a lead track plays its notes on the tracks after it.
 *
 * SETTINGS > VOICES sets how many tracks, from the active track on, play the active track's notes: 1 (stock) to 8.
 * Every note the stock OS plays reaches the frame interrupt as a 0x6c-byte note record on the scheduler's list:
 * sequencer trigs, the keyboard and MIDI alike. The base looks at each record as the frame takes it
 * (core_voice_event_entry, at 0x4002dff4) and moves a lead's note-on to the next free track of its group, and a
 * note-off to the track that holds that note. The record already names the lead's sound (+0x3c, or a sound lock's),
 * so the voice track plays the lead's sound with that trig's own locks; nothing in the kit changes.
 *
 * While linked, a voice track belongs to its lead: it plays only the notes its lead sends, always with the lead's
 * machine (machine-frame.c sends the sound chip the lead's type for it), and its own notes (its trigs) go to no
 * track, so its own machine and sample never sound over, between or after its lead's notes. Its own sound and
 * pattern stay as they are and play again once VOICES puts it back on its own.
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
};

#define TARGETS ((volatile int16_t *)0x80003362u)          /* track t's value j at [VALUES * t + j] */
#define NOTE_SOURCE ((const volatile uint32_t *)0x47db4310u) /* the source of the note each track holds, 0 none */
#define NOTE_PITCH ((const volatile int32_t *)0x47db4560u)   /* its pitch, -1 none */
#define MUTES (*(const volatile uint32_t *)0x8000467cu)
#define MUTES_OVERRIDE (*(const volatile uint32_t *)0x80004680u) /* nonzero: the inverse of the mutes in force */

static uint8_t voices[TRACKS];      /* the project's setting, 0 or 1 for a track that plays only its own notes */
static uint8_t lead_of[TRACKS];     /* each track's lead, NONE outside a group */
static uint8_t next_voice[TRACKS];  /* per lead: where the search for a free voice starts */
static uint8_t sync_next[TRACKS];   /* per lead: the voice track the idle copy looks at next */
static volatile uint16_t absorb;    /* leads whose own note set its targets this frame */
static volatile uint16_t leads;     /* leads with a group; written last by regroup */
static int16_t last[TRACKS][VALUES];

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
        /* The voices start as exact copies of the lead (every parameter, its sample slot included), so each note of
         * a chord sounds alike whichever track plays it; later turns on the lead follow in core_voice_frame. */
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

/* The track a note-on of `lead` goes to: the first track of the group from the lead on that holds no note and is not
 * muted, so the lead takes the first note of a chord (the trig keys and most MIDI senders send a chord's notes from
 * the lowest up) and each next track the next; with every track busy, the next one in turn that is not muted, which
 * ends its note as stock ends a track's note for a new one. */
static unsigned int pick(unsigned int lead, uint32_t mutes)
{
    unsigned int size = 0;
    while (lead + size < TRACKS && lead_of[lead + size] == lead) {
        ++size;
    }
    for (unsigned int t = lead; t < lead + size; ++t) {
        if (!((mutes >> t) & 1u) && !NOTE_SOURCE[t]) {
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
        /* A linked voice track's own note (its trigs): to no track (16), so only its lead's notes play there. */
        if (lead_of[lead] != NONE) {
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
        if (source != SEQUENCER) {
            const int32_t pitch = record_pitch(record);
            for (unsigned int t = lead; t < TRACKS && lead_of[t] == lead; ++t) {
                if (NOTE_SOURCE[t] == source && NOTE_PITCH[t] == pitch) {
                    *(uint32_t *)(record + 0x10) = TRACKS;
                    return;
                }
            }
        }
        to = pick(lead, mutes);
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

/* A whole track's targets from a lead's last values. Its own function, indexed, so the compiler does not reuse a
 * post-incremented address register in one instruction (sdk/runtime/m68k_codegen.py refuses that). */
static __attribute__((noinline)) void copy_values(volatile int16_t *to, const volatile int16_t *from)
{
    for (unsigned int j = 0; j < VALUES; ++j) {
        to[j] = from[j];
    }
}

void core_voice_frame(void)
{
    const uint16_t taken = absorb;
    absorb = 0;
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
        sync_next[lead] = (uint8_t)(v + 1 < end ? v + 1 : lead + 1);
        if (v < end && !NOTE_SOURCE[v]) {
            copy_values(TARGETS + VALUES * v, last[lead]);
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
