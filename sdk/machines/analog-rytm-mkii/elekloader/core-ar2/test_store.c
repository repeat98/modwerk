// SPDX-License-Identifier: GPL-2.0-or-later
// Host test of the Rytm core's stored-data format (store.c), run by sdk/tests/test_machine_base.py:
//     cc -std=c99 -Wall -Wextra -Werror -pedantic -DMODWERK_HOST test_store.c -o t && ./t
// The project images, the live project and the live global slots are host buffers; the stock routines store.c
// wraps are stubs. Every offset checked here is written out from the format, not taken from store.c, so the test
// pins the bytes a saved project holds: the tagged store's header and formula, the stored sound's +0x70..+0x7b,
// the stored kit's FX record + 0x50..+0x5c, the global slots' five spare bytes, and which data loads as zeros.

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define IMG_SIZE 0x1f9f32u
static unsigned char arena[2 * IMG_SIZE];  // [0] the stored project S, [1] a project file
static unsigned char host_lp[0xb4b27cu + 128u * 152u];
static unsigned char host_globals[4 * 228];
static unsigned host_gen, host_gen2;
#define ID 0x1a2b3c4du
#define OLD_ID 0x0badcafeu
const unsigned core_store_ids[] = { ID, OLD_ID, 0 };

static int saved, loaded;
static int host_save(void *dst, void *live, int a, int flags, int progress);
static int host_load(void *live, void *src, int progress);
static int host_part(void *dst, void *live, int a, int b, int c) { (void)dst; (void)live; (void)a; (void)b; (void)c; return 5; }

#define CORE_S_AT ((uintptr_t)arena)
#define CORE_LP_AT ((uintptr_t)host_lp)
#define CORE_GLOBALS_AT ((uintptr_t)host_globals)
#define CORE_SAVE_AT ((uintptr_t)host_save)
#define CORE_LOAD_AT ((uintptr_t)host_load)
#define CORE_TRACK_SAVE_AT ((uintptr_t)host_part)
#define CORE_SETTINGS_SAVE_AT ((uintptr_t)host_part)
#define CORE_LOCK_SAVE_AT ((uintptr_t)host_part)
#define CORE_LOCKS_SAVE_AT ((uintptr_t)host_part)
#define CORE_GEN host_gen
#define CORE_GEN2 host_gen2
#define CORE_DDR_LO ((uintptr_t)arena)
#define CORE_DDR_HI ((uintptr_t)arena + sizeof arena)

static int events[8][2], nevents;
static void on_project(int how, unsigned dropped) { events[nevents][0] = how; events[nevents++][1] = (int)dropped; }
void (*const ev_project[])(int, unsigned) = { on_project, 0 };
#include "store.c"

// stock's own work: stubs (stock's sound load leaves the route amounts' low bytes 0)
int st_sound_save_body(u8 *d, u8 *l, int a) { (void)d; (void)l; (void)a; return 11; }
int st_sound_load_body(u8 *l, u8 *s) { (void)s; for (int k = 0; k < 4; k++) l[0x71 + 3 * k] = 0; return 12; }
int st_pat_save_body(u8 *d, u8 *l, int a) { (void)d; (void)l; (void)a; return 13; }
int st_pat_load_body(u8 *l, u8 *s) { (void)l; (void)s; return 14; }
int st_kit_save_body(u8 *d, u8 *l, int a) { (void)d; (void)l; (void)a; return 15; }
int st_kit_load_body(u8 *l, u8 *s) { (void)l; (void)s; return 16; }
int st_glob_save_body(u8 *d, u8 *l, int a) { (void)d; (void)l; (void)a; return 17; }
int st_glob_load_body(u8 *l, u8 *s) { (void)l; (void)s; return 18; }
int st_pat_init_body(u8 *p, int a) { (void)p; (void)a; return 19; }
int st_track_init_body(u8 *t, int a) { (void)t; (void)a; return 20; }
int st_sound_init_body(u8 *s, int a, int b, int c) { (void)s; (void)a; (void)b; (void)c; return 21; }
int st_proj_init_body(void *p, int a, int b, int c) { (void)p; (void)a; (void)b; (void)c; return 22; }
int st_proj_load_body(void *l, u8 *s, int p) { (void)l; (void)s; (void)p; return 23; }

