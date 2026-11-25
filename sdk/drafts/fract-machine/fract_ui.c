/* FRACT LCD: UNBOUND8's approved Variant D, adapted to the sample machine.
 * Three labelled values above and below a mono waveform, actual grain
 * readers and horizontal SIZE bars. Audio processing stays unchanged. */
#include "fract_ui.h"
#include "source.h"
#include "grain.h"
#include "cpu_profile.h"
#ifndef U8
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#endif
#ifndef U16
#define U16(a) (*(volatile uint16_t *)(uintptr_t)(a))
#endif
#ifndef U32
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#endif
#ifndef OG_PUT32
#define OG_PUT32(a,v) (U32(a) = (uint32_t)(v))
#endif
#include "selection.h"

const char *const fract_ui_main_labels[FRACT_UI_MAIN_COUNT] = {
#ifdef OG_MACHINE_GRAIN_ONLY
    "POS", "SIZE", "REVS", "SPRD", "SHPE", "PTCH"
#else
    "POS", "SIZE", "REVS", "SPRD", "SPCE", "SHPE"
#endif
};
const char *const fract_ui_setup_labels[FRACT_UI_SETUP_COUNT] = {
#ifdef OG_MACHINE_GRAIN_ONLY
    "PAN", "", "SRNG", "", "", ""
#else
    "PAN", "", "SRNG", "", "", ""
#endif
};
static const uint8_t fract_ui_defaults[FRACT_UI_SAVED_BYTES] =
#ifdef OG_MACHINE_GRAIN_ONLY
    {18, 86, 127, 0, 64, 64, 0, 64, 0, 127, 0, OG_GRAIN_LAYOUT_MARKER};
#else
    {18, 86, 127, 0, 0, 64, 0, 64, 0, 127, 0, 0};
#endif

unsigned fract_ui_default(unsigned index) {
    return index < FRACT_UI_SAVED_BYTES ? fract_ui_defaults[index] : 0;
}

void fract_ui_copy_saved_bytes(const uint8_t *part, unsigned track, uint8_t out[12]) {
    for (unsigned k = 0; k < FRACT_UI_SAVED_BYTES; ++k) {
        unsigned at = (k < 6 ? 0x2a : 0x1da) + 30u * track + 6u + k % 6u;
        out[k] = part[at];
    }
}

/* The native rail uses a 3x4 letter, with white selected-track backing.
 * Accept only the expected FLEX F (or our previous G) before replacing its
 * twelve pixels. A menu/overlay with different ink remains untouched. */
int fract_ui_machine_icon(uint32_t frame[256], unsigned track, unsigned selected) {
    if (!frame || track >= 4 || selected >= 8) return 0;
    unsigned x = track == selected ? 3u : 2u, y = 5u + 15u * track;
    unsigned word = y < 32u ? 1u : 0u, shift = y & 31u;
    const unsigned f[3] = {15, 5, 1}, g[3] = {15, 9, 13};
    unsigned inverted = track == selected ? 15u : 0u;
    int match_f = 1, match_g = 1;
    for (unsigned col = 0; col < 3; ++col) {
        unsigned ink = ((frame[2u * (x + col) + word] >> shift) & 15u) ^ inverted;
        if (ink != f[col]) match_f = 0;
        if (ink != g[col]) match_g = 0;
    }
    if (!match_f && !match_g) return 0;
    uint32_t mask = 15u << shift;
    for (unsigned col = 0; col < 3; ++col) {
        uint32_t *at = frame + 2u * (x + col) + word;
        *at = (*at & ~mask) | ((g[col] ^ inverted) << shift);
    }
    return 1;
}

