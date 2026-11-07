/* SPDX-License-Identifier: MIT
 * Original UI bindings for stock OS 1.40C. Firmware/fonts stay on the unit.
 * The module owns both scratch planes; native drawing never targets stock's
 * home plane or its opacity plane. Only the home pixels are read at compose.
 */
#include "device_font.h"
#define UI_FONT 0x400ba876u
#define UI_SURFACE ((const volatile uint32_t *)0x400bf10au)
#define UI_TEXT ((void (*)(uint32_t,void *,int,int,int,const char *))0x40012bd8u)
#define UI_WIDTH ((uint32_t (*)(uint32_t,int,const char *))0x40012f30u)
#define UI_FRAME ((void (*)(void *,const char *,const char *))0x400570b8u)

static void surface(uint32_t *out,unsigned char *pixels,unsigned char *opacity)
{
    for(unsigned i=0;i<7u;++i)out[i]=UI_SURFACE[i];
    out[3]=(uint32_t)(uintptr_t)pixels;
    out[4]=(uint32_t)(uintptr_t)opacity;
}
const unsigned char *bs_device_home(void)
{return (const unsigned char *)(uintptr_t)UI_SURFACE[3];}
uint32_t bs_device_text_width(const char *text)
{return text?UI_WIDTH(UI_FONT,-1,text):0;}
void bs_device_small_text(unsigned char *frame,uint32_t x,uint32_t y,const char *text)
{
    if(!frame || !text || y>59u || x>=128u)return;
    uint32_t s[7];
    /* The plain text blitter only ORs the picture. Give it a module-owned
     * second-plane address too, rather than retaining stock's plane pointer. */
    surface(s,frame,frame);
    UI_TEXT(UI_FONT,s,(int)x,59-(int)y,-1,text);
}
static unsigned ink(const unsigned char *frame,unsigned x,unsigned y)
{return frame[x*8u+7u-y/8u]&(1u<<(y%8u));}
void bs_device_popup(unsigned char *frame,unsigned char *mask)
{
    uint32_t window[16];
    for(unsigned i=0;i<16u;++i)window[i]=0;
    for(unsigned i=0;i<1024u;++i)frame[i]=mask[i]=0;
    surface(window+9,frame,mask);
    window[9]=114;window[10]=64;
    UI_FRAME(window,"CREATE BEAT GRID","");
    /* Stock's 114 px surface paints x=1..112. Shift seven columns to leave
     * the approved eight-pixel home-screen margin on both sides. No scaling. */
    for(unsigned x=121u;x-- >7u;)
        for(unsigned b=0;b<8u;++b)frame[x*8u+b]=frame[(x-7u)*8u+b];
    for(unsigned x=0;x<128u;++x)if(x<7u || x>120u)
        for(unsigned b=0;b<8u;++b)frame[x*8u+b]=0;
    /* Derive opacity from the native frame's contour. This preserves its
     * stepped title and corner geometry without embedding a stock bitmap. */
    for(unsigned i=0;i<1024u;++i)mask[i]=0;
    for(unsigned y=0;y<64u;++y) {
        unsigned left=8u,right=119u;
        while(left<=right && !ink(frame,left,y))++left;
        if(left>right)continue;
        while(right>left && !ink(frame,right,y))--right;
        unsigned bit=1u<<(y%8u),band=7u-y/8u;
        for(unsigned x=left;x<=right;++x)mask[x*8u+band]|=(unsigned char)bit;
    }
}
static void pixel(unsigned char *frame,unsigned x,unsigned y)
{if(x<128u && y<64u)frame[x*8u+7u-y/8u]|=(unsigned char)(1u<<(y%8u));}
void bs_device_dashed_box(unsigned char *frame,uint32_t x,uint32_t y,uint32_t w,uint32_t h)
{
    if(!frame || !w || !h || x>=128u || y>=64u || w>128u-x || h>64u-y)return;
    for(unsigned i=0;i<w;++i)if(i%4u<2u){pixel(frame,x+i,y);pixel(frame,x+i,y+h-1u);}
    for(unsigned i=0;i<h;++i)if(i%4u<2u){pixel(frame,x,y+i);pixel(frame,x+w-1u,y+i);}
}
