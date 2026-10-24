// SPDX-License-Identifier: GPL-3.0-or-later
// Loop Sync for the Analog Rytm MKII: repitch sample loops so they stay in
// time with the project tempo.
//
// Each sample has a SYNC mode, kept with the project: OFF, AUTO, or a length
// of 1/4, 1/2, 3/4, 1, 1 1/2, 2, 3, 4, 6, 8, 12 or 16 bars, and a correction
// in percent (+-25 %, 0.2 % steps) for loops not cut on the bar. Up to 51
// samples a project keep a setting. A sample without one, played by a SMP
// lock or a scene while the sound's own sample is synced, needs none: a copy
// of that sample (as many frames) takes its mode and correction, so it plays
// at its speed, and any other sample plays in AUTO at 0 %. The source tempo
// comes from the length of the sample that actually plays:
//
//     seconds = frames * (END - STA) / 120 / rate    (the sound's own STA/END)
//     source  = beats * 60 / seconds * (1 + correction)    (4 beats a bar)
//
// With END at its end, digital silence at the end of the sample (below about
// -72 dB) is left out when it is shorter than 5 % of the sample: the padding a
// loop exported a little long carries. AUTO takes the bar count (1/4 to 16,
// a power of two) that puts the source tempo nearest the project tempo.
// Then, every audio block, for each sound track that plays a synced sample:
//
//     shift = 1200 * log2(tempo / source) cents
//
// is added to that track's effective TUN, after stock has applied parameter
// locks, scenes and the LFO (audio.s). The sound's own TUN is never written:
// a TUN lock still transposes, and a SMP lock or a scene that changes the
// sample gets that sample's own shift on the next block.
//
// FUNC + turn encoder A (TUN) on the SAMPLE page steps the mode, FUNC + turn
// encoder B (FIN) the correction, of the sample the selected sound loads. A box
// shows them with the source tempo; a small SYNC mark stays at the bottom
// right while the selected track is synced. Stock does nothing with a FUNC +
// turn on that page (emulator, OS 1.74).
//
// Firmware routines and data are reached at fixed addresses given for each OS
// release by build.json's cflags. Timing comes only from stock's tempo word:
// the mod keeps no clock of its own (docs/module-guides/sequencing.md).

#include "analog-rytm-mk2/store.h"

#include "slot-fields.h"

#define X(n) STORE_FIELD(loop_sync_t##n);
LOOP_SYNC_FIELDS
#undef X
// The project fields of the samples' settings: one bit stream (slot-fields.h).
#define FIELDS 32
static const unsigned pack_field[FIELDS] = {
#define X(n) STORE(loop_sync_t##n),
    LOOP_SYNC_FIELDS
#undef X
};

// Stock returns every result in d0, pointers too, while m68k-linux GCC expects
// a pointer result in a0: so the firmware's pointer-returning routines are
// declared as returning an unsigned long, cast afterwards.
typedef unsigned long word_t;
typedef int (*tempo_get_t)(void);
typedef unsigned (*is_key_held_t)(int key);
typedef word_t (*project_singleton_t)(void);
typedef int (*track_index_of_t)(void *selection);
typedef word_t (*kit_track_sound_t)(void *kit, int track);
typedef void (*fillrect_t)(void *bmp, int x0, int y0, int x1, int y1, int colour);

#define TEMPO_GET ((tempo_get_t)TEMPO_GET_AT)
#define IS_KEY_HELD ((is_key_held_t)IS_KEY_HELD_AT)
#define PROJECT_SINGLETON ((project_singleton_t)PROJECT_SINGLETON_AT)
#define TRACK_INDEX_OF ((track_index_of_t)TRACK_INDEX_OF_AT)
#define KIT_TRACK_SOUND ((kit_track_sound_t)KIT_TRACK_SOUND_AT)
#define FILLRECT ((fillrect_t)FILLRECT_AT)
#define TEMPO_WORD (*(volatile int *)TEMPO_WORD_AT)
// Sample slots 0..130, 16 bytes each: +4 the rate in its high half, +8 frames.
#define SLOT_DATA(s) (*(volatile short *volatile *)(SAMPLE_SLOTS_AT + (s) * 16))   // 16-bit mono
#define SLOT_RATE(s) (*(volatile unsigned short *)(SAMPLE_SLOTS_AT + (s) * 16 + 4))
#define SLOT_FRAMES(s) (*(volatile unsigned *)(SAMPLE_SLOTS_AT + (s) * 16 + 8))
#define SLOT_LAST 130
// The effective parameter array: per track 42 words in 8.8, after locks,
// scenes, slides and the LFO, rebuilt every block.
#define EFF(track, index) (((volatile short *)PARAMS_EFF_AT)[(track) * 42 + (index)])
#define IDX_TUN 17
#define IDX_SMP 19
#define IDX_STA 21
#define IDX_END 22
#define LIVE_PARAMS 0x14            // live sound: 42 parameter words, before locks and the LFO
#define TUN_MIN (40 * 256)
#define TUN_MAX (88 * 256)

