/* Package requiredBase admits the linked base before callbacks are installed.
 * The shared builder follows committed export addresses; no base ID belongs
 * in the machine image. Keep the readiness entry for the existing adapters. */
#include "base_binding.h"

int og_machine_base_ready(void) {
    return 1;
}
