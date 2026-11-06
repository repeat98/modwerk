/* Absolute exports are usable only on the reviewed base layouts. */
#include <stdint.h>
#include "base_binding.h"
#include "base_identity.h" /* private builder output; no stock bytes */

int og_machine_base_ready(void) {
    static int ready;
    if (!ready) {
        const volatile uint8_t *actual =
            (const volatile uint8_t *)(uintptr_t)OG_BASE_DIGEST_ADDRESS;
        int match = 0;
        /* A published base has several USB layouts at identical runtime
         * addresses. Each complete digest is approved by the build recipe. */
        for (unsigned base = 0; base < sizeof og_expected_base_digest; base += 32u) {
            int equal = 1;
            for (unsigned i = 0; i < 32u; ++i)
                if (actual[i] != og_expected_base_digest[base + i]) equal = 0;
            if (equal) match = 1;
        }
        /* A base cannot change without rebooting, which resets this image. */
        ready = match ? 1 : -1;
    }
    return ready == 1;
}
