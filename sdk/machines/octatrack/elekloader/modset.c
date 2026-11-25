/* SPDX-License-Identifier: GPL-3.0-or-later
 * Installed modules survive a power cycle (owner, 11 October 2026). The base keeps the accepted set in RAM,
 * each package exactly as the host staged it, and writes it to the card as /MODWERK0.SET and /MODWERK1.SET in
 * turn, with a generation number, so a power loss mid-write keeps the previous set. After a boot the newest
 * complete set this base wrote is installed through the runtime loader, with the same checks as a USB install.
 * Writing and reading use the logger's stock file calls and gate (engine task, card ready, nothing playing or
 * recording, not in USB disk mode). PROJ held from power-on, or FUNC held while the restore runs, skips the restore,
 * so a module that breaks the unit cannot lock it out (owner, 11 November 2026: FUNC held at power-on opens
 * Elektron's Startup Menu instead; an MKI has no PROJ key); so does another base's set (its configuration hash
 * differs) or a damaged file. The boot guard below does it without a key when the last start crashed or stopped
 * while its restore ran.
 * A volatile Keep (volatile_service.c) adds its fresh installs to this set only when the set and they are exactly
 * the trial's whole-set identity (journal.h), and is refused otherwise; the set is then saved the same way.
 *
 * A module switched off on the unit (PROJ > MODWERK > MODULES, status.c) leaves the set and waits on the shelf below,
 * saved in the same file after the set.
 *
 * Set (big-endian): "MWST", version 1, generation, count, bytes used (header included), the base's
 * configuration hash, the SHA-256 of what follows, then per module its id, its length and its package,
 * padded to 4. Design: docs/OCTATRACK_ELEKLOADER_MIGRATION.md, "Keeping the module set across power cycles". */
#include <stdint.h>
#include "upload.h"
#include "loader.h"
#include "set_package.h"
#include "status.h"
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
#include "volatile_service.h"
#define JOURNAL_BLOCKED() modwerk_runtime_volatile_busy()
#else
#define JOURNAL_BLOCKED() 0
#endif
#ifdef MODWERK_RUNTIME_SETS
#define VOLATILE_BLOCKED() (JOURNAL_BLOCKED() || modwerk_runtime_set_busy())
#else
#define VOLATILE_BLOCKED() JOURNAL_BLOCKED()
#endif

#define HEADER 84u
#define SET_BYTES (RUNTIME_POOL_BYTES + 0x1000u) /* the pool's worth of packages, and the header */
extern const uint8_t modwerk_base_digest[32];
void modwerk_diag_set(void); /* diag.c: the installed set, into the unit's log */
void modwerk_diag_refused(uint32_t module, uint32_t refusal, uint32_t used, uint32_t largest, uint32_t check); /* diag.c: ... and
                                                       * the restore's first refused package, with the module pool then and the
                                                       * loader's check that refused it */
extern const struct mu_backend modwerk_runtime_backend;
struct file_object { uint32_t word[6]; };
#ifdef MODWERK_HOST
uint8_t modwerk_test_keys[8]; /* the panel's held-key rows */
int modwerk_test_gate = 1;
uint32_t modwerk_test_ticks;
#define KEY_ROWS modwerk_test_keys
#define GATE() (modwerk_test_gate)
#define TICKS (modwerk_test_ticks)
const char *modwerk_test_said; /* the last notice */
int modwerk_test_settling;
#define SAY(text) (modwerk_test_said = (text))
#define SETTLING() (modwerk_test_settling)
int modwerk_test_dialog;
#define DIALOG() (modwerk_test_dialog)
int modwerk_test_playing, modwerk_test_host_busy;
#define STOPPED() (!modwerk_test_playing)
#define HOST_BUSY() (modwerk_test_host_busy)
#ifdef MODWERK_HOST_CARD
extern uint8_t modwerk_test_card_io[512]; /* the fixture's stock file calls under the real store and load below */
#define octamod_log_io modwerk_test_card_io
#else
int modwerk_test_file(int op, const char *path, uint8_t *data, unsigned n);
#endif
#else
/* The logger's 512-byte I/O buffer, as this base places it (build_core.py): its retained region, uncached. */
extern uint8_t octamod_log_retained[];
#define octamod_log_io ((uint8_t *)((uintptr_t)octamod_log_retained + 6144u + 0x08000000u))
int octamod_log_can_flush(void);
extern volatile uint32_t modwerk_runtime_ticks;
#define KEY_ROWS ((volatile const uint8_t *)0x46100b18u) /* the panel's held-key rows, as its last row reports left them */
#define GATE() octamod_log_can_flush()
#define TICKS modwerk_runtime_ticks
#define SAY(text) ((void (*)(const char *, unsigned))0x4005a2b8u)(text, 0xa0)
__attribute__((weak)) int modwerk_controller_settling(void) { return 0; } /* controller_board.c, on a resident base */
#define SETTLING() modwerk_controller_settling()
__attribute__((weak)) int modwerk_status_dialog(void) { return 0; } /* status.c: one of its dialogs shows */
#define DIALOG() modwerk_status_dialog()
#define STOPPED() modwerk_machine_stopped()
int modwerk_upload_busy(void); /* ep0.c: a host session is open (an install, a trial, its self-test) */
#define HOST_BUSY() modwerk_upload_busy()
#endif
/* A key held: code row * 8 + bit of the rows (status.c's and scripts/device.mjs's codes). FUNC 0x2d, PROJ 0x1c. */
#define PANEL_HELD(code) (KEY_ROWS[(code) >> 3] >> ((code) & 7u) & 1u)
#define SKIP_HELD (PANEL_HELD(0x2du) | PANEL_HELD(0x1cu))
#if !defined MODWERK_HOST || defined MODWERK_HOST_CARD
extern int olog_stock_open(struct file_object *, const char *, const char *, void *, unsigned);
extern int olog_stock_read(struct file_object *, void *, unsigned);
extern int olog_stock_write(struct file_object *, const void *, unsigned);
extern int olog_stock_close(struct file_object *);
#ifdef MODWERK_HOST_CARD
int modwerk_test_card_size(struct file_object *);
#define FILE_SIZE(f) modwerk_test_card_size(f)
#else
/* An open file's length, as the logger reads it (stock_140c.c). */
#define FILE_SIZE(f) ((int (*)(uint32_t))(uintptr_t)*(volatile uint32_t *)0x46c8241eu)((f)->word[0])
#endif
#endif

static uint8_t set[SET_BYTES] __attribute__((aligned(4)));
static const uint8_t *candidate; /* the package the host staged, until it is accepted or dropped */
static uint32_t candidate_bytes;
static unsigned pending, restored, slot;
static uint32_t retry_at;
/* "MODULES LOADED" waits until the trusted controllers the bank's tracks use run their engines (Analog BD's, placed,
 * reset and enabled), so PLAY on it sounds them (owner's MKII, 27 October 2026: Analog BD stayed silent). Half a second
 * at least, for the board to bind them and see them used; ten seconds at most; dropped if the host changes the set. */
