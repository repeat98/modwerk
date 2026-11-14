/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "arp.h"
#include "panel.h"
#include "../../../../machines/digitakt-ii/include/mk2/core.h"
#ifdef CHORD_ARP_TRIAL
#include "locks.h"
#include "../../../../machines/digitakt-ii/elekloader/modwerk/project-archive.h"
#include "../../../../machines/digitakt-ii/elekloader/modwerk/project-generation.h"
#endif

enum {
    NO = 12, LEFT = 13, RIGHT = 15, FUNC = 17, RECORD = 19, PLAY = 20, STOP = 21,
    PAGE_KEY = 22, TRIG_1 = 25, TRIG_16 = 40,
    PUSH_A = 41, PUSH_C = 43, PUSH_D = 44, PUSH_F = 46, PUSH_H = 48,
    KEY_PRESS = 1, KEY_RELEASE = 16,
    ENCODER_STEP = 8,
    MENU_VIEW = 0x38, BRAIN_CONTROLLER = 0x40,
    STOCK_GRID_RECORD = 0x270,
#ifdef CHORD_ARP_TRIAL
    STOCK_TRACK_STRIDE = 0x6a5, STOCK_NOTE = 1, STOCK_TRIGLESS = 4,
    STOCK_PATTERN_TRACK_VIEW = 0x30,
#endif
    TEXT_CENTER = 2, RECT_INVERT = -1,
};

struct control {
    const char *label;
    int8_t min;
    int8_t max;
    const char *const *options;
    uint8_t stock_encoder;
};

static const char *const chords[] = {
    "MAJ", "MIN", "DIM", "AUG", "SUS2", "SUS4", "DOM", "HDIM", "DIM7", "ALT", "QUART",
};
static const char *const sevenths[] = {"AUTO", "DIM", "MIN", "MAJ"};
static const char *const ninths[] = {"AUTO", "b9", "9", "#9"};
static const char *const elevenths[] = {"AUTO", "11", "#11"};
static const char *const thirteenths[] = {"AUTO", "b13", "13", "#13"};
static const char *const orders[] = {
    "UP", "DOWN", "UP/DN", "DN/UP", "DBL", "HI/LO", "LO/HI", "ZIGZG",
    "PINKY", "THUMB", "RAND", "SHUFL", "INPUT",
};
static const char *const divisions[] = {
    "1/1", "1/2D", "1/2", "1/2T", "1/4D", "1/4", "1/4T", "1/8D", "1/8", "1/8T",
    "1/16D", "1/16", "1/16T", "1/32D", "1/32", "1/32T", "1/64D", "1/64", "1/64T",
};
static const char *const toggle[] = {"OFF", "ON"};
static const char *const grooves[] = {"STR8", "PUSH", "LAID", "OFFBT"};
static const char *const resets[] = {"CONT", "NOTE", "GRV", "ALL"};
static const char *const page_names[] = {"CHORD", "ARP", "RHYTHM", "GROOVE"};

#define CHOICES(label, options) {label, 0, sizeof options / sizeof options[0] - 1, options, 0}
#define STEPS(label, min, max) {label, min, max, 0, 0}
#define STOCK(label, min, max) {label, min, max, 0, 1}
static const struct control controls[PAGE_COUNT][8] = {
    [CHORD] = {
        CHOICES("TYPE", chords), CHOICES("7TH", sevenths), CHOICES("9TH", ninths),
        CHOICES("11TH", elevenths), CHOICES("13TH", thirteenths), STOCK("ROOT", -1, 127),
    },
    [ARP] = {
        CHOICES("ORDER", orders), STEPS("OCT", -7, 7),
        STEPS("LO", -ARP_MAX_OCTAVE, ARP_MAX_OCTAVE), STEPS("HI", -ARP_MAX_OCTAVE, ARP_MAX_OCTAVE),
        STOCK("GATE", 2, 100), CHOICES("DIV", divisions), CHOICES("ARP", toggle),
        STEPS("TRACK", 1, AUDIO_TRACKS),
    },
    [RHYTHM] = {STEPS("LEN", 1, 32), STEPS("PULS", 1, 32), STOCK("ROT", -31, 31), STEPS("REPT", 0, 16)},
    [GROOVE] = {
        CHOICES("STYLE", grooves), STOCK("TIME", 0, 100), STOCK("ACCNT", -100, 100),
        CHOICES("RESET", resets), CHOICES("LATCH", toggle), CHOICES("SPAN", toggle),
    },
};

