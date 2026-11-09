/* SPDX-License-Identifier: GPL-2.0-or-later */
#ifndef MODWERK_DT2_PROJECT_GENERATION_H
#define MODWERK_DT2_PROJECT_GENERATION_H

#include <stdint.h>

/* Compare for equality to tell whether RAM state belongs to the active project.
 * Changes when stock loads or initializes that project, including at boot.
 */
extern const volatile uint32_t core_project_generation;

/* Same generation on bases that clear the kit-data blocks on project replacement. */
extern const volatile uint32_t core_project_kitdata_generation;

#endif
