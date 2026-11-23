/* SPDX-License-Identifier: MIT
 * Copyright (C) 2026 Andrey Sidorkin
 *
 * SONGBOOK on the host: songbook.c (built with -DAS_HOST) against simulated battery RAM and simulated stock
 * routines: the per-file arrangement writer and reader (a file holds one slot's working and saved blocks and all 8
 * flags, as stock's do), the file copy, the project job's writer, clear and the message box. verify.py runs it. */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

int as_key(int code, int pressed);
void as_tick(void *api);
void as_draw(unsigned char *frame);
int as_writer(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4);
void as_project_load(void);
void as_project_new(void);
unsigned as_project_loaded(void);
unsigned as_project_stored(void);
unsigned as_project_reloaded(void);
unsigned as_modules_ready(void);
void as_host_reinstall(void);
void as_host_keep_memory(void);
void as_host_back_memory(void);

#define LEFT 0x34
#define RIGHT 0x21
#define BLOCK 5652u
#define SLOTS 8u
#define W(n) (4u + (n) * BLOCK)                  /* offsets into cs1 */
#define S(n) (4u + (SLOTS + (n)) * BLOCK)
#define FLAGS (4u + 2u * SLOTS * BLOCK)
#define CHG 0x1614cu

static uint8_t cs1[0x16200];             /* 0x10000000 .. : the slots, their flags, the changed mask */
static uint8_t rec[20];                  /* 0x100f8f10 */
static uint8_t misc[0x2000];             /* 0x80004f00 .. */
static uint32_t change_window, playing;
static uint8_t chosen;               /* 0x100b14d1: the arrangement chosen */
static uint8_t arr_mode;             /* 0x460d1aec's low byte: arranger mode */
static uint8_t mode_wanted;          /* 0x80000010: the mode stock applies when a load ends */
static uint8_t msg_up;               /* 0x460d1e70's low byte: a message box is open */
static int closes;
static uint8_t list[16];             /* 0x400c0ba0: the CHANGE list's first row shown, then its cursor */
static int failures, checks;

uint8_t host_rd8(uint32_t a)
{
    if (a >= 0x10000000u && a < 0x10000000u + sizeof cs1) return cs1[a - 0x10000000u];
    if (a >= 0x100f8f10u && a <= 0x100f8f23u) return rec[a - 0x100f8f10u];
    if (a >= 0x400c0b40u && a < 0x400c0b44u) return (uint8_t)(change_window >> (8 * (3 - (a - 0x400c0b40u))));
    if (a >= 0x800065b8u && a < 0x800065bcu) return (uint8_t)(playing >> (8 * (3 - (a - 0x800065b8u))));
    if (a >= 0x80004f00u && a < 0x80004f00u + sizeof misc) return misc[a - 0x80004f00u];
    if (a == 0x100b14d1u) return chosen;
    if (a == 0x460d1aefu) return arr_mode;
    if (a >= 0x460d1aecu && a < 0x460d1aefu) return 0;
    if (a == 0x460d1e73u) return msg_up;
    if (a >= 0x460d1e70u && a < 0x460d1e73u) return 0;
    if (a >= 0x400c0ba0u && a < 0x400c0bb0u) return list[a - 0x400c0ba0u];
    fprintf(stderr, "read of 0x%08x\n", a);
    return 0;
}
void host_wr8(uint32_t a, uint8_t v)
{
    if (a >= 0x10000000u && a < 0x10000000u + sizeof cs1) { cs1[a - 0x10000000u] = v; return; }
    if (a >= 0x100f8f10u && a <= 0x100f8f23u) { rec[a - 0x100f8f10u] = v; return; }
    if (a == 0x80000010u) { mode_wanted = v; return; }
    if (a >= 0x400c0ba0u && a < 0x400c0bb0u) { list[a - 0x400c0ba0u] = v; return; }
    fprintf(stderr, "write of 0x%08x\n", a);
}

