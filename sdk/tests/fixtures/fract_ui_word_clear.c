/* b6b76790 scalar draw, with an independent centred-SIZE bar oracle. */
#include <assert.h>
#include <string.h>
#include <stdio.h>
#include "fract_ui.c"
static void scalar_reference_draw(uint32_t frame[256], const FractUiOverview *v) {
    if (!frame || !v) return;
    for (unsigned x=8;x<120;++x)
        for (unsigned y=1;y<56;++y) ui_pixel(frame,x,y,y<=6u);
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
        if (h) for (unsigned y=30u-h;y<=30u+h;++y) ui_pixel(frame,10u+i,y,1);
        else if (!(i&1)) ui_pixel(frame,10u+i,30,1);
    }
    unsigned centre=ui_frame_x(v->position,v->frames)-10u;
    uint32_t bin=(v->frames+107u)/108u;
    unsigned half=v->length?(v->length-1u)/(2u*bin):0;
    if (half<1u) half=1u;
    if (half>54u || v->length>=v->frames) half=54u;
    for (int offset=-(int)half;offset<=(int)half;++offset) {
        unsigned x=10u+(centre+108u+offset)%108u;
        ui_pixel(frame,x,17,1);ui_pixel(frame,x,43,1);
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

static uint32_t seed=0x12345678u;
static uint32_t next(void) {seed^=seed<<13;seed^=seed>>17;seed^=seed<<5;return seed;}
int main(void) {
    static const uint32_t lengths[]={0,1,2047,2048,441000,44860416};
    for(unsigned c=0;c<2000;++c) {
        FractUiOverview v={0};v.frames=lengths[c%6];v.position=v.frames?next()%v.frames:0;
        v.length=c%4==0?0:c%4==1?1:c%4==2?88200:44860416;
        v.sounding=c&1u;v.active=(uint8_t)(next()&63u);
        for(unsigned i=0;i<6;++i)v.values[i]=(uint8_t)next();
        for(unsigned i=0;i<108;++i)v.peaks[i]=(uint16_t)(next()%32769u);
        if(c%7==0) memset(v.peaks,0,sizeof v.peaks);
        for(unsigned i=0;i<3;++i) {
            v.readers[i]=v.frames && c%3?next()%v.frames:v.frames;
            v.left[i]=(uint16_t)(next()%257u);v.right[i]=(uint16_t)(next()%257u);
            v.reverse[i]=(uint8_t)(next()&1u);
        }
        for(unsigned i=0;i<10;++i)v.caption[i]=(char)('A'+next()%26u);
        uint32_t got[256],want[256];
        for(unsigned i=0;i<256;++i)got[i]=want[i]=next();
        fract_ui_overview_draw(got,&v);scalar_reference_draw(want,&v);
        assert(!memcmp(got,want,sizeof got));
    }
    puts("2000 complete scalar/word-clear framebuffers: every pixel identical");
}
