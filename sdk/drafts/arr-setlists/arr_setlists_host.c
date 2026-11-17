/* SPDX-License-Identifier: MIT
 * Copyright (C) 2026 Andrey Sidorkin
 *
 * ARR SETLISTS on the host: arr_setlists.c (built with -DAS_HOST) against simulated battery RAM, a simulated file
 * layer and stock's job, writer, loader and clear as stubs. verify.py runs it. */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

int as_key(int code, int pressed);
void as_tick(void *api);
void as_draw(unsigned char *frame);
int as_writer(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4);
void as_project_load(void);
unsigned as_project_loaded(void);
unsigned as_project_stored(void);
unsigned as_project_reloaded(void);
unsigned as_modules_ready(void);
void as_host_reinstall(void);

#define LEFT 0x34
#define RIGHT 0x21
#define BLOCK 5652u
#define SLOTS 8u
#define WORKING 0x10000004u
#define DATA (2u * SLOTS * BLOCK + SLOTS)
#define CHANGED 0x1001614cu

static uint8_t cs1[0x16200];             /* 0x10000000 .. : the slots, their flags, the changed mask */
static uint8_t rec[16];                  /* 0x100f8f10 */
static uint8_t misc[0x2000];             /* 0x80004f1e.. 0x80006600 and two words */
static uint32_t change_window, playing;
static uint8_t msgword[4];          /* 0x460d1e70: a stock message box is up */
static int failures, checks;

uint8_t host_rd8(uint32_t a)
{
    if (a >= 0x10000000u && a < 0x10000000u + sizeof cs1) return cs1[a - 0x10000000u];
    if (a >= 0x100f8f10u && a < 0x100f8f20u) return rec[a - 0x100f8f10u];
    if (a >= 0x400c0b40u && a < 0x400c0b44u) return (uint8_t)(change_window >> (8 * (3 - (a - 0x400c0b40u))));
    if (a >= 0x800065b8u && a < 0x800065bcu) return (uint8_t)(playing >> (8 * (3 - (a - 0x800065b8u))));
    if (a >= 0x80004f00u && a < 0x80004f00u + sizeof misc) return misc[a - 0x80004f00u];
    if (a >= 0x460d1e70u && a < 0x460d1e74u) return msgword[a - 0x460d1e70u];
    fprintf(stderr, "read of 0x%08x\n", a);
    return 0;
}
void host_wr8(uint32_t a, uint8_t v)
{
    if (a >= 0x10000000u && a < 0x10000000u + sizeof cs1) { cs1[a - 0x10000000u] = v; return; }
    if (a >= 0x100f8f10u && a < 0x100f8f20u) { rec[a - 0x100f8f10u] = v; return; }
    fprintf(stderr, "write of 0x%08x\n", a);
}

/* ---- a file layer: up to 40 files of DATA + 16 bytes, one open at a time */
struct file { char path[260]; uint8_t data[DATA + 16]; unsigned len; int used; };
static struct file files[40];
static struct file *open_file;
static unsigned pos;
static int writing;
static int file_count(void) { int n = 0; for (int i = 0; i < 40; ++i) n += files[i].used; return n; }
static struct file *find(const char *path)
{
    for (int i = 0; i < 40; ++i) if (files[i].used && !strcmp(files[i].path, path)) return &files[i];
    return 0;
}
int host_open(const char *path, int write)
{
    struct file *f = find(path);
    if (!f && !write) return -1;
    if (!f) for (int i = 0; i < 40 && !f; ++i) if (!files[i].used) { f = &files[i]; f->used = 1; snprintf(f->path, sizeof f->path, "%s", path); }
    if (write) f->len = 0;
    open_file = f; pos = 0; writing = write;
    return 0;
}
int host_read_buf(void *dst, unsigned n)
{
    if (!open_file || pos + n > open_file->len) return 0;
    memcpy(dst, open_file->data + pos, n); pos += n;
    return 1;
}
int host_read(uint32_t dst, unsigned n)
{
    if (!open_file || pos + n > open_file->len) return 0;
    for (unsigned i = 0; i < n; ++i) host_wr8(dst + i, open_file->data[pos + i]);
    pos += n;
    return 1;
}
int host_write_buf(const void *src, unsigned n) { memcpy(open_file->data + open_file->len, src, n); open_file->len += n; return 1; }
int host_write(uint32_t src, unsigned n)
{
    for (unsigned i = 0; i < n; ++i) open_file->data[open_file->len + i] = host_rd8(src + i);
    open_file->len += n;
    return 1;
}
void host_close(void) { open_file = 0; }
int host_copy(const char *from, const char *to)
{
    struct file *f = find(from);
    if (!f) return 0;
    host_open(to, 1);
    memcpy(open_file->data, f->data, f->len); open_file->len = f->len;
    host_close();
    return 1;
}