/* ---- stock's arrangement files: one slot's two blocks and all 8 flags */
struct file { char path[64]; uint8_t work[BLOCK], saved[BLOCK], flags[SLOTS]; int used; };
static struct file files[300];
static int writes, reads, fail_read;
static const char *fail_read_path;      /* one file that will not read, NULL none */
static int fail_bak_writes_after = -1;  /* backup writes that succeed before the rest fail, -1 never */
static struct file *find(const char *path)
{
    for (int i = 0; i < 300; ++i) if (files[i].used && !strcmp(files[i].path, path)) return &files[i];
    return 0;
}
static struct file *create(const char *path)
{
    struct file *f = find(path);
    for (int i = 0; i < 300 && !f; ++i) if (!files[i].used) { f = &files[i]; f->used = 1; snprintf(f->path, sizeof f->path, "%s", path); }
    return f;
}
static void files_remove(const char *path) { struct file *f = find(path); if (f) f->used = 0; }
static int file_count(void) { int n = 0; for (int i = 0; i < 300; ++i) n += files[i].used; return n; }
int host_arr_write(const char *path, unsigned slot)
{
    if (fail_bak_writes_after >= 0 && strstr(path, ".bak")) {
        if (fail_bak_writes_after == 0) return -1;
        --fail_bak_writes_after;
    }
    struct file *f = create(path);
    memcpy(f->work, &cs1[W(slot)], BLOCK); memcpy(f->saved, &cs1[S(slot)], BLOCK); memcpy(f->flags, &cs1[FLAGS], SLOTS);
    ++writes;
    return 0;
}
static const char *fail_open_path;      /* one file whose opens fail fail_opens more times while it stays there */
static int fail_opens, fail_exists;     /* fail_exists: the exists check fails too (answers "not there") */
int host_open_read(const char *path)
{
    if (fail_open_path && !strcmp(path, fail_open_path) && fail_opens > 0) { --fail_opens; return -1; }
    return find(path) ? 0 : -1;
}
int host_exists(const char *path)
{
    if (fail_exists && fail_open_path && !strcmp(path, fail_open_path)) return 0;
    return find(path) != 0;
}
int host_read_slot(const char *path, unsigned slot)
{
    struct file *f = find(path);
    if (!f) return 0;
    if (fail_read || (fail_read_path && !strcmp(path, fail_read_path))) return -1;
    memcpy(&cs1[W(slot)], f->work, BLOCK); memcpy(&cs1[S(slot)], f->saved, BLOCK); memcpy(&cs1[FLAGS], f->flags, SLOTS);
    cs1[CHG] &= (uint8_t)~(1u << slot);
    ++reads;
    return 1;
}
int host_put(const char *path, const void *src, unsigned n) { struct file *f = create(path); memcpy(f->work, src, n); return 1; }
int host_get(const char *path, void *dst, unsigned n) { struct file *f = find(path); if (!f) return 0; memcpy(dst, f->work, n); return 1; }
int host_copy(const char *to, const char *from)
{
    struct file *f = find(from);
    if (!f) return 0;
    struct file *t = create(to);
    memcpy(t->work, f->work, BLOCK); memcpy(t->saved, f->saved, BLOCK); memcpy(t->flags, f->flags, SLOTS);
    return 1;
}