volatile struct chord_arp_settings chord_arp_tracks[AUDIO_TRACKS];
static unsigned int selected_track, page, dirty;
static uint16_t initialized;
static const void *menu_view;
static uint32_t consumed[2];
static int8_t encoder_pending[8];

/* OS 1.17 stock encoder listener: object header, then 11 five-word states. */
static struct {
    uint32_t header[8];
    uint32_t states[11][5];
} stock_encoders;
static unsigned int stock_encoders_initialized;

static void reset_encoder(unsigned int knob)
{
    encoder_pending[knob] = 0;
    for (unsigned int field = 0; field < 4; ++field) {
        stock_encoders.states[knob][field] = 0;
    }
    stock_encoders.states[knob][4] = 48;
}

static void reset_encoders(void)
{
    for (unsigned int knob = 0; knob < 8; ++knob) {
        reset_encoder(knob);
    }
}

static int encoder_step(unsigned int knob, int32_t raw)
{
    int32_t pending = encoder_pending[knob];
    if ((raw > 0 && pending < 0) || (raw < 0 && pending > 0)) {
        pending = 0;
    }
    /* Bound the event before adding it. Accelerated events still edit one value. */
    pending += raw > ENCODER_STEP ? ENCODER_STEP : raw < -ENCODER_STEP ? -ENCODER_STEP : raw;
    if (pending >= ENCODER_STEP || pending <= -ENCODER_STEP) {
        encoder_pending[knob] = 0;
        return pending > 0 ? 1 : -1;
    }
    encoder_pending[knob] = (int8_t)pending;
    return 0;
}
#ifdef CHORD_ARP_TRIAL
volatile uint32_t chord_arp_project_generation;
static unsigned int step_mode, step_page, lock_full;
static int held_step = -1, lock_pattern;

struct chord_arp_project {
    uint16_t initialized, count;
    struct chord_arp_settings tracks[AUDIO_TRACKS];
    struct chord_arp_saved_lock locks[CHORD_ARP_LOCK_CAPACITY];
};

static void save_project(void *data)
{
    struct chord_arp_project *const saved = data;
    volatile uint8_t *const bytes = data;
    for (unsigned int i = 0; i < sizeof *saved; ++i) {
        bytes[i] = 0;
    }
    saved->initialized = initialized;
    for (unsigned int track = 0; track < AUDIO_TRACKS; ++track) {
        if (initialized & (1u << track)) {
            fw_memcpy(&saved->tracks[track], (const void *)&chord_arp_tracks[track],
                      sizeof saved->tracks[track]);
        }
    }
    saved->count = (uint16_t)chord_arp_locks_snapshot(saved->locks);
}

static int valid_value(unsigned int page, unsigned int knob, int value)
{
    const struct control *const control = &controls[page][knob];
    return control->label && value >= control->min && value <= control->max;
}

static int valid_track(const struct chord_arp_settings *track)
{
    if (track->manual_range > 1 || track->values[ARP][2] > track->values[ARP][3]) {
        return 0;
    }
    for (unsigned int row = 0; row < PAGE_COUNT; ++row) {
        for (unsigned int knob = 0; knob < 8; ++knob) {
            if (controls[row][knob].label && !(row == ARP && knob == 7) &&
                !valid_value(row, knob, track->values[row][knob])) {
                return 0;
            }
        }
    }
    return 1;
}

static void restore_lock(const struct chord_arp_saved_lock *lock)
{
    const uint32_t mask = (uint32_t)lock->mask[0] | (uint32_t)lock->mask[1] << 8 |
        (uint32_t)lock->mask[2] << 16 | (uint32_t)lock->mask[3] << 24;
    if (lock->pattern >= 128 || lock->track >= AUDIO_TRACKS || lock->step >= 128 ||
        (mask & ~UINT32_C(0x070f3f3f)) || lock->values[ARP][2] > lock->values[ARP][3]) {
        return;
    }
    for (unsigned int row = 0; row < PAGE_COUNT; ++row) {
        for (unsigned int knob = 0; knob < 8; ++knob) {
            if ((mask & (UINT32_C(1) << (row * 8 + knob))) &&
                !valid_value(row, knob, lock->values[row][knob])) {
                return;
            }
        }
    }
    for (unsigned int row = 0; row < PAGE_COUNT; ++row) {
        for (unsigned int knob = 0; knob < 8; ++knob) {
            if (mask & (UINT32_C(1) << (row * 8 + knob))) {
                chord_arp_lock_set(lock->pattern, lock->track, lock->step, row, knob,
                    lock->values[row][knob], lock->values[ARP][2], lock->values[ARP][3]);
            }
        }
    }
}