#define KEY_FUNC 0x80
#define KEY_TRK 0x86
#define KEY_SMPL 0x32
#define KEY_TRIG_LAST 0x0f
#define KEY_PAD_FIRST 0x90
#define KEY_PAD_LAST 0x9b
#define KEY_RECORD 0x50
#define KEY_STOP 0x52
#define KEY_PRESSED 1              // ev_key flags: 1 pressed (ADAPTING.md)
#define ENC_TUN 0                  // ev_enc on the Rytm: encoders 0-7 are A-H (emulator, OS 1.74)
#define ENC_FIN 1

#define SOUND_TRACKS 12
#define PROJECT_KIT 352            // project + 352: the active kit
#define PROJECT_TRACKSEL 48        // project + 48: the track selection
#define ACC_LIVE_SOUND 0x28        // sound accessor vtable: the live sound

// OFF, AUTO, then the lengths, in beats (4 a bar): 1/4 to 16 bars.
#define LENGTHS 12
enum { MODE_OFF, MODE_AUTO, MODE_LEN, MODES = MODE_LEN + LENGTHS };
static const unsigned char len_beats[LENGTHS] = { 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64 };
#define BEATS_OF(mode) ((mode) >= MODE_LEN ? (unsigned)len_beats[(mode) - MODE_LEN] : 0u)

#define UNITS_PER_BPM 120          // the tempo word's unit
#define ADJ_MAX 125                // +-25 %, in 0.2 % steps: a signed byte
#define ADJ_UNIT 500               // steps per 1: a correction of adj is (500 + adj) / 500
#define MODE_COUNTS 8              // encoder counts per mode step (a unit sends several a millimetre)
#define ADJ_COUNTS 2               // encoder counts per 0.2 %
#define SHOW_TICKS 30              // about 1.5 s of the ~20 Hz idle tick
#define SILENCE 8                  // |sample| below this is silence (about -72 dB)
#define TRIM_LIMIT 20              // trim at most 1/20 of a sample (5 %)
#define SCAN_PER_TICK 4            // slots checked for a new sample each tick
#define ENTRIES 51                 // samples with a setting: 51 entries of 20 bits in the fields
#define ENTRY_BITS 20              // slot 8, mode 4, correction 8
#define GLIDE_SHIFT 6              // a tempo or correction change glides: 1/64 of the way a block, about 40 ms

// No pitch correction is needed on this path: added to the effective TUN, the
// shift plays as asked (rytm-emu, OS 1.74: 98.4 cents measured for 98.44).
// 0.1, which wrote the sound's TUN parameter, played about 6 cents too far
// and corrected for it; that correction is gone with the parameter write.

// Written by the idle tick and the handlers, read by the audio interrupt (one
// word each). gen moves on whenever a slot's trim or correction changes.
static short cfg_sta[SOUND_TRACKS], cfg_end[SOUND_TRACKS];   // the sound's own STA/END, 8.8
static short cfg_smp[SOUND_TRACKS];        // the sound's own sample slot, before locks and scenes
static unsigned char slot_mode[SLOT_LAST + 1];
static signed char slot_adj[SLOT_LAST + 1];   // 0.2 % steps
static unsigned trim_frames[SLOT_LAST + 1];   // frames to count, 0 before the scan
static unsigned trim_data[SLOT_LAST + 1], trim_len[SLOT_LAST + 1];   // what was scanned
static volatile unsigned gen;
static int scan_next = 1;
// The audio interrupt's cache: the inputs of the last shift and the shift.
static short key_slot[SOUND_TRACKS], key_sta[SOUND_TRACKS], key_end[SOUND_TRACKS];
static unsigned char key_mode[SOUND_TRACKS];
static signed char key_adj[SOUND_TRACKS];
static unsigned key_gen[SOUND_TRACKS];
static int key_tempo[SOUND_TRACKS];
static short shift[SOUND_TRACKS];          // the target, in TUN's 8.8, 1/256 semitone
static int glide[SOUND_TRACKS];            // the shift played, in 1/65536 semitone, gliding to the target

