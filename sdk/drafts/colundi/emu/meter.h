/* SPDX-License-Identifier: MIT
 * Diagnostic build only. Times positive crossings of the emitted R channel
 * in units of 1/4096 sample. Stops accumulating once the test window is full.
 */
struct reading {
    unsigned degree, samples, first, last, crossings;
    int previous;
};
static volatile struct {
    char marker[8];
    unsigned notes;
    struct reading rows[12];
} meter = {.marker = {'C','U','P','C','M','T','E','S'}};

static void meter_start(unsigned track, unsigned degree)
{
    if (track == 0 && meter.notes < 12) meter.rows[meter.notes++].degree = degree;
}

static void meter_sample(unsigned track, uint32_t packed)
{
    if (track || !meter.notes) return;
    volatile struct reading *r = &meter.rows[meter.notes - 1];
    int value = (int16_t)(packed >> 16);
    if (r->samples > 128 && r->samples < 4096 && r->previous < 0 && value >= 0) {
        unsigned position = ((r->samples - 1) << 12)
            + ((unsigned)(-r->previous) << 12) / (unsigned)(value - r->previous);
        if (!r->crossings) r->first = position;
        ++r->crossings;
        r->last = position;
    }
    r->previous = value;
    ++r->samples;
}
