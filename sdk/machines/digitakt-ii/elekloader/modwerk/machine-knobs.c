/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Knob names for added machines (OS 1.17).
 *
 * An added machine's knobs are its stand-in's own parameters: the SRC page, trig locks, live recording, MIDI, saved
 * kits and the sound chip treat them exactly as the stand-in's, so a module reads their values where the stand-in's
 * arrive (the sound chip's voice parameter record, MACHINES.md). What changes is what the screen calls them: when a
 * page asks for an added machine's descriptor, the base points those parameter rows' names (+0x28 name, +0x30 short
 * name) at the machine's knob names, and back to the stock names when it asks for any other machine's. A knob with
 * value names also gets a formatter (+0x34) that shows them. Knob C, which SAMPLE does not show, becomes
 * SAMPLE's crossfade parameter (code 0xcc, sound slot 27) when a machine standing for SAMPLE names it.
 *
 * Not new parameter rows: the OS keeps per-code arrays of exactly 275 entries besides the parameter table (the
 * per-code objects at 0x4293c040 among them; 17 of the 56 checks against the row count guard such arrays), so a code
 * past 275 reads past their ends. MACHINES.md has the trace.
 */
#include <stdint.h>
#include <mk2/machines.h>

#define PARAMS ((uint32_t *)0x4020f59cu)  /* 275 rows of 0x3c bytes */
#define PARAM_ROWS 275u
#define ROW_WORDS 15u
#define ROW_NAME 10u                       /* +0x28 */
#define ROW_SHORT 12u                      /* +0x30 */
#define ROW_FORMATTER 13u                  /* +0x34 */
#define SAMPLE_TYPE 0u
#define SAMPLE_CROSSFADE 0xccu

/* Knob positions A-H in a descriptor's eight codes for the five knobs: B, C, E, F, G. */
static const uint8_t KNOB_POSITION[DT2_MACHINE_KNOBS] = { 1, 2, 4, 5, 6 };

extern const struct dt2_machine *const core_machines[DT2_MACHINE_COUNT];
extern const uint32_t *core_stock_descriptor(uint32_t type);

/* An added machine's descriptor: the stand-in's 44-byte descriptor, with knob C given SAMPLE's crossfade parameter
 * when the machine stands for SAMPLE and names knob C. Built on first use, after the OS has built its own. */
static uint32_t descriptors[DT2_MACHINE_COUNT][11];
static uint8_t built[DT2_MACHINE_COUNT];

const uint32_t *core_machine_descriptor(uint32_t type)
{
    const struct dt2_machine *machine = dt2_machine_at(type, core_machines);
    if (!machine) {
        return 0;
    }
    uint32_t n = type - DT2_MACHINE_FIRST;
    if (!built[n]) {
        const uint32_t *stock = core_stock_descriptor(machine->stands_for);
        for (uint32_t w = 0; w < 11; ++w) {
            descriptors[n][w] = stock[w];
        }
        if (machine->stands_for == SAMPLE_TYPE && machine->knobs[1].name && !descriptors[n][2 + KNOB_POSITION[1]]) {
            descriptors[n][2 + KNOB_POSITION[1]] = SAMPLE_CROSSFADE;
        }
        built[n] = 1;
    }
    return descriptors[n];
}

/* The stock names and formatters of the rows renamed now, to put back. */
static struct { uint32_t code, name, shortname, formatter; } saved[DT2_MACHINE_KNOBS];
static uint32_t saved_count;
static uint32_t shown;                     /* the added type whose names the rows carry, 0 for none */

/* Knob value names: a renamed row with value names gets the formatter of its knob position, which writes the name for
 * the value or, past the list, calls the stock formatter it replaced. A formatter is (value << 8, text out); the
 * stock ones end by copying their text with 0x40000e82 (out, text). */
typedef void formatter_fn(int32_t value, char *out);
#define COPY_TEXT ((void (*)(char *, const char *))0x40000e82u)
static const char *const *shown_values[DT2_MACHINE_KNOBS];
static formatter_fn *stock_formatter[DT2_MACHINE_KNOBS];

static void format(uint32_t knob, int32_t value, char *out)
{
    const char *const *names = shown_values[knob];
    const int32_t index = value >> 8;
    if (names && index >= 0) {
        int32_t n = 0;
        while (names[n] && n < index) {
            ++n;
        }
        if (n == index && names[n]) {
            COPY_TEXT(out, names[n]);
            return;
        }
    }
    if (stock_formatter[knob]) {
        stock_formatter[knob](value, out);
    }
}

static void format_b(int32_t value, char *out) { format(0, value, out); }
static void format_c(int32_t value, char *out) { format(1, value, out); }
static void format_e(int32_t value, char *out) { format(2, value, out); }
static void format_f(int32_t value, char *out) { format(3, value, out); }
static void format_g(int32_t value, char *out) { format(4, value, out); }
static formatter_fn *const FORMATTERS[DT2_MACHINE_KNOBS] = { format_b, format_c, format_e, format_f, format_g };

static void restore(void)
{
    for (uint32_t i = 0; i < saved_count; ++i) {
        uint32_t *row = &PARAMS[saved[i].code * ROW_WORDS];
        row[ROW_NAME] = saved[i].name;
        row[ROW_SHORT] = saved[i].shortname;
        row[ROW_FORMATTER] = saved[i].formatter;
    }
    saved_count = 0;
    shown = 0;
}

/* Called by the machine descriptor lookup (machines-entry.s) for every type it is asked for: a page asks for the
 * machine's descriptor before it draws or edits that machine's knobs, so the rows carry the names of the machine
 * asked for last. */
void core_machine_knob_names(uint32_t type)
{
    const struct dt2_machine *machine = dt2_machine_at(type, core_machines);
    if ((machine ? type : 0) == shown) {
        return;
    }
    restore();
    if (machine) {
        const uint32_t *descriptor = core_machine_descriptor(type);
        for (uint32_t knob = 0; knob < DT2_MACHINE_KNOBS; ++knob) {
            const struct dt2_machine_knob *k = &machine->knobs[knob];
            uint32_t code = descriptor[2 + KNOB_POSITION[knob]];
            if (!k->name || !code || code >= PARAM_ROWS) {
                continue;
            }
            uint32_t *row = &PARAMS[code * ROW_WORDS];
            saved[saved_count].code = code;
            saved[saved_count].name = row[ROW_NAME];
            saved[saved_count].shortname = row[ROW_SHORT];
            saved[saved_count].formatter = row[ROW_FORMATTER];
            ++saved_count;
            row[ROW_NAME] = (uint32_t)k->name;
            row[ROW_SHORT] = (uint32_t)(k->label ? k->label : k->name);
            if (k->values) {
                shown_values[knob] = k->values;
                stock_formatter[knob] = (formatter_fn *)row[ROW_FORMATTER];
                row[ROW_FORMATTER] = (uint32_t)FORMATTERS[knob];
            }
        }
        shown = type;
    }
}