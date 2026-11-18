/* SPDX-License-Identifier: MIT
 * Copyright (C) 2026 Andrey Sidorkin
 *
 * ARR SETLISTS 0.1: 128 arrangements per project, as 16 books of 8, every one an ordinary stock arrangement file.
 *
 * Book 1 is stock's: arr01-arr08. Book 2 is arr09-arr16, and so on to book 16, arr121-arr128, in the project
 * directory beside them, each written and read by stock's own routines, so every file is in stock's format (the
 * arrangement, the copy ARR SAVE keeps, the flags). Stock always works on the 8 in its slots; switching books writes
 * the slots to their book's files and reads the next book's files in.
 *
 *   In ARR > CHANGE, stopped: LEFT / RIGHT step to the book before / after.
 *
 * The card is used only in stock's card task: a switch posts stock's "write the project" job (SYNC TO CARD's,
 * 0x40022cd4), whose per-arrangement writer (0x400915ac) this module steps into. On book 1 stock's writer runs as
 * always; on another book the book's 8 files are written instead. Then the next book is loaded. Leaving book 1 keeps a
 * backup of it (arr01.bak .. arr08.bak, stock's format); arriving at book 1 loads that backup and marks all 8 changed,
 * so stock's next write puts them back into arr01-08 even if those files were overwritten meanwhile.
 *
 * Every arrangement file stores all 8 slots' "has a saved copy" flags, and reading one sets all 8: the module always
 * writes a book's 8 files together, so whichever is read last holds the book's own flags.
 *
 * A project load (power-up included) makes stock read arr01-08 into the slots again, so the slots then hold book 1.
 * After an install the module learns which book the slots hold from a fingerprint of the slots it keeps in battery RAM
 * (battery-ram.json): matching, they still hold the book it last loaded; otherwise book 1.
 *
 * Addresses: OS 1.40C (RESEARCH.md). generate.py compiles this into arr_setlists_core.s; verify.py runs it on the
 * host against simulated memory and simulated stock file routines (AS_HOST). */
#include <stdint.h>

#define K_RIGHT 0x21
#define K_LEFT 0x34

#define BOOKS 16u
#define SLOTS 8u
#define BLOCK 5652u                  /* one arrangement in battery RAM: a 20-byte header, 256 rows of 22 bytes */
#define WORKING 0x10000004u          /* the 8 working blocks, then the 8 blocks ARR SAVE keeps, then 8 flags */
#define CHANGED 0x1001614cu          /* one bit a slot: changed since written */
#define RECORD 0x100f8f10u           /* the module's battery-RAM record (battery-ram.json): magic, book, sum */
#define CHANGE_WINDOW 0x400c0b40u    /* ARR > CHANGE's window; 0 while closed */
#define PLAYING 0x800065b8u          /* the transport */

/* Stock routines, OS 1.40C. */
#define POST_WRITE 0x40022cd4u       /* post_write(0): SYNC TO CARD's job; < 0 refused */
#define PROJDIR 0x40025230u          /* projdir(0, 0) -> the project directory */
#define SPRINTF 0x40013a08u
#define F_OPEN 0x40016864u           /* (fo, path, mode, buffer, size) -> < 0 failed */
#define F_CLOSE 0x4001677cu          /* (fo) -> < 0 failed */
#define F_COPY 0x40016388u           /* (to, from, 0) -> < 0 failed, -12 no such file */
#define ARR_WRITE 0x40089644u        /* (fo, slot) -> < 0 failed: one slot in stock's file format */
#define ARR_READ 0x4008b4d4u         /* (fo, slot, 0) -> < 0 failed: one file into a slot */
#define CLEAR_ARR 0x400a041cu        /* clear_arr(slot): empty rows, no saved copy, default name */
#define MESSAGE 0x4005a2b8u          /* message(text, 0x30), UI task only */

#define REC_MAGIC 0x41534231u        /* "ASB1" */
#define IOB_LEN 0x1000u
#define SUM_LEN (2u * SLOTS * BLOCK + SLOTS)