static int host_save(void *dst, void *live, int a, int flags, int progress)
{
    (void)live; (void)a; (void)flags; (void)progress;
    saved = st_image == dst;              // the save runs with its destination as the current image
    return 1;
}

static int host_load(void *live, void *src, int progress)
{
    loaded = st_image == src;
    return st_proj_load(live, src, progress);   // stock's load entry is st_proj_load's site
}

static int failures;
#define CHECK(c) do { if (!(c)) { fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #c); failures++; } } while (0)

#define FIELD(scope, bits, at) ((unsigned)(scope) << 28 | (unsigned)(bits) << 22 | (unsigned)(at))

static unsigned char *const IMG_S = arena;
static unsigned char *const IMG_F = arena + IMG_SIZE;

// The format, written out: tagged byte k of an image.
static unsigned char *tagged(unsigned char *img, unsigned k) { return img + 0x1eecfb + 1304 * (k >> 8) + 0x116 + 4 * (k & 255); }

static void make_image(unsigned char *img)
{
    memset(img, 0, IMG_SIZE);
    put32(img, 0xbeefbace);
    put32(img + 4, 9);
    put32(img + 0x1f9f2e, 0xbacef00c);
}

static void header(unsigned char *img, unsigned id, const unsigned char gens[6])
{
    for (int k = 0; k < 4; k++)
        *tagged(img, k) = id >> (24 - 8 * k);
    for (int s = 0; s < 6; s++)
        *tagged(img, 4 + s) = gens[s];
}

