/* SPDX-License-Identifier: MIT */
#ifndef MODWERK_SAMPLE_EDITOR_ACTIONS_H
#define MODWERK_SAMPLE_EDITOR_ACTIONS_H
#include "loader.h"
#include "modwerk_sample_editor.h"
struct mw_sample_action_view {
    uint32_t action, entry_offset;
    char label[32];
};
/* Decode one immutable bounded copy, supplied under the base's stable loader
 * and descriptor-writer boundary. Encoded entry is relative; a reconstructed
 * entry must lie in that exact image alias. No pointer escapes this decoder.
 * Failure leaves out unchanged. Descriptor and BSS entries are refused. The
 * C package image has no reserved eight-byte prefix: code offset zero is valid. */
int mw_sample_action_decode(const uint8_t *image,uint32_t image_bytes,uint32_t record,
    uint32_t image_address,unsigned encoded,struct mw_sample_action_view *out);
int mw_sample_action_admission(const struct runtime_dsp *,const struct runtime_dsp *,
    enum runtime_metadata_operation);
#endif