#define NOTICE_FIRST 30u
#define NOTICE_LAST 600u
static const char *volatile notice;
static volatile uint32_t notice_at;
volatile uint32_t modwerk_modset_generation, modwerk_modset_count, modwerk_modset_result; /* for the report */
enum { RESTORED = 1, NONE_SAVED, SKIPPED, FOREIGN, DAMAGED, REFUSED, SAVED, SAVE_FAILED, TOO_BIG, LEFT_OUT, HELD };

/* The boot guard (30 October 2026). A crash restarts the unit at once (crash.c) and a stopped DSP needs a power
 * cycle; either one while the restore installs, or in the ten seconds after it, would come back at every start,
 * since the set is on the card and a sync keeps a set before anyone plays it. Battery RAM keeps, across both,
 * whether this start's restore has settled and which package it was installing. A start that never settled: with
 * a crash or a stall recorded meanwhile, the package it was installing is left out at every start until the card's
 * set changes (LEFT_OUT); with none to name, or the second start in a row that never settled with nothing recorded
 * (a hang, or switched off early), nothing loads this once (HELD), and the next start tries the whole set again. */
#define GUARD_OUT 4u
struct guard { uint32_t magic, base, armed, loading, crashes, stalls, fails, generation, out[GUARD_OUT]; };
#define GUARD_MAGIC 0x4d574247u /* "MWBG" */
#define GUARD_SETTLE 600u       /* ticks after the restore with frames moving and nothing recorded: settled */
#define GUARD_NOTICE 480u       /* ticks from the start: after crash.c's CRASH RECOVERED, which would cover it */
enum { GUARD_LEFT = 0x100u, GUARD_HELD = 0x101u }; /* diag.c's refusal for the guard's, past the loader's codes */
#ifdef MODWERK_HOST
struct guard modwerk_test_guard;
uint32_t modwerk_test_crashes, modwerk_test_stalls, modwerk_test_frames;
#define GUARD (&modwerk_test_guard)
#define CRASHES modwerk_test_crashes
#define STALLS modwerk_test_stalls
#define FRAMES modwerk_test_frames
#else
/* Battery RAM after dsp.c's stall record, below 0x100fff00 (fxmap.c: stock references nothing up to there). */
#define GUARD ((volatile struct guard *)0x100ffb00u)
typedef char guard_fits_battery_ram[0x100ff900u + 456u <= 0x100ffb00u && 0x100ffb00u + sizeof(struct guard) <= 0x100fff00u ? 1 : -1];
#define COUNT_OF(at, magic) (((const volatile uint32_t *)(at))[0] == (magic) ? ((const volatile uint32_t *)(at))[1] : 0u)
#define CRASHES COUNT_OF(0x100ff800u, 0x4d574352u) /* crash.c: "MWCR", count */
#define STALLS COUNT_OF(0x100ff900u, 0x4d575354u)  /* dsp.c: "MWST", count */
extern volatile uint32_t dl_frames;
#define FRAMES dl_frames
#endif
static uint32_t notice_after; /* the earliest tick a notice shows */