/* ---- the rest of stock */
static int posted, post_refuse, stock_writes, clears;
static char last_message[32];
int host_post_write(void) { if (post_refuse) return post_refuse == 7 ? -7 : -3; ++posted; return 1; }
const char *host_projdir(void) { return "/SET/PROJ"; }
void host_clear_arr(unsigned slot) { ++clears; memset(&cs1[W(slot)], 0, BLOCK); memset(&cs1[S(slot)], 0, BLOCK); cs1[FLAGS + slot] = 0; }
void host_message(const char *t) { snprintf(last_message, sizeof last_message, "%s", t); }
static int list_draws;
void host_draw_change(void) { ++list_draws; }
void host_arr_mode_on(void) { arr_mode = 1; }
int host_close_message(void) { msg_up = 0; ++closes; return 0; }
static int select_busy;                         /* frames stock refuses select_arr (a change of its own pending) */
static int applies;
void host_arr_apply(int on) { ++applies; arr_mode = (uint8_t)!!on; }
int host_select_arr(unsigned n) { if (select_busy) { --select_busy; return -1; } chosen = (uint8_t)n; return 0; }
/* Stock's writer: each changed slot (or one with no file yet) to arr0N.work. */
int host_stock_writer(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4)
{
    (void)a1; (void)a3; (void)a4;
    char p[64];
    /* As stock's writer (0x40091680): a slot whose bit is in the mask, or whose file is missing, is written, and its
     * bit in 0x1001614c is then SET (0x40091748): that byte says "may differ from the project's saved copy". */
    for (unsigned n = 0; n < SLOTS; ++n) {
        snprintf(p, sizeof p, "/SET/PROJ/arr%02u.work", n + 1);
        if ((a2 >> n & 1) || !find(p)) { host_arr_write(p, n); cs1[CHG] |= (uint8_t)(1u << n); }
    }
    ++stock_writes;
    return 0;
}
static unsigned char lcd[1024];
void host_set(unsigned char *frame, int x, int y, int on) { unsigned char *b = frame + x * 8 + 7 - (y >> 3), m = (unsigned char)(1u << (y & 7)); if (on) *b |= m; else *b &= (unsigned char)~m; }
static int lit(int x, int y) { return lcd[x * 8 + 7 - (y >> 3)] >> (y & 7) & 1; }
int host_pixel(const unsigned char *frame, int x, int y) { return frame[x * 8 + 7 - (y >> 3)] >> (y & 7) & 1; }
/* The main screen's arrangement row as stock draws it: a black bar, the icon's three white lines, then the name. */
static void main_screen(void)
{
    memset(lcd, 0, sizeof lcd);
    for (int x = 42; x < 128; ++x) for (int y = 32; y <= 38; ++y) host_set(lcd, x, y, 1);
    for (int x = 45; x <= 49; ++x) for (int y = 33; y <= 37; y += 2) host_set(lcd, x, y, 0);
}

static void check(const char *name, int ok)
{
    ++checks;
    if (!ok) { ++failures; printf("[FAIL] %s\n", name); }
    else printf("[PASS] %s\n", name);
}

/* The 8 slots marked with one byte, so a book's content can be told apart; flags too. */
static void mark(uint8_t m)
{
    for (unsigned i = 4; i < FLAGS; ++i) cs1[i] = (uint8_t)(m + i % 7);
    for (unsigned n = 0; n < SLOTS; ++n) cs1[FLAGS + n] = (uint8_t)((m + n) & 1);
}
static int marked(uint8_t m)
{
    for (unsigned i = 4; i < FLAGS; ++i) if (cs1[i] != (uint8_t)(m + i % 7)) return 0;
    for (unsigned n = 0; n < SLOTS; ++n) if (cs1[FLAGS + n] != (uint8_t)((m + n) & 1)) return 0;
    return 1;
}
static void put_arr01_08(void)
{
    char p[64];
    for (unsigned n = 0; n < SLOTS; ++n) { snprintf(p, sizeof p, "/SET/PROJ/arr%02u.work", n + 1); host_arr_write(p, n); }
}
static int tap(int code) { int t = as_key(code, 1); as_key(code, 0); return t; }
static void job(void) { as_writer(0x100b14f0u, 0xff, 0, 0); }   /* the card task runs the posted job */
static unsigned diag(void) { struct { volatile uint32_t value; } api = {0}; as_tick((void *)&api); return api.value; }
static unsigned book(void) { return diag() & 15; }
static void settle(void) { for (int i = 0; i < 125; ++i) as_tick(0); }   /* stock's load is over */