static void load_project(const void *data)
{
    const struct chord_arp_project *const saved = data;
    initialized = 0;
    for (unsigned int track = 0; track < AUDIO_TRACKS; ++track) {
        chord_arp_tracks[track].values[ARP][6] = 0;
        if (saved && (saved->initialized & (1u << track)) && valid_track(&saved->tracks[track])) {
            fw_memcpy((void *)&chord_arp_tracks[track], &saved->tracks[track],
                      sizeof saved->tracks[track]);
            initialized |= (uint16_t)(1u << track);
        }
    }
    chord_arp_locks_reset();
    if (saved && saved->count <= CHORD_ARP_LOCK_CAPACITY) {
        for (unsigned int i = 0; i < saved->count; ++i) {
            restore_lock(&saved->locks[i]);
        }
    }
    menu_view = 0;
    dirty = 1;
    chord_arp_project_generation = core_project_generation;
}

const dt2_project_archive_t chord_arp_project_archive = {
    UINT32_C(0x43415231), sizeof(struct chord_arp_project), save_project, load_project,
};

/* OS 1.17: the stock trig editor resolves its selected track through this view. */
static unsigned int stock_audio_track(void)
{
    const uintptr_t pattern_ui = *(const volatile uintptr_t *)0x44f370a0u;
    if (!pattern_ui) {
        return selected_track;
    }
    unsigned int (*const track_at)(const void *) = (void *)0x4004abb8u;
    const unsigned int track = track_at((const void *)(pattern_ui + STOCK_PATTERN_TRACK_VIEW));
    return track < AUDIO_TRACKS ? track : selected_track;
}

static int step_key_held(void)
{
    return held_step >= 0 && (fw_key_down(TRIG_1 + held_step % 16) & 1);
}

int chord_arp_note_trig(unsigned int pattern, unsigned int track, unsigned int step)
{
    if (pattern >= 128 || track >= AUDIO_TRACKS || step >= 128) {
        return 0;
    }
    const volatile uint8_t *flags = (const volatile uint8_t *)fw_patterns +
        pattern * (uintptr_t)fw_pattern_size + track * STOCK_TRACK_STRIDE + step * 2 + 1;
    return (*flags & (STOCK_NOTE | STOCK_TRIGLESS)) == STOCK_NOTE;
}

static int editing_step(void)
{
    return step_mode && step_key_held() && lock_pattern == core_kit_on() &&
        chord_arp_note_trig((unsigned int)lock_pattern, selected_track, (unsigned int)held_step);
}

static uint32_t selected_step_settings(struct chord_arp_settings *settings)
{
    return editing_step() ? chord_arp_lock_read((unsigned int)lock_pattern, selected_track,
                                               (unsigned int)held_step, settings) : 0;
}
#endif

extern void core_additem(void *menu, const void *const row[4]);
extern void chord_arp_row_label(void);

void chord_arp_intervals(const volatile int8_t chord[8], uint8_t extensions[4])
{
    static const uint8_t intervals[4][4] = {{0, 9, 10, 11}, {0, 13, 14, 15}, {0, 17, 18}, {0, 20, 21, 22}};
    for (unsigned int i = 0; i < 4; ++i) {
        extensions[i] = intervals[i][chord[i + 1]];
    }
}

static void edit_track(unsigned int track)
{
    if (track != selected_track) {
        reset_encoders();
    }
    const uint16_t bit = (uint16_t)(1u << track);
    if (!(initialized & bit)) {
        volatile struct chord_arp_settings *const settings = &chord_arp_tracks[track];
        for (unsigned int row = 0; row < PAGE_COUNT; ++row) {
            for (unsigned int knob = 0; knob < 8; ++knob) {
                settings->values[row][knob] = 0;
            }
        }
        settings->manual_range = 0;
        settings->values[CHORD][5] = -1;
        settings->values[ARP][4] = 50;
        settings->values[ARP][5] = 11;
        settings->values[RHYTHM][0] = 16;
        settings->values[RHYTHM][1] = 16;
        initialized |= bit;
    }
    selected_track = track;
}

