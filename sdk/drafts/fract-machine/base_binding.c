/* Absolute experimental imports are usable only on the exact paired base. */
#include <stdint.h>
#include "base_binding.h"
#include "base_identity.h" /* private builder output; no stock bytes */

int og_machine_base_ready(void) {
    static int ready;
    if (!ready) {
        const volatile uint8_t *actual =
            (const volatile uint8_t *)(uintptr_t)OG_BASE_DIGEST_ADDRESS;
        int match = 1;
        for (unsigned i = 0; i < sizeof og_expected_base_digest; ++i)
            if (actual[i] != og_expected_base_digest[i]) match = 0;
        /* A base cannot change without rebooting, which resets this image. */
        ready = match ? 1 : -1;
    }
    return ready == 1;
}
