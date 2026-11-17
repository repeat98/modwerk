/* SPDX-License-Identifier: MIT
 * Copyright (C) 2026 Andrey Sidorkin
 *
 * ARR SETLISTS 0.1: 128 arrangements per project, as 16 banks of 8.
 *
 * Bank A is stock's: the 8 arrangements in battery RAM and arr01-arr08 on the card, which this module never makes
 * hold another bank. Banks B-P are files of the module's own in the project directory, each holding 8 arrangements
 * exactly as stock keeps them in battery RAM (the working blocks, the saved blocks ARR SAVE keeps, and their flags).
 * Stock always works on the 8 in its slots; switching banks writes the slots to their bank and reads the new bank in.
 *
 *   In ARR > CHANGE, stopped: LEFT / RIGHT step to the bank before / after.
 *
 * The card is used only in stock's card task: a switch posts stock's "write the project" job (SYNC TO CARD's,
 * 0x40022cd4), whose arrangement writer (0x400915ac) this module steps into. There, on bank A, stock writes arr01-08
 * as always; on another bank, stock's writer is skipped and the bank's own file is written. Then the new bank is
 * loaded. Leaving bank A keeps a backup of it (arrbankA.bak); arriving at bank A loads that backup and marks all 8
 * changed, so stock's next write puts them back into arr01-08 even if those files were overwritten meanwhile.
 *
 * A project load (power-up included) makes stock read arr01-08 into the slots again (measured under ot_emu), so the
 * slots then hold bank A. The module learns which bank the slots hold after it is installed from a fingerprint of the
 * slots it keeps in battery RAM (battery-ram.json): matching, they still hold the bank it last loaded; otherwise A.
 *
 * Addresses: OS 1.40C (RESEARCH.md). generate.py compiles this into arr_setlists_core.s; verify.py runs it on the
 * host against simulated memory and a simulated file layer (AS_HOST). */
#include <stdint.h>

#define K_RIGHT 0x21
#define K_LEFT 0x34

#define BANKS 16u
#define SLOTS 8u
#define BLOCK 5652u                  /* one arrangement in battery RAM: a 20-byte header, 256 rows of 22 bytes */
#define WORKING 0x10000004u          /* the 8 working blocks */
#define SAVED 0x1000b0a4u            /* the 8 blocks ARR SAVE keeps */
#define HAS_SAVED 0x10016144u        /* 8 bytes: ARR SAVE has run on that slot */
#define CHANGED 0x1001614cu          /* one bit a slot: changed since written */
#define RECORD 0x100f8f10u           /* the module's battery-RAM record (battery-ram.json): magic, bank, sum */
#define CHANGE_WINDOW 0x400c0b40u    /* ARR > CHANGE's window; 0 while closed */
#define PLAYING 0x800065b8u          /* the transport */

/* Stock routines, OS 1.40C. */
#define POST_WRITE 0x40022cd4u       /* post_write(0): SYNC TO CARD's job; < 0 refused */
#define PROJDIR 0x40025230u          /* projdir(0, 0) -> the project directory */
#define SPRINTF 0x40013a08u
#define F_OPEN 0x40016864u           /* (fo, path, mode, buffer, size) -> < 0 failed */
#define F_READ 0x40016564u           /* (fo, dst, n) -> 1 done */
#define F_WRITE 0x400166b8u
#define F_CLOSE 0x4001677cu
#define CLEAR_ARR 0x400a041cu        /* clear_arr(slot): empty rows, no saved copy, default name */
#define MESSAGE 0x4005a2b8u          /* message(text, 0x30), UI task only */
#define LOAD_ARR 0x4008fd28u         /* stock's arrangement loader (dir, mask, a3, a4): arr01-08.work into the slots */

#define FILE_MAGIC 0x4153424bu       /* "ASBK" */
#define FILE_VERSION 1u
#define REC_MAGIC 0x41534231u        /* "ASB1" */
#define IOB_LEN 0x1000u
#define DATA_LEN (2u * SLOTS * BLOCK + SLOTS)