/* Authored 3x5 lettering on the native pool's title strip. */
static unsigned fract_ui_heading_glyph(unsigned c) {
    switch (c) {
    case 'A': return 0x78be; case 'C': return 0x463f;
    case 'E': return 0x46bf; case 'F': return 0x04bf;
    case 'H': return 0x7c9f; case 'I': return 0x47f1;
    case 'M': return 0x7cdf; case 'N': return 0x7c5f;
    case 'R': return 0x7cbf; case 'T': return 0x07e1;
    case ':': return 10u << 5; default: return 0;
    }
}
void fract_ui_pool_heading(uint32_t frame[256]) {
    if (!frame) return;
    /* Leave the native border and track rail intact. */
    for (unsigned x = 8; x < 120; ++x) frame[2u*x+1u] |= 0x7eu;
    const char title[] = "MACHINE:FRACT";
    for (unsigned i = 0; title[i]; ++i) {
        unsigned glyph = fract_ui_heading_glyph((unsigned char)title[i]);
        for (unsigned col = 0; col < 3; ++col, glyph >>= 5)
            frame[2u*(38u+4u*i+col)+1u] &= ~((glyph & 31u) << 1);
    }
}
#ifndef FRACT_UI_POOL_TITLE_CONTEXT
#define FRACT_UI_POOL_TITLE_CONTEXT() 0
#endif


/* Authored caption font retained from FRACT; R has a notch. N uses four
 * columns with a diagonal, as specified by UNBOUND8 Variant D. */
static const uint16_t fract_ui_font[64] = {
    0x0000u,0x1ea1u,0x1ea1u,0x7d5fu,0x1ea1u,0x1ea1u,0x6aaau,0x1ea1u,
    0x45c0u,0x01d1u,0x1ea1u,0x11c4u,0x1ea1u,0x1084u,0x0200u,0x1ea1u,
    0x3a2eu,0x43f2u,0x5ebdu,0x7eb1u,0x7c87u,0x26b7u,0x76bfu,0x1f21u,
    0x7ebfu,0x7eb7u,0x1ea1u,0x1ea1u,0x1ea1u,0x1ea1u,0x1ea1u,0x1ea1u,
    0x1ea1u,0x78beu,0x2abfu,0x463fu,0x3a3fu,0x46bfu,0x04bfu,0x763fu,
    0x7c9fu,0x47f1u,0x7e18u,0x6c9fu,0x421fu,0x7cdfu,0x7c5fu,0x7e3fu,
    0x1cbfu,0x7d2fu,0x68bfu,0x76b7u,0x07e1u,0x7e1fu,0x3e0fu,0x7d9fu,
    0x6c9bu,0x0f83u,0x4eb9u,0x1ea1u,0x1ea1u,0x1ea1u,0x1ea1u,0x4210u
};

static unsigned ui_width(unsigned c) { return c == 'N' ? 4u : 3u; }
static uint32_t ui_glyph(unsigned c) {
    if (c >= 'a' && c <= 'z') c -= 'a'-'A';
    if (c == 'N') return 31u | (2u<<5) | (4u<<10) | (31u<<15);
    if (c == ':') return 10u << 5;
    return fract_ui_font[c >= 32u && c < 96u ? c-32u : '?' - 32u];
}
static unsigned ui_text_width(const char *s) {
    unsigned n=0;
    for (;*s;++s) n += ui_width((unsigned char)*s)+1u;
    return n ? n-1u : 0;
}
/* Native columns: word1 is rows0..31, word0 is rows32..63. All authored
 * content is clipped to the main rectangle; rail, right strip and footer
 * are stock's. ink:0 black,1 white,2 XOR. */