static int ready;                          // set by ev_project: the kit and its sounds exist
static int on_sample_page;                 // SMPL was the last page key, and no other key moved away since
static int show_ticks, shown_mode, shown_src, shown_beats, shown_adj, shown_full;
// The fields as last read or written, and the slot of each entry (0: free).
static unsigned words[FIELDS];
static unsigned char entry_slot[ENTRIES];
static int turn_acc, turn_enc = -1;        // counts not yet used; reset when the box goes away
static int mark_shown;                     // the SYNC mark was drawn on the last frame

static void *accessor(int track)
{
    char *project = (char *)PROJECT_SINGLETON();
    return (void *)KIT_TRACK_SOUND(project + PROJECT_KIT, track);
}

static void *live_sound(void *acc)
{
    word_t (*get)(void *) = (*(word_t (***)(void *))acc)[ACC_LIVE_SOUND / 4];
    return (void *)get(acc);
}

// log2(num / den) in 1/65536, for num/den within 1/8..8. Integer only: the
// ColdFire build links no C library.
static int log2_ratio(unsigned num, unsigned den)
{
    int whole = 0, frac = 0, i;
    unsigned x;
    while (num >= 2 * den) { den <<= 1; whole++; }
    while (num < den) { num <<= 1; whole--; }
    // num / den in [1, 2) as Q15: keep den below 2^16 so num << 15 fits
    while (den >= 65536) { num >>= 1; den >>= 1; }
    x = (num << 15) / den;
    for (i = 15; i >= 0; i--) {
        x = (x * x) >> 15;
        if (x >= (2u << 15)) { x >>= 1; frac |= 1 << i; }
    }
    return whole * 65536 + frac;
}

// The source tempo, in 1/120 BPM, of a slot played from sta to end (8.8, of
// 120) as `beats` beats; 0 when the slot is empty or the region too short.
static unsigned source_for(int slot, int sta, int end, unsigned beats)
{
    unsigned frames, rate, span, region;
    if (slot <= 0 || slot > SLOT_LAST || end <= sta)
        return 0;
    frames = SLOT_FRAMES(slot);
    if (end >= (120 << 8) && trim_frames[slot] && trim_len[slot] == frames)
        frames = trim_frames[slot];       // the padding at the end left out
    rate = SLOT_RATE(slot);
    span = (unsigned)(end - sta);                      // up to 120 << 8
    region = ((frames >> 4) * (span >> 4)) / 120;          // frames * span / (120 << 8)
    if (region < 1000 || rate < 1000)
        return 0;
    // beats * 60 s * 120 units * rate / region, kept within 32 bits
    return (7200u * beats * (rate / 100)) / (region / 100);
}

// AUTO: the power-of-two length (1/4 to 16 bars), as beats, that puts the
// source tempo nearest the project tempo; the shorter of two as near. The
// other lengths are for FUNC + TUN only: among them, a one-bar loop of 100 BPM
// at 127 would read as 1.5 bars of 150 (rytm-emu, LS19).
static unsigned auto_beats(int slot, int sta, int end, int tempo)
{
    unsigned best = 4, src;
    int i, d, best_d = 0x7fffffff;
    for (i = 0; i < LENGTHS && tempo > 0; i++) {
        if (len_beats[i] & (len_beats[i] - 1))
            continue;
        src = source_for(slot, sta, end, len_beats[i]);
        if (!src)
            break;
        d = log2_ratio(src, (unsigned)tempo);
        if (d < 0) d = -d;
        if (d < best_d) { best_d = d; best = len_beats[i]; }
    }
    return best;
}