static uint32_t be32(const uint8_t *p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
static void put32(uint8_t *p, uint32_t v) { p[0] = (uint8_t)(v >> 24), p[1] = (uint8_t)(v >> 16), p[2] = (uint8_t)(v >> 8), p[3] = (uint8_t)v; }
static uint32_t used(void) { return be32(set) == 0x4d575354u ? be32(set + 16) : HEADER; }
static uint32_t module_of(const uint8_t *p, uint32_t n) { return n >= 32u && ((uint32_t)p[4] << 8 | p[5]) >= 4u ? be32(p + 28) : 0; }
/* A package that changes nothing removes its module: no image, hooks, sites or DSP code (loader.c). */
static int removes(const uint8_t *p, uint32_t n)
{
    return n >= 28u && !be32(p + 8) && !be32(p + 12) && !be32(p + 20) && !be32(p + 24) && (n < 36u || ((uint32_t)p[4] << 8 | p[5]) < 5u || !be32(p + 32));
}

/* Modules switched off on the unit (owner, 16 November 2026). A module switched off is unloaded as a host's removal
 * unloads it and leaves the set, so the set still names exactly what runs and every identity a host checks holds.
 * Its package waits on the shelf until it is switched on, installed as the restore installs one, or until a host
 * installs or removes that module. The shelf is the top of set[], in whole sectors, and the set's room is what it
 * leaves: "MWOF", version 1, count, bytes used (header included), the set's generation, the SHA-256 of what follows,
 * then per module its id, its length, its package's SHA-256 and the package, padded to 4. In the file it follows the
 * set's sectors, and the set says so with version 2: such a set is whole only with a whole shelf of its own
 * generation after it, so a write cut short between the two leaves the other file's older set and shelf standing.
 * A version 1 set has no shelf, whatever an earlier, longer file left after it. */
#define OFF_MAGIC 0x4d574f46u
#define OFF_HEADER 52u
#define OFF_RECORD 40u
typedef char set_is_whole_sectors[SET_BYTES % 512u ? -1 : 1];
static uint32_t off_bytes; /* the shelf's sectors: 0, or a multiple of 512 */
/* Odd while the shelf or the set moves: a reader in another task or the USB interrupt looks again later. */
static volatile uint32_t off_moving;
#define OFF (set + SET_BYTES - off_bytes)
#define ROOM (SET_BYTES - off_bytes)
static uint32_t off_used(void) { return off_bytes ? be32(OFF + 12) : OFF_HEADER; }
static uint32_t off_count(void) { return off_bytes ? be32(OFF + 8) : 0; }
static void bytes_move(uint8_t *to, const uint8_t *from, uint32_t n)
{
    if (to < from) for (uint32_t i = 0; i < n; ++i) to[i] = from[i];
    else if (to > from) while (n--) to[n] = from[n];
}
/* A shelf of `bytes` at `s`, whole: its records fill what it says it uses, and their hash is its own. */
static int off_whole(const uint8_t *s, uint32_t bytes)
{
    uint8_t digest[MU_DIGEST_BYTES];
    if (bytes < OFF_HEADER || be32(s) != OFF_MAGIC || be32(s + 4) != 1u) return 0;
    uint32_t count = be32(s + 8), n = be32(s + 12), at = OFF_HEADER, seen = 0;
    if (!count || count > RUNTIME_MODULES || n < OFF_HEADER || n > bytes || ((n + 511u) & ~511u) != bytes) return 0;
    for (; at < n; ++seen) {
        if (n - at < OFF_RECORD) return 0;
        uint32_t length = be32(s + at + 4);
        if (!be32(s + at) || length > n - at - OFF_RECORD || ((length + 3u) & ~3u) > n - at - OFF_RECORD) return 0;
        at += OFF_RECORD + ((length + 3u) & ~3u);
    }
    if (seen != count) return 0;
    mu_sha256(s + OFF_HEADER, n - OFF_HEADER, digest);
    for (unsigned i = 0; i < MU_DIGEST_BYTES; ++i) if (digest[i] != s[20 + i]) return 0;
    return 1;
}
static void off_seal(uint32_t count, uint32_t n)
{
    uint8_t *s = OFF;
    s[0] = 'M', s[1] = 'W', s[2] = 'O', s[3] = 'F';
    put32(s + 4, 1), put32(s + 8, count), put32(s + 12, n);
    for (uint32_t i = n; i < off_bytes; ++i) s[i] = 0;
    mu_sha256(s + OFF_HEADER, n - OFF_HEADER, s + 20);
}
static uint8_t *off_find(uint32_t id)
{
    for (uint32_t at = OFF_HEADER, n = off_used(); off_bytes && at < n; at += OFF_RECORD + ((be32(OFF + at + 4) + 3u) & ~3u))
        if (be32(OFF + at) == id) return OFF + at;
    return 0;
}
static void off_drop(uint32_t id)
{
    uint8_t *r = off_find(id);
    if (!r) return;
    uint32_t n = off_used(), count = off_count() - 1u, step = OFF_RECORD + ((be32(r + 4) + 3u) & ~3u), at = (uint32_t)(r - OFF);
    off_moving = off_moving + 1u;
    if (!count) off_bytes = 0;
    else {
        bytes_move(r, r + step, n - at - step);
        n -= step;
        off_seal(count, n);
        uint32_t less = off_bytes - ((n + 511u) & ~511u);
        if (less) { bytes_move(OFF + less, OFF, n); off_bytes -= less; }
    }
    off_moving = off_moving + 1u;
}
/* A package onto the shelf, from the set below it: 0 when the set leaves no room for the shelf's new sectors. */
static int off_add(uint32_t id, const uint8_t *p, uint32_t length)
{
    uint32_t padded = (length + 3u) & ~3u, old = off_used(), n = old + OFF_RECORD + padded, grown = (n + 511u) & ~511u, count = off_count();
    if (count >= RUNTIME_MODULES || grown > SET_BYTES - used()) return 0;
    uint8_t *to = set + SET_BYTES - grown;
    off_moving = off_moving + 1u;
    if (off_bytes) bytes_move(to, OFF, old);
    off_bytes = grown;
    uint8_t *r = to + old;
    put32(r, id), put32(r + 4, length), mu_sha256(p, length, r + 8);
    for (uint32_t i = 0; i < padded; ++i) r[OFF_RECORD + i] = i < length ? p[i] : 0;
    off_seal(count + 1u, n);
    off_moving = off_moving + 1u;
    return 1;
}
static void seal(uint32_t count, uint32_t bytes)
{
    /* A module in the set runs: a host installed it, or it was switched on. It leaves the shelf. */
    for (uint32_t at = HEADER; off_bytes && at < bytes; at += 8u + ((be32(set + at + 4) + 3u) & ~3u)) off_drop(be32(set + at));
    set[0] = 'M', set[1] = 'W', set[2] = 'S', set[3] = 'T';
    put32(set + 4, off_bytes ? 2u : 1u), put32(set + 8, be32(set + 8) + 1u), put32(set + 12, count), put32(set + 16, bytes);
    if (off_bytes) put32(OFF + 16, be32(set + 8)); /* the shelf is this generation's */
    for (unsigned i = 0; i < 32u; ++i) set[20 + i] = modwerk_base_digest[i];
    mu_sha256(set + HEADER, bytes - HEADER, set + 52);
    modwerk_modset_generation = be32(set + 8), modwerk_modset_count = count;
}

/* boot.c, at prepare and accept: what the host staged, and that it stays. */
void modwerk_modset_candidate(const uint8_t *package, uint32_t bytes)
{ notice = 0; /* the set changes: a held notice would describe the old one */ if (!JOURNAL_BLOCKED()) candidate = package, candidate_bytes = bytes; }
#ifdef MODWERK_RUNTIME_SETS
/* Pure preflight over the old saved set and the complete incoming change set.
 * No intermediate accepted package reaches set[] or the card. With a null
 * argument it rechecks the retained candidate immediately before Keep. */
int modwerk_modset_check_set(const uint8_t *data,uint32_t length)
{
    /* Static, as every per-row array here: 128 rows outgrow a stock task's stack. Engine task only. */
    static const uint8_t *packages[RUNTIME_SET_CHANGES];static uint32_t lengths[RUNTIME_SET_CHANGES];
    if(!data) data=candidate,length=candidate_bytes;
    int n=runtime_set_parse(data,length,packages,lengths);
    /* The reason the site reads after a refusal here, not the loader's last one: BUSY (it retries) while the last
     * change is on its way to the card, else none. */
    modwerk_runtime_refused(pending && modwerk_modset_result != SAVE_FAILED ? RUNTIME_BUSY : RUNTIME_OK);
    if(!n || !restored || pending) return 0;
    static uint32_t ids[RUNTIME_JOURNAL_ROWS],old_ids[RUNTIME_JOURNAL_ROWS];
    static uint8_t sha[RUNTIME_JOURNAL_ROWS*MU_DIGEST_BYTES],old_sha[RUNTIME_JOURNAL_ROWS*MU_DIGEST_BYTES];
    uint8_t digest[32];unsigned count=0,old_count=0;uint32_t end=HEADER,total=used();
    for(uint32_t at=HEADER;at<total;) {
        if(total-at<8u || old_count==RUNTIME_JOURNAL_ROWS) return 0;
        uint32_t id=be32(set+at),bytes=be32(set+at+4);
        if(bytes>total-at-8u || ((bytes+3u)&~3u)>total-at-8u) return 0;
        old_ids[old_count]=id;mu_sha256(set+at+8,bytes,old_sha+32u*old_count++);
        int changed=0;for(int i=0;i<n;++i) changed|=id==module_of(packages[i],lengths[i]);
        if(!changed) { ids[count]=id;for(unsigned k=0;k<32u;++k) sha[32u*count+k]=old_sha[32u*(old_count-1u)+k];++count;end+=8u+((bytes+3u)&~3u); }
        at+=8u+((bytes+3u)&~3u);
    }
    if(!runtime_journal_set_digest(old_ids,old_sha,old_count,digest)) return 0;
    for(unsigned i=0;i<32u;++i) if(digest[i]!=data[48+i]) return 0;
    for(int i=0;i<n;++i) if(!removes(packages[i],lengths[i])) {
        /* The set would outgrow the saved set: say why, as the loader would. */
        if(count==RUNTIME_JOURNAL_ROWS) { modwerk_runtime_refused(RUNTIME_FULL);return 0; }
        if(lengths[i]>ROOM-end || 8u+((lengths[i]+3u)&~3u)>ROOM-end) { modwerk_runtime_refused(RUNTIME_MEMORY);return 0; }
        ids[count]=module_of(packages[i],lengths[i]);mu_sha256(packages[i],lengths[i],sha+32u*count++);
        end+=8u+((lengths[i]+3u)&~3u);
    }
    return runtime_journal_set_digest(ids,sha,count,digest);
}
/* Already preflighted before retirement. Remove changed records, append all
 * surviving replacements, then seal one generation for the entire Keep. */
static void accept_set(const uint8_t *data,uint32_t length)
{
    static const uint8_t *packages[RUNTIME_SET_CHANGES];static uint32_t lengths[RUNTIME_SET_CHANGES];
    int n=runtime_set_parse(data,length,packages,lengths);uint32_t end=used(),count=be32(set)==0x4d575354u?be32(set+12):0;
    for(uint32_t at=HEADER;at<end;) {
        uint32_t bytes=be32(set+at+4),step=8u+((bytes+3u)&~3u);int changed=0;
        for(int i=0;i<n;++i) changed|=be32(set+at)==module_of(packages[i],lengths[i]);
        if(!changed) { at+=step;continue; }
        for(uint32_t k=at;k+step<end;++k) set[k]=set[k+step];
        end-=step;--count;
    }
    for(int i=0;i<n;++i) off_drop(module_of(packages[i],lengths[i])); /* the host decides it now: installed, or gone */
    for(int i=0;i<n;++i) if(!removes(packages[i],lengths[i])) {
        uint32_t padded=(lengths[i]+3u)&~3u;put32(set+end,module_of(packages[i],lengths[i]));put32(set+end+4,lengths[i]);
        for(uint32_t k=0;k<padded;++k) set[end+8u+k]=k<lengths[i]?packages[i][k]:0;
        end+=8u+padded;++count;
    }
    seal(count,end);candidate=0;pending=1;retry_at=0;
}
#endif
void modwerk_modset_accepted(void)
{
    if (VOLATILE_BLOCKED() || !candidate) return;
#ifdef MODWERK_RUNTIME_SETS
    if(candidate_bytes>=RUNTIME_SET_HEADER && be32(candidate)==RUNTIME_SET_MAGIC) { accept_set(candidate,candidate_bytes);return; }
#endif
    uint32_t id = module_of(candidate, candidate_bytes), n = used(), count = be32(set) == 0x4d575354u ? be32(set + 12) : 0;
    /* Drop the module's earlier package, then append the new one unless it removes the module. */
    for (uint32_t at = HEADER; at < n;) {
        uint32_t length = be32(set + at + 4), step = 8u + ((length + 3u) & ~3u);
        if (be32(set + at) != id) { at += step; continue; }
        for (uint32_t i = at; i + step < n; ++i) set[i] = set[i + step];
        n -= step, --count;
    }
    off_drop(id); /* the host decides it now: installed, or gone */
    if (!removes(candidate, candidate_bytes)) {
        uint32_t step = 8u + ((candidate_bytes + 3u) & ~3u);
        if (n + step > ROOM) { modwerk_modset_result = TOO_BIG; candidate = 0; return; }
        put32(set + n, id), put32(set + n + 4, candidate_bytes);
        for (uint32_t i = 0; i < candidate_bytes; ++i) set[n + 8 + i] = candidate[i];
        for (uint32_t i = candidate_bytes; i < ((candidate_bytes + 3u) & ~3u); ++i) set[n + 8 + i] = 0;
        n += step, ++count;
    }
    seal(count, n);
    candidate = 0, pending = 1, retry_at = 0;
}
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
static uint32_t keep_count, keep_bytes; /* a checked Keep: its packages wait past used() until it is sealed */
/* volatile_service.c's Keep, engine task under the stable lock, before the journal accepts: the kept fresh packages,
 * appended to this set, must give exactly the trial's whole-set identity, so a boot restores what the journal
 * reported. 0, and the set as it was: no room, or the set is not the live baseline (a module too big for it; one
 * refused at boot has left set[]). */
int modwerk_modset_keep(const uint8_t *const package[], const uint32_t bytes[], unsigned n, const uint8_t digest[MU_DIGEST_BYTES])
{
    static uint32_t ids[RUNTIME_JOURNAL_ROWS];static uint8_t sha[MU_DIGEST_BYTES * RUNTIME_JOURNAL_ROWS];
    uint32_t end = used(), count = 0;uint8_t got[MU_DIGEST_BYTES];
    keep_bytes = 0, notice = 0;
    if (!restored) return 0;
    for (unsigned i = 0; i < n; ++i) {
        uint32_t step = 8u + ((bytes[i] + 3u) & ~3u);
        if (step > ROOM - end) return 0; /* a length that wraps step is caught by the walk below */
        put32(set + end, module_of(package[i], bytes[i])), put32(set + end + 4, bytes[i]);
        for (uint32_t k = 0; k < step - 8u; ++k) set[end + 8u + k] = k < bytes[i] ? package[i][k] : 0;
        end += step;
    }
    for (uint32_t at = HEADER, length = 0; at < end; at += 8u + ((length + 3u) & ~3u), ++count) {
        if (count == RUNTIME_JOURNAL_ROWS || end - at < 8u || (length = be32(set + at + 4)) > end - at - 8u) return 0;
        ids[count] = be32(set + at), mu_sha256(set + at + 8, length, sha + MU_DIGEST_BYTES * count);
    }
    if (!runtime_journal_set_digest(ids, sha, count, got)) return 0;
    for (unsigned i = 0; i < MU_DIGEST_BYTES; ++i) if (got[i] != digest[i]) return 0;
    keep_count = count, keep_bytes = end;
    return 1;
}
/* The journal accepted that Keep: the set is the kept set, saved as an accepted install is. */
void modwerk_modset_kept(void) { if (keep_bytes) seal(keep_count, keep_bytes), pending = 1, retry_at = 0, keep_bytes = 0; }
/* MWVS flags, read by the USB interrupt: 1 while the set's last change is not confirmed on the card, 3 once a
 * write of it failed (retried every ten seconds). */
unsigned modwerk_modset_unsaved(void) { return pending ? 1u | (unsigned)(modwerk_modset_result == SAVE_FAILED) << 1 : 0u; }
#endif

#if defined MODWERK_DEV || defined MODWERK_HOST
/* dev.c's ADOPT TEST: this development base restores a whole set another base wrote (the flashed base's, on the card)
 * as its own and writes nothing to the card for the rest of that start, so a twin's restore can be tried without a
 * Keep replacing the owner's set. Battery RAM (battery-ram.json): "MWAD" and this base's id, so another base ignores it. */
#ifdef MODWERK_HOST
uint32_t modwerk_test_adopt[2];
#define ADOPT modwerk_test_adopt
#else
#define ADOPT ((volatile uint32_t *)0x100ffd38u)
#endif
#define ADOPTING() (ADOPT[0] == 0x4d574144u && ADOPT[1] == be32(modwerk_base_digest))
static unsigned adopted; /* this start restored another base's set: no card writes */
void modwerk_modset_adopt_test(unsigned on);
void modwerk_modset_adopt_test(unsigned on) { ADOPT[1] = be32(modwerk_base_digest), ADOPT[0] = on ? 0x4d574144u : 0; }
#else
#define ADOPTING() 0
#define adopted 0
#endif
#if defined MODWERK_HOST && !defined MODWERK_HOST_CARD
/* The pretend card keeps a file's shelf beside its set: op 2 reads it (its bytes, 0 none), op 3 writes it. */
static int load(unsigned which)
{
    static uint8_t shelf[SET_BYTES];
    const char *path = which ? "/MODWERK1.SET" : "/MODWERK0.SET";
    int n = modwerk_test_file(0, path, set, SET_BYTES);
    uint32_t bytes = n >= (int)HEADER && be32(set + 4) == 2u ? (uint32_t)modwerk_test_file(2, path, shelf, SET_BYTES) : 0;
    off_bytes = 0;
    if (bytes >= 512u && !(bytes % 512u) && bytes <= SET_BYTES - (((uint32_t)n + 511u) & ~511u) && off_whole(shelf, bytes) &&
        be32(shelf + 16) == be32(set + 8)) {
        off_bytes = bytes;
        for (uint32_t i = 0; i < bytes; ++i) OFF[i] = shelf[i];
    }
    return n;
}
static int store(unsigned which)
{
    const char *path = which ? "/MODWERK1.SET" : "/MODWERK0.SET";
    if (VOLATILE_BLOCKED() || adopted) return 0;
    return modwerk_test_file(1, path, set, used()) && modwerk_test_file(3, path, OFF, off_bytes);
}
#else
/* One slot into `set`: its bytes, or 0 when it is absent or unreadable. */
static int load(unsigned which)
{
    struct file_object f;
    if (olog_stock_open(&f, which ? "/MODWERK1.SET" : "/MODWERK0.SET", "r", octamod_log_io, 512) < 0) return 0;
    int ok = olog_stock_read(&f, set, 512) == 1;
    uint32_t n = ok && be32(set) == 0x4d575354u ? be32(set + 16) : 0;
    ok = ok && n >= HEADER && n <= SET_BYTES;
    for (uint32_t at = 512; ok && at < n; at += 512) ok = olog_stock_read(&f, set + at, 512) == 1;
    /* The shelf, after the set's sectors: taken only whole, and only into what the set leaves. */
    static uint8_t first[512];
    off_moving = off_moving + 1u;
    off_bytes = 0;
    if (ok && be32(set + 4) == 2u && olog_stock_read(&f, first, 512) == 1 && be32(first) == OFF_MAGIC && be32(first + 12) <= SET_BYTES &&
        be32(first + 16) == be32(set + 8)) {
        uint32_t bytes = (be32(first + 12) + 511u) & ~511u;
        if (bytes >= 512u && bytes <= SET_BYTES - ((n + 511u) & ~511u)) {
            uint8_t *s = set + SET_BYTES - bytes;
            int got = 1;
            for (unsigned i = 0; i < 512u; ++i) s[i] = first[i];
            for (uint32_t at = 512; got && at < bytes; at += 512) got = olog_stock_read(&f, s + at, 512) == 1;
            if (got && off_whole(s, bytes)) off_bytes = bytes;
        }
    }
    off_moving = off_moving + 1u;
    (void)olog_stock_close(&f);
    return ok ? (int)n : 0;
}
/* The set into one slot, sector by sector while the gate holds, then read back whole. */
static int store(unsigned which)
{
    if (VOLATILE_BLOCKED() || adopted) return 0;
    static uint8_t verify[512];
    const char *path = which ? "/MODWERK1.SET" : "/MODWERK0.SET";
    struct file_object f;
    uint32_t n = (used() + 511u) & ~511u;
    if (olog_stock_open(&f, path, "w", octamod_log_io, 512) < 0) return 0;
    int had = FILE_SIZE(&f), ok = 1;
    for (uint32_t at = 0; ok && at < n; at += 512) ok = !VOLATILE_BLOCKED() && GATE() && olog_stock_write(&f, set + at, 512) == 1;
    for (uint32_t at = 0; ok && at < off_bytes; at += 512) ok = !VOLATILE_BLOCKED() && GATE() && olog_stock_write(&f, OFF + at, 512) == 1; /* the shelf */
    /* Stock's close takes the length from word 4, and shortening a file leaves its last cluster linked to the freed
     * tail (#1830). So the file keeps its length; the header says how much of it is the set, and a version 1 set
     * reads no shelf after it. */
    if (had > 0 && (uint32_t)had > n + off_bytes) f.word[4] = (uint32_t)had;
    ok = olog_stock_close(&f) >= 0 && ok;
    if (!ok || olog_stock_open(&f, path, "r", octamod_log_io, 512) < 0) return 0;
    for (uint32_t at = 0; ok && at < n; at += 512) {
        ok = olog_stock_read(&f, verify, 512) == 1;
        for (unsigned i = 0; ok && i < 512u; ++i) ok = verify[i] == set[at + i];
    }
    for (uint32_t at = 0; ok && at < off_bytes; at += 512) {
        ok = olog_stock_read(&f, verify, 512) == 1;
        for (unsigned i = 0; ok && i < 512u; ++i) ok = verify[i] == OFF[at + i];
    }
    return olog_stock_close(&f) >= 0 && ok;
}
#endif

/* A loaded slot that this base wrote whole: 1, else 0 (another base's set is FOREIGN). */
static int whole(int n)
{
    uint8_t digest[MU_DIGEST_BYTES];
    if (n < (int)HEADER || (be32(set + 4) != 1u && !(be32(set + 4) == 2u && off_bytes)) || be32(set + 16) != (uint32_t)n) return 0;
    for (unsigned i = 0; i < 32u; ++i) if (set[20 + i] != modwerk_base_digest[i] && !ADOPTING()) { modwerk_modset_result = FOREIGN; return 0; }
    mu_sha256(set + HEADER, (uint32_t)n - HEADER, digest);
    for (unsigned i = 0; i < MU_DIGEST_BYTES; ++i) if (digest[i] != set[52 + i]) return 0;
#if defined MODWERK_DEV || defined MODWERK_HOST
    if (ADOPTING()) adopted = 1;
#endif
    return 1;
}
/* A package the loader refuses BUSY (it names every switch it could not make so) is tried again every half second,
 * ten seconds at most, before it is left out: at power-on Ring SC, the key bus reader, was refused BUSY while a sync
 * later in that boot installed the same package (beta finding 69). A loader that cannot be entered (playing) waits
 * the same way. ep0.c holds the host until the restore is done. */
#define RESTORE_RETRY 30u
#define RESTORE_TRIES 20u
/* Per package of set[], as ep0.c's RESTORE request reports it (status.h): its first byte 0 to try, 1 installed, 2 left
 * out. restore_count: the set's packages once the restore has run, else 0. */
static uint8_t restore_entry[RUNTIME_MODULES][MODSET_RESTORE_ENTRY];
#define restore_outcome(k) restore_entry[k][0]
static volatile uint32_t restore_count;
static unsigned restore_tries;
static uint32_t left_out, left_why, left_used, left_largest, left_check; /* the first package left out, the loader's refusal,
                                                              * the module pool at that moment (used, largest free run) and the
                                                              * loader's check that refused it, for the log */
static char guard_text[24]; /* "<NAME> LEFT OUT": at most 20 characters, as long as a stock popup's line */
/* At the restore, before anything installs: what the last start left in the guard. 1: hold every module this start. */
static int guard_check(uint32_t newest)
{
    volatile struct guard *g = GUARD;
    uint32_t base = be32(modwerk_base_digest);
    if (g->magic != GUARD_MAGIC || g->base != base) { /* the first start, or another base's: nothing to go by */
        g->armed = g->loading = g->fails = g->generation = 0;
        for (unsigned i = 0; i < GUARD_OUT; ++i) g->out[i] = 0;
        g->base = base, g->magic = GUARD_MAGIC;
    }
    if (g->generation != newest) { /* a sync changed the set: try every module again */
        for (unsigned i = 0; i < GUARD_OUT; ++i) g->out[i] = 0;
        g->generation = newest;
    }
    int hold = 0;
    if (g->armed) {
        int recorded = CRASHES != g->crashes || STALLS != g->stalls;
        unsigned room = GUARD_OUT;
        for (unsigned i = 0; i < GUARD_OUT; ++i) if (!g->out[i] && room == GUARD_OUT) room = i;
        if (recorded && g->loading && room < GUARD_OUT) g->out[room] = g->loading, g->fails = 0;
        else if (recorded || ++g->fails >= 2u) hold = 1, g->fails = 0;
    }
    g->armed = g->loading = 0;
    return hold;
}
static int guard_left(uint32_t id)
{
    for (unsigned i = 0; id && i < GUARD_OUT; ++i) if (GUARD->out[i] == id) return 1;
    return 0;
}
/* The popup for a package the guard left out: its name as the chooser shows it (ABI 6 on, loader.c), in capitals
 * (the font has no others), cut to 11; "MODULE LEFT OUT" without one. */
static void guard_name(const uint8_t *p, uint32_t n)
{
    unsigned k = 0;
    if (n >= 65u && ((uint32_t)p[4] << 8 | p[5]) >= 6u)
        for (; k < 11u && p[50 + k]; ++k) guard_text[k] = p[50 + k] >= 'a' && p[50 + k] <= 'z' ? (char)(p[50 + k] - 32) : (char)p[50 + k];
    for (const char *t = k ? " LEFT OUT" : "MODULE LEFT OUT"; *t; ) guard_text[k++] = *t++;
    guard_text[k] = 0;
}
/* Package k's outcome: 1 installed, or 2 left out with why (the loader's refusal or the guard's), the check that refused
 * it and the pool's largest free run then. */
static void outcome(uint32_t k, unsigned state, const uint8_t *p, uint32_t length, uint32_t why, uint32_t check, uint32_t largest)
{
    uint8_t *e = restore_entry[k];
    int named = length >= 65u && ((uint32_t)p[4] << 8 | p[5]) >= 6u;
    e[0] = (uint8_t)state, e[1] = (uint8_t)check, e[2] = (uint8_t)(why >> 8), e[3] = (uint8_t)why;
    put32(e + 4, module_of(p, length)), put32(e + 8, length), put32(e + 12, largest);
    for (unsigned i = 0; i < 16u; ++i) e[16 + i] = named && i < 15u ? p[50 + i] : 0;
}
static void restore_pass(void)
{
    const struct mu_backend *b6 = &modwerk_runtime_backend;
    volatile struct guard *g = GUARD;
    if (!g->armed) g->crashes = CRASHES, g->stalls = STALLS, g->armed = 1;
    int open = b6->enter(b6->user), last = ++restore_tries >= RESTORE_TRIES;
    uint32_t n = used(), count = 0, installed = 0, waiting = 0, end = HEADER, guarded = 0;
    for (uint32_t at = HEADER; at < n; at += 8u + ((be32(set + at + 4) + 3u) & ~3u), ++count) {
        if (count >= RUNTIME_MODULES || restore_outcome(count)) continue; /* past the loader's rows: never live */
        uint32_t length = be32(set + at + 4), id = module_of(set + at + 8, length);
        if (guard_left(id)) {
            outcome(count, 2, set + at + 8, length, GUARD_LEFT, 0, 0), ++guarded;
            if (guarded == 1u) guard_name(set + at + 8, length);
            if (!left_out) left_out = id, left_why = GUARD_LEFT;
            continue;
        }
        /* The package a crash or a stall would blame: after a stall the loader is shut off and refuses the rest. */
        if (STALLS == g->stalls) g->loading = id;
        if (open && b6->prepare(b6->user, set + at + 8, length) && b6->publish(b6->user) == MU_APPLIED && b6->retire(b6->user)) {
            outcome(count, 1, set + at + 8, length, 0, 0, 0);
            continue;
        }
        /* Read before the next install overwrites the loader's refusal. */
        uint32_t why = open ? (uint32_t)modwerk_runtime_refusal() : (uint32_t)RUNTIME_BUSY;
        if (open) (void)b6->discard(b6->user);
        if (why == RUNTIME_BUSY && !last) { ++waiting; continue; }
        uint32_t largest = 0, in_use = RUNTIME_POOL_BYTES - modwerk_runtime_free(&largest), check = open ? (uint32_t)modwerk_runtime_refused_check() : 0;
        outcome(count, 2, set + at + 8, length, why, check, largest);
        if (!left_out) left_out = id, left_why = why, left_used = in_use, left_largest = largest, left_check = check;
    }
    if (STALLS == g->stalls) g->loading = 0; /* between installs, nothing to blame */
    if (open) (void)b6->leave(b6->user);
    if (waiting) { retry_at = TICKS + RESTORE_RETRY; return; }
    restored = 1, restore_tries = 0;
    /* What did not install leaves set[], which must name exactly what runs: a sync's baseline is the live set
     * (modwerk_modset_check_set refused every one after a partial restore, beta finding 69). The card keeps its
     * copy until the next change, so the next boot tries the refused ones again. */
    for (uint32_t at = HEADER, k = 0; at < n; ++k) {
        uint32_t step = 8u + ((be32(set + at + 4) + 3u) & ~3u);
        if (k < RUNTIME_MODULES && restore_outcome(k) == 1) {
            for (uint32_t i = 0; end != at && i < step; ++i) set[end + i] = set[at + i]; /* the loader keeps its own copy */
            end += step, ++installed;
        }
        at += step;
    }
    if (left_out) modwerk_diag_refused(left_out, left_why, left_used, left_largest, left_check);
    restore_count = count;
    if (installed != count) seal(installed, end);
    modwerk_modset_generation = be32(set + 8), modwerk_modset_count = installed;
    modwerk_modset_result = installed == count ? RESTORED : guarded ? LEFT_OUT : REFUSED;
    if (guarded) notice_at = TICKS, notice_after = GUARD_NOTICE, notice = guarded == 1u ? guard_text : "MODULES LEFT OUT";
    else if (installed && installed == count) notice_at = TICKS, notice = "MODULES LOADED";
    else SAY(installed ? "SOME MODULES FAILED" : "MODULES NOT LOADED"); /* no engine changes what these say */
    modwerk_diag_set(); /* diag.c: the set this boot runs, in the unit's log */
}
/* After a boot: the newest whole set, each package installed as a USB install would be. */
static void restore(void)
{
    restored = 1, restore_count = 0;
    unsigned held = SKIP_HELD;
    int a = load(0), wa = whole(a);
    uint32_t ga = wa ? be32(set + 8) : 0;
    int b = load(1), wb = whole(b);
    uint32_t gb = wb ? be32(set + 8) : 0;
    int hold = guard_check(ga > gb ? ga : gb);
    /* PROJ or FUNC held, or the guard holds: nothing installed, but the card's newest generation and slot are kept, so a
     * later save wins over it. */
    if (held || (hold && (wa || wb))) {
        slot = wb && (!wa || gb > ga) ? 1u : 0u;
        if (wa || wb) (void)load(slot); /* its shelf stays, for the page and the next save */
        else off_bytes = 0;
        for (unsigned i = 0; i < HEADER; ++i) set[i] = 0;
        put32(set + 8, ga > gb ? ga : gb);
        if (held) { modwerk_modset_result = SKIPPED; SAY("MODULES SKIPPED"); return; }
        modwerk_modset_result = HELD, notice_at = TICKS, notice_after = GUARD_NOTICE, notice = "MODULES HELD";
        modwerk_diag_refused(0, GUARD_HELD, 0, 0, 0), modwerk_diag_set();
        return;
    }
    if (!wa && !wb) {
        if (modwerk_modset_result != FOREIGN) modwerk_modset_result = a || b ? DAMAGED : NONE_SAVED;
        off_bytes = 0; /* no set of this base's: its shelf goes with it */
        for (unsigned i = 0; i < HEADER; ++i) set[i] = 0;
        modwerk_diag_set(); /* nothing restored: the log says so */
        return;
    }
    slot = wb && (!wa || gb > ga) ? 1u : 0u; /* the newer one; the next save goes to the other */
    if (!slot && (int)load(0) != a) { modwerk_modset_result = DAMAGED; off_bytes = 0; return; }
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) restore_outcome(i) = 0;
    restored = 0, left_out = left_why = left_used = left_largest = left_check = 0;
    restore_pass();
}
/* ep0.c's tick (sys task, as the board's): the restore's notice, once its engines run or its time is up and no dialog of
 * status.c's shows (MISSING opens after a restore that left out a module the bank names); and the
 * guard's settling, once the restore has run ten seconds with frames moving and no crash or stall recorded. */
