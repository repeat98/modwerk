/* SPDX-License-Identifier: GPL-3.0-or-later
 * SCENE GEN engine: scene locks generated around a Part's own values, for the crossfader to travel between. Firmware-free:
 * it sees the Part's values and each parameter's range as plain arrays and writes plain lock rows; the glue reads and
 * writes the Part. Integers only. */
#ifndef SCENEGEN_ENGINE_H
#define SCENEGEN_ENGINE_H
#include <stdint.h>
#include <stddef.h>
#define SG_TRACKS 8u
#define SG_SLOTS 30u   /* a scene's lock bytes per track: PLAYBACK 0-5, LFO 6-11, AMP 12-17, FX1 18-23, FX2 24-29 */
#define SG_SCENES 16u
#define SG_NO_LOCK 255u
#define SG_XVOL 17u    /* AMP slot F: the crossfader volume, a scene-only control; never generated */
enum { SG_TO_A, SG_TO_B, SG_TO_RAND16, SG_TO_PATH16, SG_TARGETS };
enum { SG_SRC, SG_LFO, SG_AMP, SG_FX1, SG_FX2, SG_FX, SG_ALL, SG_PAGES };

typedef struct {
    uint8_t target;  /* SG_TO_A .. SG_TO_PATH16 */
    uint8_t pages;   /* SG_SRC .. SG_ALL: page 1 of these */
    uint8_t all;     /* 0 the active track, 1 every audio track */
    uint8_t spread;  /* 1-127: how far from the Part's values, as a share of each parameter's range */
} SgParams;
/* What the glue reads: per track and slot the Part's value and the range, lo > hi when the page has no such knob. */
typedef struct { uint8_t base[SG_TRACKS][SG_SLOTS], lo[SG_TRACKS][SG_SLOTS], hi[SG_TRACKS][SG_SLOTS]; } SgPart;
/* The scenes' lock rows, as the Part keeps them: [scene][track][32] (only the first SG_SLOTS bytes are locks). */
typedef uint8_t SgScenes[SG_SCENES][SG_TRACKS][32];

extern const SgParams sg_defaults;
extern const char *const sg_target_names[SG_TARGETS];
extern const char *const sg_page_names[SG_PAGES];
/* Whether slot k is one the pages select. */
unsigned sg_selected(unsigned pages, unsigned k);
/* Writes the generated locks into `scenes` for the scenes the target names (scene_a, scene_b: the scenes selected on
 * the A and B sides), on `track` or every track, leaving every other lock as it was. Returns the number of lock bytes
 * that changed, or -1 on a bad argument. */
int sg_generate(SgScenes scenes, const SgPart *part, const SgParams *p, unsigned track, unsigned scene_a,
                unsigned scene_b, uint32_t seed);
#endif
