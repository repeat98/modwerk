/* SPDX-License-Identifier: MIT
 * SOURCE PROTOTYPE ONLY: physical base and USB lifetime unqualified.
 * The private package builder targets the emulator, not a device installer. */
#include <stddef.h>
#include "modwerk_events.h"
#include "modwerk_page.h"
#include "bridge.h"
#ifndef SW_USB_HOST_TEST
_Static_assert(sizeof(struct modwerk_machine) == 80, "machine ABI");
_Static_assert(sizeof(struct modwerk_machine_start) == 16, "START ABI");
#endif
static SWUSBVoice voices[8];
static uint8_t page[MODWERK_PAGE_BYTES];
static unsigned page_ready;
const uint8_t sw_usb_defaults[12] = {64,85,127,6,127,80,0,0,0,0,0,0};
static const char *const names[6] = {"TUNE","DETN","MIX","OSC","WIDE","LEVL"};
static void osc_text(char *out, int v)
{
    out[0] = (char)('1' + (v < 0 ? 0 : v > 6 ? 6 : v)); out[1] = 0;
}
static void copy_text(uint8_t *out, const char *s, unsigned n)
{
    unsigned i=0;
    for (; i+1u<n && s[i]; ++i) out[i]=(uint8_t)s[i];
    for (; i<n; ++i) out[i]=0;
}
/* Copy the descriptor from the user's own OS at runtime, never ship it. */
void sw_usb_build_page(const volatile uint8_t *stock)
{
    for (unsigned i=0; i<MODWERK_PAGE_BYTES; ++i) page[i]=stock[i];
    copy_text(page+0x3c,"SSAW",5); copy_text(page+0x41,"SRC",13);
    for (unsigned i=0; i<12; ++i)
        modwerk_page_control(page,i,i<6?names[i]:"",sw_usb_defaults[i],
                              i<6?(i==3?7:128):0,i==3?osc_text:0);
    modwerk_page_put32(page,0x1c6,0x00111111u);
    modwerk_page_put32(page,0x1c2,0);
    page_ready=1;
}
uint32_t sw_usb_track_page(const volatile uint8_t *slot)
{
    (void)slot;
    if (!page_ready) sw_usb_build_page((const volatile uint8_t *)(uintptr_t)0x400d3176u);
    return (uint32_t)(uintptr_t)(page+0x38);
}
static unsigned owns(const volatile uint8_t *part, unsigned track)
{
    const volatile uint8_t *s=part+60u+30u*track;
    return part[0x22u+track]==1 && s[0]=='S' && s[1]=='W' && s[2]==1;
}
unsigned sw_usb_claim(unsigned track)
{
    uint32_t bank=*(volatile uint32_t *)(uintptr_t)0x46c82456u;
    /* Same readable bank range as the pinned base registry's valid_bank().
     * Its arena can place bank A at 0x400e21e0, below the old test fixture. */
    if (track>=8 || bank<0x40000000u || bank>=0x47f00000u) return 0;
    unsigned pi=*(volatile uint8_t *)(uintptr_t)0x100b14cfu & 3u;
    const volatile uint8_t *part=(const volatile uint8_t *)(uintptr_t)(bank+0x8ed80u+pi*6322u);
    return owns(part,track);
}
unsigned sw_usb_admit(const volatile uint8_t *part, unsigned track)
{
    if (!part || track>=8) return 0;
    for (unsigned t=0; t<8; ++t) if (t!=track && owns(part,t)) return 0;
    return 1;
}
void sw_usb_leave_track(unsigned track)
{
    if (track<8) sw_usb_leave(&voices[track]);
}
int sw_usb_start(unsigned track, unsigned sample, unsigned flags)
{
    (void)sample; (void)flags;
    if (track>=8) return -1;
    sw_usb_note_start(&voices[track]); return 0;
}
/* Task-side entry: queue only, consumed by the frame renderer. */
void sw_usb_release_track(unsigned track)
{
    if (track<8) sw_usb_note_release(&voices[track]);
}
/* Notification only: preserve stock's reset and all other subscribers. */
void sw_usb_voice_reset(unsigned track)
{
    if (track >= 8) {
        for (unsigned t=0; t<8; ++t) sw_usb_voice_reset(t);
    } else if (sw_usb_claim(track)) sw_usb_note_kill(&voices[track]);
}
/* Core runtime key notification. Never take a key away from stock or another
 * module. Native held rows (base boot.c/modset.c) also cover FUNC held before
 * this module was installed; FUNC+STOP is Paste, not a transport stop. */
int sw_usb_key(int code, int pressed)
{
    if (code==0x27 && pressed &&
        !(*(volatile const uint8_t *)(uintptr_t)0x46100b1du & 0x20u))
        sw_usb_voice_reset(8);
    return 0;
}
/* ev_tail_kill is already in the frame interrupt. Leave other sources and
 * the effects record untouched; stock remains responsible for their tails. */
void sw_usb_tail_kill(uint8_t *record, unsigned track)
{
    (void)record;
    if (track<8 && sw_usb_claim(track) && voices[track].ready)
        ssm_kill(&voices[track].engine);
}
#define U32(at) (*(volatile uint32_t *)(uintptr_t)(at))
#define U16(at) (*(volatile uint16_t *)(uintptr_t)(at))
int sw_usb_render(unsigned track, unsigned ping, unsigned start, unsigned end)
{
    if (track>=8 || ping>1 || start>end || end>16) return -1;
    SWUSBFrame f;
    const volatile uint8_t *fp=(const volatile uint8_t *)(uintptr_t)U32(0x800062a8u);
    for (unsigned i=0; i<12; ++i) f.params[i]=fp[i];
    uintptr_t amp=0x80000110u+ping*0x200u+track*64u;
    f.attack=U16(amp)>>8; f.hold=U16(amp+2)>>8; f.release=U16(amp+4)>>8;
    if (f.attack>127) f.attack=127;
    if (f.hold>127) f.hold=127;
    if (f.release>127) f.release=127;
    f.step=U16(0x800065b2u); f.transport=U32(0x800065b8u);
    uint32_t *p=(uint32_t *)(uintptr_t)U32(0x80001c80u);
    int words=sw_usb_packet(&voices[track],&f,start,end,p,36);
    if (words<0) return words;
    if (voices[track].ready && end==16) {
        U16(amp)=0; U16(amp+2)=0x7f00; U16(amp+4)=0x7f00;
    }
    U32(0x80001c80u)=(uint32_t)(uintptr_t)(p+words);
    return 0;
}
const struct modwerk_machine sw_usb_machine = {
    .abi=MODWERK_MACHINE_ABI, .sig={'S','W'}, .sig_lo=1, .sig_hi=1,
    .label="SUPERSAW",
    .flags=MODWERK_MACHINE_PROTECT|MODWERK_MACHINE_LIST|MODWERK_MACHINE_START,
    .defaults=sw_usb_defaults, .admit_track=sw_usb_admit,
    .track_page=sw_usb_track_page, .leave=sw_usb_leave_track,
    .render=sw_usb_render,
    /* CPU price 0 selects the base's fallback; it does NOT mean zero CPU. */
};
const struct modwerk_machine_start sw_usb_machine_start = {
    MODWERK_MACHINE_START_ABI, sizeof(struct modwerk_machine_start),
    &sw_usb_machine, sw_usb_start
};
