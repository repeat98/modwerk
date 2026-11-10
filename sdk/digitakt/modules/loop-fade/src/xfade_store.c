/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Crossfader: the groups and the fader's CC on the +Drive, one set for the whole unit.
 *
 * They are kept as two files, /cfw/xfade.a and /cfw/xfade.b, written in turn:
 * a save cut short by power loss leaves the other one whole, and the loader
 * takes the valid one with the higher sequence number. With neither file valid
 * nothing is grouped and no CC is set.
 *
 * cxf_tick runs from the 30 Hz compose check (ev_tick, the UI task, through
 * xfade.c). It loads the files once the drive is mounted and free, and saves
 * about a second after the last change on SETTINGS > CROSSFADER, only when
 * something changed. The firmware's ekFS calls take the filesystem's mutex
 * themselves, except lookup; they are called only while that mutex is free
 * (a sample load holds it for its whole read) and the drive is mounted. */

typedef unsigned long u32;
typedef long s32;
typedef unsigned char u8;

#define OS_EK_OPEN    0x400cf3a0   /* ekFS open(path, mode, file) */
#define OS_EK_READ    0x400cf0e6   /* ekFS read(buf, len, file) */
#define OS_EK_WRITE   0x400cf146   /* ekFS write(buf, len, file) */
#define OS_EK_CLOSE   0x400cf35e   /* ekFS close(file) */
#define OS_EK_MKDIR   0x400ce034   /* ekFS mkdir(path) */
#define OS_EK_LOOKUP  0x400d0ccc   /* ekFS lookup(path, ...) */
#define OS_EK_LOCK    0x40001884   /* mutex lock(m) */
#define OS_EK_UNLOCK  0x400019b6   /* mutex unlock(m) */
#define OS_EK_MUTEX   0x42686690   /* the filesystem's mutex (its owner first) */
#define OS_EK_MOUNTED 0x420eec50   /* the drive is mounted */

typedef struct { u32 inode, pos, writable, open; } ekfile;
#define EK_OPEN    ((s32 (*)(const char *, const char *, ekfile *))OS_EK_OPEN)
#define EK_READ    ((s32 (*)(void *, s32, ekfile *))OS_EK_READ)
#define EK_WRITE   ((s32 (*)(const void *, s32, ekfile *))OS_EK_WRITE)
#define EK_CLOSE   ((s32 (*)(ekfile *))OS_EK_CLOSE)
#define EK_MKDIR   ((s32 (*)(const char *))OS_EK_MKDIR)
#define EK_LOOKUP  ((s32 (*)(const char *, u32 *, s32, s32, s32))OS_EK_LOOKUP)
#define EK_LOCK    ((void (*)(void *))OS_EK_LOCK)
#define EK_UNLOCK  ((void (*)(void *))OS_EK_UNLOCK)
#define EK_MUTEX   ((void *)OS_EK_MUTEX)
#define EK_OWNER   (*(volatile u32 *)OS_EK_MUTEX)
#define EK_MOUNTED (*(volatile u32 *)OS_EK_MOUNTED)
#define EK_NOENT   0x19            /* lookup: no such file or directory */

#define TABLES     13             /* 10 groups, the CC, the FADER ON tracks (2 bytes, bit 0 track 1) */
#define MAGIC      0x58464432u     /* "XFD2" */
#define MAGIC1     0x58464431u     /* "XFD1": 12 bytes, the last one FADER ON as one track (0 none, 1..8) */
#define RETRY      300             /* ticks after a failed save (10 s) */

/* The 16 bytes of padding keep the whole file in a USB listing, which
 * reports size - 16. */
struct cxf_file {
    u32 magic, size, seq, sum;
    u8 rx[TABLES];
    u8 pad[16];
};

extern u8 cxf_group[10];
extern u32 cxf_cc, cxf_fmask;
volatile u32 cxf_dirty;            /* ticks until the settings are saved; 0: saved */

static const char *const cxf_path[2] = { "/cfw/xfade.b", "/cfw/xfade.a" };
static struct cxf_file cxf_img;
static u32 cxf_seq;
static s32 cxf_loaded;             /* 1: loaded, or found none */
u32 cxf_saves, cxf_save_fail;      /* counts, for the USB PEEK */

static u32 sum(const u8 *rx, u32 n)
{
    u32 s = 0x5eed1234u, i;
    for (i = 0; i < n; i++)
        s = ((s << 5) | (s >> 27)) ^ rx[i];
    return s;
}

