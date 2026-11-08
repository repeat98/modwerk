#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "fract_ui.h"
static unsigned pixel(const uint32_t *f,unsigned x,unsigned y) {
    return (f[2*x+(y<32)]>>(y&31))&1;
}
int main(int argc,char **argv) {
    uint32_t frame[256],before[256],other[256];
    FractUiOverview v={.frames=441000,.position=88200,.length=44100,
        .readers={44100,176400,330750},.left={256,128,64},.right={64,128,256},
        .reverse={0,1,0},.sounding=1,.values={40,100,127,0,64,64},.caption="LAYOUT"};
    for(unsigned i=0;i<FRACT_UI_BINS;++i) v.peaks[i]=(uint16_t)(1+(i*17)%39);
    for(unsigned i=0;i<256;++i) before[i]=frame[i]=0xa5a5a5a5;
    fract_ui_overview_draw(frame,&v);
    for(unsigned x=0;x<128;++x) for(unsigned y=0;y<64;++y)
        if(x<8 || x>=120 || y==0 || y>=56) assert(pixel(frame,x,y)==pixel(before,x,y));
    unsigned top=0,bottom=0;
    for(unsigned x=8;x<120;++x) {
        for(unsigned y=9;y<14;++y) top+=pixel(frame,x,y);
        for(unsigned y=48;y<53;++y) bottom+=pixel(frame,x,y);
    }
    assert(top>50 && bottom>50);
    unsigned upper=0,lower=0;
    for(unsigned x=10;x<118;++x) {upper+=pixel(frame,x,17);lower+=pixel(frame,x,43);}
    assert(upper>=3 && upper==lower);
    memcpy(other,frame,sizeof frame);v.readers[0]+=44100;
    fract_ui_overview_draw(other,&v);
    unsigned moved=0;
    for(unsigned x=0;x<128;++x) for(unsigned y=0;y<64;++y)
        if(pixel(frame,x,y)!=pixel(other,x,y)) {assert(y>=20 && y<=40);++moved;}
    assert(moved);
    char text[12];fract_ui_control_text(text,0,255);assert(!strcmp(text,"POS:127"));
#ifdef OG_MACHINE_GRAIN_ONLY
    fract_ui_control_text(text,5,4);assert(!strcmp(text,"PTCH:-12.0"));
    fract_ui_control_text(text,5,64);assert(!strcmp(text,"PTCH:0.0"));
    fract_ui_control_text(text,5,65);assert(!strcmp(text,"PTCH:+0.2"));
    fract_ui_control_text(text,5,255);assert(!strcmp(text,"PTCH:+12.0"));
#endif
    if(argc==2) {
        FILE *out=fopen(argv[1],"wb");assert(out);
        fprintf(out,"P5\n128 64\n255\n");
        for(unsigned y=0;y<64;++y) for(unsigned x=0;x<128;++x) fputc(pixel(frame,x,y)?255:0,out);
        assert(!fclose(out));
    }
    return 0;
}
