/* Original bounded recorder. Only engine safe points perform card I/O. */
#include "octamod_log_port.h"
static struct octamod_log_ring previous = {0}, snapshot = {0};
static char file[OCTAMOD_LOG_FILE_SIZE] __attribute__((aligned(512))) = {0};
static uint32_t ready = 0, busy = 0, have_previous = 0, attempted = 0;
static uint32_t last_attempt = 0, checkpoint = 0, first_flush = 1;
static uint32_t job_active = 0, job_id = 0, correlation = 0, job_token = 0, pending = 0;
#define ring (octamod_log_retained.ring)

void octamod_log_on_boot(void)
{
    ready = 0;
    unsigned same = 1;
    for (unsigned i = 0; i < 65; ++i)
        if (octamod_log_retained.configuration[i] != octamod_log_identity.configuration[i]) same = 0;
    if (!same) ring.magic = 0;
    have_previous = (uint32_t)octamod_log_boot(&ring, &previous);
    for (unsigned i = 0; i < 65; ++i)
        octamod_log_retained.configuration[i] = octamod_log_identity.configuration[i];
    busy = attempted = checkpoint = job_active = correlation = pending = 0;
    first_flush = ready = 1;
    octamod_log_platform_init();
    octamod_log_event(OLOG_I, OLOG_TAG('B','O','O','T'), 1, have_previous, OCTAMOD_LOG_VERSION);
}
void octamod_log_event(enum octamod_log_level level, uint32_t tag, uint16_t code, uint32_t a, uint32_t b)
{
    if (ready) {
        octamod_log(&ring, octamod_log_ticks(), level, tag, code, a, b);
        if (level == OLOG_E || level == OLOG_F) pending = 1;
    }
}
void octamod_log_fault(uint32_t format_sr, uint32_t pc)
{
    /* Format/vector word above SR in a ColdFire exception frame. */
    octamod_log_event(OLOG_F, OLOG_TAG('F','L','T',0), (uint16_t)((format_sr >> 18) & 0xffu), pc, format_sr);
}
int octamod_log_flush(unsigned requested)
{
    if (!ready || busy) return 0;
    if (requested) pending = 1;
    if (!octamod_log_can_flush()) return 0;
    uint32_t now = octamod_log_ticks(), dirty = ring.head - ring.flushed;
    if (!first_flush && !dirty) { pending = 0; return 0; }
    if (!first_flush && !pending && dirty < OLOG_FLUSH_RECORDS) return 0;
    /* Also throttle failures. Long idle gaps across timer wraps may delay a
     * checkpoint, but never shorten the minimum interval. */
    if (attempted && (uint32_t)(now - last_attempt) < OLOG_FLUSH_INTERVAL) return 0;
    busy = 1;
    if (!octamod_log_snapshot(&ring, &snapshot)) { busy = 0; return 0; }
    uint32_t used = octamod_log_format(&snapshot, have_previous ? &previous : 0, &octamod_log_identity, file);
    if (!used) { busy = 0; return -1; }
    if (!attempted) checkpoint = octamod_log_start_slot();
    attempted = 1; last_attempt = now;
    int ok = octamod_log_write_checkpoint(checkpoint & 1u, file, sizeof file, used);
    if (ok) {
        octamod_log_flushed(&ring, snapshot.head);
        first_flush = 0; pending = ring.head != snapshot.head; ++checkpoint;
        /* Retain the recovered session in every checkpoint this boot. */
    }
    busy = 0;
    /* A success must not dirty its own log and trigger endless writes. */
    if (!ok) octamod_log_event(OLOG_E, OLOG_TAG('L','O','G',0), 2, checkpoint & 1u, used);
    return ok ? 1 : -1;
}
uint32_t octamod_log_next_correlation(void)
{
    uint16_t sr = 0;
#ifndef OCTAMOD_LOG_HOST
    __asm__ volatile ("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d" (sr) : : "memory");
#endif
    uint32_t next = ++correlation;
#ifndef OCTAMOD_LOG_HOST
    __asm__ volatile ("move.w %0,%%sr" : : "d" (sr) : "memory");
#else
    (void)sr;
#endif
    return next;
}
void octamod_log_engine_begin(uint32_t job)
{
    job_active = 1; job_id = job; job_token = octamod_log_next_correlation();
    octamod_log_event(OLOG_I, OLOG_TAG('J','O','B',0), 1, job_token, job);
    octamod_log_capture_state(job_token);
}
void octamod_log_engine_idle(void)
{
    if (!ready) octamod_log_on_boot();
    unsigned requested = 0;
    if (job_active) {
        octamod_log_event(OLOG_I, OLOG_TAG('J','O','B',0), 2, job_token, job_id);
        octamod_log_capture_state(job_token);
        requested = job_id == 7 || job_id == 0x11 || job_id == 0x12;
        job_active = 0;
    }
    (void)octamod_log_flush(requested);
}
void octamod_log_transport(uint32_t request)
{
    uint32_t token = octamod_log_next_correlation();
    octamod_log_event(OLOG_I, OLOG_TAG('T','R','N',0), 1, token, request);
}
void octamod_log_io_error(uint32_t operation, int32_t result)
{
    /* Missing/empty optional files are normal probes, not I/O failures. */
    if (operation == 1 && (result == -12 || result == -10)) return;
    if (!busy && result < 0)
        octamod_log_event(OLOG_E, OLOG_TAG('F','S',0,0), (uint16_t)operation, job_active ? job_token : 0, (uint32_t)result);
}