static int visible(const uint8_t *controller)
{
    const uint8_t *top = *(const uint8_t *const *)(controller + 0x18);
    return menu_view && top && top != controller + 0x14 && *(const void *const *)(top + 8) == menu_view;
}

static void select_arp(void **payload)
{
    uint8_t *view = (uint8_t *)*payload + MENU_VIEW;
    menu_view = view;
    if (!stock_encoders_initialized) {
        fw_enc_init(&stock_encoders);
        stock_encoders_initialized = 1;
    }
#ifdef CHORD_ARP_TRIAL
    step_mode = step_page = lock_full = 0;
    held_step = -1;
    edit_track(stock_audio_track());
#else
    edit_track(selected_track);
#endif
    reset_encoders();
    page = CHORD;
    dirty = 1;
    fw_invalidate(view);
}

static void draw_row(void *payload, void *item, void *bitmap, int x, int y)
{
    (void)payload;
    (void)item;
    for (int i = 0; i < 3; ++i) {
        fw_fillrect(bitmap, x + 1 + 3 * i, y + 5 - 2 * i, x + 2 + 3 * i, y + 8, 1);
    }
}

static void change_row(void *payload, void *item, int delta)
{
    (void)payload;
    (void)item;
    (void)delta;
}

void chord_arp_settings(void *menu)
{
    static const void *const row[4] = {
        (const void *)chord_arp_row_label, (const void *)select_arp,
        (const void *)draw_row, (const void *)change_row,
    };
    core_additem(menu, row);
}

void chord_arp_tick(uint8_t *controller)
{
#ifdef CHORD_ARP_TRIAL
    const uint32_t generation = core_project_generation;
    if (chord_arp_project_generation != generation) {
        for (unsigned int track = 0; track < AUDIO_TRACKS; ++track) {
            chord_arp_tracks[track].values[ARP][6] = 0;
        }
        initialized = 0;
        chord_arp_locks_reset();
        menu_view = 0;
        dirty = 1;
        chord_arp_project_generation = generation;
    }
    chord_arp_locks_prune((unsigned int)core_kit_on(), chord_arp_note_trig);
    if (held_step >= 0 && !step_key_held()) {
        held_step = -1;
        reset_encoders();
        lock_full = 0;
        dirty = 1;
    }
#endif
    if (menu_view && !visible(controller)) {
        menu_view = 0;
        dirty = 1;
    }
    if (dirty) {
        controller[0x20] = 1;
        dirty = 0;
    }
}