static void ui_pixel(uint32_t frame[256], unsigned x, unsigned y, unsigned ink) {
    if (x < 8u || x >= 120u || y < 1u || y >= 56u) return;
    uint32_t *word=frame+2u*x+(y<32u),bit=1u<<(y&31u);
    if (ink==2) *word ^= bit;
    else if (ink) *word |= bit;
    else *word &= ~bit;
}
static void ui_text(uint32_t frame[256], unsigned x, unsigned y,
                    const char *s, unsigned ink) {
    for (;*s;++s) {
        unsigned c=(unsigned char)*s,w=ui_width(c);uint32_t glyph=ui_glyph(c);
        for (unsigned col=0;col<w;++col,glyph>>=5)
            for (unsigned row=0;row<5;++row)
                if (glyph&(1u<<row)) ui_pixel(frame,x+col,y+row,ink);
        x+=w+1u;
    }
}
static char *ui_unsigned(char *s,unsigned n) {
    if (n>=100) *s++=(char)('0'+n/100);
    if (n>=10) *s++=(char)('0'+n/10%10);
    *s++=(char)('0'+n%10);return s;
}
void fract_ui_control_text(char out[12], unsigned control, unsigned value) {
    if (control>=6) {out[0]=0;return;}
    char *s=out;const char *label=fract_ui_main_labels[control];
    while (*label) *s++=*label++;
    *s++=':';
#ifdef OG_MACHINE_GRAIN_ONLY
    if (control==5) {
        if (value<4) value=4;
        if (value>124) value=124;
        int pitch=((int)value-64)*2;
        if (pitch<0) {*s++='-';pitch=-pitch;}
        else if (pitch) *s++='+';
        s=ui_unsigned(s,(unsigned)pitch/10u);*s++='.';
        *s++=(char)('0'+pitch%10);
    } else
#endif
        s=ui_unsigned(s,value>127?127:value);
    *s=0;
}
static unsigned ui_frame_x(uint32_t frame,uint32_t frames) {
    if (frames<2) return 10;
    if (frame>=frames) frame=frames-1;
    /* Use the same bounded bin width as the overview sampler. */
    uint32_t width=(frames+107u)/108u;
    unsigned x=(unsigned)(frame/width);
    return 10u+(x>107u?107u:x);
}
void fract_ui_overview_draw(uint32_t frame[256], const FractUiOverview *v) {
    if (!frame || !v) return;
    /* Same clipped rectangle as the scalar pixel loop: retain row0 and
     * rows56..63, set rows1..6 white, clear rows7..55. Two word updates per
     * column replace55 read/modify/writes without changing any pixel. */
    for (unsigned x=8;x<120;++x) {
        frame[2u*x] &= 0xff000000u;
        frame[2u*x+1u] = (frame[2u*x+1u]&1u) | 0x7eu;
    }
    ui_text(frame,10,1,v->caption,0);
    for (unsigned k=0;k<6;++k) {
        char text[12];fract_ui_control_text(text,k,v->values[k]);
        unsigned width=ui_text_width(text),col=k%3u,y=k<3?9u:48u;
        unsigned x=col==0?9u:col==1?64u-width/2u:119u-width;
        ui_text(frame,x,y,text,1);
        if (v->active&(1u<<k))
            for (unsigned xx=x-1;xx<=x+width;++xx)
                for (unsigned yy=y-1;yy<=y+5;++yy) ui_pixel(frame,xx,yy,2);
    }
    if (!v->frames) {ui_text(frame,44,28,"LOAD SAMPLE",1);return;}
    unsigned peak=1;
    for (unsigned i=0;i<FRACT_UI_BINS;++i) if (v->peaks[i]>peak) peak=v->peaks[i];
    for (unsigned i=0;i<FRACT_UI_BINS;++i) {
        unsigned h=v->peaks[i]*10u/peak;
        unsigned x=10u+i;
        if (h) { /* h is1..10: exact rows30-h..30+h, crossing row32. */
            frame[2u*x+1u] |= ~0u<<(30u-h);
            if (h>1u) frame[2u*x] |= (1u<<(h-1u))-1u;
        } else if (!(i&1)) frame[2u*x+1u] |= 1u<<30;
    }
    unsigned centre=ui_frame_x(v->position,v->frames)-10u;
    uint32_t width=(v->frames+107u)/108u;
    unsigned radius=v->length?(v->length-1u)/2u/width:0;
    if (!radius) radius=1; /* A visible, symmetric three-pixel minimum. */
    /* Same circular span as the audio, rounded symmetrically to LCD bins.
     * A window covering the source fills both bars. Two clear rows
     * separate the21-pixel wave from each SIZE bar. */
    for (unsigned i=0;i<108u;++i) {
        unsigned distance=i>centre?i-centre:centre-i;
        if (v->length>=v->frames || distance<=radius || 108u-distance<=radius) {
            ui_pixel(frame,10u+i,17,1);ui_pixel(frame,10u+i,43,1);
        }
    }
    if (v->sounding) for (unsigned g=0;g<3;++g) if (v->readers[g]<v->frames) {
        unsigned x=ui_frame_x(v->readers[g],v->frames);
        unsigned sum=v->left[g]+v->right[g];
        unsigned y=24u+(sum?v->right[g]*12u/sum:6u);
        for (unsigned xx=x-1;xx<=x+1;++xx)
            for (unsigned yy=y-1;yy<=y+1;++yy)
                if (!v->reverse[g] || xx==x-1 || xx==x+1 || yy==y-1 || yy==y+1)
                    ui_pixel(frame,xx,yy,2);
    }
}
static FractUiOverview fract_ui_overview = {
#ifdef OG_MACHINE_GRAIN_ONLY
    .values={18,86,127,0,64,64},
#else
    .values={18,86,127,0,0,64},
#endif
    .caption="SAMPLE"
};
static unsigned fract_ui_cached_track=8,fract_ui_probed;
static uint32_t fract_ui_identity,fract_ui_scanned;
static int ui_part(unsigned track,uintptr_t *part) {
    uint32_t bank=U32(0x46c82456u);
    if (track>=8 || bank<0x40000000u || bank>=0x47f00000u) return 0;
    *part=bank+0x8ed80u+(U8(0x100b14cfu)&3u)*6322u;return 1;
}
/* A cursor lives for one UI update only; source changes cannot retain it. */
static unsigned ui_peak(OgStream *stream,uint32_t frame) {
    const OgSource *source=stream->source;
    if (!stream->remaining || frame-stream->frame>=stream->remaining) {
        stream->cursor=og_locate(source,frame,&stream->remaining);stream->frame=frame;
    }
    uintptr_t p=stream->cursor;
    if (p) p+=(frame-stream->frame)*source->bytes*source->channels;
    if (!p) return 0;
    int left,right;
    if (source->bytes==2) {
        if (source->channels==2) {uint32_t pair=U32(p);left=(int16_t)(pair>>16);right=(int16_t)pair;}
        else left=right=(int16_t)U16(p);
    } else {
        left=(int16_t)((U8(p)<<8)|U8(p+1));
        right=source->channels==2?(int16_t)((U8(p+3)<<8)|U8(p+4)):left;
    }
    if (left<0) left=-left;
    if (right<0) right=-right;
    return (unsigned)(left>right?left:right);
}
static void ui_update(unsigned track) {
    FractUiOverview *v=&fract_ui_overview;uintptr_t part;
    if (!ui_part(track,&part)) {v->frames=0;return;}
    for (unsigned k=0;k<6;++k) {
        v->values[k]=U8(part+0x30u+30u*track+k);
        if (U32(0x46c7d248u+20u*k)) v->active|=(uint8_t)(1u<<k);
        else v->active&=(uint8_t)~(1u<<k);
    }
    OgSource source;
    if (!og_describe(U8(part+0x2cbu+5u*track),&source)) {v->frames=0;return;}
    uint32_t identity=source.identity^(source.slot<<24);
    if (identity!=fract_ui_identity || track!=fract_ui_cached_track || source.frames!=v->frames) {
        fract_ui_identity=identity;fract_ui_cached_track=track;v->frames=source.frames;
        fract_ui_probed=0;fract_ui_scanned=0;
        for (unsigned i=0;i<FRACT_UI_BINS;++i) v->peaks[i]=0;
        unsigned i=0;
        for (;i<10;++i) {unsigned c=U8(0x46c922c4u+44u*source.slot+24u+i);if (!c) break;
            v->caption[i]=(char)(c>='a'&&c<='z'?c-32u:c);}
        v->caption[i]=0;
        if (!i) {
            const char name[]="SAMPLE";
            for (unsigned k=0;k<sizeof name;++k) v->caption[k]=name[k];
        }
    }
    OgStream stream={.source=&source,.remaining=0};
    unsigned width=(source.frames+107u)/108u;
    if (fract_ui_probed<FRACT_UI_BINS) {
        unsigned end=fract_ui_probed+18u;if (end>FRACT_UI_BINS) end=FRACT_UI_BINS;
        for (unsigned x=fract_ui_probed;x<end;++x) {
            uint32_t base=width*x,span=base<source.frames?source.frames-base:0;
            if (span>width) span=width;
            for (unsigned j=0;j<8&&span;++j) {
                unsigned value=ui_peak(&stream,base+j*span/8u);
                if (value>v->peaks[x]) v->peaks[x]=(uint16_t)value;
            }
        }
        fract_ui_probed=end;
    } else if (fract_ui_scanned<source.frames) {
        uint32_t end=fract_ui_scanned+256u;if (end>source.frames) end=source.frames;
        for (uint32_t at=fract_ui_scanned;at<end;++at) {
            unsigned x=at/width,value=ui_peak(&stream,at);
            if (value>v->peaks[x]) v->peaks[x]=(uint16_t)value;
        }
        fract_ui_scanned=end;
    }
    unsigned pos=v->values[0]>127?127:v->values[0];
    unsigned size=v->values[1]>127?127:v->values[1];
    v->sounding=og_owner==track && U8(0x800049d8u+168u*track) && og_state.identity==identity;
    if (v->sounding) {pos=og_state.params[2];size=og_state.params[1];}
    v->position=(v->frames-1u)/127u*pos+((v->frames-1u)%127u)*pos/127u;
    v->length=og_size(size);
    for (unsigned g=0;g<3;++g) {
        const OgHead *head=og_state.head+g;
        v->readers[g]=v->frames;
        if (v->sounding && head->length && head->length<=88200u && head->cursor<v->frames) {
            v->readers[g]=head->cursor;v->left[g]=head->left;v->right[g]=head->right;v->reverse[g]=head->reverse;
        }
    }
}