// The source tempo for a mode, corrected by adj: a loop with a tail plays
// longer than its bars, so AUTO finds it slow and a + adj brings it back.
// Each sample keeps its own length, so locks still follow.
static unsigned source_of(int mode, int adj, int slot, int sta, int end, int tempo)
{
    unsigned beats = mode == MODE_AUTO ? auto_beats(slot, sta, end, tempo) : BEATS_OF(mode);
    unsigned src = source_for(slot, sta, end, beats);
    return (unsigned)(((int)src * (ADJ_UNIT + adj)) / ADJ_UNIT);
}

// The shift in TUN's 8.8, capped at +-48 semitones: past TUN's own +-24 the
// loop stays as far as TUN goes instead of jumping back to its own speed
// (LS21 dropped the shift beyond a factor of 8, and a fast loop snapped back
// to full speed as the tempo went down).
#define TENTHS_CAP 48000           // 48 semitones, in tenths of a cent
static int shift_for(int tempo, unsigned src)
{
    int tenths;
    if (!src || tempo <= 0)
        return 0;
    tenths = (log2_ratio((unsigned)tempo, src) * 375) / 2048;   // * 12000 / 65536
    if (tenths > TENTHS_CAP) tenths = TENTHS_CAP;
    if (tenths < -TENTHS_CAP) tenths = -TENTHS_CAP;
    return tenths >= 0 ? (tenths * 256 + 500) / 1000 : -((-tenths * 256 + 500) / 1000);
}

// The audio interrupt, once a block, between the LFO and the voices (audio.s).
// Recomputes a track's shift only when its inputs changed, then adds it to
// the track's effective TUN. The array is rebuilt every block, so the add does
// not accumulate.
void loop_sync_audio(void)
{
    int tempo = TEMPO_WORD, track;
    for (track = 0; track < SOUND_TRACKS; track++) {
        // The sample that plays (SMP locks and scenes follow), with its own
        // setting or else one from the sound's own sample (see the top), over
        // the sound's own STA/END: a STA lock that slices the loop, or an LFO
        // on STA/END, must not read as a shorter loop.
        int slot = EFF(track, IDX_SMP) >> 8, base = cfg_smp[track], mode, adj, sta, end, tun;
        if (slot <= 0 || slot > SLOT_LAST)
            continue;
        mode = slot_mode[slot];
        adj = slot_adj[slot];
        if (mode == MODE_OFF && !adj && base > 0 && base <= SLOT_LAST && slot_mode[base] != MODE_OFF) {
            if (SLOT_FRAMES(slot) == SLOT_FRAMES(base)) {
                mode = slot_mode[base];
                adj = slot_adj[base];
            } else {
                mode = MODE_AUTO;
            }
        }
        if (mode == MODE_OFF || mode >= MODES)
            continue;
        sta = cfg_sta[track];
        end = cfg_end[track];
        if (slot != key_slot[track] || sta != key_sta[track] || end != key_end[track]
            || mode != key_mode[track] || adj != key_adj[track] || gen != key_gen[track]
            || tempo != key_tempo[track]) {
            // A new sample, region or mode jumps to its shift; a tempo or a
            // correction change glides, as a turntable's speed would.
            int jump = slot != key_slot[track] || sta != key_sta[track] || end != key_end[track]
                       || mode != key_mode[track];
            key_slot[track] = (short)slot;
            key_sta[track] = (short)sta;
            key_end[track] = (short)end;
            key_mode[track] = (unsigned char)mode;
            key_adj[track] = (signed char)adj;
            key_gen[track] = gen;
            key_tempo[track] = tempo;
            shift[track] = (short)shift_for(tempo, source_of(mode, adj, slot, sta, end, tempo));
            if (jump)
                glide[track] = shift[track] << 8;
        }
        {
            int target = shift[track] << 8, d = target - glide[track];
            glide[track] += d >= 0 ? (d + (1 << GLIDE_SHIFT) - 1) >> GLIDE_SHIFT : -((-d + (1 << GLIDE_SHIFT) - 1) >> GLIDE_SHIFT);
        }
        if (!glide[track])
            continue;
        tun = EFF(track, IDX_TUN) + ((glide[track] + 128) >> 8);
        if (tun < TUN_MIN) tun = TUN_MIN;
        if (tun > TUN_MAX) tun = TUN_MAX;
        EFF(track, IDX_TUN) = (short)tun;
    }
}