/* ---- stock */
static int posted, post_refuse, stock_writes, stock_loads, clears;
static char last_message[32];
int host_post_write(void) { if (post_refuse) return post_refuse == 7 ? -7 : -3; ++posted; return 1; }
const char *host_projdir(void) { return "/TESTSET/PROJ"; }
void host_clear_arr(unsigned slot) { ++clears; memset(&cs1[4 + slot * BLOCK + 20], 0, BLOCK - 20); cs1[4 + slot * BLOCK + 0x12] = cs1[4 + slot * BLOCK + 0x13] = 0; }
void host_message(const char *t) { snprintf(last_message, sizeof last_message, "%s", t); }
int host_stock_writer(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4) { (void)a1; (void)a2; (void)a3; (void)a4; ++stock_writes; return 0; }
int host_stock_loader(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4) { (void)a1; (void)a2; (void)a3; (void)a4; ++stock_loads; return 0; }
static unsigned char lcd[1024];
void host_set(unsigned char *frame, int x, int y, int on) { unsigned char *b = frame + x * 8 + 7 - (y >> 3), m = (unsigned char)(1u << (y & 7)); if (on) *b |= m; else *b &= (unsigned char)~m; }
static int lit(int x, int y) { return lcd[x * 8 + 7 - (y >> 3)] >> (y & 7) & 1; }

static void check(const char *name, int ok)
{
    ++checks;
    if (!ok) { ++failures; printf("[FAIL] %s\n", name); }
    else printf("[PASS] %s\n", name);
}

/* The 8 slots marked with one byte, so a bank's content can be told apart. */
static void mark(uint8_t m) { for (unsigned i = 0; i < DATA; ++i) cs1[4 + i] = (uint8_t)(m + i % 7); }
static int marked(uint8_t m) { for (unsigned i = 0; i < DATA; ++i) if (cs1[4 + i] != (uint8_t)(m + i % 7)) return 0; return 1; }
static int tap(int code) { int t = as_key(code, 1); as_key(code, 0); return t; }
/* The card task runs the posted job; stock's own message shows and goes; the UI ticks on. */
static void job(void)
{
    as_writer(0x100b14f0u, 0xff, 0, 0);
    as_tick(0);
    msgword[3] = 0x0c; for (int i = 0; i < 5; ++i) as_tick(0);
    msgword[3] = 0; as_tick(0);
}
static unsigned bank_word(void) { struct { volatile uint32_t value; } api = {0}; as_tick((void *)&api); return api.value & 15; }

