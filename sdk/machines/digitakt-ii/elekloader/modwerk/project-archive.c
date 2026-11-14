/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "project-archive.h"
#include "mk2/core.h"

enum {
    ACTIVE_PROJECT = 0x41776c9c,
    KIT_RECORDS = 0xae0200, KIT_RECORD_SIZE = 0x5800,
    CHUNKS = 128, CHUNK_BYTES = 44, CHUNK_STRIDE = CHUNK_BYTES + 4,
    ARCHIVE_BYTES = CHUNKS * CHUNK_BYTES,
    CHUNK_MAGIC = 0x4d574131, /* MWA1 */
    HEADER = 8,
};

extern const dt2_project_archive_t *const core_project_archive[];
static uint32_t archive[ARCHIVE_BYTES / 4];

static uint32_t *chunk(const uint8_t *file, unsigned int index)
{
    return (uint32_t *)(file + KIT_RECORDS + (index + 1u) * KIT_RECORD_SIZE - CHUNK_STRIDE);
}

static int blank(const uint32_t *words)
{
    for (unsigned int i = 0; i < CHUNK_STRIDE / 4; ++i) {
        if (words[i]) {
            return 0;
        }
    }
    return 1;
}

static uint32_t checksum(const uint8_t *bytes, unsigned int size)
{
    uint32_t hash = UINT32_C(2166136261);
    for (unsigned int i = 0; i < size; ++i) {
        hash = (hash ^ bytes[i]) * UINT32_C(16777619);
    }
    return hash;
}

void core_project_archive_save(uint8_t *file, uint32_t flags, uintptr_t project)
{
    if (project != ACTIVE_PROJECT || !(flags & 2u) || !core_project_archive[0]) {
        return;
    }
    uint8_t *const bytes = (uint8_t *)archive;
    unsigned int used = HEADER;
    for (const dt2_project_archive_t *const *entry = core_project_archive; *entry; ++entry) {
        const dt2_project_archive_t *const block = *entry;
        if (!block->tag || (block->size & 3u) || used > ARCHIVE_BYTES - 8 ||
            block->size > ARCHIVE_BYTES - used - 8) {
            ++core_store_conflicts;
            continue;
        }
        uint32_t *const header = (uint32_t *)(bytes + used);
        header[0] = block->tag;
        header[1] = block->size;
        block->save(header + 2);
        used += 8 + block->size;
    }
    archive[0] = used;
    archive[1] = checksum(bytes + HEADER, used - HEADER);
    const unsigned int count = (used + CHUNK_BYTES - 1) / CHUNK_BYTES;
    for (unsigned int i = 0; i < count; ++i) {
        const uint32_t *const slot = chunk(file, i);
        if (slot[0] != CHUNK_MAGIC && !blank(slot)) {
            ++core_store_conflicts;
            return;
        }
    }
    for (unsigned int i = used / 4; i < count * CHUNK_BYTES / 4; ++i) {
        archive[i] = 0;
    }
    for (unsigned int i = 0; i < count; ++i) {
        uint32_t *const slot = chunk(file, i);
        slot[0] = CHUNK_MAGIC;
        fw_memcpy(slot + 1, bytes + i * CHUNK_BYTES, CHUNK_BYTES);
    }
}

static unsigned int read_archive(const uint8_t *file)
{
    if (!file || chunk(file, 0)[0] != CHUNK_MAGIC) {
        return 0;
    }
    const unsigned int used = chunk(file, 0)[1];
    if (used < HEADER || used > ARCHIVE_BYTES || (used & 3u)) {
        return 0;
    }
    uint8_t *const bytes = (uint8_t *)archive;
    for (unsigned int i = 0; i < (used + CHUNK_BYTES - 1) / CHUNK_BYTES; ++i) {
        const uint32_t *const slot = chunk(file, i);
        if (slot[0] != CHUNK_MAGIC) {
            return 0;
        }
        fw_memcpy(bytes + i * CHUNK_BYTES, slot + 1, CHUNK_BYTES);
    }
    return checksum(bytes + HEADER, used - HEADER) == archive[1] ? used : 0;
}

void core_project_archive_load(const uint8_t *file)
{
    if (!core_project_archive[0]) {
        return;
    }
    const unsigned int used = read_archive(file);
    for (const dt2_project_archive_t *const *entry = core_project_archive; *entry; ++entry) {
        const dt2_project_archive_t *const block = *entry;
        const void *data = 0;
        for (unsigned int offset = HEADER; offset + 8 <= used;) {
            const uint32_t *const header = archive + offset / 4;
            const unsigned int size = header[1];
            if ((size & 3u) || size > used - offset - 8) {
                break;
            }
            if (header[0] == block->tag && size == block->size) {
                data = header + 2;
                break;
            }
            offset += 8 + size;
        }
        block->load(data);
    }
}