// Scan one slot's end for digital silence, when its sample is new: at most
// TRIM_LIMIT of it, so a loop whose last beat is meant to be quiet is kept.
static void scan_slot(int slot)
{
    volatile short *data = SLOT_DATA(slot);
    unsigned frames = SLOT_FRAMES(slot), limit, i;
    if (trim_data[slot] == (unsigned)data && trim_len[slot] == frames)
        return;
    trim_data[slot] = (unsigned)data;
    trim_len[slot] = frames;
    trim_frames[slot] = 0;
    if (frames >= 1000 && SLOT_RATE(slot) >= 1000) {
        limit = frames / TRIM_LIMIT;
        for (i = frames; i > frames - limit; i--) {
            int v = data[i - 1];
            if (v >= SILENCE || v <= -SILENCE)
                break;
        }
        if (i > frames - limit && i < frames)
            trim_frames[slot] = i;        // the last sound, the padding after it left out
    }
    gen++;
}

// ev_tick, about 20 Hz: copy each sound's sample and STA/END for the audio interrupt and
// check a few sample slots for a new sample.
void loop_sync_tick(char *ctrl)
{
    int track, n;
    if (!ready)
        return;
    for (track = 0; track < SOUND_TRACKS; track++) {
        void *live = live_sound(accessor(track));
        if (live) {
            volatile short *params = (volatile short *)((char *)live + LIVE_PARAMS);
            cfg_sta[track] = params[IDX_STA];
            cfg_end[track] = params[IDX_END];
            cfg_smp[track] = (short)(params[IDX_SMP] >> 8);
        }
    }
    for (n = 0; n < SCAN_PER_TICK; n++) {
        scan_slot(scan_next);
        if (++scan_next > SLOT_LAST)
            scan_next = 1;
    }
    {
        char *project = (char *)PROJECT_SINGLETON();
        int sel = TRACK_INDEX_OF(project + PROJECT_TRACKSEL), slot, mark;
        slot = sel >= 0 && sel < SOUND_TRACKS ? EFF(sel, IDX_SMP) >> 8 : 0;
        // Only on the SAMPLE page: elsewhere the mark would cover stock screens.
        mark = on_sample_page && slot > 0 && slot <= SLOT_LAST
               && (slot_mode[slot] != MODE_OFF || (cfg_smp[sel] > 0 && cfg_smp[sel] <= SLOT_LAST && slot_mode[cfg_smp[sel]] != MODE_OFF));
        if (mark != mark_shown || show_ticks)
            ctrl[0x20] = 1;   // redraw: the box goes away, the SYNC mark follows the track
        mark_shown = mark;
    }
    if (show_ticks)
        show_ticks--;
}

// ev_key: track whether the SAMPLE page is up. SMPL alone opens it; any other
// key except FUNC, the trig keys, the pads, TRK and the transport may leave it
// (a menu, another page), so the flag drops and SMPL must be pressed again.
int loop_sync_key(void *brain, char *ev)
{
    int key = *(int *)(ev + 12), flags = *(int *)(ev + 16);
    (void)brain;
    if (!(flags & KEY_PRESSED))
        return 0;
    if (key == KEY_SMPL)
        on_sample_page = !IS_KEY_HELD(KEY_FUNC);
    else if (!(key == KEY_FUNC || key == KEY_TRK || key <= KEY_TRIG_LAST
               || (key >= KEY_PAD_FIRST && key <= KEY_PAD_LAST)
               || (key >= KEY_RECORD && key <= KEY_STOP)))
        on_sample_page = 0;
    return 0;
}

// The fields' bit stream: n bits at bit `at`, the first in field 0's high bit.
static unsigned get_bits(unsigned at, int n)
{
    unsigned v = 0;
    for (; n > 0; n--, at++)
        v = v << 1 | (words[at / 32] >> (31 - at % 32) & 1);
    return v;
}

static void put_bits(unsigned at, int n, unsigned v)
{
    for (; n > 0; n--, at++) {
        unsigned m = 1u << (31 - at % 32);
        if (v >> (n - 1) & 1) words[at / 32] |= m; else words[at / 32] &= ~m;
    }
}

