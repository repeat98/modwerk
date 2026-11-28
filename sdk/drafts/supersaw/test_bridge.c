/* SPDX-License-Identifier: MIT */
#define SW_USB_HOST_TEST 1
#include "usb_machine.c"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static unsigned rng=0x831e7u;
static unsigned random_word(void) { rng=rng*1664525u+1013904223u; return rng; }
static uint32_t be32(const uint8_t *p)
{ return (uint32_t)p[0]<<24 | (uint32_t)p[1]<<16 | (uint32_t)p[2]<<8 | p[3]; }
static void page_and_admission(void)
{
    uint8_t stock[MODWERK_PAGE_BYTES]; memset(stock,0x5a,sizeof stock);
    sw_usb_build_page(stock);
    assert(!memcmp(page,stock,0x38));
    assert(!strcmp((char*)page+0x3c,"SSAW"));
    for (unsigned i=0;i<12;++i) {
        assert(be32(page+0xd2+4*i)==(i<6?(i==3?7:128):0));
        assert(page[0x96+i]==sw_usb_defaults[i]);
        assert(be32(page+0x132+4*i)==0);
        assert(be32(page+0x162+4*i)==0);
    }
    assert(be32(page+0x1c6)==0x111111 && be32(page+0x1c2)==0);
    char out[8]; osc_text(out,0); assert(!strcmp(out,"1"));
    osc_text(out,6); assert(!strcmp(out,"7"));
    uint8_t part[6322]; memset(part,0,sizeof part);
    for(unsigned owner=0;owner<8;++owner) {
        memset(part,0,sizeof part); part[0x22+owner]=1;
        memcpy(part+60+30*owner,"SW\1",3);
        for(unsigned t=0;t<8;++t) assert(sw_usb_admit(part,t)==(t==owner));
        part[60+30*owner]='X';
        for(unsigned t=0;t<8;++t) assert(sw_usb_admit(part,t));
    }
    assert(!sw_usb_admit(part,8) && !sw_usb_admit(0,0));
    assert(sw_usb_machine_start.machine==&sw_usb_machine);
    assert(sw_usb_machine_start.start==sw_usb_start);
    assert(!(sw_usb_machine.flags&MODWERK_MACHINE_NATIVE_FLEX));
}
int main(void)
{
    page_and_admission();
    SWUSBVoice v={0}, untouched={0}; SSMachine ref={0}; unsigned previous_transport=0;
    SWUSBFrame f={{64,0,85,0,127,0,6,0,127,0,80,0},0,127,30,0,1};
    uint32_t p[40];
    assert(sw_usb_packet(&v,&f,0,16,p,36)==36);
    for(unsigned i=4;i<36;++i) assert(p[i]==0);
    assert(!memcmp(&v,&untouched,sizeof v));
    unsigned packets=0, samples=0;
    for(unsigned frame=0;frame<20000;++frame) {
        if(frame%7==0) {sw_usb_note_start(&v); if(frame==0) ssm_init(&ref);}
        if(frame%13==0 && frame%7!=0) {sw_usb_note_release(&v); ssm_release(&ref);}
        for(unsigned i=0;i<12;++i) f.params[i]=(uint8_t)random_word();
        for(unsigned i=0;i<6;++i) f.params[2*i]%=128;
        f.params[6]%=7;
        f.attack=random_word()%128; f.hold=random_word()%128; f.release=random_word()%128;
        f.step=frame/43; f.transport=(frame%53)!=0;
        unsigned split=frame%17;
        for(unsigned pass=0;pass<2;++pass) {
            unsigned start=pass?split:0, end=pass?16:split;
            /* A 16/16 empty trailing call is NOT sent by this fixture: the
             * V0.27 scheduler prepares once on whichever call ends at 16. */
            if(pass && split==16) continue;
            int32_t expected[32]; unsigned n=end-start;
            if(end==16) {
                if(!f.transport && previous_transport) ssm_kill(&ref);
                previous_transport=f.transport;
                ssm_clock(&ref,f.step);
                ssm_prepare(&ref,f.params,(int)f.attack,(int)f.hold,(int)f.release,frame%7==0);
            } else ssm_knobs(&ref,f.params);
            assert(ssm_render(&ref,expected,n)==0);
            for(unsigned i=0;i<40;++i) p[i]=0xdeadbeefu;
            assert(sw_usb_packet(&v,&f,start,end,p,36)==(int)(4+2*n));
            assert(p[0]==n && p[1]==start && p[2]==0x4000000u && p[3]==start<<26);
            for(unsigned i=0;i<2*n;++i) assert(p[4+i]==(uint32_t)expected[i]);
            for(unsigned i=4+2*n;i<40;++i) assert(p[i]==0xdeadbeefu);
            assert(!memcmp(&v.engine,&ref,sizeof ref));
            ++packets; samples+=n;
        }
    }
    SWUSBVoice saved=v;
    memset(p,0x55,sizeof p); uint32_t old[40]; memcpy(old,p,sizeof p);
    assert(sw_usb_packet(&v,&f,8,7,p,36)==-1);
    assert(sw_usb_packet(&v,&f,0,17,p,36)==-1);
    assert(sw_usb_packet(&v,&f,0,16,p,35)==-1);
    assert(sw_usb_packet(0,&f,0,16,p,36)==-1);
    assert(!memcmp(&v,&saved,sizeof v) && !memcmp(p,old,sizeof p));
    sw_usb_note_start(&v); saved=v; sw_usb_note_release(&v);
    assert(!memcmp(&v,&saved,sizeof v)); /* START wins same pending release. */
    sw_usb_leave(&v); assert(!v.ready && !v.pending_start);
    assert(sw_usb_packet(&v,&f,0,16,p,36)==36);
    for(unsigned i=4;i<36;++i) assert(p[i]==0);
    sw_usb_note_start(&v); sw_usb_packet(&v,&f,0,16,p,36);
    SSMachine prior=v.engine; sw_usb_note_release(&v);
    assert(v.pending_release && !memcmp(&prior,&v.engine,sizeof prior));
    sw_usb_packet(&v,&f,0,16,p,36);
    assert(!v.pending_release && !v.engine.rec.voice.on);
    unsigned ticket=v.generation;
    sw_usb_note_start(&v); sw_usb_packet(&v,&f,0,16,p,36);
    v.pending_release=ticket; /* old task publication resumed after START */
    sw_usb_packet(&v,&f,0,16,p,36);
    assert(!v.pending_release && v.engine.rec.voice.on);
    prior=v.engine; sw_usb_note_kill(&v);
    assert(v.pending_kill && !memcmp(&prior,&v.engine,sizeof prior));
    sw_usb_packet(&v,&f,0,16,p,36);
    for(unsigned i=4;i<36;++i) assert(p[i]==0);
    sw_usb_note_start(&v); sw_usb_note_kill(&v);
    sw_usb_packet(&v,&f,0,16,p,36);
    for(unsigned i=4;i<36;++i) assert(p[i]==0);
    sw_usb_note_start(&v); sw_usb_packet(&v,&f,0,16,p,36);
    ticket=v.generation;
    sw_usb_note_kill(&v); sw_usb_note_start(&v);
    sw_usb_packet(&v,&f,0,16,p,36);
    assert(v.engine.rec.voice.on && !v.pending_kill);
    v.pending_kill=ticket; /* delayed publication from an older generation */
    sw_usb_packet(&v,&f,0,16,p,36);
    assert(v.engine.rec.voice.on && !v.pending_kill);
    sw_usb_start(2,0,0); SWUSBVoice other=voices[2]; sw_usb_leave_track(1);
    assert(!memcmp(&other,&voices[2],sizeof other)); sw_usb_leave_track(2);
    printf("PASS: %u packets, %u stereo samples; V0.27 scheduler/core equality, split boundaries, guards, silence, release priority, page and admission\n",packets,samples);
    return 0;
}