void modwerk_modset_notice_tick(void)
{
    static uint32_t frames, since;
    volatile struct guard *g = GUARD;
    uint32_t now = FRAMES;
    if (!restored || !g->armed || now == frames || CRASHES != g->crashes || STALLS != g->stalls) since = TICKS;
    else if (TICKS - since >= GUARD_SETTLE) g->armed = g->loading = g->fails = 0;
    frames = now;
    const char *text = notice;
    uint32_t waited = TICKS - notice_at;
    if (!text || TICKS < notice_after || DIALOG() || waited < NOTICE_FIRST || (waited < NOTICE_LAST && SETTLING())) return;
    notice = 0;
    SAY(text);
}
#ifdef MODWERK_DEV
/* dev.c's GUARD TEST: the guard as a crash in this start's restore leaves it, blaming its first package (1) or none
 * (0), so the next start, a RAM boot included, shows what a tester's would. */
void modwerk_modset_guard_test(unsigned blame);
void modwerk_modset_guard_test(unsigned blame)
{
    volatile struct guard *g = GUARD;
    g->crashes = CRASHES - 1u, g->stalls = STALLS, g->loading = blame && used() > HEADER ? be32(set + HEADER) : 0, g->armed = 1;
}
#endif
/* PROJ > MODWERK > MODULES (status.c): a module switched off or on at once (owner, 16 November 2026). The page asks
 * from the UI task; the engine task answers at its next service, with the unit stopped and no host session open.
 * Off: the loader unloads the module as a host's removal would (refused while a track runs it), its package goes
 * from the set to the shelf. On: the loader installs the shelved package as the restore installs one, and it joins
 * the set again. Either way the set is saved as after any change, and a refusal leaves everything as it was. */