int chord_arp_key(const uint8_t *brain, const uint32_t *event)
{
    const uint32_t key = event[3], flags = event[4];
    if (key >= 64) {
        return 0;
    }
    uint32_t *const keys = &consumed[key / 32];
    const uint32_t bit = UINT32_C(1) << (key % 32);
    const int trig = key >= TRIG_1 && key <= TRIG_16;
#ifdef CHORD_ARP_TRIAL
    /* Stock handles the key after us. Prune first so a rapid re-add cannot
     * revive locks from a delete handled since the last UI tick. */
    if (trig && (flags & KEY_PRESS)) {
        chord_arp_locks_prune((unsigned int)core_kit_on(), chord_arp_note_trig);
    }
#endif
    if (*keys & bit) {
        if (flags & KEY_RELEASE) {
            *keys &= ~bit;
#ifdef CHORD_ARP_TRIAL
            if (key >= TRIG_1 && key <= TRIG_16 && held_step >= 0 &&
                key == TRIG_1 + (unsigned int)held_step % 16) {
                held_step = -1;
                reset_encoders();
                lock_full = 0;
                dirty = 1;
            }
#endif
            return 1;
        }
#ifdef CHORD_ARP_TRIAL
        if (trig && held_step < 0 && (flags & KEY_PRESS)) {
            *keys &= ~bit;
        } else
#endif
        return 1;
    }
    if (!(flags & KEY_PRESS) || !visible(brain + BRAIN_CONTROLLER)) {
        return 0;
    }
    const int func = fw_key_down(FUNC) & 1;
#ifdef CHORD_ARP_TRIAL
    if (key == PAGE_KEY && func) {
        step_mode = !step_mode;
        held_step = -1;
        reset_encoders();
        lock_full = 0;
    } else if (step_mode && key == PAGE_KEY) {
        if (held_step < 0) {
            step_page = (step_page + 1) % 8;
        }
    } else if (step_mode && trig) {
        if (held_step < 0) {
            lock_pattern = core_kit_on();
            held_step = (int)(step_page * 16 + key - TRIG_1);
            reset_encoders();
        }
    } else if (key == RECORD && !func) {
        step_mode = lock_full = 0;
        held_step = -1;
        reset_encoders();
        dirty = 1;
        return 0;
    } else if (key == NO && step_mode && step_key_held()) {
        if (editing_step()) {
            chord_arp_lock_clear((unsigned int)lock_pattern, selected_track,
                                 (unsigned int)held_step, UINT32_MAX);
        }
        lock_full = 0;
    } else
#endif
    if (key == NO) {
        menu_view = 0;
    } else if (key == LEFT) {
        page = func ? CHORD : (page + PAGE_COUNT - 1) % PAGE_COUNT;
        reset_encoders();
    } else if (key == RIGHT) {
        page = func ? GROOVE : (page + 1) % PAGE_COUNT;
        reset_encoders();
    } else if (key >= PUSH_A && key <= PUSH_H) {
        reset_encoder(key - PUSH_A);
#ifdef CHORD_ARP_TRIAL
        if (step_mode && step_key_held()) {
            if (editing_step()) {
                const unsigned int knob = key - PUSH_A;
                chord_arp_lock_clear((unsigned int)lock_pattern, selected_track, (unsigned int)held_step,
                                     chord_arp_lock_mask(page, knob));
            }
            lock_full = 0;
        } else
#endif
        if (page == CHORD && key == PUSH_F) {
            chord_arp_tracks[selected_track].values[CHORD][5] = -1;
        } else if (page == ARP && (key == PUSH_C || key == PUSH_D)) {
            volatile struct chord_arp_settings *const settings = &chord_arp_tracks[selected_track];
            settings->manual_range = 0;
            settings->values[ARP][2] = settings->values[ARP][3] = 0;
        }
    } else if (!func && (key == RECORD || key == PLAY || key == STOP ||
               (trig && *(const uint8_t *)(fw_ui_states() + STOCK_GRID_RECORD) == 1))) {
        return 0;
    }
    *keys |= bit;
    dirty = 1;
    return 1;
}

int chord_arp_encoder(const uint8_t *brain, const int32_t *event)
{
    if (!visible(brain + BRAIN_CONTROLLER)) {
        return 0;
    }
    const int32_t encoder = event[3], raw_delta = event[4];
    if (encoder < 1 || encoder > 8 || !raw_delta) {
        return 1;
    }
    const unsigned int knob = (unsigned int)encoder - 1;
    const struct control *control = &controls[page][knob];
    if (!control->label) {
        return 1;
    }
    volatile struct chord_arp_settings *const settings = &chord_arp_tracks[selected_track];
    const volatile int8_t (*values)[8] = settings->values;
#ifdef CHORD_ARP_TRIAL
    const int step_edit = editing_step();
    if ((step_mode && step_key_held() && !step_edit) ||
        (step_edit && ((page == ARP && knob >= 6) || (page == GROOVE && knob >= 3)))) {
        return 1;
    }
    struct chord_arp_settings locked;
    if (step_edit && selected_step_settings(&locked)) {
        values = locked.values;
    }
#endif
    const int delta = control->stock_encoder
        ? fw_enc_list(&stock_encoders, (void *)event, fw_enc_param) / 256
        : encoder_step(knob, raw_delta);
    if (!delta) {
        return 1;
    }
    const int track_selector = page == ARP && knob == 7;
    int min = control->min, max = control->max;
    if (page == ARP && knob == 2) {
        max = values[ARP][3];
    } else if (page == ARP && knob == 3) {
        min = values[ARP][2];
    } else if (page == RHYTHM && knob == 1) {
        max = values[RHYTHM][0];
    }
#ifdef CHORD_ARP_TRIAL
    if (page == RHYTHM && knob == 3) {
        max = chord_arp_trial_repeat_max(values[ARP][5]);
    }
#endif
    const int current = track_selector ? (int)selected_track + 1 : values[page][knob];
    int next = delta < min - current ? min : delta > max - current ? max : current + delta;
    if (page == CHORD && knob == 5 && current < 0) {
        next = 60;
    }
#ifdef CHORD_ARP_TRIAL
    if (step_edit) {
        lock_full = !chord_arp_lock_set((unsigned int)lock_pattern, selected_track, (unsigned int)held_step,
                                       page, knob, (int8_t)next, values[ARP][2], values[ARP][3]);
        dirty = 1;
        return 1;
    }
#endif
    if (track_selector) {
        if (next != current) {
            unsigned int track = (unsigned int)(next - 1);
#ifdef CHORD_ARP_TRIAL
            /* OS 1.17 native track change, including its UI notifications. */
            void (*const select_stock_track)(unsigned int) = (void *)0x40077308u;
            select_stock_track(track);
            track = stock_audio_track();
#endif
            edit_track(track);
        }
    } else {
        settings->values[page][knob] = (int8_t)next;
        if (page == ARP && (knob == 2 || knob == 3)) {
            settings->manual_range = 1;
        } else if (page == RHYTHM && knob == 0 && values[RHYTHM][1] > next) {
            settings->values[RHYTHM][1] = (int8_t)next;
        }
#ifdef CHORD_ARP_TRIAL
        if (page == ARP && knob == 5) {
            const int repeat_max = chord_arp_trial_repeat_max(next);
            if (values[RHYTHM][3] > repeat_max) {
                settings->values[RHYTHM][3] = (int8_t)repeat_max;
            }
        }
#endif
    }
    dirty = 1;
    return 1;
}

