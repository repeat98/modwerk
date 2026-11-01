/* SPDX-License-Identifier: MIT
 * Private proposal for an optional shared-base tail. Remove this compatibility
 * declaration after the separately reviewed base SDK exports the extension.
 * The ABI-1 prefix and its sizeof remain unchanged.
 */
#ifndef BS_SAMPLE_OPTIONS_H
#define BS_SAMPLE_OPTIONS_H
#include "../../../machines/octatrack/include/modwerk_sample_editor.h"
#ifndef MODWERK_SAMPLE_EDITOR_HAS_OPTIONS
enum {
    MODWERK_SAMPLE_ANALYZING=10,
    MODWERK_SAMPLE_ANALYSIS_FAILED=11,
    MODWERK_SAMPLE_ANALYSIS_LIMIT=12
};
#define MODWERK_SAMPLE_SNAP_ZERO 1u
struct modwerk_sample_editor_options_api {
    struct modwerk_sample_editor_api base;
    unsigned (*replace_options)(uint32_t,const struct modwerk_sample_grid *,uint32_t);
} __attribute__((aligned(4)));
#endif
#endif