static volatile uint32_t switch_id;
static volatile uint8_t switch_on, switch_asked;
volatile uint32_t modwerk_modset_switch_result; /* status.h's MODSET_SWITCH codes, for the page */
int modwerk_modset_switch(uint32_t id, int on)
{
    if (switch_asked) return 0;
    switch_id = id, switch_on = (uint8_t)!!on, modwerk_modset_switch_result = MODSET_SWITCH_PENDING, switch_asked = 1;
    return 1;
}
int modwerk_modset_switch_due(void) { return switch_asked; } /* ep0.c's tick wakes the engine for it */
static uint32_t switch_now(uint32_t id, int on)
{
    const struct mu_backend *b6 = &modwerk_runtime_backend;
    if (!STOPPED()) return MODSET_SWITCH_PLAYING;
    if (!restored || pending || candidate || VOLATILE_BLOCKED() || HOST_BUSY() || !GATE()) return MODSET_SWITCH_BUSY;
    /* Only while the set here is the card's. After a start that skipped, held or left out modules the card still has
     * them all, and saving this start's smaller set over it for a switch would lose them: a restart restores them, a
     * sync decides them. After a base update (another base's set), a damaged file or a module the restore could not
     * load, a restart comes back the same: only a sync makes the set whole, so the page says that (owner, 16 November
     * 2026). */
    if (modwerk_modset_result == SKIPPED || modwerk_modset_result == HELD || modwerk_modset_result == LEFT_OUT) return MODSET_SWITCH_PARTIAL;
    if (modwerk_modset_result != RESTORED && modwerk_modset_result != NONE_SAVED && modwerk_modset_result != SAVED) return MODSET_SWITCH_SYNC;
    uint32_t n = used(), count = be32(set) == 0x4d575354u ? be32(set + 12) : 0, at = HEADER, length = 0, step = 0;
    static uint8_t gone[32]; /* the package that removes a module: ABI 4, no image, hooks or sites (removes()) */
    const uint8_t *package = gone;
    if (on) {
        const uint8_t *r = off_find(id);
        if (!r) return MODSET_SWITCH_GONE;
        length = be32(r + 4), step = 8u + ((length + 3u) & ~3u), at = n;
        if (count >= RUNTIME_MODULES || step > ROOM - n) return MODSET_SWITCH_FULL;
        for (uint32_t i = 0; i < step - 8u; ++i) set[n + 8u + i] = i < length ? r[OFF_RECORD + i] : 0; /* past the set, until it installs */
        package = set + n + 8u;
    } else {
        for (; at < n; at += step) {
            length = be32(set + at + 4), step = 8u + ((length + 3u) & ~3u);
            if (be32(set + at) == id) break;
        }
        if (at >= n) return MODSET_SWITCH_GONE;
        if (off_count() >= RUNTIME_MODULES || ((off_used() + OFF_RECORD + step - 8u + 511u) & ~511u) > SET_BYTES - n) return MODSET_SWITCH_FULL;
        for (unsigned i = 0; i < 32u; ++i) gone[i] = 0;
        gone[0] = 'M', gone[1] = 'W', gone[2] = 'R', gone[3] = 'M', gone[5] = 4, put32(gone + 28, id);
    }
    if (!b6->enter(b6->user)) return MODSET_SWITCH_BUSY;
    int ok = b6->prepare(b6->user, package, on ? length : 32u) && b6->publish(b6->user) == MU_APPLIED && b6->retire(b6->user);
    uint32_t why = ok ? 0 : (uint32_t)modwerk_runtime_refusal(); /* read before the discard overwrites it */
    if (!ok) (void)b6->discard(b6->user);
    (void)b6->leave(b6->user);
    if (!ok) return MODSET_SWITCH_REFUSED + why;
    if (on) put32(set + n, id), put32(set + n + 4, length), seal(count + 1u, n + step); /* seal takes it off the shelf */
    else {
        (void)off_add(id, set + at + 8u, length); /* its room was checked above */
        bytes_move(set + at, set + at + step, n - at - step);
        seal(count - 1u, n - step);
    }
    notice = 0, pending = 1, retry_at = 0;
    return MODSET_SWITCHED;
}
/* The shelf for status.c's page and for a host (ep0.c's OFF request): "MWO", the entries here, the shelf's count
 * (u16), 0, 0, then per module 56 bytes: an INVENTORY entry (loader.c modwerk_runtime_list: 0xff, 0, its parameter
 * layout, its id, its name; layout 0 and no name before ABI 6), then its package's SHA-256. Entries `first` on, at
 * most `most`. 0 while the shelf moves: ask again. From the UI task with the machine locked, or from the USB
 * interrupt; the engine task alone changes the shelf. */
