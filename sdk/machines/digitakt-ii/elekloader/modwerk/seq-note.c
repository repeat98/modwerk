/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "seq-note.h"

uint32_t core_seq_note_pitch(const struct dt2_seq_note_context *context, uint32_t pitch)
{
    if (pitch > 127) {
        return pitch;
    }

    for (unsigned int i = 0; i < DT2_SEQ_NOTE_HANDLERS && ev_seq_note[i]; ++i) {
        const int32_t result = ev_seq_note[i](context, pitch);
        if ((uint32_t)result <= 127) {
            pitch = (uint32_t)result;
        }
    }

    return pitch;
}
