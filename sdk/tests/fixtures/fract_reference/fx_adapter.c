#include "fxid.h"
#if !defined(__mcoldfire__)
/* sourcehook.s's tests, for host models of the detour: a call reaches
 * og_render when its track owns FRACT, or when its own frame record names
 * FRACT on FX2 and its voice plays. (The
 * assembly finds the record through the stock caller's a5; the stock only
 * passes pings 0 and 1, so the mask here changes nothing.) */
int og_fetch_wants(unsigned ping,unsigned track) {
    return track==og_owner || (U8(0x80000149u+(((ping&1u)*8u+track)<<6))==OG_FX_ID &&
                               U8(0x800049d8u+track*168u));
}
#endif
/* The UI tick's release, every tick: og_render's first test, on both pings.
 * og_fetch reaches og_render only on FRACT calls, so an owner whose voice
 * stopped, whose FX2 left FRACT or whose sample was unloaded (no more seam
 * calls) is let go here, at the latest one tick later. */
void og_release_check(void) {
    unsigned owner=og_owner;
    if (owner>=8) return;
    if (!U8(0x800049d8u+owner*168u) || (U16(0x80000148u+owner*64u)&255u)!=OG_FX_ID ||
        (U16(0x80000348u+owner*64u)&255u)!=OG_FX_ID) {
        og_stop(&og_state);og_owner=8;
    }
}
/* The SPCE word of a call record: FX2's fifth parameter, value << 8, which
 * SPACE reads at r6+4 (engine.asm). 0 glides SPACE to exact dry within 256
 * frames (TESTING.md, "A second FRACT": a gdb clear of this word, and of no
 * other, made a second FRACT's output equal FX2 NONE's in octemu). */
enum { OG_REC_SPCE=32 };
/* Called after the ordinary six-argument sample fetch. The native renderer
 * retains its trigger/stop lifecycle, then its bounded output is granulated. */
void og_render(int32_t *audio,unsigned ping,unsigned track,unsigned count,
               unsigned output_samples,unsigned flags) {
    /* Native fetch flags request source refills, including during sustained
     * playback. They are not note triggers and must not restart grain ramps. */
    (void)output_samples;(void)flags;
    if (track>=8 || count-1u>=64) return;
    OgGrain *state=&og_state;
    uintptr_t rec=0x80000110u+((ping&1u)*8u+track)*64u;
    OgSource src;
    uintptr_t voice=0x800049d8u+track*168u;
    if (og_owner<8 && (!U8(0x800049d8u+og_owner*168u) ||
        (U16(0x80000148u+((ping&1u)*8u+og_owner)*64u)&255u)!=OG_FX_ID)) {
        og_stop(state);og_owner=8;
    }
    /* A second FRACT: FRACT on this record's FX2 while another track owns
     * the granulator. One owner, three total readers, so this track plays
     * its dry samples, and SPACE is bypassed too, as with FX2 NONE: the
     * call clears the SPCE word of its own record. The stock rebuilds the
     * record every block, and this runs after that and before the transfer
     * (the declick clear's timing), so the bypass holds exactly while the
     * calls come; og_fetch clears it on a stopped voice's calls. */
    if (og_owner<8 && og_owner!=track && (U16(rec+56)&255u)==OG_FX_ID) {
        OG_PUT16(rec+OG_REC_SPCE,0);
        return;
    }
    /* TSTR uses a different native fetch/transfer layout. Leave that path
     * exactly stock; the independent sample readers require TSTR OFF. */
    if ((U16(rec+56)&255u)!=OG_FX_ID || U8(0x8000052cu+(ping&1u)*384u+track*48u) ||
        U8(voice+20)!=1 ||
        !og_describe(U8(voice+21),&src)) {
        if (og_owner==track) {og_reset(state,0);og_owner=8;}
        return;
    }
    /* A stopped voice retires readers while retaining the source identity. */
    if (!U8(voice)) {
        if (og_owner==track) {og_stop(state);og_owner=8;}
        return;
    }
    /* Includes scene values, step locks and LFO modulation already applied
     * by the native frame publisher. GUI knob values are never audio inputs. */
    /* Main POS/SIZE/REVS/SPRD and SHPE, one word a slot from rec+24, of
     * which only the high byte, the value, is read (the low byte is a
     * fraction); SETUP PAN, SCAN, SRNG and DENS, one byte a slot from
     * rec+48. REV (slot 2, renamed REVS) and SCAN (slot 7) traded places by
     * the user's decision of 2026-10-21 (SCAN 64 holds). SHPE (slot 5,
     * PTCH's word until 0.10.0: the 64 that 0.9.6 projects store there, its
     * unity, is Hann). DENS (slot 9) reads upwards (og_densities, sizes.h,
     * from manifest.py): 127, its default, is density 127, three heads a
     * third of a length apart; 0, which projects saved before DENS read
     * upwards hold, the sparsest. */
    unsigned dens=U8(rec+51);
    uint8_t params[OG_PARAMS]={og_densities[dens>127?127:dens],U8(rec+26),U8(rec+24),U8(rec+49),U8(rec+30),
                               U8(rec+48),U8(rec+34),U8(rec+28)};
    /* REVS reads as a direction (the user, 2026-10-21), and this is the one
     * place it is set: 127, its default, plays every grain forwards, 0
     * reverses every grain. The engine takes the reverse probability in
     * 127ths, 127 - REVS, and draws nothing at 0 (grain.c), so REVS 127 is
     * 0.9.6's sound. A high byte above 127, which the stock never
     * publishes, reads as 127, not as a wrapped probability. (Two
     * statements: as one expression GCC keeps REVS in a sixth saved
     * register, four more bytes of stack on the seam's deepest path.) */
    if (params[OG_REV]>127) params[OG_REV]=127;
    params[OG_REV]=(uint8_t)(127-params[OG_REV]);
    /* Nobody else owns FRACT here (a second FRACT returned above). */
    int acquired=og_owner==8;
    if (acquired) og_owner=track;
    /* A TRIG sets bit 8 of word 30, and the stock DSP then adds the previous
     * output to the restarted voice: over FRACT's grains, a click. The owner's
     * record drops only that bit (TESTING.md, "Retrigger click"). */
    OG_PUT16(rec+60,U16(rec+60)&~0x100u);
    uint32_t identity=src.identity^(src.slot<<24);
    /* The same slot must reset on an owner change: no scan, birth phase
     * or entry ramp may leak from the preceding track into a new owner. */
    if (acquired || state->identity!=identity) og_reset(state,identity);
    /* Every grain plays unity: track pitch reaches the output on the DSP. */
    state->pitch=0;
    state->spread_mode=(uint8_t)(U8(rec+50)==1);
    src.join_mode=src.frames>=2048;
    og_engine(state,&src,params,audio,count);
    /* Unsupported/stop cases release ownership above. */
}