unsigned modwerk_modset_off_list(uint8_t *out, unsigned first, unsigned most)
{
    if (off_moving & 1u) return 0;
    unsigned n = 0, seen = 0;
    for (uint32_t at = OFF_HEADER, used_now = off_used(); off_bytes && at < used_now && n < most; ) {
        const uint8_t *r = OFF + at, *p = r + OFF_RECORD;
        uint32_t length = be32(r + 4);
        at += OFF_RECORD + ((length + 3u) & ~3u);
        if (seen++ < first) continue;
        uint8_t *e = out + 8u + MODSET_OFF_ENTRY * n++;
        int named = length >= 68u && ((uint32_t)p[4] << 8 | p[5]) >= 6u;
        e[0] = 0xffu, e[1] = 0, e[2] = named ? p[66] : 0, e[3] = named ? p[67] : 0;
        for (unsigned i = 0; i < 4u; ++i) e[4 + i] = r[i];
        for (unsigned i = 0; i < 16u; ++i) e[8 + i] = named && i < 15u ? p[50 + i] : 0;
        for (unsigned i = 0; i < MU_DIGEST_BYTES; ++i) e[24 + i] = r[8 + i];
    }
    uint32_t count = off_count();
    out[0] = 'M', out[1] = 'W', out[2] = 'O', out[3] = (uint8_t)n, out[4] = (uint8_t)(count >> 8), out[5] = (uint8_t)count, out[6] = out[7] = 0;
    return 8u + MODSET_OFF_ENTRY * n;
}
/* This start's restore for a host (ep0.c's RESTORE request; status.h): each package of the card's set, loaded or left out
 * and why, entries `first` on, at most `most`; none until the restore has run. The header's result is the card set's
 * now, as SELFTEST's `saved`. From the USB interrupt; only the restore writes the entries, before it sets the count. */