#ifdef AS_HOST
uint8_t host_rd8(uint32_t a);
void host_wr8(uint32_t a, uint8_t v);
int host_post_write(void);
const char *host_projdir(void);
int host_arr_write(const char *path, unsigned slot);
int host_arr_read(const char *path, unsigned slot);
int host_copy(const char *to, const char *from);
void host_clear_arr(unsigned slot);
void host_message(const char *text);
int host_stock_writer(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4);
#define rd8(a) host_rd8(a)
static void wr8(uint32_t a, uint32_t v) { host_wr8(a, (uint8_t)v); }
#else
static uint32_t rd8(uint32_t a) { return *(volatile uint8_t *)a; }
static void wr8(uint32_t a, uint32_t v) { *(volatile uint8_t *)a = (uint8_t)v; }
#endif
static uint32_t rd32(uint32_t a) { return (uint32_t)rd8(a) << 24 | (uint32_t)rd8(a + 1) << 16 | (uint32_t)rd8(a + 2) << 8 | rd8(a + 3); }
static void wr32(uint32_t a, uint32_t v) { wr8(a, v >> 24); wr8(a + 1, v >> 16); wr8(a + 2, v >> 8); wr8(a + 3, v); }

#define MAGIC 0x41535332u /* "ASS2": card builds do not zero .bss */

