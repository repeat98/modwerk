/* FRACT: a static Flex sample overview on the native LCD.
 * The runtime package subscribes og_ui to module_tick and og_draw to
 * module_draw; the card build installs neither and shows the stock page.
 * LCD ABI: native column bitmap, y grows upward, bit 31 is the bottom row.
 * og_ui finds the peaks in bounded work per tick, initial probes and then
 * an exact pass straight over the arena pages, and composes the overview's
 * columns when the heights change; og_draw copies them. This UI performs
 * no audio processing.
 */
#include <stdint.h>
#include "source.h"
#ifndef U8
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U16(a) (*(volatile uint16_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#endif
#include "fxid.h"
#include "selection.c"
static uint8_t values[6] = {18,86,64,0,0,0};
/* Exact peaks stay in the UI; two normalized heights share each byte
 * in the kernel cave. Only UI analysis writes either cache. */
uint16_t og_peaks[108]={0};
extern uint8_t og_peak_heights[54];
#define peaks og_peaks
/* Only peak analysis changes these heights. Encoder-driven stock redraws
 * reuse them instead of normalizing the same waveform again. */
#define peak_heights og_peak_heights
/* The second word of the overview's columns x = 0..111: the waveform and
 * the caption, composed with the heights (compose) from the peaks.
 * The tick that takes a new source composes before it returns, so og_draw
 * never copies the columns of a source og_ui_frames no longer names. */
uint32_t og_columns[112]={0};
/* Columns the initial probes have covered, 0..108; the exact pass follows. */
uint32_t og_ui_probed=0;
/* The peaks changed since the last compose. */
uint32_t og_ui_stale=0;
extern uint32_t og_ui_identity, og_ui_scanned, og_ui_frames;
extern uint32_t og_cached_track;
#define cached_track og_cached_track
/* Redraw once per eight native UI polls. Stock event-driven composition
 * still updates encoder/menu feedback; no audio cadence is changed. */
extern uint32_t og_ui_wait;
#define ui_wait og_ui_wait
/* Work a tick: the initial probes of OG_UI_PROBE_COLUMNS columns (eight
 * each), or OG_UI_SCAN_BYTES arena bytes of the exact pass (one page) in at
 * most OG_UI_SCAN_BINS bins, or composing the columns. Sized so that any
 * tick and a draw fit G1's UI budget together (tests/verify_profile.py,
 * the ui-* rows). */
enum { OG_UI_PROBE_COLUMNS=24, OG_UI_SCAN_BYTES=6144, OG_UI_SCAN_BINS=27 };
/* Cached columns of the project's 3x5 caption glyphs, centred in each
 * 18-column cell. No per-frame alphabet search or glyph pixel loop. */
/* Six exact 5-bit columns per word: POS SIZE REVS SPRD SPCE SHPE (the sixth
 * cell, PTCH's until 0.10.0, at 0.9.6's x = 93). REV took the third cell
 * from SCAN (now SETUP B) by the user's decision of 2026-10-21 and was
 * renamed REVS the same day: four letters at x = 40, where SCAN sat. */
static const uint32_t control_columns[18] = {
    0x0bf00000u,0x01f8fc07u,0x000076b7u,0x01dadc00u,0x2b9047f1u,0x011afc13u,0x01f2fc00u,0x20f046bfu,0x01dadc0fu,0x01dadc00u,0x0bf01cbfu,0x00e8fc1fu,0x3e0ed6e0u,0x231f80e5u,0x0008d7e0u,0x3e0ed6e0u,0x0e5f83e4u,0x0008d7e0u
};
/* The overview's captions in the original 3x5 glyphs (alphabet
 * ADEFILMOPRSTX), as 5-bit columns, six a word: three columns a letter,
 * one blank column after it, four for a space. All fit x=2..107, y=0..14.
 * LOAD is the first 15 columns of LOAD FLEX SAMPLE. */
static const uint32_t sample_columns[4]={0x0be076b7u,0x01f37c1eu,0x21f01cbfu,0x011afc10u};
static const uint32_t load_flex_sample[11]={
    0x23f0421fu,0x01e2f81fu,0x00003a3fu,0x0012fc00u,0x2bf0421fu,0x01b26c11u,0x2b700000u,0x01e2f81du,
    0x0bf07cdfu,0x01087c07u,0x000046bfu
};
/* The caption above the overview is the sample's name as the stock shows
 * it in its slot list (TESTING.md, "The sample's name"): Flex slot s's
 * record at 0x46c922c4 + 44*s, the one og_describe reads, holds at +24 the
 * long file name with its extension cut and, past ten characters, its first
 * five and last five, NUL-terminated when shorter. A name the stock has not
 * written yet, or none, shows SAMPLE. The caption cell runs from x = 2 to
 * x = 75, left of the leftmost status word (TSTR OFF at 77): eighteen
 * characters of four columns, so the field's ten always fit. */
enum { OG_NAME_CHARS=10, OG_CAPTION_COLUMNS=42 };
_Static_assert(2+4*OG_NAME_CHARS-1<=75 && 4*OG_NAME_CHARS<=OG_CAPTION_COLUMNS,
               "The stock's longest name fits the caption cell and its packed columns");
/* The caption's packed columns, six a word, from x = 2: SAMPLE until a
 * source names itself. compose() puts them into og_columns. */
uint32_t og_caption[7]={0x0be076b7u,0x01f37c1eu,0x21f01cbfu,0x011afc10u,0,0,0};
/* The ten name bytes the caption was composed from, as og_ui read them:
 * +24..+27, +28..+31, and +32..+33 in the high half. */
uint32_t og_ui_name[3]={0};
/* The 3x5 font for ASCII 32 to 95, eight a row, columns packed as above:
 * column c in bits 5c..5c+4, bit 0 its top row. Letters, digits, space and
 * - _ . ( ) # & + have glyphs in the captions' style; every other entry
 * is '?'. */
static const uint16_t font[64]={
    0x0000u,0x1ea1u,0x1ea1u,0x7d5fu,0x1ea1u,0x1ea1u,0x6aaau,0x1ea1u,
    0x45c0u,0x01d1u,0x1ea1u,0x11c4u,0x1ea1u,0x1084u,0x0200u,0x1ea1u,
    0x3a2eu,0x43f2u,0x5ebdu,0x7eb1u,0x7c87u,0x26b7u,0x76bfu,0x1f21u,
    0x7ebfu,0x7eb7u,0x1ea1u,0x1ea1u,0x1ea1u,0x1ea1u,0x1ea1u,0x1ea1u,
    0x1ea1u,0x78beu,0x2abfu,0x463fu,0x3a3fu,0x46bfu,0x04bfu,0x763fu,
    0x7c9fu,0x47f1u,0x7e18u,0x6c9fu,0x421fu,0x7cdfu,0x7c5fu,0x7e3fu,
    0x1cbfu,0x7d2fu,0x7cbfu,0x76b7u,0x07e1u,0x7e1fu,0x3e0fu,0x7d9fu,
    0x6c9bu,0x0f83u,0x4eb9u,0x1ea1u,0x1ea1u,0x1ea1u,0x1ea1u,0x4210u
};
static unsigned upper(unsigned c) {return c-'a'<26u?c-32u:c;}
/* The glyph of byte c: lower case as upper case, anything else as '?'. */
static unsigned glyph(unsigned c) {
    c=upper(c)-32u;
    return font[c<64u?c:'?'-32u];
}
static uintptr_t name_at(unsigned slot) {return 0x46c922c4u+slot*44u+24u;}
/* The caption from Flex slot `slot`'s stock name: its first NUL or ten
 * characters, a trailing .WAV or .AIF (any case) dropped (the stock has
 * already cut the extension; this keeps a name like LOOP.WAV.WAV short). */
static void caption(unsigned slot) {
    uintptr_t at=name_at(slot);
    uint32_t *name=og_ui_name;
    name[0]=U32(at);name[1]=U32(at+4u);name[2]=(uint32_t)U16(at+8u)<<16;
    uint8_t text[OG_NAME_CHARS];
    unsigned length=0;
    for (;length<OG_NAME_CHARS;++length) {
        unsigned c=name[length/4u]>>(24u-8u*(length%4u))&255u;
        if (!c) break;
        text[length]=(uint8_t)c;
    }
    if (length>=4 && text[length-4]=='.') {
        unsigned ext=upper(text[length-3])<<16|upper(text[length-2])<<8|upper(text[length-1]);
        if (ext==('W'<<16|'A'<<8|'V') || ext==('A'<<16|'I'<<8|'F')) length-=4;
    }
    for (unsigned w=0;w<7;++w) og_caption[w]=!length && w<4?sample_columns[w]:0;
    for (unsigned i=0,j=0;i<length;++i,++j) {
        unsigned bits=glyph(text[i]);
        for (unsigned col=0;col<3;++col,++j,bits>>=5) og_caption[j/6u]|=(bits&31u)<<(5u*(j%6u));
    }
}
/* Whether the name differs from the one the caption shows. */
static int renamed(unsigned slot) {
    uintptr_t at=name_at(slot);
    return U32(at)!=og_ui_name[0] || U32(at+4u)!=og_ui_name[1] || (uint32_t)U16(at+8u)<<16!=og_ui_name[2];
}
static const uint32_t tstr_off[6]={0x2b7007e1u,0x001f841du,0x00007cbfu,0x01f8fc00u,0x0bf004bfu,0x00000001u};
static const uint32_t stop_columns[3]={0x3e1076b7u,0x01f8fc01u,0x00001cbfu};
/* A second FRACT's page names the owner's track: FRACT ON T, then its
 * number from the font. */
static const uint32_t fract_on_t[7]={0x0bf004bfu,0x01e2f81fu,0x3e10463fu,0x00000001u,0x05f07e3fu,0x0000001fu,0x000007e1u};

/* The frame is 128 columns of two words, as module_draw passes it and as
 * the stock composite holds it. Our overview occupies x=8..119, y=31..62.
 * Compose that exact slice in place, preserving every neighboring bit. No
 * duplicate column/mask buffers or UI stack bitmap. */
static volatile uint32_t *frame_words=0;
static void target(unsigned char *frame) {
    frame_words=(volatile uint32_t *)(uintptr_t)frame;
}
static volatile uint32_t *canvas(unsigned x) {
    return frame_words+2*(x+8);
}
static uint32_t column(unsigned x) {
    volatile uint32_t *p=canvas(x);
    return (p[0]<<31)|(p[1]>>1);
}
static void put(unsigned x,uint32_t bits) {
    volatile uint32_t *p=canvas(x);
    p[0]=(p[0]&~1u)|(bits>>31);
    p[1]=(p[1]&1u)|(bits<<1);
}
/* Private calls are bounded: x=1..110, y=18/29/30, in the second word. */
static void pixel(int x, int y) {
    canvas((unsigned)x)[1]|=1u<<(y+1);
}
/* `count` packed caption columns at x, rows y..y+4 of the second word. */
static void glyphs(unsigned x,unsigned y,const uint32_t *packed,unsigned count) {
    volatile uint32_t *p=canvas(x)+1;
    uint32_t bits=0;
    for (unsigned j=0;j<count;++j,p+=2,bits>>=5) {
        if (!(j%6)) bits=*packed++;
        *p|=(bits&31u)<<(y+1);
    }
}
/* Page kind 0x46c7d8d8: SRC 0, LFO 1, AMP 2, FX1 3, FX2 4 (octemu, OS
 * 1.40C). The FX2 page shows the selected track's FX2 effect, so FRACT's
 * own id in that Part slot names its page in a card build and a runtime
 * package alike, without the address of a descriptor. */
static int visible(void) {
    if (U8(0x46c7d8d8)!=4 || U32(0x460d173a) || U32(0x460d1694)) return 0;
    uint32_t layer=U32(0x460d165c);
    if (!layer || U32(layer)) return 0;
    unsigned track=U8(0x100b14cc);
    uintptr_t bank=U32(0x46c82456);
    if (track>=8 || bank<0x400e21e0 || bank>=0x40a955e0) return 0;
    uintptr_t part=bank+0x8ed80+(U8(0x100b14cf)&3u)*6322u;
    return U8(part+8u+track)==OG_FX_ID ? (int)track+1 : 0;
}
/* Stock dials publish nothing to the module: the six base values come
 * from the selected track's Part. Without a valid bank the last values
 * stay. Locks and scene values reach the audio path, not these dials. */
static void part_values(unsigned track) {
    uintptr_t bank=U32(0x46c82456);
    if (track>=8 || bank<0x400e21e0 || bank>=0x40a955e0) return;
    uintptr_t base=bank+0x8ed80+(U8(0x100b14cf)&3u)*6322u+0x12cu+24u*track;
    for (unsigned k=0;k<6;++k) {
        unsigned v=U8(base+k);
        values[k]=(uint8_t)(v>127?127:v);
    }
}
/* Exact UI-only normalization, both nibbles of a byte written together,
 * and the columns: a centred mask of 2h+1 rows and the caption. */
static void compose(void) {
    unsigned peakmax=1;
    for (unsigned x=0;x<108;++x) if (peaks[x]>peakmax) peakmax=peaks[x];
    uint32_t *word=og_columns+2,packed=0;
    unsigned low=0,left=0;
    for (unsigned x=0;x<108;++x,packed>>=5) {
        if (!left) {packed=x<OG_CAPTION_COLUMNS?og_caption[x/6]:0;left=6;}
        --left;
        unsigned h=peaks[x]*11u/peakmax;
        if (x&1) peak_heights[x>>1]=(uint8_t)(low|h<<4);
        else low=h;
        *word++=((1u<<(2*h+1))-1u)<<(19-h)|(packed&31u)<<1;
    }
}
/* max(|left|,|right|) of one frame as og_stream_pcm decodes it; an
 * unmapped frame reads as silence. */
static unsigned frame_peak(const OgSource *s,uint32_t frame) {
    uint32_t remaining;
    uintptr_t p=og_locate(s,frame,&remaining);
    if (!p) return 0;
    int32_t a,b;
    if (s->bytes==2) {
        if (s->channels==2) {
            uint32_t pair=U32(p);
            a=(int16_t)(pair>>16);b=(int16_t)pair;
        } else a=b=(int16_t)U16(p);
    } else {
        a=(int16_t)((U8(p)<<8)|U8(p+1));
        b=s->channels==2?(int16_t)((U8(p+3)<<8)|U8(p+4)):a;
    }
    if (a<0) a=-a;
    if (b<0) b=-b;
    return (unsigned)(a>b?a:b);
}
/* Eight initial probes per column make quiet samples visible at once: the
 * frames 0.9.6 probed, OG_UI_PROBE_COLUMNS columns a tick. The exact pass
 * has not started, so a column's peak is its probes' alone. */
static void probe(const OgSource *s) {
    unsigned x=og_ui_probed,last=x+OG_UI_PROBE_COLUMNS;
    if (last>108) last=108;
    uint32_t frames=s->frames;
    unsigned binwidth=(frames+107)/108;
    for (;x<last;++x) {
        unsigned start=binwidth*x,span=start<frames?frames-start:0,peak=0;
        if (span>binwidth) span=binwidth;
        for (unsigned j=0;j<8 && span;++j) {
            unsigned v=frame_peak(s,start+((j*span/8+(x*37+j*17)%span)%span));
            if (v>peak) peak=v;
        }
        peaks[x]=(uint16_t)peak;
    }
    og_ui_probed=last;
}
/* The bounds of the samples at p, n >= 1 frames of one page in `format`
 * (og_describe's mode: 0 PCM24 mono, 1 PCM24 stereo, 2 PCM16 mono, 3 PCM16
 * stereo), merged into a bin's bounds lo <= 0 <= hi; returns p past them.
 * The ColdFire build runs this loop as written below in assembly, 8 to 21
 * instructions a frame at most (a ramp moves a bound at every sample);
 * host builds run the C, which the tests check. */
#if defined(__mcoldfire__)
#define OG_STEP(a,b) "\tcmp.l\t%[t],%[hi]\n\tjge\t" a "f\n\tmove.l\t%[t],%[hi]\n" \
                     a ":\tcmp.l\t%[t],%[lo]\n\tjle\t" b "f\n\tmove.l\t%[t],%[lo]\n" b ":"
#define OG_BYTES(at) "\tmove.b\t" at "(%[p]),%[t]\n\tlsl.l\t#8,%[t]\n\tmove.b\t" at "+1(%[p]),%[t]\n" \
                     "\tmvs.w\t%[t],%[t]\n"
#endif
static inline __attribute__((always_inline)) uintptr_t bounds(unsigned format,uintptr_t p,uint32_t n,
                                                               int32_t *high,int32_t *low) {
    int32_t hi=*high,lo=*low;
#if defined(__mcoldfire__)
    uint32_t v,t;
    if (format==3) __asm__ volatile(
        "1:\tmove.l\t(%[p])+,%[v]\n\tmvs.w\t%[v],%[t]\n" OG_STEP("2","3")
        "\tswap\t%[v]\n\tmvs.w\t%[v],%[t]\n" OG_STEP("4","5")
        "\tsubq.l\t#1,%[n]\n\tjne\t1b\n"
        : [p]"+a"(p),[n]"+d"(n),[hi]"+d"(hi),[lo]"+d"(lo),[v]"=&d"(v),[t]"=&d"(t) : : "cc","memory");
    else if (format==2) __asm__ volatile(
        "1:\tmvs.w\t(%[p])+,%[t]\n" OG_STEP("2","3")
        "\tsubq.l\t#1,%[n]\n\tjne\t1b\n"
        : [p]"+a"(p),[n]"+d"(n),[hi]"+d"(hi),[lo]"+d"(lo),[t]"=&d"(t) : : "cc","memory");
    else if (format==1) __asm__ volatile(
        "1:" OG_BYTES("0") OG_STEP("2","3") OG_BYTES("3") OG_STEP("4","5")
        "\taddq.l\t#6,%[p]\n\tsubq.l\t#1,%[n]\n\tjne\t1b\n"
        : [p]"+a"(p),[n]"+d"(n),[hi]"+d"(hi),[lo]"+d"(lo),[t]"=&d"(t) : : "cc","memory");
    else __asm__ volatile(
        "1:" OG_BYTES("0") "\taddq.l\t#3,%[p]\n" OG_STEP("2","3")
        "\tsubq.l\t#1,%[n]\n\tjne\t1b\n"
        : [p]"+a"(p),[n]"+d"(n),[hi]"+d"(hi),[lo]"+d"(lo),[t]"=&d"(t) : : "cc","memory");
#else
#define OG_BOUND(sample) do {int32_t v_=(sample);if (v_>hi) hi=v_;if (v_<lo) lo=v_;} while (0)
    for (;n;--n) {
        if (format==3) {uint32_t pair=U32(p);OG_BOUND((int16_t)pair);OG_BOUND((int16_t)(pair>>16));p+=4;}
        else if (format==2) {OG_BOUND((int16_t)U16(p));p+=2;}
        else if (format==1) {OG_BOUND((int16_t)((U8(p)<<8)|U8(p+1)));OG_BOUND((int16_t)((U8(p+3)<<8)|U8(p+4)));p+=6;}
        else {OG_BOUND((int16_t)((U8(p)<<8)|U8(p+1)));p+=3;}
    }
#endif
    *high=hi;*low=lo;
    return p;
}
/* A bin's bounds into its peak: max(hi,-lo) is its largest |sample|. */
static void merge(unsigned x,int32_t hi,int32_t lo) {
    unsigned peak=(unsigned)(hi>-lo?hi:-lo);
    if (peak>peaks[x]) peaks[x]=(uint16_t)peak;
}
/* The exact pass: OG_UI_SCAN_BYTES a tick straight from the arena pages,
 * and at most OG_UI_SCAN_BINS bins (short samples have narrow bins), one
 * og_locate a page, the current bin's bounds in registers. A tick that
 * ends inside a bin merges its part into the peak; the next tick merges the
 * rest. Unmapped pages read as silence (og_stream_pcm's zeros) and are
 * skipped. Both bounds start at 0, which leaves every peak exact. */
static void scan(const OgSource *s) {
    uint32_t frames=s->frames,at=og_ui_scanned;
    unsigned stereo=s->channels==2,format=(s->bytes==2?2u:0u)+stereo;
    unsigned bpf=s->bytes*s->channels,perpage=6144u/bpf;
    unsigned binwidth=(frames+107)/108,x=at/binwidth;
    uint32_t end=at+OG_UI_SCAN_BYTES/bpf,last=(x+OG_UI_SCAN_BINS)*binwidth;
    if (end>last) end=last;
    if (end>frames) end=frames;
    uint32_t edge=(x+1)*binwidth;
    int32_t hi=0,lo=0;
    while (at<end) {
        uint32_t n;
        uintptr_t p=og_locate(s,at,&n);
        if (!p) n=perpage-at%perpage;
        if (n>end-at) n=end-at;
        uint32_t stop=at+n;
        for (;;) {
            uint32_t part=(edge<stop?edge:stop)-at;
            if (p) p=bounds(format,p,part,&hi,&lo);
            at+=part;
            if (at<edge) break;
            merge(x,hi,lo);hi=lo=0;++x;edge+=binwidth;
            if (at==stop) break;
        }
    }
    /* Bin x holds frames of this tick unless the tick ended on its start. */
    if (at>edge-binwidth) merge(x,hi,lo);
    og_ui_scanned=at;
}
/* A tick does one piece of work: it takes a new source (the peaks cleared,
 * the caption taken from its name, and composed at once), or retakes a
 * changed name (the stock writes it just after the record turns valid) and
 * composes, or composes changed peaks at a redraw or once both passes are
 * done, or probes, or runs the exact pass. Until the overview is complete
 * every tick works; then only the redraw ticks look for a new source. */
void og_ui(void) {
    og_release_check();
    int track=visible();
    if (!track) {ui_wait=0;return;}
    unsigned wait=ui_wait;
    ui_wait=wait?wait-1:7;
    uint32_t frames=og_ui_frames;
    if (wait && (!frames || (og_ui_scanned>=frames && !og_ui_stale))) return;
    OgSource next;
    if (!og_source((unsigned)track-1,&next)) og_ui_frames=0;
    else {
        uint32_t identity=next.identity^(next.slot<<24);
        if (og_ui_identity!=identity || cached_track!=(unsigned)track || frames!=next.frames) {
            og_ui_identity=identity;cached_track=(unsigned)track;
            og_ui_frames=next.frames;og_ui_scanned=0;og_ui_probed=0;
            for (unsigned x=0;x<108;++x) peaks[x]=0;
            caption(next.slot);compose();og_ui_stale=0;
        } else if (renamed(next.slot)) {
            caption(next.slot);compose();og_ui_stale=0;
        } else if (og_ui_stale && (!wait || og_ui_scanned>=frames)) {
            compose();og_ui_stale=0;
        } else if (og_ui_probed<108) {
            probe(&next);og_ui_stale=1;
        } else if (og_ui_scanned<frames) {
            scan(&next);og_ui_stale=1;
        }
    }
    if (!wait) U32(0x46c7c72c)=1;
}
static int position(uint32_t frame,unsigned width) {
    return 2+(int)(frame/width);
}
static void overview(uint32_t window) {
    (void)window;
    /* The first pass also clears the dial rows (bits 1..24 of the first
     * word), which controls() draws next. */
    volatile uint32_t *p=canvas(0);
    if (!og_ui_frames) {
        for (unsigned x=0;x<112;++x,p+=2) {p[0]&=~0x01ffffffu;p[1]&=1u;}
        glyphs(2,0,sample_columns,23);
        for (int x=2;x<110;x+=2) pixel(x,18);
        glyphs(21,10,load_flex_sample,63);
        return;
    }
    /* The composed waveform and caption, one word a column. */
    const uint32_t *word=og_columns;
    for (unsigned x=0;x<112;++x,p+=2) {p[0]&=~0x01ffffffu;p[1]=(p[1]&1u)|*word++;}
    OgGrain *s=&og_state;
    unsigned selected=U8(0x100b14cc);
    int sounding=og_owner==selected && U8(0x800049d8+selected*168u) &&
                 s->identity==og_ui_identity;
    unsigned pos=sounding?s->params[2]:values[0];
    unsigned size=sounding?s->params[1]:values[1];
    uint32_t target=(og_ui_frames-1)/127*pos+((og_ui_frames-1)%127)*pos/127;
    if (sounding) {target+=s->scan;if (target>=og_ui_frames) target-=og_ui_frames;}
    uint32_t span=og_size(size); /* unity: grains read SIZE source frames */
    uint32_t end=(target+span)%og_ui_frames;
    unsigned binwidth=(og_ui_frames+107)/108;
    int sx=position(target,binwidth),ex=position(end,binwidth),cursors[OG_MAX_GRAINS]={-1,-1,-1};
    if (sounding) for (unsigned g=0;g<OG_MAX_GRAINS;++g) {
        const OgHead *h=s->head+g;
        if (h->length && h->length<=88200 && h->start<og_ui_frames && h->cursor<og_ui_frames)
            cursors[g]=position(h->cursor,binwidth);
    }
    /* Plain slice boundaries show the requested POS/SIZE region. Reader
     * squares follow actual latched heads, including during an edit.
     * Union the ink so coincident boundaries/readers do not cancel: only
     * the boundary and reader columns carry ink, and each of them is
     * inked once, with all the ink that falls on it. */
    int inked[2+3*OG_MAX_GRAINS];
    unsigned count=0;
    inked[count++]=sx;inked[count++]=ex;
    for (unsigned g=0;g<OG_MAX_GRAINS;++g) if (cursors[g]>=0)
        for (int d=-1;d<=1;++d) inked[count++]=cursors[g]+d;
    for (unsigned i=0;i<count;++i) {
        int x=inked[i];
        unsigned j=0;
        while (j<i && inked[j]!=x) ++j;
        if (j<i || x<1 || x>110) continue;
        uint32_t ink=x==sx || x==ex?0x3fffffc0u:0;
        for (unsigned g=0;g<OG_MAX_GRAINS;++g) if (cursors[g]>=0 &&
            x>=cursors[g]-1 && x<=cursors[g]+1) ink|=0x001f0000u;
        canvas((unsigned)x)[1]^=ink<<1;
    }
    /* The POS marker: rows 29-30 at sx, row 30 at its two neighbours.
     * One column pointer keeps the UI unit inside its cave. */
    volatile uint32_t *m=canvas((unsigned)sx);
    m[-1]|=1u<<31;m[1]|=3u<<30;m[3]|=1u<<31;
    if (U8(0x8000052cu+selected*48u)) glyphs(77,0,tstr_off,31);
    else if (og_ui_scanned<og_ui_frames) glyphs(85,0,load_flex_sample,15);
    else if (!sounding) glyphs(89,0,stop_columns,15);
}
/* The page of a second FRACT: another track owns the granulator, so this
 * track plays dry with SPACE bypassed (og_render), and its overview shows
 * only where FRACT is: FRACT ON T<n>, 43 columns centred on the waveform's
 * x = 2..109, its five rows around the waveform's centre row. The first
 * pass also clears the dial rows, which controls() draws next. */
static void elsewhere(unsigned owner) {
    volatile uint32_t *p=canvas(0);
    for (unsigned x=0;x<112;++x,p+=2) {p[0]&=~0x01ffffffu;p[1]&=1u;}
    glyphs(34,16,fract_on_t,39);
    uint32_t number=glyph('1'+owner);
    glyphs(74,16,&number,3);
}
static void controls(uint32_t window) {
    volatile uint32_t *p;
    /* overview() has cleared the dial rows. Use the stock dial, numeric
     * field, edit timer and lock highlight. Our final composite repaints
     * every cell, so clear the native text-only and skip-clear flags. Keep
     * native edit/lock flags and per-slot timer. */
    void (*dial)(int,int,unsigned,int,unsigned,uintptr_t,uint32_t)=(void *)0x400479b4;
    /* At y=6 the raised edit numerals end at row 56; the dial boxes still
     * clear row 57, the stock footer bar's solid top edge, at x=10..117. */
    for (unsigned k=0;k<6;++k)
        dial(10+(int)k*18,6,k,values[k],0,0,window);
    /* The stock dial clears its own box. Restore the compact captions last,
     * masking only their seven rows so raised dials and numbers survive,
     * and redraw that footer edge (bit 25) over exactly the dial columns
     * (x = 2..109; x = 0, 1, 110 and 111 are only masked). */
    p=canvas(0);
    p[0]&=~254u;p[2]&=~254u;
    p=canvas(2);
    for (unsigned word=0;word<18;++word) {
        uint32_t packed=control_columns[word];
        for (unsigned j=0;j<6;++j,p+=2,packed>>=5)
            *p=(*p&~254u)|0x02000002u|((packed&31u)<<3);
    }
    p[0]&=~254u;p[2]&=~254u;
}
/* module_draw: all stock layers are composed in this frame, before it
 * goes to the screen. */
void og_draw(unsigned char *frame) {
    int track=visible();
    if (!track) return;
    part_values((unsigned)track-1);
    target(frame);
    uint32_t window[5]={128,64,2,(uint32_t)(uintptr_t)frame,0};
    /* og_owner < 8 names the track that owns FRACT; another track's FRACT
     * page says where it is. The audio interrupt may change it at any time;
     * the next redraw (og_ui, every eighth tick) follows. */
    unsigned owner=og_owner;
    if (owner<8 && owner!=(unsigned)track-1u) elsewhere(owner);
    else overview((uint32_t)(uintptr_t)window);
    controls((uint32_t)(uintptr_t)window);
}