int main(void)
{
    as_modules_ready();
    check("installed with no record: book 1", book() == 0);

    mark(0x10);                                    /* book 1's songs, already on the card */
    put_arr01_08();
    change_window = 0;
    check("LEFT/RIGHT outside ARR > CHANGE are stock's", tap(RIGHT) == 0 && tap(LEFT) == 0);
    change_window = 0x46c7d384u;
    playing = 1;
    check("while playing, RIGHT in ARR > CHANGE is taken but changes nothing", tap(RIGHT) == 1 && posted == 0 && !strcmp(last_message, "STOP TO CHANGE BOOK"));
    playing = 0;
    check("LEFT at book 1 changes nothing", tap(LEFT) == 1 && posted == 0);
    check("RIGHT posts stock's write job", tap(RIGHT) == 1 && posted == 1);
    check("a second press while it runs is ignored", tap(RIGHT) == 1 && posted == 1);
    job();
    check("the job wrote book 1 through stock's writer", stock_writes == 1);
    check("leaving book 1 kept its backup, arr01.bak .. arr08.bak", find("/SET/PROJ/arr01.bak") && find("/SET/PROJ/arr08.bak"));
    check("a book never used starts as 8 cleared arrangements", clears == 8);
    as_tick(0);
    check("the open list is drawn again with the new book's names, once", list_draws == 1 && (as_tick(0), list_draws == 1));
    check("a book never visited starts on arrangement 1", chosen == 0);
    msg_up = 1; as_tick(0);
    check("the job's NOW SAFE TO EJECT! is closed as it opens", msg_up == 0 && closes == 1);
    msg_up = 1; as_tick(0);
    check("only that one: a later message stays", msg_up == 1);
    msg_up = 0;
    check("now on book 2, nothing changed, nothing written as arr09 yet", book() == 1 && cs1[CHG] == 0 && !find("/SET/PROJ/arr09.work"));

    mark(0x20); cs1[CHG] = 0x04;                   /* book 2's songs, one changed */
    int w = writes;
    job();
    check("a write on book 2 writes all 8 of arr09-arr16, not arr01-08", stock_writes == 1 && writes == w + 8 && find("/SET/PROJ/arr09.work") && find("/SET/PROJ/arr16.work") && cs1[CHG] == 0);
    w = writes;
    job();
    check("the SYNC job asks for all 8: all 8 written again, as stock does", writes == w + 8);
    w = writes;
    as_writer(0x100b14f0u, 0, 0, 0);
    check("a job asking for none, with nothing changed: nothing written", writes == w);
    /* the list's FUNC + PLAY: an arrangement cleared without being marked changed */
    host_clear_arr(4); cs1[CHG] = 0;
    tap(LEFT); job(); as_tick(0); tap(RIGHT); job(); as_tick(0);
    check("a clear the list did not mark changed stays cleared after leaving the book", book() == 1 && cs1[W(4) + 30] == 0 && cs1[W(3) + 30] != 0);
    mark(0x20); job();                             /* book 2 as before, for the checks below */

    tap(RIGHT); job();                             /* to book 3, new */
    mark(0x30); cs1[CHG] = 1;
    tap(LEFT); job();                              /* back to book 2: book 3 written first */
    check("back on book 2: its songs and flags are in the slots", book() == 1 && marked(0x20) && cs1[CHG] == 0);
    check("book 3 went to arr17-arr24", find("/SET/PROJ/arr17.work") && find("/SET/PROJ/arr24.work"));
    tap(RIGHT); job();
    check("book 3's songs come back", book() == 2 && marked(0x30));
    chosen = 5; tap(LEFT); job(); as_tick(0);                       /* arrangement 6 chosen in book 3, then to book 2 */
    check("book 2 comes back on its own last choice, not book 3's", book() == 1 && chosen == 0);
    chosen = 2; tap(RIGHT); job(); as_tick(0);
    check("and book 3 on arrangement 6 again", book() == 2 && chosen == 5);
    check("with the list's cursor on it", list[7] == 5 && list[4] == 0);
    tap(LEFT); job(); tap(LEFT); job();
    check("back on book 1: its songs from the backup", book() == 0 && marked(0x10));
    int sw = stock_writes;
    check("arriving at book 1 marks all 8 changed, so stock rewrites arr01-08", cs1[CHG] == 0xff);
    job();
    check("then stock's writer writes them", stock_writes == sw + 1 && find("/SET/PROJ/arr03.work")->work[100] == cs1[W(2) + 100]);

    /* arr01-08 overwritten while the module was away: book 1 comes back from the backup and repairs them */
    tap(RIGHT); job();                             /* to book 2; the backup is fresh */
    mark(0x66);
    put_arr01_08();
    mark(0x20);
    tap(LEFT); job();
    check("damaged arr01-08: book 1 still comes back from its backup", book() == 0 && marked(0x10));
    job();
    { struct file *f = find("/SET/PROJ/arr03.work"); check("and stock's next write repairs arr01-08", f && f->work[100] == cs1[W(2) + 100]); }

    post_refuse = 1;
    tap(RIGHT);
    check("a refused job leaves the book as it is", book() == 0 && !strcmp(last_message, "CARD BUSY"));
    post_refuse = 7;
    tap(RIGHT);
    check("with no project loaded it says so", book() == 0 && !strcmp(last_message, "NO PROJECT"));
    post_refuse = 0;

    tap(RIGHT); job();                             /* book 2 */
    fail_read = 1;
    tap(LEFT); job();
    check("a file that will not read is reported", (as_tick(0), !strcmp(last_message, "BOOK FILE ERROR")));
    fail_read = 0;
    { uint8_t keep4 = find("/SET/PROJ/arr04.work")->work[9];
      int w = writes, sw = stock_writes; job();      /* a sync on book 1, read only in part, nothing edited */
      check("a sync on book 1 read only in part writes none of arr01-08 (stock's writer would write all 8)", writes == w && stock_writes == sw && find("/SET/PROJ/arr04.work")->work[9] == keep4);
    }
    tap(RIGHT); job(); tap(LEFT); job();
    check("nothing marked changed after it, so arr01-08 stay as they are", cs1[CHG] == 0 && find("/SET/PROJ/arr04.work")->work[9] == (uint8_t)(0x10 + (W(3) + 9) % 7));
    tap(RIGHT); job(); tap(LEFT); job();
    check("and book 1 comes back from arr01-08, the backup left alone", book() == 0 && marked(0x10));

    /* the owner's review (#1737): a backup file missing, unreadable, or written only in part */
    tap(RIGHT); job(); as_tick(0);                 /* book 2; book 1's backup is fresh */
    mark(0x20); cs1[CHG] = 0;
    files_remove("/SET/PROJ/arr03.bak");           /* the owner's case: one backup file missing */
    { uint8_t keep3 = find("/SET/PROJ/arr03.work")->work[100];
      tap(LEFT); job(); as_tick(0);
      check("a missing arr03.bak: slot 3 comes from arr03.work, unmarked", book() == 0 && cs1[W(2) + 100] == keep3 && !(cs1[CHG] & 0x04));
      check("the slots that read from their backup are marked, so arr01-08 are repaired", (cs1[CHG] & 0xfb) == 0xfb);
      job();
      check("and the next save leaves arr03.work as it was, not empty", find("/SET/PROJ/arr03.work")->work[100] == keep3); }
    tap(RIGHT); job(); as_tick(0);                 /* book 2 again; a full backup is written */
    mark(0x20); cs1[CHG] = 0;
    fail_read_path = "/SET/PROJ/arr05.bak";        /* one backup file there but not readable */
    { uint8_t keep5 = find("/SET/PROJ/arr05.work")->work[100];
      tap(LEFT); job(); as_tick(0);
      check("an unreadable arr05.bak: slot 5 comes from arr05.work, unmarked", book() == 0 && cs1[W(4) + 100] == keep5 && !(cs1[CHG] & 0x10));
      job();
      check("and the next save leaves arr05.work as it was", find("/SET/PROJ/arr05.work")->work[100] == keep5); }
    fail_read_path = 0;
    /* a backup write that fails half way when leaving book 1 is never read back */
    mark(0x10); cs1[CHG] = 0xff; job();          /* book 1 as it should be, written to arr01-08 */
    fail_bak_writes_after = 3;
    tap(RIGHT); job(); as_tick(0);
    fail_bak_writes_after = -1;
    mark(0x20);
    { uint8_t want = find("/SET/PROJ/arr07.work")->work[100];
      find("/SET/PROJ/arr07.bak")->work[100] = (uint8_t)(want + 1);  /* the stale backup differs from arr07.work */
      tap(LEFT); job(); as_tick(0);
      check("after a partial backup, book 1 comes from arr01-08, nothing marked", book() == 0 && cs1[W(6) + 100] == want && cs1[CHG] == 0); }

    /* the owner's review (#1737): an existing arrangement file that fails to open once is not "no such file" */
    tap(RIGHT); job(); as_tick(0);                 /* book 2 */
    mark(0x20); cs1[CHG] = 0xff; job();            /* book 2's songs saved to arr09-16 */
    { uint8_t keep11 = find("/SET/PROJ/arr11.work")->work[100];
      tap(RIGHT); job(); as_tick(0);               /* book 3 */
      fail_open_path = "/SET/PROJ/arr11.work"; fail_opens = 1;
      last_message[0] = 0;
      tap(LEFT); job(); as_tick(0);                /* back to book 2: arr11.work does not open this once */
      check("arr11.work there but not opened: reported as a book file error", book() == 1 && !strcmp(last_message, "BOOK FILE ERROR"));
      as_host_reinstall(); as_modules_ready();      /* the owner's review: the module reloads before the next sync */
      check("after a reinstall it still knows book 2 was read only in part", book() == 1);
      int w0 = writes; job();                      /* the next sync, nothing edited */
      check("the next sync writes none of book 2's files", writes == w0);
      check("and arr11.work keeps its saved arrangement", find("/SET/PROJ/arr11.work")->work[100] == keep11);
      cs1[W(0) + 100] ^= 0x5a; cs1[CHG] = 0x01; job();   /* an edit of slot 1 on that book */
      check("an edit on that book is still saved, to arr09.work only", find("/SET/PROJ/arr09.work")->work[100] == cs1[W(0) + 100] && find("/SET/PROJ/arr11.work")->work[100] == keep11);
      fail_open_path = 0; fail_opens = 0;
      /* the same after Undo: this copy comes back with its memory from before the failed read (another build ran) */
      tap(RIGHT); job(); as_tick(0);              /* book 3 */
      as_host_keep_memory();
      fail_open_path = "/SET/PROJ/arr11.work"; fail_opens = 1;
      tap(LEFT); job(); as_tick(0);                /* the failed read happens in another build's trial */
      fail_open_path = 0; fail_opens = 0;
      as_host_back_memory(); as_modules_ready();
      { int w1 = writes; job();
        check("back after Undo: the next sync still writes nothing of book 2", book() == 1 && writes == w1 && find("/SET/PROJ/arr11.work")->work[100] == keep11); }
      tap(RIGHT); job(); tap(LEFT); job(); as_tick(0);
      check("opened again later, arr11.work reads into slot 3", book() == 1 && cs1[W(2) + 100] == keep11);
      tap(RIGHT); job();
      fail_open_path = "/SET/PROJ/arr11.work"; fail_opens = 1; fail_exists = 1;
      tap(LEFT); job(); as_tick(0);                /* the open and the exists check fail once, the second open works */
      check("a failed open and a failed exists check: the second open reads it", book() == 1 && cs1[W(2) + 100] == keep11 && cs1[CHG] == 0);
      fail_open_path = 0; fail_opens = 0; fail_exists = 0; }
    mark(0x20); cs1[CHG] = 0xff; job();            /* book 2 saved as before the edit, for the cases below */
    tap(LEFT); job(); as_tick(0);                  /* back to book 1 */

    /* reinstalls and power cycles */
    tap(RIGHT); job();
    check("on book 2", book() == 1 && marked(0x20));
    as_host_reinstall(); as_modules_ready();
    check("reinstalled without a project load: the slots still hold book 2, and it knows", book() == 1);
    mark(0x10);                                    /* a power cycle: stock read arr01-08 (book 1) into the slots */
    as_host_reinstall(); as_modules_ready();
    check("after a power cycle the slots hold book 1, and it knows", book() == 0);
    as_modules_ready();
    check("a second ev_modules_ready changes nothing", book() == 0);
    tap(RIGHT); job();
    check("from there, book 2's own songs come back", book() == 1 && marked(0x20));

    as_project_load(); as_project_loaded();       /* stock's first job: it only checks the files */
    check("while stock's first load job runs, the slots still hold book 2, and it knows", book() == 1 && marked(0x20));
    { int sw0 = stock_writes; cs1[CHG] = 1; job();   /* a write between the two jobs (the developer's book 1 loss) */
      check("a write between the two jobs saves book 2 to its own files, never arr01-08", stock_writes == sw0 && book() == 1); }
    as_project_new(); mark(0x10);                 /* the second: the new-project step, then arr01-08 into the slots */
    check("a project load: book 1", book() == 0);

    /* a kept build on book 2; a trial of another build switches to book 1; the kept build comes back with its memory */
    tap(RIGHT); job();
    check("the kept build on book 2", book() == 1 && marked(0x20));
    as_host_keep_memory();
    as_host_reinstall(); as_modules_ready();       /* the trial build */
    check("the trial build sees book 2", book() == 1);
    tap(LEFT); job();
    check("and switches to book 1", book() == 0 && marked(0x10));
    as_host_back_memory(); as_modules_ready();     /* rolled back: the kept build, its memory saying book 2 */
    check("the kept build does not trust its old memory: book 1", book() == 0);
    w = writes;
    cs1[CHG] = 1; job();
    check("so a write goes to arr01-08, not book 1's songs into arr09-arr16", stock_writes > 0 && find("/SET/PROJ/arr09.work")->work[50] == (uint8_t)(0x20 + (W(0) + 50) % 7));
    as_modules_ready();
    check("with nothing else run since, its own memory stands", book() == 0);

    /* SAVE PROJECT and RELOAD PROJECT */
    tap(RIGHT); job();
    int before = file_count();
    as_project_stored();
    check("SAVE PROJECT copies arr09-arr24 and arrbook to .strd, and nothing past them", find("/SET/PROJ/arr09.strd") && find("/SET/PROJ/arr24.strd") && !find("/SET/PROJ/arr25.strd") && find("/SET/PROJ/arrbook.strd") && file_count() == before + 17);
    mark(0x55); cs1[CHG] = 1; job();               /* book 2 edited and written after the save */
    as_project_reloaded(); as_project_new(); mark(0x10);
    check("RELOAD PROJECT leaves the slots on book 1", book() == 0);
    tap(RIGHT); job();
    check("book 2 is as saved, not as edited after", book() == 1 && marked(0x20));


    /* a project load comes back to the book and arrangement it was left on */
    while (book() != 2) { tap(book() < 2 ? RIGHT : LEFT); job(); as_tick(0); }
    chosen = 4; job();                             /* book 3, arrangement 5, SYNC */
    as_project_load(); as_project_loaded();
    { int p1 = posted; for (int i = 0; i < 300; ++i) as_tick(0);
      check("no return switch between stock's two load jobs, however long the gap", posted == p1 && book() == 2); }
    as_project_new(); mark(0x10); chosen = 1;      /* LOAD's new-project step, then arr01-08 */
    check("after stock's new-project step: book 1, as stock loaded it", book() == 0);
    settle();
    post_refuse = 3; as_tick(0); as_tick(0);
    check("while stock is still loading, it waits", book() == 0 && cs1[CHG] == 0);
    post_refuse = 0; as_tick(0); job(); as_tick(0);
    check("then it goes back to book 3, on arrangement 5", book() == 2 && marked(0x30) && chosen == 4);
    check("left in pattern mode: it stays in pattern mode", arr_mode == 0);
    arr_mode = 1; as_tick(0); job();               /* arranger mode on, SYNC */
    mode_wanted = 0; arr_mode = 0; as_tick(0);     /* LOAD switches it off and clears the byte as it starts ... */
    job();                                         /* ... and saves the project before loading it */
    as_project_load();
    check("left in arranger mode: during the load, the byte stock applies at its end says arranger", mode_wanted == 1);
    as_project_new(); mark(0x10); arr_mode = mode_wanted;  /* stock's end of the load applies it */
    settle(); job(); as_tick(0); as_tick(0);
    for (int i = 0; i < 130; ++i) as_tick(0);     /* two seconds of quiet */
    check("after LOAD: arranger mode, on book 3", arr_mode == 1 && book() == 2);
    as_key(0x2d, 1); as_key(0x2e, 1); as_key(0x2e, 0); as_key(0x2d, 0); arr_mode = 0; as_tick(0);  /* FUNC + PATTERN: off */
    job();                                         /* SYNC in pattern mode */
    mode_wanted = 0; as_tick(0); job();            /* LOAD: off, save, load */
    as_project_load();
    check("switched off by the musician: LOAD leaves pattern mode", mode_wanted == 0);
    as_project_new(); mark(0x10); settle(); job(); for (int i = 0; i < 130; ++i) as_tick(0);
    check("and nothing turns it on", arr_mode == 0 && book() == 2);
    /* RELOAD PROJECT: where it was saved, not where it was left after */
    as_project_stored();                           /* saved on book 3, arrangement 5 */
    tap(LEFT); job(); as_tick(0); chosen = 6; job();  /* book 2, arrangement 7, SYNC */
    as_project_reloaded(); as_project_load(); as_project_new(); mark(0x10);   /* no ev_banks_loaded after a reload */
    settle(); job(); as_tick(0);
    check("RELOAD PROJECT comes back to where it was saved: book 3, arrangement 5", book() == 2 && chosen == 4);
    /* right after a RELOAD in arranger mode, stock refuses the choice for a few frames */
    as_project_stored();
    tap(LEFT); job(); as_tick(0); chosen = 6; job();
    as_project_reloaded(); as_project_new(); mark(0x10); settle(); job();
    select_busy = 5; chosen = 1;
    for (int i = 0; i < 10; ++i) as_tick(0);
    check("a refused choice is tried again until stock takes it: book 3, arrangement 5", book() == 2 && chosen == 4 && select_busy == 0);
    /* RELOAD in arranger mode: stock's end of the load turned it on over book 1; the return applies it again */
    as_project_stored();
    tap(LEFT); job(); as_tick(0); chosen = 6; job();
    { int a0 = applies;
      arr_mode = 1; as_project_reloaded(); as_project_new(); mark(0x10); settle(); job();
      for (int i = 0; i < 3; ++i) as_tick(0);
      check("after RELOAD in arranger mode the return applies arranger mode again, once", applies == a0 + 1 && arr_mode == 1 && book() == 2);
      tap(LEFT); job(); for (int i = 0; i < 3; ++i) as_tick(0);
      check("a LEFT/RIGHT switch never does", applies == a0 + 1);
      tap(RIGHT); job(); for (int i = 0; i < 3; ++i) as_tick(0);
      arr_mode = 0; }
    /* RELOAD as the unit raised it the second time: the reload, stock's new-project step, and no ev_banks_load */
    as_project_stored();                           /* saved on book 3, arrangement 5 */
    tap(LEFT); job(); as_tick(0); chosen = 6; job();
    as_project_reloaded(); as_project_new(); mark(0x10);
    settle(); job(); as_tick(0);
    check("RELOAD without ev_banks_load still comes back: book 3, arrangement 5", book() == 2 && chosen == 4);
    as_project_load(); as_project_loaded(); as_project_new(); mark(0x10); settle(); job(); as_tick(0);
    /* saved on book 1: a load stays there, with no job */
    while (book() != 0) { tap(LEFT); job(); as_tick(0); }
    job();
    int p0 = posted;
    as_project_load(); as_project_new(); mark(0x10); settle(); job(); as_tick(0);
    check("left on book 1: it stays on book 1, with no job", book() == 0 && posted == p0 && marked(0x10));
    tap(RIGHT); job(); as_tick(0);                 /* book 2 again for the label checks */

    /* the label in ARR > CHANGE */
    memset(lcd, 0, sizeof lcd);
    as_draw(lcd);
    check("BOOK 2 knocked out of a solid box at the top right", lit(103, 0) && !lit(102, 0) && lit(127, 8) && !lit(105, 2) && !lit(124, 2) && !lit(126, 2) && lit(120, 2));
    for (int i = 0; i < 10; ++i) { tap(RIGHT); job(); }
    memset(lcd, 0, sizeof lcd);
    as_draw(lcd);
    check("book 12: two digits, 1 then 2, the box wider", book() == 11 && lit(99, 0) && !lit(101, 2) && lit(120, 2) && !lit(121, 2) && !lit(120, 3) && !lit(124, 2) && !lit(126, 2));
    for (int i = 0; i < 4; ++i) { tap(RIGHT); job(); }
    check("book 16 is the last", book() == 15 && tap(RIGHT) == 1 && book() == 15);
    mark(0x77); cs1[CHG] = 1; job();
    check("book 16 is arr121-arr128", find("/SET/PROJ/arr121.work") && find("/SET/PROJ/arr128.work"));
    memset(lcd, 0xff, sizeof lcd);
    as_draw(lcd);
    check("drawn the same over a lit background", lit(99, 0) && !lit(101, 2));
    change_window = 0;
    memset(lcd, 0, sizeof lcd);
    as_draw(lcd);
    check("nothing drawn outside ARR > CHANGE", !lit(99, 0) && !lit(127, 8));
    main_screen(); as_draw(lcd);
    check("the main screen's mode icon is left alone", lit(44, 33) && !lit(45, 33) && lit(45, 34));
    int d = list_draws;
    post_refuse = 0; change_window = 0x46c7d384u; tap(LEFT); change_window = 0; job(); as_tick(0);
    check("a switch that ends with the list closed draws nothing", list_draws == d);

    printf("%d checks, %d failed\n", checks, failures);
    return failures != 0;
}