static void draw_chord(void *bitmap, const volatile int8_t *values)
{
    uint8_t extensions[4], tones[ARP_MAX_NOTES];
    chord_arp_intervals(values, extensions);
    const uint8_t count = arp_chord_notes(60, values[0], extensions, 0, tones);
    for (unsigned int i = 0; i <= 24; ++i) {
        const int x = 76 + 2 * (int)i;
        fw_fillrect(bitmap, x, 10, x, i % 12 ? 10 : 12, 1);
    }
    for (unsigned int i = 0; i < count; ++i) {
        const int x = 76 + 2 * (tones[i] - 60);
        fw_fillrect(bitmap, x, 13, x + 1, 20, 1);
    }
    fw_textf(bitmap, fw_font_narrow, 100, 1, TEXT_CENTER, "CHORD TONES");
}

static void draw_rhythm(void *bitmap, const volatile int8_t *values)
{
    const uint8_t length = (uint8_t)values[0], pulses = (uint8_t)values[1];
    const struct arp_rhythm rhythm = {length, pulses < length ? pulses : length, values[2], 0};
    const int cell = 104 / rhythm.length;
    for (unsigned int step = 0; step < rhythm.length; ++step) {
        const int x = 10 + cell * (int)step + cell / 2;
        uint32_t position;
        const int pulse = arp_rhythm_position(rhythm, step, 0, &position);
        fw_fillrect(bitmap, x, 12, x + 1, pulse ? 19 : 13, 1);
        if (step % 4 == 0) {
            fw_fillrect(bitmap, x, 9, x, 9, 1);
        }
    }
    fw_textf(bitmap, fw_font_narrow, 67, 1, TEXT_CENTER, "PULSE PATTERN");
}

static void draw_groove(void *bitmap, const volatile int8_t *values)
{
    const enum arp_groove groove = values[0];
    for (uint32_t step = 0; step < 4; ++step) {
        const int x = 67 + 16 * (int)step;
        const int advance = (int)arp_groove_onset(groove, step, (uint8_t)values[1], 0, 100, 200) - 100;
        const int velocity = arp_groove_velocity(groove, step, values[2], 85);
        fw_fillrect(bitmap, x - 7, 10, x + 7, 10, 1);
        fw_fillrect(bitmap, x, 8, x, 8, 1);
        fw_fillrect(bitmap, x + advance / 3, 11, x + advance / 3 + 1, 11 + velocity / 14, 1);
    }
    fw_textf(bitmap, fw_font_narrow, 94, 1, TEXT_CENTER, "GROOVE SHAPE");
}

static void draw_switch(void *bitmap, int x, int y, int on)
{
    fw_fillrect(bitmap, x - 6, y, x + 6, y, 1);
    fw_fillrect(bitmap, x - 6, y + 6, x + 6, y + 6, 1);
    fw_fillrect(bitmap, x - 7, y + 1, x - 7, y + 5, 1);
    fw_fillrect(bitmap, x + 7, y + 1, x + 7, y + 5, 1);
    const int knob = on ? x + 2 : x - 5;
    fw_fillrect(bitmap, knob, y + 2, knob + 3, y + 4, 1);
}

