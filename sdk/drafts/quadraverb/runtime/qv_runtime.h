/* SPDX-License-Identifier: GPL-3.0-or-later
 * The Quadraverb's ColdFire half (qv_runtime.c): its ot_dsp_effects record, and the tables engine/qvcf.py generates
 * into gen/qv_tables.h from the owner's ROM image (committed under his 27 Nov 2026 waiver). This header holds no ROM
 * data. */
#ifndef QV_RUNTIME_H
#define QV_RUNTIME_H
#include <stdint.h>

/* Copied from the base's sdk/machines/octatrack/include/modwerk_events.h (base 0.8.3 draft, branch base-083-qv-work
 * at 59774b0d0, ot_dsp_effects): keep it identical. */
struct modwerk_dsp_effect {
    uint32_t abi;                       /* MODWERK_DSP_EFFECT_ABI */
    uint32_t program_words;             /* the P words of each of its program areas, 1-2048: the most one program's code takes; 0 none */
    int32_t (*program)(unsigned slot);  /* the program slot runs from now: 0-0x7fffff, or -1 none yet */
    uint32_t (*code)(unsigned slot, int32_t program, uint32_t at, uint32_t *out); /* that program's words for P address at */
    uint16_t stream_in, stream_out;     /* the stream: halfwords a frame to the slot's DSP code and from it; 0 none */
    void (*fill)(unsigned slot, uint32_t frame, volatile uint16_t *in);         /* the in-block the DSP reads in that frame */
    void (*take)(unsigned slot, uint32_t frame, const volatile uint16_t *out);  /* the out-block the DSP wrote in that frame */
    uint32_t reserved;                  /* 0 */
};
#define MODWERK_DSP_EFFECT_ABI 1u

/* One program's stream plan (qvs.Plan, as qvs.ColdFire reads it) and its area (engine/qvarea.py). */
struct qv_line { uint32_t at, mask; };   /* a streamed line's ring: its offset in the slot's rings, its length - 1 */
struct qv_window {                       /* an in-block run of w halfwords from ring line, newest first */
    int32_t b;                           /* its start B: b (static), or b + the published U (moving) */
    uint16_t line, w, u0;                /* line: index in qv_lines; u0: U before any was published */
    int16_t mv;                          /* -1 static, else its moving window's index in the out-block */
};
struct qv_prog {
    uint16_t lines, line0, windows, win0, moving, in_words;
    uint32_t ring;                       /* halfwords of all its rings */
    uint32_t area0, area_n, reloc0, reloc_n, origin; /* area words qv_area[3 * area0..], relocations qv_relocs[reloc0..] */
};

extern const struct modwerk_dsp_effect qv_effect;
int32_t qv_program(unsigned slot);
uint32_t qv_code(unsigned slot, int32_t program, uint32_t at, uint32_t *out);
void qv_fill(unsigned slot, uint32_t frame, volatile uint16_t *in);
void qv_take(unsigned slot, uint32_t frame, const volatile uint16_t *out);
const char *qv_name(unsigned value);  /* runtime/qv_entry.s: PROG's message box line */
uint32_t qv_page(void);               /* runtime/qv_entry.s: our installed FX2 page, or 0 */

/* Diagnostics, never an ABI: resyncs, takes with no room in the pool, samples asked before they arrived, out-blocks
 * missed, blocks with a tag that is not ours. */
extern volatile uint32_t qv_resyncs, qv_no_room, qv_missing, qv_gaps, qv_bad_tags;
#endif
