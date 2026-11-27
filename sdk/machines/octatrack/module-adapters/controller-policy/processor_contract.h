/* SPDX-License-Identifier: MIT */
#ifndef MODWERK_PROCESSOR_CONTRACT_H
#define MODWERK_PROCESSOR_CONTRACT_H
#include "loader.h"
#define TP_FEATURE 16u
#define TP_MEMBERS 16u
#define TP_CODE_WORDS 2048u
#define TP_STATE_WORDS 1839u
#define TP_PACKAGE_HEADER 18u
#define TP_PACKAGE_MAGIC 0x4d5754u
#define TP_CHAIN_MAGIC 0x545043u
#define TP_BRA 0x0d10c0u
#define TP_BSR 0x0d1080u
#define TP_RTS 0x00000cu
/* The target toolchain is freestanding and supplies no C library headers. */
static inline void tp_zero(void *p,unsigned n){uint8_t *q=p;while(n--)*q++=0;}
static inline void tp_copy(void *p,const void *s,unsigned n){uint8_t *q=p;const uint8_t *r=s;while(n--)*q++=*r++;}
static inline int tp_different(const void *p,const void *s,unsigned n){const uint8_t *q=p,*r=s;while(n--)if(*q++!=*r++)return 1;return 0;}
enum { TP_NONE, TP_VALID, TP_BAD, TP_FULL };
/* A view is used only under the loader's stable owner lock. Plans copy all
 * DSP words and retain no pointers into an uploaded or predecessor image. */
struct tp_view {
    const struct runtime_dsp *dsp;
    const uint32_t *code,*y_relocations,*initial;
    uint16_t code_words,state_words,stride,control,reset,y_count;
    uint8_t minimum,maximum,neutral,order;
    uint32_t y_origin;
};
struct tp_input { struct tp_view view; uint32_t module,generation,charge; };
struct tp_member {
    uint32_t module,generation;
    uint16_t y_base,state_words,stride,control,reset;
    uint8_t minimum,maximum,neutral,order;
};
struct tp_plan {
    uint32_t words[TP_CODE_WORDS],initial[TP_STATE_WORDS];
    uint16_t relocations[TP_CODE_WORDS];
    struct tp_member member[TP_MEMBERS];
    uint16_t word_count,relocation_count,count,pad;
    uint32_t charge;
};
int tp_decode(const struct runtime_dsp *,struct tp_view *);
/* Dry-run: output may be0. No image/state buffer changes on refusal. */
int tp_build(const struct tp_input *,unsigned,struct tp_plan *);
unsigned tp_state_offset(unsigned address);
#endif