void mod_draw(void *bitmap, const uint8_t *controller)
{
    if (!visible(controller)) {
        return;
    }
    fw_fillrect(bitmap, 0, 0, 127, 63, 0);
    const volatile struct chord_arp_settings *settings = &chord_arp_tracks[selected_track];
#ifdef CHORD_ARP_TRIAL
    struct chord_arp_settings locked;
    const uint32_t mask = selected_step_settings(&locked);
    if (mask) {
        settings = &locked;
    }
#endif
    fw_textf(bitmap, fw_font, 2, 55, 0, "T%02d", selected_track + 1);
    fw_textf(bitmap, fw_font, 27, 55, 0, "CHORD ARP");
    fw_textf(bitmap, fw_font_narrow, 100, 56, TEXT_CENTER, "%s", settings->values[ARP][6] ? "ON" : "OFF");
    fw_textf(bitmap, fw_font_narrow, 119, 56, TEXT_CENTER, "%d/4", page + 1);
    fw_fillrect(bitmap, 0, 53, 21, 63, RECT_INVERT);
    fw_fillrect(bitmap, 89, 53, 127, 63, RECT_INVERT);
    fw_fillrect(bitmap, 0, 52, 127, 52, 1);
    fw_textf(bitmap, fw_font_narrow, 2, 45, 0, "%s", page_names[page]);
#ifdef CHORD_ARP_TRIAL
    if (lock_full) {
        fw_textf(bitmap, fw_font_narrow, 81, 45, TEXT_CENTER, "LOCKS FULL");
    } else if (editing_step()) {
        fw_textf(bitmap, fw_font_narrow, 86, 45, TEXT_CENTER, "STEP %03d", held_step + 1);
    } else if (step_mode && step_key_held()) {
        fw_textf(bitmap, fw_font_narrow, 86, 45, TEXT_CENTER, "NO NOTE TRIG");
    } else if (step_mode) {
        fw_textf(bitmap, fw_font_narrow, 85, 45, TEXT_CENTER, "LOCK PAGE %d", step_page + 1);
    }
#endif
    for (unsigned int i = 0; i < PAGE_COUNT; ++i) {
        const int y = 42 - 8 * (int)i;
        fw_fillrect(bitmap, page == i ? 124 : 126, y, 127, y + 1, 1);
    }
    for (int x = 2; x < 121; x += 3) {
        fw_fillrect(bitmap, x, 41, x, 41, 1);
        fw_fillrect(bitmap, x, 23, x, 23, 1);
    }
    for (unsigned int i = 0; i < 8; ++i) {
        const struct control *control = &controls[page][i];
        if (!control->label) {
            continue;
        }
        const int x = 15 + 30 * (int)(i % 4);
        const int y = i < 4 ? 25 : 1;
        const int value = page == ARP && i == 7 ? (int)selected_track + 1 : settings->values[page][i];
        fw_textf(bitmap, fw_font_narrow, x, y, TEXT_CENTER, "%s", control->label);
        if (page == ARP && i == 6) {
            draw_switch(bitmap, x, y + 7, value);
        } else if (page == CHORD && i == 5) {
            static const char *const pitch_names[] = {
                "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
            };
            if (value < 0) {
                fw_textf(bitmap, fw_font, x, y + 8, TEXT_CENTER, "TRIG");
            } else {
                fw_textf(bitmap, fw_font, x, y + 8, TEXT_CENTER, "%s%d",
                         pitch_names[value % 12], value / 12);
            }
        } else if (control->options) {
            fw_textf(bitmap, fw_font, x, y + 8, TEXT_CENTER, "%s", control->options[value]);
        } else if (page == ARP && (i == 2 || i == 3) && !settings->manual_range) {
            fw_textf(bitmap, fw_font, x, y + 8, TEXT_CENTER, "%s", "AUTO");
        } else {
            fw_textf(bitmap, fw_font, x, y + 8, TEXT_CENTER, control->min < 0 && value > 0 ? "+%d" : "%d", value);
        }
#ifdef CHORD_ARP_TRIAL
        if (mask & chord_arp_lock_mask(page, i)) {
            fw_fillrect(bitmap, x - 12, y + 7, x + 12, y + 15, RECT_INVERT);
        }
#endif
    }
    if (page == CHORD) {
        draw_chord(bitmap, settings->values[CHORD]);
    } else if (page == RHYTHM) {
        draw_rhythm(bitmap, settings->values[RHYTHM]);
    } else if (page == GROOVE) {
        draw_groove(bitmap, settings->values[GROOVE]);
    }
}