int main(void)
{
    as_modules_ready();
    check("installed with no record: bank A", bank_word() == 0);

    mark(0x10);                                    /* bank A's songs */
    change_window = 0;
    check("LEFT/RIGHT outside ARR > CHANGE are stock's", tap(RIGHT) == 0 && tap(LEFT) == 0);
    change_window = 0x46c7d384u;
    playing = 1;
    check("while playing, RIGHT in ARR > CHANGE is taken but changes nothing", tap(RIGHT) == 1 && posted == 0 && !strcmp(last_message, "STOP TO CHANGE BANK"));
    playing = 0;
    check("LEFT at bank A changes nothing", tap(LEFT) == 1 && posted == 0);
    check("RIGHT posts stock's write job", tap(RIGHT) == 1 && posted == 1);
    check("a second press while it runs is ignored", tap(RIGHT) == 1 && posted == 1);
    job();
    check("the job wrote bank A through stock's writer", stock_writes == 1);
    check("leaving A kept a backup of it", find("/TESTSET/PROJ/arrbankA.bak") != 0);
    check("a bank never used starts as 8 cleared arrangements", clears == 8);
    check("now on bank B, nothing changed", bank_word() == 1 && cs1[CHANGED - 0x10000000u] == 0);

    mark(0x20); cs1[CHANGED - 0x10000000u] = 0x04;   /* bank B's songs, one changed */
    job();
    check("a background write on bank B writes its file, not arr01-08", stock_writes == 1 && find("/TESTSET/PROJ/arrbankB.work") != 0 && cs1[CHANGED - 0x10000000u] == 0);

    tap(RIGHT); job();                             /* to C, new */
    mark(0x30); cs1[CHANGED - 0x10000000u] = 1;
    tap(LEFT); job();                              /* back to B: C written first */
    check("back on bank B: its songs are in the slots", bank_word() == 1 && marked(0x20));
    check("bank C was written before leaving it", find("/TESTSET/PROJ/arrbankC.work") != 0);
    tap(RIGHT); job();
    check("bank C's songs come back", bank_word() == 2 && marked(0x30));
    tap(LEFT); job(); tap(LEFT); job();
    check("back on bank A: its songs from the backup", bank_word() == 0 && marked(0x10));
    check("arriving at A marks all 8 changed, so stock rewrites arr01-08", cs1[CHANGED - 0x10000000u] == 0xff && stock_loads == 0);
    job();
    check("then stock's writer writes them", stock_writes == 2);

    post_refuse = 1;
    tap(RIGHT);
    check("a refused job leaves the bank as it is", bank_word() == 0 && !strcmp(last_message, "CARD BUSY"));
    post_refuse = 7;
    tap(RIGHT);
    check("with no project loaded it says so", bank_word() == 0 && !strcmp(last_message, "NO PROJECT"));
    post_refuse = 0;

    /* reinstalls and power cycles */
    tap(RIGHT); job();                             /* on B */
    check("on bank B", bank_word() == 1 && marked(0x20));
    as_host_reinstall(); as_modules_ready();
    check("reinstalled without a project load: the slots still hold B, and it knows", bank_word() == 1);
    mark(0x10);                                    /* a power cycle: stock read arr01-08 (bank A) into the slots */
    as_host_reinstall(); as_modules_ready();
    check("after a power cycle the slots hold A, and it knows", bank_word() == 0);
    as_modules_ready();
    check("a second ev_modules_ready changes nothing", bank_word() == 0);
    tap(RIGHT); job();
    check("from there, B's own songs come back", bank_word() == 1 && marked(0x20));

    /* a project load with the module installed */
    as_project_load(); mark(0x10); as_project_loaded();
    check("a project load: bank A", bank_word() == 0);

    /* SAVE PROJECT and RELOAD PROJECT */
    tap(RIGHT); job();
    int before = file_count();
    as_project_stored();
    check("SAVE PROJECT copies each bank file and the backup to its .strd", find("/TESTSET/PROJ/arrbankB.strd") && find("/TESTSET/PROJ/arrbankC.strd") && find("/TESTSET/PROJ/arrbankA.bks") && file_count() > before);
    mark(0x55); cs1[CHANGED - 0x10000000u] = 1; job();   /* bank B edited and written after the save */
    as_project_reloaded(); mark(0x10);
    check("RELOAD PROJECT brings back B's saved file and leaves the slots on A", bank_word() == 0);
    tap(RIGHT); job();
    check("bank B is as saved, not as edited after", bank_word() == 1 && marked(0x20));

    /* the bank letter in ARR > CHANGE */
    memset(lcd, 0, sizeof lcd);
    as_draw(lcd);
    check("a solid box at the top right with BANK and the bank's letter knocked out", lit(104, 0) && lit(127, 8) && !lit(106, 2) && !lit(123, 2) && !lit(124, 2) && lit(125, 2));
    memset(lcd, 0xff, sizeof lcd);
    as_draw(lcd);
    check("drawn the same over a lit background (no XOR)", lit(104, 0) && !lit(106, 2));
    change_window = 0;
    memset(lcd, 0, sizeof lcd);
    as_draw(lcd);
    check("nothing drawn outside ARR > CHANGE", !lit(104, 0));

    printf("%d checks, %d failed\n", checks, failures);
    return failures != 0;
}
