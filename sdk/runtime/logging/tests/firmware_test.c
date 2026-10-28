#include <stdio.h>
#include <string.h>
#include "octamod_log_port.h"
struct octamod_log_retained_state octamod_log_retained;
const struct octamod_log_identity octamod_log_identity = {
 "0123456789abcdef", "1.40C", "octamod-log@0.2.0-draft",
 "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
 "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
 "FILTER", "FILTER;DELAY", "", 1 };
static uint32_t ticks, writes, slots[32];
static int safe = 1, succeeds = 1, append_during_write = 0, failures;
static char last[OCTAMOD_LOG_FILE_SIZE + 1];
#define CHECK(x) do { if (!(x)) { fprintf(stderr, "FAIL %d: %s\n", __LINE__, #x); ++failures; } } while (0)
void octamod_log_platform_init(void) {}
unsigned octamod_log_start_slot(void) { return 0; }
uint32_t octamod_log_ticks(void) { return ticks; }
int octamod_log_can_flush(void) { return safe; }
void octamod_log_capture_state(uint32_t token) { (void)token; }
int octamod_log_write_checkpoint(unsigned slot, const char *data, uint32_t size, uint32_t used)
{
 CHECK(size == OCTAMOD_LOG_FILE_SIZE && slot < 2 && used <= size);
 slots[writes++] = slot; memcpy(last, data, size); last[size] = 0;
 /* Simulate an interrupt logging while the filesystem has yielded. */
 if (append_during_write) octamod_log_event(OLOG_E, OLOG_TAG('L','A','T','E'), 1, 2, 3);
 return succeeds;
}
int main(void)
{
 memset(&octamod_log_retained, 0xa5, sizeof octamod_log_retained);
 octamod_log_on_boot();
 safe = 0; CHECK(octamod_log_flush(1) == 0 && writes == 0);
 safe = 1; CHECK(octamod_log_flush(1) == 1 && writes == 1);
 CHECK(strstr(last, "# configuration=0123456789abcdef") != NULL);
 CHECK(strstr(last, "# complete=") != NULL);
 ticks += OLOG_FLUSH_INTERVAL;
 CHECK(octamod_log_flush(1) == 0 && writes == 1); /* success doesn't dirty */
 octamod_log_event(OLOG_I,OLOG_TAG('T','E','S','T'),1,0,0);
 CHECK(octamod_log_flush(0) == 0); /* batch threshold */
 octamod_log_fault(0x400c2700, 0x4000406a);
 CHECK(octamod_log_flush(1) == 1 && writes == 2 && slots[1] == 1);
 CHECK(strstr(last, "F FLT 0003 4000406A 400C2700") != NULL);
 octamod_log_event(OLOG_I,OLOG_TAG('T','E','S','T'),1,0,0);
 CHECK(octamod_log_flush(1) == 0 && writes == 2); /* rapid SAVE */
 ticks += OLOG_FLUSH_INTERVAL; succeeds = 0;
 uint32_t flushed = octamod_log_retained.ring.flushed;
 CHECK(octamod_log_flush(1) == -1 && writes == 3);
 CHECK(octamod_log_retained.ring.flushed == flushed);
 CHECK(octamod_log_flush(1) == 0 && writes == 3); /* no failure storm */
 ticks += OLOG_FLUSH_INTERVAL; succeeds = 1; append_during_write = 1;
 CHECK(octamod_log_flush(1) == 1 && slots[2] == slots[3]);
 CHECK(octamod_log_retained.ring.head != octamod_log_retained.ring.flushed);
 append_during_write = 0;
 octamod_log_on_boot();
 CHECK(octamod_log_flush(1) == 1 && strstr(last,"# recovered=1") != NULL);
 ticks += OLOG_FLUSH_INTERVAL;
 octamod_log_event(OLOG_I,OLOG_TAG('T','E','S','T'),1,0,0);
 CHECK(octamod_log_flush(1) == 1 && strstr(last,"# recovered=1") != NULL);
 /* Another configuration must never relabel old events as this build. */
 octamod_log_retained.configuration[0] = 'f'; octamod_log_on_boot();
 CHECK(octamod_log_flush(1) == 1 && strstr(last,"# recovered=1") == NULL);
 /* Counter wrap still enforces the minimum interval. */
 ticks = UINT32_MAX - OLOG_FLUSH_INTERVAL / 2;
 octamod_log_event(OLOG_I,OLOG_TAG('T','E','S','T'),1,0,0);
 CHECK(octamod_log_flush(1) == 1);
 ticks += OLOG_FLUSH_INTERVAL;
 octamod_log_event(OLOG_I,OLOG_TAG('T','E','S','T'),1,0,0);
 CHECK(octamod_log_flush(1) == 1);
 if (failures) return 1;
 puts("octamod-log controller test: ok");
 return 0;
}
