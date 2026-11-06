/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "feedback.h"
const uint8_t mf_cc[MF_PARAMS] = {95, 74, 75, 78, 80, 82, 83};
/* Admit only a coherent descriptor/ring state. While active, the whole
 * outstanding ring span must equal the DMA block. Then every remaining-count
 * value from zero through block (including reload) leaves at least this much
 * room. Idle descriptors must have completed/reloaded, with no outstanding
 * span. Unknown, special or transient states always defer.
 */
int mf_queue_admits(unsigned active, unsigned span, unsigned block,
                    unsigned remaining, unsigned pending)
{
    if (span >= 4096u || block >= 4096u || remaining > block || pending > 4096u)
        return 0;
    if (active == 0) {
        if (span || remaining != block) return 0;
    } else if (active == 1) {
        if (!block || span != block) return 0;
    } else return 0;
    return span + pending <= 4096u - 64u - 3u;
}
static int pending(const struct mf_cell *c)
{
    return c->valid && (c->refresh || !c->sent || c->value != c->sent_value || c->channel != c->sent_channel);
}
void mf_reset(struct mf_state *s)
{
    unsigned i;
    for (i = 0; i < MF_COUNT; ++i) {
        s->cells[i].valid = s->cells[i].sent = s->cells[i].refresh = 0;
    }
    s->cursor = 0;
}
void mf_request_refresh(struct mf_state *s)
{
    unsigned i;
    /* Preserve the cursor: retries and repeated refresh requests cannot
     * starve later tracks when the output is congested.
     */
    for (i = 0; i < MF_COUNT; ++i) if (s->cells[i].valid) s->cells[i].refresh = 1;
}
void mf_offer(struct mf_state *s, unsigned track, unsigned parameter, int channel, int value)
{
    struct mf_cell *c;
    if (track >= MF_TRACKS || parameter >= MF_PARAMS) return;
    c = &s->cells[track * MF_PARAMS + parameter];
    if ((unsigned)channel >= 16) { c->valid = c->sent = c->refresh = 0; return; }
    value = value < 0 ? 0 : value > 127 ? 127 : value;
    if (pending(c) && (c->channel != channel || c->value != value)) ++s->coalesced;
    c->value = (uint8_t)value;
    c->channel = (uint8_t)channel;
    c->valid = 1;
}
unsigned mf_flush(struct mf_state *s, mf_send send)
{
    unsigned scanned, emitted = 0;
    for (scanned = 0; scanned < MF_COUNT && emitted < MF_BUDGET; ++scanned) {
        unsigned i = s->cursor;
        struct mf_cell *c = &s->cells[i];
        if (pending(c)) {
            if (!send(c->channel, mf_cc[i % MF_PARAMS], c->value)) { ++s->deferred; break; }
            c->sent_channel = c->channel;
            c->sent_value = c->value;
            c->sent = 1;
            c->refresh = 0;
            ++emitted;
        }
        s->cursor = (i + 1) % MF_COUNT;
    }
    return emitted;
}