static unsigned fract_ui_visible(void) {
    if (U8(0x80000015u) || U8(0x46c7d8d8u) || U32(0x460d1e70u) ||
        U32(0x460d173au) || U32(0x460d1694u)) return 0;
    uint32_t layer = U32(0x460d165cu);
    if (!layer || U32(layer)) return 0;
    unsigned track = U8(0x100b14ccu);
    return track < 8u ? track + 1u : 0;
}
static unsigned fract_ui_redraw_wait;
void fract_ui_tick(void) {
    unsigned selected = fract_ui_visible();
    if (!selected || !OG_MACHINE_OWNS(selected - 1u)) {
        fract_ui_redraw_wait = 0; return;
    }
    ui_update(selected - 1u);
    if (!fract_ui_redraw_wait) {
        OG_PUT32(0x46c7c72cu, 1); fract_ui_redraw_wait = 7;
    } else --fract_ui_redraw_wait;
}
void fract_ui_draw(unsigned char *frame) {
    if (FRACT_UI_POOL_TITLE_CONTEXT()) {
        fract_ui_pool_heading((uint32_t *)(void *)frame);
    }
    unsigned overview = fract_ui_visible();
    if (!FRACT_UI_POOL_TITLE_CONTEXT() && overview && OG_MACHINE_OWNS(overview - 1u))
        fract_ui_overview_draw((uint32_t *)(void *)frame, &fract_ui_overview);
    /* SETUP and sample menus retain the native rail too. Its exact glyph
     * preimage guards the overlay; full-screen messages and MIDI stay stock. */
    if (U8(0x80000015u) || U32(0x460d1e70u)) return;
    unsigned selected = U8(0x100b14ccu) + 1u;
    if (selected > 8u) return;
    for (unsigned track = 0; track < 4; ++track)
        if (OG_MACHINE_OWNS(track))
            (void)fract_ui_machine_icon((uint32_t *)(void *)frame, track, selected - 1u);
}
void module_tick(struct modwerk_runtime_api *api) {
#ifdef OG_MACHINE_CPU_PROFILE
    uint32_t at=og_cpu_clock();fract_ui_tick();og_cpu_ui_end(at);og_cpu_publish(api);
#else
    (void)api; fract_ui_tick();
#endif
}
void module_draw(unsigned char *frame) {
#ifdef OG_MACHINE_CPU_PROFILE
    uint32_t at=og_cpu_clock();fract_ui_draw(frame);og_cpu_draw_end(at);
#else
    fract_ui_draw(frame);
#endif
}
