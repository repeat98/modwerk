/* SPDX-License-Identifier: GPL-3.0-or-later */
/* build_core.py's block-3 rule in Octabam's buffer planner (test_recipe.py applies the edits): the top of each core's
 * FX2 block 3 holds the receiver's packet operations (dsp_loader.WINDOW), so an effect whose buffer reaches past it
 * (reads 2) neither takes nor keeps that block, and is planned before the narrow ones (reads 1). */
#include <assert.h>
#include <string.h>
#include "buffers.h"

enum { NARROW = 10, WIDE = 11, OTHER = 12 };
static uint8_t reads[MODWERK_FX_IDS];

/* Core 1's FX2 slots (tracks 1-4) run `ids` from a fresh plan: -> the planner's result, blocks in `blocks`. */
static int plan(const uint8_t ids4[4], const uint8_t running4[4], uint8_t blocks[4])
{
    struct dl_buffers b;
    uint8_t running[16], ids[16];
    memset(running, 0, sizeof running), memset(ids, 0, sizeof ids);
    for (unsigned t = 0; t < 4; ++t) ids[8 + t] = ids4[t], running[8 + t] = running4[t];
    dl_buffers_init(&b, 0);
    int r = dl_buffers_prepare(&b, running, ids, reads);
    for (unsigned t = 0; t < 4; ++t) blocks[t] = b.target[8 + t];
    return r;
}

int main(void)
{
    static const uint8_t idle[4] = {0, 0, 0, 0};
    uint8_t blocks[4];
    reads[NARROW] = 1, reads[WIDE] = 2, reads[OTHER] = 1;
    { /* four wide buffers on one core: only three blocks are clear of the window half */
        const uint8_t ids[4] = {WIDE, WIDE, WIDE, WIDE};
        assert(plan(ids, idle, blocks) == DL_BUF_MEMORY);
    }
    { /* three wide and a narrow one fit, whatever the order: the narrow one gets block 3 */
        const uint8_t ids[4] = {NARROW, WIDE, WIDE, WIDE};
        assert(plan(ids, idle, blocks) == DL_BUF_OK);
        assert(blocks[0] == 3 && blocks[1] != 3 && blocks[2] != 3 && blocks[3] != 3);
    }
    { /* four narrow ones use all four blocks, as stock's effects do */
        const uint8_t ids[4] = {NARROW, NARROW, NARROW, NARROW};
        assert(plan(ids, idle, blocks) == DL_BUF_OK);
        assert(blocks[0] != blocks[1] && blocks[2] != blocks[3] && (blocks[0] == 3 || blocks[1] == 3 || blocks[2] == 3 || blocks[3] == 3));
    }
    { /* a wide effect already named on track 4 (its stock block, 3, from before any transaction) does not keep it */
        const uint8_t ids[4] = {0, 0, 0, WIDE};
        assert(plan(ids, ids, blocks) == DL_BUF_OK);
        assert(blocks[3] != DL_BUF_NONE && blocks[3] != 3);
    }
    { /* a narrow one there keeps its block */
        const uint8_t ids[4] = {0, 0, 0, NARROW};
        assert(plan(ids, ids, blocks) == DL_BUF_OK && blocks[3] == 3);
    }
    { /* all four blocks in use, and track 4 swaps its effect for another: it takes over its own block, as stock does */
        const uint8_t running[4] = {NARROW, NARROW, NARROW, NARROW}, ids[4] = {NARROW, NARROW, NARROW, OTHER};
        assert(plan(ids, running, blocks) == DL_BUF_OK);
        assert(blocks[0] == 0 && blocks[1] == 1 && blocks[2] == 2 && blocks[3] == 3);
    }
    { /* the same swap to a wide effect: track 4's own block is block 3, so it has nowhere to go */
        const uint8_t running[4] = {NARROW, NARROW, NARROW, NARROW}, ids[4] = {NARROW, NARROW, NARROW, WIDE};
        assert(plan(ids, running, blocks) == DL_BUF_MEMORY);
    }
    { /* but a wide effect swapping in on track 1 keeps track 1's block 0 */
        const uint8_t running[4] = {NARROW, NARROW, NARROW, NARROW}, ids[4] = {WIDE, NARROW, NARROW, NARROW};
        assert(plan(ids, running, blocks) == DL_BUF_OK && blocks[0] == 0);
    }
    return 0;
}