#ifdef AS_HOST
uint8_t host_rd8(uint32_t a);
void host_wr8(uint32_t a, uint8_t v);
int host_post_write(void);
const char *host_projdir(void);
int host_open(const char *path, int write);
int host_read(uint32_t dst, unsigned n);       /* into simulated memory */
int host_read_buf(void *dst, unsigned n);
int host_write(uint32_t src, unsigned n);
int host_write_buf(const void *src, unsigned n);
void host_close(void);
void host_clear_arr(unsigned slot);
void host_message(const char *text);
int host_stock_writer(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4);
int host_stock_loader(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4);
#define rd8(a) host_rd8(a)
static void wr8(uint32_t a, uint32_t v) { host_wr8(a, (uint8_t)v); }
#else
static uint32_t rd8(uint32_t a) { return *(volatile uint8_t *)a; }
static void wr8(uint32_t a, uint32_t v) { *(volatile uint8_t *)a = (uint8_t)v; }
#endif
static uint32_t rd32(uint32_t a) { return (uint32_t)rd8(a) << 24 | (uint32_t)rd8(a + 1) << 16 | (uint32_t)rd8(a + 2) << 8 | rd8(a + 3); }
static void wr32(uint32_t a, uint32_t v) { wr8(a, v >> 24); wr8(a + 1, v >> 16); wr8(a + 2, v >> 8); wr8(a + 3, v); }

#define MAGIC 0x41535331u /* "ASS1": card builds do not zero .bss */

struct as_state {
    uint32_t magic;
    uint8_t bank;            /* the bank in the slots, 0 = A */
    int8_t pending;          /* the bank a posted write job loads, -1 none */
    uint8_t done;            /* the card task finished a switch (the diagnostic word shows it once) */
    uint8_t failed;          /* ... or could not do it */
    uint8_t backup;          /* arrbankA.bak holds bank A as it was left */
    uint8_t ready;           /* the battery record was read since install */
    uint16_t ticks;
    char path[260];
    char path2[260];
    uint8_t fo[24], fo2[24];
    uint8_t iob[IOB_LEN], iob2[IOB_LEN];
    uint8_t chunk[512];
    uint32_t header[4];
};
static struct as_state st;
static struct as_state *volatile st_at = &st;

#ifdef AS_HOST
void as_host_reinstall(void) { st_at->magic = 0; } /* a fresh install: the module's memory is new */
#endif

static struct as_state *ready(void)
{
    struct as_state *s = st_at;
    if (s->magic == MAGIC) return s;
    uint8_t *p = (uint8_t *)s;
    for (unsigned i = 0; i < sizeof *s; ++i) p[i] = 0;
    s->magic = MAGIC;
    s->pending = -1;
    return s;
}

/* ---------------------------------------------------------------- stock calls */
#ifdef AS_HOST
static int post_write(void) { return host_post_write(); }
static const char *projdir(void) { return host_projdir(); }
static void clear_arr(unsigned slot) { host_clear_arr(slot); }
static void message(const char *t) { host_message(t); }
static int stock_loader(uint32_t a1, uint32_t a3, uint32_t a4) { return host_stock_loader(a1, 0xff, a3, a4); }
static int stock_writer(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4) { return host_stock_writer(a1, a2, a3, a4); }
#else
static int post_write(void) { return ((int (*)(int))POST_WRITE)(0); }
static const char *projdir(void) { return ((const char *(*)(int, int))PROJDIR)(0, 0); }
static void clear_arr(unsigned slot) { ((void (*)(int))CLEAR_ARR)((int)slot); }
static void message(const char *t) { ((void (*)(const char *, int))MESSAGE)(t, 0x30); }
static int stock_loader(uint32_t a1, uint32_t a3, uint32_t a4)
{
    return ((int (*)(uint32_t, uint32_t, uint32_t, uint32_t))LOAD_ARR)(a1, 0xff, a3, a4);
}
int as_stock_writer(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4); /* below: stock's writer, entered past the site */
static int stock_writer(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4) { return as_stock_writer(a1, a2, a3, a4); }
#endif

/* ---------------------------------------------------------------- the files */
/* "%s/arrbankB.work" for bank 1 (B) .. 15 (P); bank 0 is the backup of A, "arrbankA.bak". strd: the .strd copy. */
static void bank_path(char *out, unsigned bank, int strd)
{
    const char *dir = projdir();
    char *t = out;
    while (*dir && t < out + 220) *t++ = *dir++;
    const char *name = "/arrbank";
    while (*name) *t++ = *name++;
    *t++ = (char)('A' + bank);
    const char *ext = bank == 0 ? (strd ? ".bks" : ".bak") : strd ? ".strd" : ".work";
    while (*ext) *t++ = *ext++;
    *t = 0;
}

