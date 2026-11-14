/* SPDX-License-Identifier: MIT
 * Native pattern storage: PTCH's lock byte stores the note root; unused
 * audio lock slot 30 stores a compact chord. Slot 31 remains SAMPLE.
 * The playback copier consumes these two bytes before normal PTCH locks.
 * No card sidecar, heap allocation, or separate sequencer clock.
 */
#include <stdint.h>
#ifndef POLY_RECORD_HOST_TEST
#define REC_READ(a) (*(volatile uint32_t *)(uintptr_t)(a))
static int rec_place(unsigned t,uint32_t ctx,unsigned less) {
    return ((int (*)(unsigned,uint32_t))(less?0x4004271cu:0x40042d1cu))(t,ctx);
}
static void rec_lock(unsigned t,unsigned slot,unsigned v,int step,uint32_t ctx) {
    ((void (*)(unsigned,unsigned,unsigned,int,uint32_t))0x40042158u)(t,slot,v,step,ctx);
}
#else
extern uint32_t rec_test_read(uintptr_t address);
extern int rec_place(unsigned,uint32_t,unsigned);
extern void rec_lock(unsigned,unsigned,unsigned,int,uint32_t);
#define REC_READ(a) rec_test_read(a)
#endif
#define CHORD_SHAPES 232u
static const uint16_t chord_masks[CHORD_SHAPES]={
0x1,0x3,0x5,0x9,0x11,0x21,0x41,0x81,0x101,0x201,0x401,0x801,0x7,0xb,0x13,0x23,0x43,0x83,0x103,0x203,0x403,0x803,0xd,0x15,0x25,0x45,0x85,0x105,0x205,0x405,0x805,0x19,0x29,0x49,0x89,0x109,0x209,0x409,0x809,0x31,0x51,0x91,0x111,0x211,0x411,0x811,0x61,0xa1,0x121,0x221,0x421,0x821,0xc1,0x141,0x241,0x441,0x841,0x181,0x281,0x481,0x881,0x301,0x501,0x901,0x601,0xa01,0xc01,0xf,0x17,0x27,0x47,0x87,0x107,0x207,0x407,0x807,0x1b,0x2b,0x4b,0x8b,0x10b,0x20b,0x40b,0x80b,0x33,0x53,0x93,0x113,0x213,0x413,0x813,0x63,0xa3,0x123,0x223,0x423,0x823,0xc3,0x143,0x243,0x443,0x843,0x183,0x283,0x483,0x883,0x303,0x503,0x903,0x603,0xa03,0xc03,0x1d,0x2d,0x4d,0x8d,0x10d,0x20d,0x40d,0x80d,0x35,0x55,0x95,0x115,0x215,0x415,0x815,0x65,0xa5,0x125,0x225,0x425,0x825,0xc5,0x145,0x245,0x445,0x845,0x185,0x285,0x485,0x885,0x305,0x505,0x905,0x605,0xa05,0xc05,0x39,0x59,0x99,0x119,0x219,0x419,0x819,0x69,0xa9,0x129,0x229,0x429,0x829,0xc9,0x149,0x249,0x449,0x849,0x189,0x289,0x489,0x889,0x309,0x509,0x909,0x609,0xa09,0xc09,0x71,0xb1,0x131,0x231,0x431,0x831,0xd1,0x151,0x251,0x451,0x851,0x191,0x291,0x491,0x891,0x311,0x511,0x911,0x611,0xa11,0xc11,0xe1,0x161,0x261,0x461,0x861,0x1a1,0x2a1,0x4a1,0x8a1,0x321,0x521,0x921,0x621,0xa21,0xc21,0x1c1,0x2c1,0x4c1,0x8c1,0x341,0x541,0x941,0x641,0xa41,0xc41,0x381,0x581,0x981,0x681,0xa81,0xc81,0x701,0xb01,0xd01,0xe01
};
static uint8_t sequence_notes[8][4]={{0}}, sequence_count[8]={0}, sequence_index[8]={0};
extern volatile uint8_t poly_held[8][64],poly_pending_key[8];
static unsigned chord_encode(uint16_t mask) {
    for(unsigned i=0;i<CHORD_SHAPES;++i) if(chord_masks[i]==mask) return i;
    return 255;
}
/* Stock chooses the step, bank, pattern and microtiming from its recorder
 * context. Capture the held panel chord on each press, matching the native
 * grid. Key-up releases live voices; recorded duration follows AMP HOLD.
 * Wider/larger chords do not overwrite a previously captured valid chord.
 */
void pm_record_key(unsigned track,unsigned key) {
    #ifndef POLY_RECORD_HOST_TEST
    extern volatile uint32_t poly_diag_key_calls,poly_diag_record_calls,poly_diag_record_last;
    ++poly_diag_key_calls;
    #endif
    if(track>=8 || key>124 || !REC_READ(0x460d172au)) return;
    unsigned root=125, count=0; uint16_t mask=0;
    for(unsigned i=0;i<64;++i) {
        unsigned k=poly_held[track][i];
        if(k<=124) { if(k<root) root=k; ++count; }
    }
    if(!count || count>4) return;
    for(unsigned i=0;i<64;++i) {
        unsigned k=poly_held[track][i];
        if(k<=124) { if(k-root>11) return; mask|=(uint16_t)(1u<<(k-root)); }
    }
    unsigned shape=chord_encode(mask);
    if(shape==255) return;
    uint32_t ctx=REC_READ(0x46c7e956u);
    int step=rec_place(track,ctx,!!REC_READ(0x46c7dd26u));
    if(step<0 || step>=64) return;
    rec_lock(track,0,root,step,ctx); rec_lock(track,30,shape,step,ctx);
    #ifndef POLY_RECORD_HOST_TEST
    ++poly_diag_record_calls;
    poly_diag_record_last=(track<<24)|((unsigned)step<<16)|(root<<8)|shape;
    #endif
}
/* Values and their masks have just been copied to the stock per-track
 * playback buffers. Remove only the encoded root from normal PTCH locking;
 * all other parameters, including SAMPLE, retain the stock path.
 */
void pm_sequence_stage(unsigned track,volatile uint8_t *values,volatile uint8_t *masks,unsigned command) {
    if(track>=8 || !pm_is_poly_track(track)) return;
    sequence_count[track]=sequence_index[track]=0;
    unsigned root=values[0], shape=values[30];
    if(root>124 || shape>=CHORD_SHAPES) return;
    values[0]=255; values[30]=255; masks[0]=0; masks[30]=0;
    if(!(command&1u)) return; /* trigless locks must not start voices */
    uint16_t mask=chord_masks[shape]; unsigned n=0;
    for(unsigned i=0;i<12;++i) if(mask&(1u<<i)) {
        if(root+i>124) return;
        sequence_notes[track][n++]=(uint8_t)(root+i);
    }
    sequence_count[track]=(uint8_t)n;
}
int pm_sequence_next(unsigned track) {
    if(track>=8) return -1;
    if(poly_pending_key[track]!=255) { sequence_count[track]=0; return -1; }
    unsigned i=sequence_index[track];
    if(i>=sequence_count[track]) return -1;
    sequence_index[track]=(uint8_t)(i+1);
    return sequence_notes[track][i];
}
