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

/* Internal writer for an already validated active-project file buffer. */
void core_project_archive_write(uint8_t *file);

#endif
