/* SPDX-License-Identifier: GPL-3.0-or-later */
// Voice Spread for the Digitone II: spreads the voices of a chord across the stereo field and,
// if wanted, their filter frequencies a little apart. Two rows in SETTINGS > PERSONALIZE set it for the project.
//
// The Digitone II base's ev_frame_params hands over the values of the 16 voice slots (not the
// tracks: OS 1.12 keeps one 101-value parameter array per voice), once a frame and before the stock
// modulators add theirs. Each slot gets a fixed offset of its own, so the notes of a chord, which
// take different slots, sit at different places. A track's kit, its pages and what is saved stay
// untouched: the offset is added to the live copy every frame and taken away by turning it off.

#include <stdint.h>
#include "../../../../machines/digitakt-ii/include/digitakt-mk2/core.h"

#include "spread.h"

// The project's setting, saved in the project file's header through core_projdata.
static struct vs_setting saved;
static volatile uint8_t pan_level, filter_level;

static void loaded(int found)
{
    struct vs_setting s = saved;
    if (!found || s.version != VS_VERSION) {
        s.pan = 0;
        s.filter = 0;
    }
    pan_level = s.pan < VS_PAN_LEVELS ? s.pan : 0;
    filter_level = s.filter < VS_FILTER_LEVELS ? s.filter : 0;
    saved.version = VS_VERSION;
    saved.pan = pan_level;
    saved.filter = filter_level;
}

const core_projdata_t voice_spread_projdata = {
    .tag = {'V', 'S', 'P', 'R'},
    .size = sizeof saved,
    .data = &saved,
    .loaded = loaded,
};

static const char *const pan_values[VS_PAN_LEVELS] = {"OFF", "25", "50", "75", "100"};
static const char *const filter_values[VS_FILTER_LEVELS] = {"OFF", "LOW", "MID", "HIGH"};

static uint32_t get_pan(void) { return pan_level; }
static uint32_t get_filter(void) { return filter_level; }

static void set_pan(uint32_t value)
{
    pan_level = (uint8_t)value;
    saved.version = VS_VERSION;
    saved.pan = (uint8_t)value;
}

static void set_filter(uint32_t value)
{
    filter_level = (uint8_t)value;
    saved.version = VS_VERSION;
    saved.filter = (uint8_t)value;
}

static const core_value_t pan_row = {"VOICE SPREAD", pan_values, VS_PAN_LEVELS, get_pan, set_pan};
static const core_value_t filter_row = {"FILTER SPREAD", filter_values, VS_FILTER_LEVELS, get_filter, set_filter};

// ev_personalize: while the stock OS builds SETTINGS > PERSONALIZE.
void voice_spread_personalize(void *menu)
{
    core_addvalue(menu, &pan_row);
    core_addvalue(menu, &filter_row);
}

// ev_frame_params: interrupt level, once a frame. Slot k's value j at values[stride * k + j].
void voice_spread_frame(int16_t *values, int stride)
{
    const unsigned int pan = pan_level, filter = filter_level;
    if (pan == 0 && filter == 0)
        return;
    vs_apply(values, stride, pan, filter);
}
