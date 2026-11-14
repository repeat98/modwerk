/* SPDX-License-Identifier: GPL-2.0-or-later */
#ifndef MODWERK_DT2_PROJECT_ARCHIVE_H
#define MODWERK_DT2_PROJECT_ARCHIVE_H

#include <stdint.h>

typedef struct {
    uint32_t tag;
    uint32_t size;
    void (*save)(void *data);
    void (*load)(const void *data);
} dt2_project_archive_t;

#endif
