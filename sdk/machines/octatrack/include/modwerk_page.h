/* SPDX-License-Identifier: MIT */
/* The controls of a machine's SRC or SRC SETUP page, drawn as stock draws them (OS 1.40C).
 *
 * A page descriptor holds twelve slots (SRC A-F are 0-5, SRC SETUP A-F are 6-11). How a slot looks follows
 * from how many values it has, as on stock's own pages: two values are a switch (AMP SETUP's SYNC), three or
 * four a switch with that many positions (SRC SETUP's LOOP and TSTR), five the five-position one, and
 * anything longer a knob. modwerk_page_control() fills one slot and picks that widget, so a short list never
 * ends up as a knob. Addresses only: the descriptor itself is copied from the unit's own OS at run time.
 *
 * Seen on an MKII: two values (Analog BD's TYPE and FIXD), three (11 November 2026, a dev twin of d8fae687),
 * four (stock's LOOP and TSTR) and five (Repitch's TSTR). */
#ifndef MODWERK_PAGE_H
#define MODWERK_PAGE_H
#include <stdint.h>

#define MODWERK_PAGE_BYTES 0x1cau          /* one descriptor, as stock's FLEX page */
#define MODWERK_PAGE_SWITCH 0x40046f10u    /* two values */
#define MODWERK_PAGE_SELECT 0x40046c28u    /* three or four values */
#define MODWERK_PAGE_SELECT5 0x40046ab4u   /* five values */
#define MODWERK_PAGE_KNOB 0u               /* stock's ordinary knob */
#define MODWERK_PAGE_OFF_ON 0x4003c14cu    /* stock's formatter for the words OFF and ON */

/* The widget stock uses for a control with `count` values. The three are reached as steps from the lowest one,
 * never as a list of the addresses: a compiler turns a chain of comparisons into such a list, and switch, select,
 * select, select5 in a row is a stretch of stock's own page descriptors, which no package may repeat (#1471). */
static inline uint32_t modwerk_page_widget(unsigned count)
{
    static const uint16_t step[4] = {
        (uint16_t)(MODWERK_PAGE_SWITCH - MODWERK_PAGE_SELECT5), (uint16_t)(MODWERK_PAGE_SELECT - MODWERK_PAGE_SELECT5),
        (uint16_t)(MODWERK_PAGE_SELECT - MODWERK_PAGE_SELECT5), 0u,
    };
    return count - 2u < 4u ? MODWERK_PAGE_SELECT5 + step[count - 2u] : MODWERK_PAGE_KNOB;
}

static inline void modwerk_page_put32(uint8_t *desc, unsigned at, uint32_t v)
{
    for (unsigned i = 0; i < 4u; ++i) desc[at + i] = (uint8_t)(v >> (24u - 8u * i));
}

/* Fill slot `slot` (0-11) of the descriptor at `desc`: its name (up to five letters), the value a new track
 * starts with, how many values it has (0 to count - 1) and the function that writes a value's text
 * (0: stock's numbers, or OFF and ON for two values). The stored byte is the value. */
static inline void modwerk_page_control(uint8_t *desc, unsigned slot, const char *name, unsigned start, unsigned count,
    void (*text)(char *, int))
{
    unsigned i = 0;
    if (slot >= 12u) return;
    for (; i < 5u && name[i]; ++i) desc[0x4eu + 6u * slot + i] = (uint8_t)name[i];
    for (; i < 6u; ++i) desc[0x4eu + 6u * slot + i] = 0;
    desc[0x96u + slot] = (uint8_t)start;
    modwerk_page_put32(desc, 0xa2u + 4u * slot, 0);
    modwerk_page_put32(desc, 0xd2u + 4u * slot, count);
    modwerk_page_put32(desc, 0x102u + 4u * slot, text ? (uint32_t)(uintptr_t)text : count == 2u ? MODWERK_PAGE_OFF_ON : 0u);
    modwerk_page_put32(desc, 0x132u + 4u * slot, modwerk_page_widget(count));
    modwerk_page_put32(desc, 0x162u + 4u * slot, 0); /* stock's bounded editor */
}
#endif