int main(void)
{
    // generations sound 3, kit 4, global 5, track 6, pattern 7, project 8; split T = 2, P = 4
    host_gen = 3u << 24 | 4u << 16 | 5u << 8 | 6u;
    host_gen2 = 7u << 24 | 8u << 16 | 2u << 8 | 4u;
    const unsigned char gens[6] = { 3, 4, 5, 6, 7, 8 };
    make_image(IMG_S);
    make_image(IMG_F);

    // the tagged store's formula (SPEC vectors) and its header, written by CREATE NEW
    CHECK(tagged(IMG_S, 0) == IMG_S + 0x1eee11 && tagged(IMG_S, 255) == IMG_S + 0x1ef20d);
    CHECK(tagged(IMG_S, 256) == IMG_S + 0x1ef329 && tagged(IMG_S, 4351) == IMG_S + 0x1f438d);
    for (unsigned k = 0; k < 4352; k++)
        CHECK(tag(IMG_S, k) == tagged(IMG_S, k));
    *tagged(IMG_S, 4000) = 0x55;
    core_store_globals[1][2] = 9;
    CHECK(st_proj_init(0, 0, 0, 0) == 22);
    const unsigned char want_header[10] = { 0x1a, 0x2b, 0x3c, 0x4d, 3, 4, 5, 6, 7, 8 };
    for (int k = 0; k < 10; k++)
        CHECK(IMG_S[0x1eee11 + 4 * k] == want_header[k]);
    CHECK(*tagged(IMG_S, 4000) == 0 && core_store_globals[1][2] == 0);
    CHECK(nevents == 1 && events[0][0] == CORE_PROJECT_NEW && events[0][1] == 0);

    // project scope: the split leaves 4342 - 1677*2 - 129*4 = 472 bytes from tagged byte 3880
    CHECK(PATTERNS_AT == 3364 && PROJECT_AT == 3880);
    core_store_set(FIELD(STORE_PROJECT, 8, 471 * 8), 0, 0, 0xa5);
    CHECK(*tagged(IMG_S, 4351) == 0xa5 && core_store_get(FIELD(STORE_PROJECT, 8, 471 * 8), 0, 0) == 0xa5);
    core_store_set(FIELD(STORE_PROJECT, 12, 4), 0, 0, 0xabc);      // spans bytes 0 and 1, MSB first
    CHECK(*tagged(IMG_S, 3880) == 0x0a && *tagged(IMG_S, 3881) == 0xbc);
    core_store_set(FIELD(STORE_PROJECT, 3, 1), 0, 0, 0xff);        // bits above the width are ignored
    CHECK(*tagged(IMG_S, 3880) == 0x7a && core_store_get(FIELD(STORE_PROJECT, 3, 1), 0, 0) == 7);
    CHECK(core_store_get(FIELD(0, 8, 0), host_lp, 0) == 0 && core_store_get(FIELD(7, 8, 0), host_lp, 0) == 0);

    // sound: live bytes +0x6d..+0x6f and the route amounts' low bytes; a pool sound writes through to S
    unsigned char *pool5 = host_lp + 0xb4b27c + 152 * 5;
    core_store_set(FIELD(STORE_SOUND, 32, 0), pool5, 0, 0x11223344);
    core_store_set(FIELD(STORE_SOUND, 24, 32), pool5, 0, 0x556677);
    const unsigned live_at[7] = { 0x6d, 0x6e, 0x6f, 0x71, 0x74, 0x77, 0x7a };
    const unsigned char sound_bytes[7] = { 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77 };
    for (int k = 0; k < 7; k++)
        CHECK(pool5[live_at[k]] == sound_bytes[k]);
    unsigned char *stored5 = IMG_S + 0x1f4397 + 162 * 5;
    const unsigned char stored_sound[12] = { 0x11, 0x22, 0x33, 0x1a, 0x2b, 0x3c, 0x4d, 3, 0x44, 0x55, 0x66, 0x77 };
    CHECK(memcmp(stored5 + 0x70, stored_sound, 12) == 0);
    CHECK(core_store_get(FIELD(STORE_SOUND, 16, 24), pool5, 0) == 0x4455);
    CHECK(core_store_get(FIELD(STORE_SOUND, 8, 0), 0, 0) == 0);

    // sound save and load, both directions: what the core writes, and stored bytes written out by hand
    unsigned char rec[162] = { 0 }, live[152] = { 0 };
    CHECK(st_sound_save(rec, pool5, 0) == 11 && memcmp(rec + 0x70, stored_sound, 12) == 0);
    CHECK(st_sound_load(live, rec) == 12);
    for (int k = 0; k < 7; k++)
        CHECK(live[live_at[k]] == sound_bytes[k]);
    memcpy(rec + 0x70, stored_sound, 12);
    put32(rec + 0x73, OLD_ID);                                     // an ancestor layout loads too
    memset(live, 0, sizeof live);
    st_sound_load(live, rec);
    CHECK(live[0x7a] == 0x77 && live[0x6d] == 0x11);
    rec[0x77] = 2;                                                 // another generation: zeros
    st_sound_load(live, rec);
    for (int k = 0; k < 7; k++)
        CHECK(live[live_at[k]] == 0);
    rec[0x77] = 3;
    put32(rec + 0x73, 0x99999999);                                 // an unknown layout: zeros
    st_sound_load(live, rec);
    CHECK(live[0x6d] == 0);
    put32(rec + 0x73, ID);
    st_image = 0;                                                  // a file of another project version: zeros
    st_sound_load(live, rec);
    CHECK(live[0x6d] == 0);
    st_image = IMG_S;
    memset(pool5 + 0x60, 0xee, 0x30);
    st_sound_init(pool5, 0, 0, 0);
    for (int k = 0; k < 7; k++)
        CHECK(pool5[live_at[k]] == 0);
    CHECK(pool5[0x70] == 0xee && pool5[0x72] == 0xee);

    // kit: FX words 38..41 (+0x796..+0x79d); stored kit FX record + 0x50..+0x5c (= stored kit + 0x816..+0x822)
    unsigned char *saved_kit7 = host_lp + 0xa8cf18 + 128 * 2531 + 2531 * 7;
    core_store_set(FIELD(STORE_KIT, 32, 0), saved_kit7, 0, 0x01020304);
    core_store_set(FIELD(STORE_KIT, 32, 32), saved_kit7, 0, 0x05060708);
    unsigned char *stored_kit7 = IMG_S + 0x19d3fb + 2610 * 7;
    const unsigned char kit_bytes[13] = { 1, 2, 3, 4, 5, 6, 7, 8, 0x1a, 0x2b, 0x3c, 0x4d, 4 };
    CHECK(memcmp(saved_kit7 + 0x796, kit_bytes, 8) == 0);
    CHECK(memcmp(stored_kit7 + 0x816, kit_bytes, 13) == 0);
    put32(IMG_S + 0x19d3f7, 3);                                    // the working kit copies kit 3
    unsigned char *edited3 = host_lp + 0xa8cf18 + 2531 * 3, *edited4 = edited3 + 2531;
    core_store_set(FIELD(STORE_KIT, 8, 0), edited3, 0, 0x42);
    CHECK(IMG_S[0x19c9c5 + 0x816] == 0x42 && IMG_S[0x19c9c5 + 0x822] == 4);
    core_store_set(FIELD(STORE_KIT, 8, 0), edited4, 0, 0x43);      // not the kit in use: no stored copy
    CHECK(IMG_S[0x19d3fb + 2610 * 4 + 0x816] == 0 && edited4[0x796] == 0x43);
    // a sound of a kit writes through to its sound in the stored kit
    core_store_set(FIELD(STORE_SOUND, 8, 48), saved_kit7 + 42 + 152 * 11, 0, 0x99);
    CHECK(stored_kit7[46 + 162 * 11 + 0x7b] == 0x99 && stored_kit7[46 + 162 * 11 + 0x77] == 3);
    unsigned char krec[2610] = { 0 }, klive[2531] = { 0 };
    CHECK(st_kit_save(krec, saved_kit7, 0) == 15 && memcmp(krec + 0x816, kit_bytes, 13) == 0);
    CHECK(st_kit_load(klive, krec) == 16 && memcmp(klive + 0x796, kit_bytes, 8) == 0);
    krec[0x822] = 1;
    st_kit_load(klive, krec);
    for (int k = 0; k < 8; k++)
        CHECK(klive[0x796 + k] == 0);

    // global slots: five spare bytes at + 0x4b of each 80-byte stored slot, valid by the image's header
    core_store_set(FIELD(STORE_GLOBAL, 32, 8), 0, 2, 0xfedcba98);
    CHECK(core_store_globals[2][0] == 0 && core_store_globals[2][1] == 0xfe && core_store_globals[2][4] == 0x98);
    CHECK(memcmp(IMG_S + 0x1f9dee + 80 * 2 + 0x4b, core_store_globals[2], 5) == 0);
    CHECK(core_store_get(FIELD(STORE_GLOBAL, 8, 8), 0, 4) == 0);
    unsigned char *live2 = host_globals + 228 * 2;
    unsigned char *file_slot2 = IMG_F + 0x1f9dee + 80 * 2;
    CHECK(st_glob_save(file_slot2, live2, 0) == 17 && memcmp(file_slot2 + 0x4b, core_store_globals[2], 5) == 0);
    memset(core_store_globals, 0, sizeof core_store_globals);
    st_glob_load(live2, file_slot2);                               // the file has no header yet: zeros
    CHECK(core_store_globals[2][1] == 0);
    header(IMG_F, ID, gens);
    st_glob_load(live2, file_slot2);
    CHECK(core_store_globals[2][1] == 0xfe && core_store_globals[2][4] == 0x98);
    unsigned char sysex[80];
    memcpy(sysex, file_slot2, 80);
    st_glob_load(live2, sysex);                                    // a SysEx global dump: zeros
    CHECK(core_store_globals[2][1] == 0);
    st_glob_save(file_slot2, host_globals + 1, 0);                 // not a live slot: zeros
    CHECK(file_slot2[0x4c] == 0);

    // track and pattern bytes: tagged 10 + (13n + t)T and 3364 + 4n
    unsigned char *work = host_lp + 24, *pat8 = host_lp + 85784 + 85760 * 8;
    core_store_set(FIELD(STORE_TRACK, 16, 0), pat8, 6, 0xbeef);
    CHECK(pat8[917 * 6 + 785] == 0xbe && pat8[917 * 6 + 786] == 0xef);
    CHECK(*tagged(IMG_S, 256) == 0xbe && *tagged(IMG_S, 257) == 0xef); // pattern 8 is n = 9: 10 + (117 + 6) * 2
    CHECK(core_store_get(FIELD(STORE_TRACK, 16, 0), pat8, 13) == 0);
    core_store_set(FIELD(STORE_PATTERN, 32, 0), work, 0, 0xc0ffee11);
    CHECK(memcmp(work + 85696, "\xc0\xff\xee\x11", 4) == 0 && *tagged(IMG_S, 3364) == 0xc0 && *tagged(IMG_S, 3367) == 0x11);
    for (int t = 0; t < 13; t++)
        work[917 * t + 785] = (unsigned char)(0x20 + t), work[917 * t + 786] = (unsigned char)(0x40 + t);
    unsigned char *file_work = IMG_F + 0x18, *file_pat2 = IMG_F + 0x3345 + 13101 * 2;
    for (unsigned k = 10; k < 4352; k++)
        *tagged(IMG_F, k) = 0x77;
    CHECK(st_pat_save(file_pat2, work, 0) == 13);                  // pattern 2 is n = 3
    CHECK(*tagged(IMG_F, 10 + 39 * 2) == 0x20 && *tagged(IMG_F, 10 + 51 * 2 + 1) == 0x4c);
    CHECK(*tagged(IMG_F, 3364 + 12) == 0xc0 && *tagged(IMG_F, 3364 + 15) == 0x11);
    CHECK(*tagged(IMG_F, 3880) == 0x77);                          // not the working pattern: the project stays
    CHECK(st_pat_save(file_work, work, 0) == 13);                  // the working pattern takes the project along
    CHECK(*tagged(IMG_F, 3880) == 0x7a && *tagged(IMG_F, 4351) == 0xa5 && *tagged(IMG_F, 3) == 0x4d);
    unsigned char *other = host_lp + 85784;
    memset(other + 85696, 0x33, 64);
    CHECK(st_pat_load(other, file_pat2) == 14);
    CHECK(other[917 * 12 + 786] == 0x4c && other[917 * 12 + 787] == 0 && other[85699] == 0x11 && other[85700] == 0);
    *tagged(IMG_F, 7) = 9;                                         // track generation differs: zeros there only
    st_pat_load(other, file_pat2);
    CHECK(other[785] == 0 && other[85696] == 0xc0);
    *tagged(IMG_F, 7) = 6;
    unsigned char copy13101[13101];
    st_pattern_copy(file_pat2, copy13101, sizeof copy13101);       // a pattern copied in brings no module data
    CHECK(*tagged(IMG_F, 10 + 39 * 2) == 0 && *tagged(IMG_F, 3364 + 12) == 0 && *tagged(IMG_F, 3880) == 0x7a);
    st_pattern_copy(copy13101, file_work, sizeof copy13101);       // into a buffer of no image: left alone
    CHECK(*tagged(IMG_F, 10) == 0x20);

    // a song record copied keeps the target's tagged bytes
    unsigned char song[0x518], src[0x518];
    memset(song, 1, sizeof song);
    memset(src, 2, sizeof src);
    CHECK(st_song_copy(song, src, 0x518) == song);
    CHECK(song[0x116] == 1 && song[0x116 + 4 * 255] == 1 && song[0x117] == 2 && song[0x115] == 2 && song[0x517] == 2);
    st_song_copy(song, src, 100);
    CHECK(song[0x116] == 1 && song[99] == 2);

    // a project load: the dropped scopes and S cleaned of what this layout cannot read
    nevents = 0;
    *tagged(IMG_F, 8) = 1;                                         // the file's pattern generation is another
    st_image = 0;
    CHECK(st_file_load(host_lp, IMG_F, 0) == 23 && loaded && st_image == IMG_S);
    CHECK(nevents == 1 && events[0][0] == CORE_PROJECT_LOADED && events[0][1] == (int)STORE_DROPPED(STORE_PATTERN));
    put32(IMG_F + 4, 8);                                           // an older project version brings nothing
    st_file_load(host_lp, IMG_F, 0);
    CHECK(!loaded && events[1][1] == 0x78 && *tagged(IMG_S, 3880) == 0);
    put32(IMG_F + 4, 9);
    *tagged(IMG_S, 7) = 1;                                         // S's track generation is another
    *tagged(IMG_S, 20) = 0x12;
    st_proj_load(host_lp, 0, 0);
    CHECK(*tagged(IMG_S, 20) == 0 && *tagged(IMG_S, 7) == 6 && *tagged(IMG_S, 3364) == 0xc0);
    put32(IMG_S + 0x1eee11, 0);                                    // S of no known layout: every scope cleared
    IMG_S[0x1f9dee + 0x4b] = 0x44;
    st_proj_load(host_lp, 0, 0);
    CHECK(*tagged(IMG_S, 3364) == 0 && IMG_S[0x1f9dee + 0x4b] == 0 && *tagged(IMG_S, 0) == 0x1a);

    // SAVE PROJECT AS: the saved file's core bytes come back to S, by the save's flags
    for (unsigned k = 0; k < 4352; k++)
        *tagged(IMG_F, k) = 0x66;
    header(IMG_F, ID, gens);
    IMG_F[0x1f9dee + 80 * 3 + 0x4f] = 0x3f;
    IMG_F[0x1f4397 + 162 * 127 + 0x7b] = 0x5d;
    IMG_F[0x19d3fb + 2610 * 127 + 0x822] = 0x6e;
    IMG_F[0x19d3fb + 46 + 162 * 11 + 0x70] = 0x7f;
    IMG_F[0x19c9c5 + 0x816] = 0x80;
    put32(IMG_F + 0x19d3f7, 4);                                    // another working kit than S's: not copied
    CHECK(st_file_save(IMG_F, host_lp, 0, 0x02 | 0x04 | 0x08 | 0x20, 0) == 1 && saved && st_image == IMG_S);
    CHECK(IMG_S[0x1f9dee + 80 * 3 + 0x4f] == 0x3f && IMG_S[0x1f4397 + 162 * 127 + 0x7b] == 0x5d);
    CHECK(IMG_S[0x19d3fb + 2610 * 127 + 0x822] == 0x6e && IMG_S[0x19d3fb + 46 + 162 * 11 + 0x70] == 0x7f);
    CHECK(IMG_S[0x19c9c5 + 0x816] == 0x42 && *tagged(IMG_S, 4351) == 0x66);
    CHECK(IMG_S[0x19d3fb + 46 + 0x6f] == 0);                       // only the core's bytes are copied
    put32(IMG_F + 0x19d3f7, 3);
    *tagged(IMG_F, 4351) = 0x67;
    st_file_save(IMG_F, host_lp, 0, 0x04, 0);                      // the working kit, its index the same
    CHECK(IMG_S[0x19c9c5 + 0x816] == 0x80 && *tagged(IMG_S, 4351) == 0x66);

    // part saves follow a pattern's parts only when the image's layout is this build's
    for (int t = 0; t < 13; t++)
        work[917 * t + 785] = 0x31;
    CHECK(st_track_save(file_work + 4 + 641 * 5, work + 917 * 5, 0, 0, 0) == 5);
    CHECK(*tagged(IMG_F, 10 + 5 * 2) == 0x31);
    work[85696] = 0x32;
    CHECK(st_settings_save(file_work + 13089, work + 85683, 0) == 5 && *tagged(IMG_F, 3364) == 0x32);
    work[85696] = 0x34;
    CHECK(st_locks_save(file_work + 8337, work + 11921, 0) == 5 && *tagged(IMG_F, 3364) == 0x34);
    *tagged(IMG_F, 8) = 2;
    work[85696] = 0x35;
    CHECK(st_lock_save(file_work + 8337, work + 11921, 0, 1, 2) == 5 && *tagged(IMG_F, 3364) == 0x34);

    // inits clear the homes
    st_pat_init(work, 0);
    st_track_init(work + 917 * 3, 0);
    CHECK(work[85696] == 0 && work[917 * 3 + 785] == 0 && work[917 * 4 + 785] == 0x31);

    if (failures)
        return 1;
    puts("ok");
    return 0;
}