unsigned modwerk_modset_restore_list(uint8_t *out, unsigned first, unsigned most)
{
    uint32_t count = restore_count, rows = count < RUNTIME_MODULES ? count : RUNTIME_MODULES, n = 0;
    for (; first + n < rows && n < most; ++n)
        for (unsigned i = 0; i < MODSET_RESTORE_ENTRY; ++i) out[8u + MODSET_RESTORE_ENTRY * n + i] = restore_entry[first + n][i];
    out[0] = 'M', out[1] = 'W', out[2] = 'R', out[3] = (uint8_t)n, out[4] = (uint8_t)(count >> 8), out[5] = (uint8_t)count;
    out[6] = (uint8_t)modwerk_modset_result, out[7] = 1;
    return 8u + MODSET_RESTORE_ENTRY * n;
}
int modwerk_modset_is_off(uint32_t module)
{
    uint32_t moving = off_moving;
    const uint8_t *r = module && !(moving & 1u) ? off_find(module) : 0;
    return r && off_moving == moving; /* a move meanwhile: not sure, so not off */
}
/* ep0.c holds host frames until the restore has run: an install before it would race it, and the restore would undo it. */
int modwerk_modset_restored(void) { return (int)restored; }
#ifdef MODWERK_SAMPLE_EDITOR
/* Used together with ep0.c's actual MU_TRIAL/MU_NORMAL phase, never alone.
 * Completed trials retain both candidate and SET_ROWS until Keep/Undo. Those
 * are not active writes; export-idle would wrongly refuse every trial module.
 * Still exclude incomplete restore, queued saves and volatile work. */