#ifdef AS_HOST
static int f_open(struct as_state *s, const char *path, int write) { (void)s; return host_open(path, write); }
static int f_read_mem(struct as_state *s, uint32_t dst, unsigned n) { (void)s; return host_read(dst, n); }
static int f_read_buf(struct as_state *s, void *dst, unsigned n) { (void)s; return host_read_buf(dst, n); }
static int f_write_mem(struct as_state *s, uint32_t src, unsigned n) { (void)s; return host_write(src, n); }
static int f_write_buf(struct as_state *s, const void *src, unsigned n) { (void)s; return host_write_buf(src, n); }
static void f_close(struct as_state *s) { (void)s; host_close(); }
#else
typedef int f_open_t(void *, const char *, const char *, void *, unsigned);
typedef int f_io_t(void *, const void *, unsigned);
static int f_open(struct as_state *s, const char *path, int write)
{
    return ((f_open_t *)F_OPEN)(s->fo, path, write ? "w" : "r", s->iob, IOB_LEN);
}
static int f_read_mem(struct as_state *s, uint32_t dst, unsigned n) { return ((f_io_t *)F_READ)(s->fo, (const void *)dst, n) == 1; }
static int f_read_buf(struct as_state *s, void *dst, unsigned n) { return ((f_io_t *)F_READ)(s->fo, dst, n) == 1; }
static int f_write_mem(struct as_state *s, uint32_t src, unsigned n) { return ((f_io_t *)F_WRITE)(s->fo, (const void *)src, n) == 1; }
static int f_write_buf(struct as_state *s, const void *src, unsigned n) { return ((f_io_t *)F_WRITE)(s->fo, src, n) == 1; }
static void f_close(struct as_state *s) { ((void (*)(void *))F_CLOSE)(s->fo); }
#endif

/* A fingerprint of the slots: the working blocks, the saved blocks and their flags. */
static uint32_t slots_sum(void)
{
    uint32_t h = 2166136261u;
    for (uint32_t a = WORKING; a < WORKING + 2u * SLOTS * BLOCK + SLOTS; ++a) h = (h ^ rd8(a)) * 16777619u;
    return h;
}

static void remember(struct as_state *s)
{
    wr32(RECORD, REC_MAGIC);
    wr8(RECORD + 4, s->bank);
    wr8(RECORD + 5, s->backup);
    wr32(RECORD + 8, slots_sum());
}

/* The slots to a bank's file (or bank A's backup). 1 when written. The data comes straight from battery RAM; the
 * header from the module's own buffer, never the file layer's (TRAPS.md: a file keeps unwritten bytes in its buffer). */
static int write_bank(struct as_state *s, unsigned bank)
{
    bank_path(s->path, bank, 0);
    if (f_open(s, s->path, 1) < 0) return 0;
    s->header[0] = FILE_MAGIC; s->header[1] = FILE_VERSION; s->header[2] = DATA_LEN; s->header[3] = slots_sum();
    int ok = f_write_buf(s, s->header, sizeof s->header) && f_write_mem(s, WORKING, DATA_LEN);
    f_close(s);
    return ok;
}

/* A bank's file into the slots. 1 when read; 0 leaves the slots as they were (a missing or foreign file). */
static int read_bank(struct as_state *s, unsigned bank)
{
    bank_path(s->path, bank, 0);
    if (f_open(s, s->path, 0) < 0) return 0;
    int ok = f_read_buf(s, s->header, sizeof s->header) && s->header[0] == FILE_MAGIC && s->header[1] == FILE_VERSION
        && s->header[2] == DATA_LEN && f_read_mem(s, WORKING, DATA_LEN);
    f_close(s);
    return ok;
}

/* One file to another, in chunks through the module's own buffer (SAVE / RELOAD PROJECT). */
#ifdef AS_HOST
int host_copy(const char *from, const char *to);
static int copy_file(struct as_state *s, const char *from, const char *to) { (void)s; return host_copy(from, to); }
#else
static int copy_file(struct as_state *s, const char *from, const char *to)
{
    if (((f_open_t *)F_OPEN)(s->fo, from, "r", s->iob, IOB_LEN) < 0) return 0;
    if (((f_open_t *)F_OPEN)(s->fo2, to, "w", s->iob2, IOB_LEN) < 0) { f_close(s); return 0; }
    int ok = 1;
    unsigned left = sizeof s->header + DATA_LEN;
    while (ok && left) {
        unsigned n = left < sizeof s->chunk ? left : sizeof s->chunk;
        ok = ((f_io_t *)F_READ)(s->fo, s->chunk, n) == 1 && ((f_io_t *)F_WRITE)(s->fo2, s->chunk, n) == 1;
        left -= n;
    }
    f_close(s);
    ((void (*)(void *))F_CLOSE)(s->fo2);
    return ok;
}
#endif