static s32 ek_ready(void)
{
    return EK_MOUNTED != 0 && EK_OWNER == 0;
}

/* Read one file into cxf_img; 1 if it is whole and valid. */
static s32 img_read(const char *path)
{
    ekfile f;
    s32 got, i;
    if (EK_OPEN(path, "r", &f) != 0)
        return 0;
    got = EK_READ(&cxf_img, sizeof cxf_img, &f);
    EK_CLOSE(&f);
    if (got < (s32)(sizeof cxf_img - sizeof cxf_img.pad))
        return 0;
    if (cxf_img.magic == MAGIC1 && cxf_img.size == 12 && cxf_img.sum == sum(cxf_img.rx, 12)
        && cxf_img.rx[11] <= 8) {            /* an older file: its one FADER track becomes the set */
        u32 m = cxf_img.rx[11] ? 1u << (cxf_img.rx[11] - 1) : 0;
        cxf_img.rx[11] = (u8)m;
        cxf_img.rx[12] = 0;
    } else if (cxf_img.magic != MAGIC || cxf_img.size != TABLES || cxf_img.sum != sum(cxf_img.rx, TABLES))
        return 0;
    for (i = 0; i < 10; i++)
        if (cxf_img.rx[i] > 2)
            return 0;
    if (cxf_img.rx[10] > 128)
        return 0;
    return 1;
}

/* Load the tables: the valid file with the higher seq; with none, keep 70-77.
 * Returns 0 if the drive is not ready yet (try again next tick). */
static s32 store_load(void)
{
    s32 ok0, ok1, pick, i;
    u32 seq0;
    if (!ek_ready())
        return 0;
    ok0 = img_read(cxf_path[0]);
    seq0 = cxf_img.seq;
    ok1 = img_read(cxf_path[1]);             /* cxf_img now holds file 1 */
    if (ok0 && ok1)
        pick = cxf_img.seq > seq0 ? 1 : 0;
    else
        pick = ok1 ? 1 : ok0 ? 0 : -1;
    if (pick == 0 && !img_read(cxf_path[0]))
        pick = -1;
    if (pick >= 0) {
        cxf_seq = cxf_img.seq;
        if (!cxf_dirty) {                    /* a change made before the drive was ready wins */
            for (i = 0; i < 10; i++)
                cxf_group[i] = cxf_img.rx[i];
            cxf_cc = cxf_img.rx[10];
            cxf_fmask = cxf_img.rx[11] | (u32)cxf_img.rx[12] << 8;
        }
    }
    cxf_loaded = 1;
    return 1;
}

/* Save the tables over the older file (seq + 1 decides which). */
static s32 store_save(void)
{
    ekfile f;
    u32 ino, seq = cxf_seq + 1;
    s32 r, w, i;
    if (!ek_ready())
        return 0;
    EK_LOCK(EK_MUTEX);
    r = EK_LOOKUP("/cfw", &ino, 0, 0, 0);
    EK_UNLOCK(EK_MUTEX);
    if (r == EK_NOENT && EK_MKDIR("/cfw") != 0)
        return -1;
    for (i = 0; i < 10; i++)
        cxf_img.rx[i] = cxf_group[i];
    cxf_img.rx[10] = (u8)(cxf_cc > 128 ? 128 : cxf_cc);
    cxf_img.rx[11] = (u8)cxf_fmask;
    cxf_img.rx[12] = (u8)(cxf_fmask >> 8);
    for (i = 0; i < (s32)sizeof cxf_img.pad; i++)
        cxf_img.pad[i] = 0;
    cxf_img.magic = MAGIC;
    cxf_img.size = TABLES;
    cxf_img.seq = seq;
    cxf_img.sum = sum(cxf_img.rx, TABLES);
    if (EK_OPEN(cxf_path[seq & 1], "w", &f) != 0)
        return -1;
    w = EK_WRITE(&cxf_img, sizeof cxf_img, &f);
    EK_CLOSE(&f);
    if (w != (s32)sizeof cxf_img)
        return -1;
    cxf_seq = seq;
    return 1;
}

void cxf_tick(u8 *ctrl)
{
    (void)ctrl;
    if (!cxf_loaded) {
        store_load();
        return;
    }
    if (cxf_dirty == 0)
        return;
    if (--cxf_dirty != 0)
        return;
    switch (store_save()) {
    case 1:
        cxf_saves++;
        break;
    case -1:
        cxf_save_fail++;
        cxf_dirty = RETRY;
        break;
    default:                                 /* the drive is busy: next tick */
        cxf_dirty = 1;
        break;
    }
}
