/* Compile separately without OG_NATIVE_STAGE_ONE: per-frame scalar oracle. */
#define og_state cpu_reference_state
#define og_owner cpu_reference_owner
#define og_grain cpu_reference_legacy
#define og_grain_all cpu_reference_all
#define og_reset cpu_reference_reset
#define og_stop cpu_reference_stop
#define og_size cpu_reference_size
#define og_hop cpu_reference_hop
#define og_scan_advance cpu_reference_scan
#include "grain.c"