// Keep a slot's mode and correction: in its entry, a free one when it has
// none, and an entry back to free when both are back to OFF and 0. Returns 0
// when all ENTRIES are taken, and changes nothing then.
static int keep_slot(int slot, int mode, int adj)
{
    int e, free_e = -1, used = mode != MODE_OFF || adj != 0;
    unsigned at;
    for (e = 0; e < ENTRIES && entry_slot[e] != slot; e++)
        if (free_e < 0 && !entry_slot[e])
            free_e = e;
    if (e == ENTRIES) {
        if (!used)
            e = -1;               // nothing kept, nothing to keep
        else if (free_e < 0)
            return 0;
        else
            e = free_e;
    }
    if (e >= 0) {
        at = (unsigned)e * ENTRY_BITS;
        entry_slot[e] = (unsigned char)(used ? slot : 0);
        put_bits(at, 8, used ? (unsigned)slot : 0);
        put_bits(at + 8, 4, used ? (unsigned)mode : 0);
        put_bits(at + 12, 8, used ? (unsigned)adj & 0xff : 0);
        core_store_set(pack_field[at / 32], 0, 0, words[at / 32]);
        core_store_set(pack_field[(at + ENTRY_BITS - 1) / 32], 0, 0, words[(at + ENTRY_BITS - 1) / 32]);
    }
    slot_mode[slot] = (unsigned char)mode;
    slot_adj[slot] = (signed char)adj;
    gen++;
    return 1;
}

// ev_enc: on the SAMPLE page with FUNC held, A steps the mode and B the
// correction of the sample the selected sound loads (not the one a SMP lock
// plays at that moment, which changes from step to step while the pattern
// plays). Every other turn passes.
int loop_sync_enc(void *brain, char *ev)
{
    int enc = *(int *)(ev + 12), delta = *(int *)(ev + 16), track, mode, adj, tempo, slot, sta, end, ok;
    char *project;
    (void)brain;
    if (!ready || !on_sample_page || (enc != ENC_TUN && enc != ENC_FIN) || !IS_KEY_HELD(KEY_FUNC))
        return 0;
    project = (char *)PROJECT_SINGLETON();
    track = TRACK_INDEX_OF(project + PROJECT_TRACKSEL);
    if (track < 0 || track >= SOUND_TRACKS)
        return 0;
    slot = cfg_smp[track];
    if (slot <= 0 || slot > SLOT_LAST)
        slot = 0;                  // no sample: the box shows OFF
    mode = slot ? slot_mode[slot] : MODE_OFF;
    adj = slot ? slot_adj[slot] : 0;
    sta = cfg_sta[track];
    end = cfg_end[track];
    // Accumulate counts: one mode step every MODE_COUNTS, 0.2 % every ADJ_COUNTS.
    if (enc != turn_enc || !show_ticks)
        turn_acc = 0;
    turn_enc = enc;
    turn_acc += delta;
    {
        int per = enc == ENC_TUN ? MODE_COUNTS : ADJ_COUNTS;
        delta = turn_acc / per;
        turn_acc -= delta * per;
    }
    ok = 1;
    if (slot && delta) {
        int m = mode, a = adj;
        if (enc == ENC_TUN) {
            m += delta > 0 ? 1 : -1;    // never more than one mode a step
            if (m < MODE_OFF) m = MODE_OFF;
            if (m >= MODES) m = MODES - 1;
        } else {
            a += delta;
            if (a < -ADJ_MAX) a = -ADJ_MAX;
            if (a > ADJ_MAX) a = ADJ_MAX;
        }
        if ((m != mode || a != adj) && (ok = keep_slot(slot, m, a)) != 0) {
            mode = m;
            adj = a;
        }
    }
    tempo = TEMPO_GET();
    shown_full = !ok;
    shown_mode = mode;
    shown_adj = adj;
    shown_beats = mode == MODE_AUTO ? (int)auto_beats(slot, sta, end, tempo) : (int)BEATS_OF(mode);
    shown_src = mode == MODE_OFF ? 0 : (int)source_of(mode, adj, slot, sta, end, tempo);
    show_ticks = SHOW_TICKS;
    return 1;
}