/* ---------------------------------------------------------------- the card task */
/* Stock's arrangement writer, stepped into at its entry (the site's jmp reaches as_writer_entry below). */
int as_writer(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4)
{
    struct as_state *s = ready();
    int rc = 0;
    if (s->bank == 0) rc = stock_writer(a1, a2, a3, a4);     /* bank A: arr01-08 as always */
    else if (rd8(CHANGED)) {
        if (write_bank(s, s->bank)) wr8(CHANGED, 0);
        else rc = -1;
    }
    if (s->pending >= 0) {
        unsigned to = (unsigned)s->pending;
        int ok = 1;
        if (s->bank == 0) { ok = write_bank(s, 0); if (ok) s->backup = 1; }  /* leaving A: its backup first */
        else if (rd8(CHANGED)) ok = write_bank(s, s->bank);
        if (ok) {
            if (to == 0) {
                if (!(s->backup && read_bank(s, 0))) stock_loader(a1, a3, a4);  /* no backup: stock's own files */
                wr8(CHANGED, 0xff);                                  /* rewrite arr01-08 from what was loaded */
            } else {
                if (!read_bank(s, to)) for (unsigned n = 0; n < SLOTS; ++n) clear_arr(n);  /* a new bank: empty */
                wr8(CHANGED, 0);
            }
            s->bank = (uint8_t)to;
            s->done = 1;
        } else s->failed = 1;
        s->pending = -1;
    }
    remember(s);
    return rc;
}

#ifndef AS_HOST
/* The site's jmp lands here with the caller's frame as at stock's entry: forward its four arguments to as_writer and
 * return to the caller. as_stock_writer replays the two instructions the site displaced and runs stock's writer. */
__asm__(
    "\t.text\n"
    "\t.globl as_writer_entry\n"
    "as_writer_entry:\n"
    "\tmove.l 16(%sp),-(%sp)\n"
    "\tmove.l 16(%sp),-(%sp)\n"
    "\tmove.l 16(%sp),-(%sp)\n"
    "\tmove.l 16(%sp),-(%sp)\n"
    "\tjsr as_writer\n"
    "\tlea 16(%sp),%sp\n"
    "\trts\n"
    "\t.globl as_stock_writer\n"
    "as_stock_writer:\n"
    "\tlink.w %fp,#-324\n"
    "\tmovem.l %d2-%d7/%a2-%a5,(%sp)\n"
    "\tjmp 0x400915b4\n");
#endif

/* A project load (power-up included) or a new project: stock reads arr01-08 into the slots, so they hold bank A. */
void as_project_load(void)
{
    struct as_state *s = ready();
    s->bank = 0;
    s->pending = -1;
    s->ready = 1;
}

unsigned as_project_loaded(void)
{
    struct as_state *s = ready();
    s->bank = 0;
    s->backup = 0;
    remember(s);
    return 0;
}

/* SAVE PROJECT copied .work to .strd: the bank files too. */
unsigned as_project_stored(void)
{
    struct as_state *s = ready();
    for (unsigned b = 0; b < BANKS; ++b) {
        if (b == 0 && !s->backup) continue;
        bank_path(s->path, b, 0);
        bank_path(s->path2, b, 1);
        copy_file(s, s->path, s->path2);
    }
    return 0;
}

/* RELOAD PROJECT copied .strd back to .work: the bank files too; stock's loads then put bank A in the slots. */
unsigned as_project_reloaded(void)
{
    struct as_state *s = ready();
    for (unsigned b = 1; b < BANKS; ++b) {
        bank_path(s->path, b, 1);
        bank_path(s->path2, b, 0);
        copy_file(s, s->path, s->path2);
    }
    s->bank = 0;
    s->backup = 0;
    return 0;
}