struct as_state {
    uint32_t magic;
    uint8_t book;            /* the book in the slots, 0 = book 1 */
    int8_t pending;          /* the book a posted write job loads, -1 none */
    uint8_t failed;          /* the card task could not finish a switch: the UI task says so */
    uint8_t backup;          /* arr01.bak .. arr08.bak hold book 1 as it was left */
    uint8_t ready;           /* the battery record was read since install */
    uint8_t damaged;         /* a file of the book in the slots did not read: write back only what is edited */
    uint16_t ticks;
    char path[260];
    char path2[260];
    uint8_t fo[24];
    uint8_t iob[IOB_LEN];
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
static int stock_writer(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4) { return host_stock_writer(a1, a2, a3, a4); }
static int arr_write(struct as_state *s, unsigned slot) { return host_arr_write(s->path, slot) >= 0; }
static int arr_read(struct as_state *s, unsigned slot) { return host_arr_read(s->path, slot); }
static int copy_file(struct as_state *s) { return host_copy(s->path2, s->path); }
#else
static int post_write(void) { return ((int (*)(int))POST_WRITE)(0); }
static const char *projdir(void) { return ((const char *(*)(int, int))PROJDIR)(0, 0); }
static void clear_arr(unsigned slot) { ((void (*)(int))CLEAR_ARR)((int)slot); }
static void message(const char *t) { ((void (*)(const char *, int))MESSAGE)(t, 0x30); }
int as_stock_writer(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4); /* below: stock's writer, entered past the site */
static int stock_writer(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4) { return as_stock_writer(a1, a2, a3, a4); }

typedef int f_open_t(void *, const char *, const char *, void *, unsigned);
static int f_open(struct as_state *s, const char *mode) { return ((f_open_t *)F_OPEN)(s->fo, s->path, mode, s->iob, IOB_LEN); }
static int f_close(struct as_state *s) { return ((int (*)(void *))F_CLOSE)(s->fo); }

/* One slot to s->path, by stock's own writer. 1 when written and closed. */
static int arr_write(struct as_state *s, unsigned slot)
{
    if (f_open(s, "w") < 0) return 0;
    int ok = ((int (*)(void *, unsigned))ARR_WRITE)(s->fo, slot) >= 0;
    return f_close(s) >= 0 && ok;
}

/* s->path into a slot, by stock's own reader. 1 read, 0 no such file (the slot is untouched), -1 failed. */
static int arr_read(struct as_state *s, unsigned slot)
{
    if (f_open(s, "r") < 0) return 0;
    int ok = ((int (*)(void *, unsigned, int))ARR_READ)(s->fo, slot, 0) >= 0;
    f_close(s);
    return ok ? 1 : -1;
}

/* s->path to s->path2 by stock's own copy. 1 copied, 0 no such file, -1 failed. */
static int copy_file(struct as_state *s)
{
    int rc = ((int (*)(const char *, const char *, int))F_COPY)(s->path2, s->path, 0);
    return rc >= 0 ? 1 : rc == -12 ? 0 : -1;
}
#endif

/* ---------------------------------------------------------------- the files */
/* "<project>/arr<NN>.<ext>": NN is 1-128 (two digits at least, as stock's arr01). */
static void arr_path(char *out, unsigned number, const char *ext)
{
    const char *dir = projdir();
    char *t = out;
    while (*dir && t < out + 240) *t++ = *dir++;
    *t++ = '/'; *t++ = 'a'; *t++ = 'r'; *t++ = 'r';
    if (number >= 100) *t++ = (char)('0' + number / 100);
    *t++ = (char)('0' + number / 10 % 10);
    *t++ = (char)('0' + number % 10);
    *t++ = '.';
    while (*ext) *t++ = *ext++;
    *t = 0;
}

static unsigned arr_number(unsigned book, unsigned slot) { return book * SLOTS + slot + 1; }

/* A fingerprint of the slots: the working blocks, the saved blocks and their flags. */
static uint32_t slots_sum(void)
{
    uint32_t h = 2166136261u;
    for (uint32_t a = WORKING; a < WORKING + SUM_LEN; ++a) h = (h ^ rd8(a)) * 16777619u;
    return h;
}

static void remember(struct as_state *s)
{
    wr32(RECORD, REC_MAGIC);
    wr8(RECORD + 4, s->book);
    wr8(RECORD + 5, s->backup);
    wr32(RECORD + 8, slots_sum());
}

/* The 8 slots to a book's 8 files (book 0: book 1's backup, arr01.bak .. arr08.bak). 1 when all were written. */
static int write_book(struct as_state *s, unsigned book)
{
    int ok = 1;
    for (unsigned n = 0; n < SLOTS; ++n) {
        arr_path(s->path, arr_number(book, n), book ? "work" : "bak");
        ok &= arr_write(s, n);
    }
    return ok;
}

/* A book's 8 files into the slots; a file not there yet gives an empty arrangement, and so does one that does not
 * read. 1 when nothing failed. */
static int read_book(struct as_state *s, unsigned book, const char *ext)
{
    int ok = 1;
    for (unsigned n = 0; n < SLOTS; ++n) {
        arr_path(s->path, arr_number(book, n), ext);
        int r = arr_read(s, n);
        if (r <= 0) clear_arr(n);
        if (r < 0) ok = 0;
    }
    return ok;
}

/* Only the slots edited, to their files: after a failed load, a slot that did not read keeps its file untouched. */
static int write_changed(struct as_state *s, unsigned book)
{
    int ok = 1;
    for (unsigned n = 0; n < SLOTS; ++n) if (rd8(CHANGED) >> n & 1) {
        arr_path(s->path, arr_number(book, n), "work");
        ok &= arr_write(s, n);
    }
    return ok;
}

/* ---------------------------------------------------------------- the card task */
/* Stock's arrangement writer, stepped into at its entry (the site's jmp reaches as_writer_entry below). */
int as_writer(uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4)
{
    struct as_state *s = ready();
    int rc = 0;
    if (s->book == 0) rc = stock_writer(a1, a2, a3, a4);     /* book 1: arr01-08 as always */
    else if (rd8(CHANGED)) {                                  /* another book: its 8 files together */
        if (s->damaged ? write_changed(s, s->book) : write_book(s, s->book)) wr8(CHANGED, 0);
        else rc = -1;
    }
    if (s->pending >= 0) {
        unsigned to = (unsigned)s->pending;
        if (rc >= 0) {
            if (s->book == 0) s->backup = !s->damaged && write_book(s, 0);   /* leaving book 1: its backup */
            int ok;
            if (to == 0 && s->backup && read_book(s, 0, "bak")) {
                wr8(CHANGED, 0xff);                          /* stock's next write puts them back into arr01-08 */
                ok = 1;
            } else {
                ok = read_book(s, to, "work");                /* never marked changed: nothing is written back */
                wr8(CHANGED, 0);
            }
            s->book = (uint8_t)to;                            /* the slots hold the new book now, even after a fault */
            s->damaged = (uint8_t)!ok;
            if (!ok) s->failed = 1;
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

/* A project load (power-up included) or a new project: stock reads arr01-08 into the slots, so they hold book 1. */
void as_project_load(void)
{
    struct as_state *s = ready();
    s->book = 0;
    s->pending = -1;
    s->ready = 1;
}

unsigned as_project_loaded(void)
{
    struct as_state *s = ready();
    s->book = 0;
    s->backup = 0;
    s->damaged = 0;
    remember(s);
    return 0;
}

/* SAVE PROJECT copied arr01-08 .work to .strd: arr09-arr128 too, those there are. */
unsigned as_project_stored(void)
{
    struct as_state *s = ready();
    for (unsigned n = SLOTS + 1; n <= BOOKS * SLOTS; ++n) {
        arr_path(s->path, n, "work");
        arr_path(s->path2, n, "strd");
        copy_file(s);
    }
    return 0;
}

/* RELOAD PROJECT copied arr01-08 .strd back to .work: arr09-arr128 too; stock's loads then put book 1 in the slots. */
unsigned as_project_reloaded(void)
{
    struct as_state *s = ready();
    for (unsigned n = SLOTS + 1; n <= BOOKS * SLOTS; ++n) {
        arr_path(s->path, n, "strd");
        arr_path(s->path2, n, "work");
        copy_file(s);
    }
    s->book = 0;
    s->backup = 0;
    s->damaged = 0;
    return 0;
}

/* Installed (or the set changed): which book do the slots hold? The record's, when the slots still match it. */
unsigned as_modules_ready(void)
{
    struct as_state *s = ready();
    if (s->ready) return 0;
    s->ready = 1;
    if (rd32(RECORD) == REC_MAGIC && rd8(RECORD + 4) < BOOKS && rd32(RECORD + 8) == slots_sum()) {
        s->book = (uint8_t)rd8(RECORD + 4);
        s->backup = (uint8_t)rd8(RECORD + 5);
    } else s->book = 0;
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
    if (!stopped()) { message("STOP TO CHANGE BOOK"); return 1; }
    int to = (int)s->book + (code == K_RIGHT ? 1 : -1);
    if (to < 0 || to >= (int)BOOKS) return 1;
    s->pending = (int8_t)to;
    s->failed = 0;
    int rc = post_write();                                    /* stock: -7 no project, else busy or a save pending */
    if (rc < 0) { s->pending = -1; message(rc == -7 ? "NO PROJECT" : "CARD BUSY"); }
    return 1;
}

struct as_api { volatile uint32_t value; };

/* A failed switch said, the fingerprint kept fresh, and the diagnostic word: bit 0-3 the book (0 = book 1), 4-7 the
 * book a switch is loading (+1; 0 none), 9 failed, 10 backup of book 1 kept. */
void as_tick(void *api)
{
    struct as_state *s = ready();
    if (api) ((struct as_api *)api)->value = (uint32_t)s->book | (uint32_t)(s->pending < 0 ? 0 : s->pending + 1) << 4
        | (uint32_t)s->failed << 9 | (uint32_t)s->backup << 10;
    if (s->failed) { s->failed = 0; message("BOOK FILE ERROR"); }
    if (s->book && s->pending < 0 && ++s->ticks >= 120) { s->ticks = 0; remember(s); }
}

/* ---------------------------------------------------------------- the screen */
/* 3x5 glyphs, row-major, 15 bits each (top row in bits 14-12): the module's own. 0-9, then B, O, K. */
static const uint16_t GLYPH[13] = {
    0x7b6f, 0x2c97, 0x73e7, 0x72cf, 0x5bc9, 0x79cf, 0x79ef, 0x7292, 0x7bef, 0x7bcf, 0x6bae, 0x2b6a, 0x5bad,
};
#define G_B 10
#define G_O 11
#define G_K 12

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

static void glyph(unsigned char *frame, int x, int y, unsigned g)
{
    uint16_t bits = GLYPH[g];
    for (int r = 0; r < 5; ++r) for (int k = 0; k < 3; ++k) if (bits & (1u << (14 - r * 3 - k))) put(frame, x + k, y + r, 0);
}

/* In ARR > CHANGE: "BOOK 12" knocked out of a solid box at the screen's top right, over whatever stock drew there. */
void as_draw(unsigned char *frame)
{
    struct as_state *s = ready();
    if (!rd32(CHANGE_WINDOW)) return;
    unsigned n = s->book + 1u;
    int digits = n >= 10 ? 2 : 1;
    int dx = 124 - 4 * (digits - 1), bx = dx - 19;          /* right-aligned: BOOK, a space, the number */
    for (int y = 0; y < 9; ++y) for (int x = bx - 2; x < 128; ++x) put(frame, x, y, 1);
    static const uint8_t word[4] = {G_B, G_O, G_O, G_K};
    for (int i = 0; i < 4; ++i) glyph(frame, bx + 4 * i, 2, word[i]);
    if (digits == 2) glyph(frame, dx, 2, n / 10);
    glyph(frame, 124, 2, n % 10);
}