// ev_project: a loaded or new project brings its samples' settings. Until the
// first one (at boot, after the project load) the kit is not built yet, so the
// tick and the key and encoder handlers do nothing.
void loop_sync_project(int how, unsigned dropped)
{
    int track, e, f;
    (void)how;
    (void)dropped;
    for (track = 0; track < SOUND_TRACKS; track++)
        key_slot[track] = -1;
    for (track = 1; track <= SLOT_LAST; track++) {
        slot_mode[track] = MODE_OFF;
        slot_adj[track] = 0;
        trim_len[track] = 0xffffffff;     // scan every slot again
    }
    for (f = 0; f < FIELDS; f++)
        words[f] = core_store_get(pack_field[f], 0, 0);
    for (e = 0; e < ENTRIES; e++) {
        unsigned at = (unsigned)e * ENTRY_BITS;
        int slot = (int)get_bits(at, 8), mode = (int)get_bits(at + 8, 4), adj = (int)get_bits(at + 12, 8);
        if (adj >= 0x80) adj -= 0x100;
        entry_slot[e] = 0;
        if (slot <= 0 || slot > SLOT_LAST || slot_mode[slot] || slot_adj[slot])
            continue;             // free, or not a slot of this machine, or a repeat: free
        entry_slot[e] = (unsigned char)slot;
        slot_mode[slot] = (unsigned char)(mode < MODES ? mode : MODE_OFF);
        slot_adj[slot] = (signed char)(adj < -ADJ_MAX ? -ADJ_MAX : adj > ADJ_MAX ? ADJ_MAX : adj);
    }
    gen++;
    show_ticks = 0;
    ready = 1;
}

// 3 x 5 glyphs, the top row first, bit 2 the left pixel.
enum { G_A = 10, G_B, G_F, G_M, G_O, G_P, G_R, G_T, G_U, G_DOT, G_SLASH, G_D, G_J, G_S, G_PLUS, G_MINUS, G_PCT, G_Y, G_N, G_C, G_L, G_SPACE = 255 };
static const unsigned char glyphs[][5] = {
    {7, 5, 5, 5, 7}, {2, 6, 2, 2, 7}, {7, 1, 7, 4, 7}, {7, 1, 7, 1, 7}, {5, 5, 7, 1, 1},
    {7, 4, 7, 1, 7}, {7, 4, 7, 5, 7}, {7, 1, 1, 1, 1}, {7, 5, 7, 5, 7}, {7, 5, 7, 1, 7},
    {2, 5, 7, 5, 5},   // A
    {6, 5, 6, 5, 6},   // B
    {7, 4, 6, 4, 4},   // F
    {5, 7, 7, 5, 5},   // M
    {7, 5, 5, 5, 7},   // O
    {6, 5, 6, 4, 4},   // P
    {6, 5, 6, 5, 5},   // R
    {7, 2, 2, 2, 2},   // T
    {5, 5, 5, 5, 7},   // U
    {0, 0, 0, 0, 2},   // .
    {1, 1, 2, 4, 4},   // /
    {6, 5, 5, 5, 6},   // D
    {1, 1, 1, 5, 7},   // J
    {7, 4, 7, 1, 7},   // S
    {0, 2, 7, 2, 0},   // +
    {0, 0, 7, 0, 0},   // -
    {5, 1, 2, 4, 5},   // %
    {5, 5, 2, 2, 2},   // Y
    {6, 5, 5, 5, 5},   // N
    {7, 4, 4, 4, 7},   // C
    {4, 4, 4, 4, 7},   // L
};

// The same glyphs at one pixel a dot, for the SYNC mark.
static void glyph1(void *bmp, int g, int x, int top)
{
    int r, c;
    for (r = 0; r < 5; r++)
        for (c = 0; c < 3; c++)
            if (glyphs[g][r] & (4 >> c))
                FILLRECT(bmp, x + c, top - r, x + c, top - r, 1);
}

// x is the left edge, top the top row (y counts up from the bottom row, 0).
static void glyph(void *bmp, int g, int x, int top)
{
    int r, c;
    if (g == G_SPACE)
        return;
    for (r = 0; r < 5; r++)
        for (c = 0; c < 3; c++)
            if (glyphs[g][r] & (4 >> c))
                FILLRECT(bmp, x + 2 * c, top - 2 * r - 1, x + 2 * c + 1, top - 2 * r, 1);
}