/* Installed (or the set changed): which bank do the slots hold? The record's, when the slots still match it. */
unsigned as_modules_ready(void)
{
    struct as_state *s = ready();
    if (s->ready) return 0;
    s->ready = 1;
    if (rd32(RECORD) == REC_MAGIC && rd8(RECORD + 4) < BANKS && rd32(RECORD + 8) == slots_sum()) {
        s->bank = (uint8_t)rd8(RECORD + 4);
        s->backup = (uint8_t)rd8(RECORD + 5);
    } else s->bank = 0;
    remember(s);
    return 0;
}

/* ---------------------------------------------------------------- the UI task */
static int stopped(void)
{
    if (rd32(PLAYING)) return 0;
    for (unsigned i = 0; i < 16; ++i) if (rd8(0x80006500u + i) || rd8(0x80004f1eu + i * 84u)) return 0;
    return 1;
}

int as_key(int code, int pressed)
{
    struct as_state *s = ready();
    if (code != K_LEFT && code != K_RIGHT) return 0;
    if (!rd32(CHANGE_WINDOW)) return 0;                      /* only in ARR > CHANGE */
    if (!pressed) return 1;                                   /* its release is ours too */
    if (s->pending >= 0) return 1;                            /* a switch is under way */
    if (!stopped()) { message("STOP TO CHANGE BANK"); return 1; }
    int to = (int)s->bank + (code == K_RIGHT ? 1 : -1);
    if (to < 0 || to >= (int)BANKS) return 1;
    s->pending = (int8_t)to;
    s->done = s->failed = 0;
    int rc = post_write();                                    /* stock: -7 no project, else busy or a save pending */
    if (rc < 0) { s->pending = -1; message(rc == -7 ? "NO PROJECT" : "CARD BUSY"); }
    return 1;
}

struct as_api { volatile uint32_t value; };

/* The UI side of a finished switch, the fingerprint kept fresh, and the diagnostic word: bit 0-3 the bank, 4-7 the
 * bank a switch is loading (15 + 1 = none), 8 done, 9 failed, 10 backup of A kept. */
void as_tick(void *api)
{
    struct as_state *s = ready();
    s->done = 0;                                          /* the label in ARR > CHANGE shows the new bank */
    if (s->failed) { s->failed = 0; message("BANK NOT CHANGED"); }
    if (s->bank && s->pending < 0 && ++s->ticks >= 120) { s->ticks = 0; remember(s); }
    if (api) ((struct as_api *)api)->value = (uint32_t)s->bank | (uint32_t)(s->pending < 0 ? 0 : s->pending + 1) << 4
        | (uint32_t)s->done << 8 | (uint32_t)s->failed << 9 | (uint32_t)s->backup << 10;
}

/* ---------------------------------------------------------------- the screen */

/* 3x5 letters A-P, row-major, 15 bits each (top row in bits 14-12): the module's own glyphs. */
static const uint16_t GLYPH[16] = {
    0x2bed, 0x6bae, 0x3923, 0x6b6e, 0x79a7, 0x79a4, 0x396b, 0x5bed, 0x7497, 0x126a, 0x5bad, 0x4927, 0x5fed, 0x6b6d, 0x2b6a, 0x6ba4,
};

/* In ARR > CHANGE: "BANK C" knocked out of a solid box at the screen's top right, over whatever stock drew there. */
#ifdef AS_HOST
void host_set(unsigned char *frame, int x, int y, int on);
static void put(unsigned char *frame, int x, int y, int on) { host_set(frame, x, y, on); }
#else
static void put(unsigned char *frame, int x, int y, int on)
{
    unsigned char *b = frame + x * 8 + 7 - (y >> 3), m = (unsigned char)(1u << (y & 7));
    if (on) *b |= m; else *b &= (unsigned char)~m;
}
#endif

static void glyph(unsigned char *frame, int x, int y, unsigned letter)
{
    uint16_t g = GLYPH[letter & 15];
    for (int r = 0; r < 5; ++r) for (int k = 0; k < 3; ++k) if (g & (1u << (14 - r * 3 - k))) put(frame, x + k, y + r, 0);
}

void as_draw(unsigned char *frame)
{
    struct as_state *s = ready();
    if (!rd32(CHANGE_WINDOW)) return;
    for (int y = 0; y < 9; ++y) for (int x = 104; x < 128; ++x) put(frame, x, y, 1);
    static const uint8_t word[4] = {1, 0, 13, 10};             /* B A N K, as indices into GLYPH */
    for (int i = 0; i < 4; ++i) glyph(frame, 106 + 4 * i, 2, word[i]);
    glyph(frame, 123, 2, s->bank);
}