int mw_sample_storage_ready(void) { return restored && !pending && !JOURNAL_BLOCKED(); }
#endif
/* ep0.c's tick wakes the engine for this: a kept set not yet on the card whose save may run now (first try or retry). */
int modwerk_modset_due(void) { return restored && pending && TICKS >= retry_at && !VOLATILE_BLOCKED(); }
#ifdef MODWERK_SAVED_SET_EXPORT
/* A restored baseline without a staged package or any queued/retrying save. */
int modwerk_modset_export_idle(void) { return restored && !pending && !candidate && !VOLATILE_BLOCKED(); }
#endif
/* Engine task, on every return to its receive: the restore once after boot, then any pending save. */
void modwerk_modset_service(void)
{
#ifdef MODWERK_SAVED_SET_EXPORT
    int modwerk_saved_set_busy(void);
    if (modwerk_saved_set_busy()) return;
#endif
    if (switch_asked) { /* answered whatever holds the rest back: the page waits for it */
        modwerk_modset_switch_result = switch_now(switch_id, switch_on);
        switch_asked = 0;
    }
    if (VOLATILE_BLOCKED() || !GATE()) return;
    if (!restored) { /* three seconds in: the project and the card are up; then the restore's retries */
        if (!restore_tries) { if (TICKS > 180u) restore(); }
        else if (TICKS >= retry_at) restore_pass();
        return;
    }
#if defined MODWERK_RUNTIME_EVENTS && !defined MODWERK_HOST
    { /* ev_modules_ready (events.json): the live set changed and the gate above holds, so the card is free and nothing
       * plays. A module installed into a running project reads its own file now; no project load will tell it. */
        extern uint32_t modwerk_runtime_owner_epoch(void);
        extern const unsigned char modwerk_raise_ev_modules_ready[]; /* runtime_events.s: the base raises it, no module */
        extern void modwerk_sample_memory_service(void); /* sample_memory.c: ot_sample_memory's pages, before the raise */
        static uint32_t ready;
        uint32_t now = modwerk_runtime_owner_epoch();
        if (now != ready) {
            ready = now;
            modwerk_sample_memory_service();
            (void)((unsigned (*)(void))(uintptr_t)modwerk_raise_ev_modules_ready)();
        }
    }
#endif
    if (!pending || TICKS < retry_at) return;
    slot ^= 1u;
    if (store(slot)) pending = 0, modwerk_modset_result = SAVED, modwerk_diag_set(); /* the set as the card holds it, in the unit's log */
    else slot ^= 1u, retry_at = TICKS + 600u, modwerk_modset_result = SAVE_FAILED; /* ten seconds, then again */
}