static int put_bpm(unsigned char *t, int n, int src)
{
    int tenths = (src + 6) / 12, whole = tenths / 10;
    if (!src) {
        t[n++] = G_DOT; t[n++] = G_DOT; t[n++] = G_DOT;
        return n;
    }
    if (whole >= 1000) {
        // 8 BAR on a short loop reads above 999 BPM: whole BPM, at most 9999
        if (whole > 9999) whole = 9999;
        t[n++] = (unsigned char)(whole / 1000);
        t[n++] = (unsigned char)(whole / 100 % 10);
        t[n++] = (unsigned char)(whole / 10 % 10);
        t[n++] = (unsigned char)(whole % 10);
        return n;
    }
    if (whole >= 100) t[n++] = (unsigned char)(whole / 100);
    if (whole >= 10) t[n++] = (unsigned char)(whole / 10 % 10);
    t[n++] = (unsigned char)(whole % 10);
    t[n++] = G_DOT;
    t[n++] = (unsigned char)(tenths % 10);
    return n;
}

// ev_draw: the mode and source tempo, for a moment after each FUNC turn.
// Lines: "OFF"; "AUTO +1.4%" over "1BAR 121.8"; "3/4BAR 120.0" alone for a
// fixed length; "FULL" when 51 samples already keep a setting.
void loop_sync_draw(void *bmp, void *ctrl)
{
    unsigned char top[12], bottom[12];
    int nt = 0, nb = 0, i, x, b = shown_beats;
    (void)ctrl;
    if (mark_shown) {
        // SYNC, white on black, bottom right (y counts up from the bottom row)
        static const unsigned char word[4] = { G_S, G_Y, G_N, G_C };
        FILLRECT(bmp, 110, 0, 127, 6, 0);
        for (i = 0; i < 4; i++)
            glyph1(bmp, word[i], 111 + 4 * i, 5);
    }
    if (!show_ticks)
        return;
    if (shown_full) {
        top[nt++] = G_F; top[nt++] = G_U; top[nt++] = G_L; top[nt++] = G_L;
    } else if (shown_mode == MODE_OFF) {
        top[nt++] = G_O; top[nt++] = G_F; top[nt++] = G_F;
    } else {
        if (shown_mode == MODE_AUTO) {
            top[nt++] = G_A; top[nt++] = G_U; top[nt++] = G_T; top[nt++] = G_O;
        }
        if (shown_adj) {
            int a = (shown_adj < 0 ? -shown_adj : shown_adj) * 2;   // tenths of a percent
            if (nt) top[nt++] = G_SPACE;
            top[nt++] = shown_adj < 0 ? G_MINUS : G_PLUS;
            if (a >= 100) top[nt++] = (unsigned char)(a / 100);
            top[nt++] = (unsigned char)(a / 10 % 10);
            top[nt++] = G_DOT;
            top[nt++] = (unsigned char)(a % 10);
            top[nt++] = G_PCT;
        }
        if (b % 4 == 0) {
            int bars = b / 4;
            if (bars >= 10) bottom[nb++] = (unsigned char)(bars / 10);
            bottom[nb++] = (unsigned char)(bars % 10);
        } else if (b == 6) {
            bottom[nb++] = 1; bottom[nb++] = G_DOT; bottom[nb++] = 5;   // 1.5
        } else if (b == 2) {
            bottom[nb++] = 1; bottom[nb++] = G_SLASH; bottom[nb++] = 2;
        } else {
            bottom[nb++] = (unsigned char)b; bottom[nb++] = G_SLASH; bottom[nb++] = 4;   // 1/4, 3/4
        }
        bottom[nb++] = G_B; bottom[nb++] = G_A; bottom[nb++] = G_R; bottom[nb++] = G_SPACE;
        nb = put_bpm(bottom, nb, shown_src);
    }
    FILLRECT(bmp, 14, 14, 113, 49, 1);
    FILLRECT(bmp, 15, 15, 112, 48, 0);
    x = 64 - (nt * 8 - 2) / 2;
    for (i = 0; i < nt; i++, x += 8)
        glyph(bmp, top[i], x, nb ? 44 : 36);
    x = 64 - (nb * 8 - 2) / 2;
    for (i = 0; i < nb; i++, x += 8)
        glyph(bmp, bottom[i], x, 29);
}
