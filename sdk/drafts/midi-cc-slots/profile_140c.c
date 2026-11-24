/* SPDX-License-Identifier: MIT
 * Original 1.40C adapter. All card I/O runs in the engine task, stopped.
 * The wake queue retains a stock ROM sentinel, never a module-owned pointer.
 */
#include "profile.h"
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
struct file_object {uint32_t word[6];};
#ifndef MM_PROFILE_IO_ALIGN
#define MM_PROFILE_IO_ALIGN 4
#endif
static uint8_t io[512] __attribute__((aligned(MM_PROFILE_IO_ALIGN)));
int mm_profile_directory(char *out,unsigned size) {
    const char *p=((const char *(*)(unsigned,unsigned))0x40025230u)(0,0);
    if(!p)return 0;
    unsigned n=0;
    while(p[n]){if(n+1>=size)return 0;out[n]=p[n];++n;}
    out[n]=0;return n&&out[0]=='/';
}
int mm_profile_gate(void) {
    if(U32(0x800068fcu)!=0x460ddde4u||U32(0x460d1cb8u)!=1||U32(0x460e76a0u))return 0;
    /* Drain pending engine commands (including project loads) before observing
     * their resulting bank/channel state. Our own sentinel drains normally. */
    if(U32(0x460d17d2u))return 0;
    for(unsigned i=0;i<16;i++)if(U8(0x80006500u+i)||U8(0x80004f1eu+84*i))return 0;
    return U32(0x800065b8u)==0;
}
int mm_profile_file(unsigned write,const char *path,uint8_t *data,unsigned size) {
    struct file_object file;
    int result=((int (*)(void *,const char *,const char *,void *,unsigned))0x40016864u)(&file,path,write?"w":"r",io,sizeof io);
    if(result<0)return result==-12?0:-1;
    unsigned partial=0,amount=size;
    if(!write) {
        int bytes=((int (*)(uint32_t))(uintptr_t)U32(0x46c8241eu))(file.word[0]);
        if(bytes<8||bytes>(int)size){((int (*)(void *))0x4001677cu)(&file);return -1;}
        if(bytes<(int)size) {
            partial=1;amount=(unsigned)bytes;
            for(unsigned i=amount;i<size;i++)data[i]=0;
        }
    }
    result=((int (*)(void *,void *,unsigned))(write?0x400166b8u:0x40016564u))(&file,data,amount);
    int closed=((int (*)(void *))0x4001677cu)(&file);
    return result==1&&closed>=0?(partial?2:1):-1;
}
unsigned mm_profile_bank(void) {return U8(0x100b14ceu);}
void mm_profile_context(unsigned *bank,unsigned *part,uint8_t channels[8]) {
    *bank=U8(0x100b14ceu);*part=U8(0x100b14cfu);
    uint32_t base=U32(0x46c82456u);
    if(*bank>15||*part>3||base<0x40000400u||base>0x47e00000u){*bank=255;return;}
    for(unsigned t=0;t<8;t++)channels[t]=U8(base+0x8f262u+*part*6322u+t*36u);
}
void mm_profile_apply(const uint8_t channels[8]) {
    unsigned part=U8(0x100b14cfu);uint32_t bank=U32(0x46c82456u);
    if(part>3||bank<0x40000400u||bank>0x47e00000u)return;
    unsigned changed=0;
    for(unsigned t=0;t<8;t++) {
        uint32_t at=part*6322u+t*36u;
        if(U8(bank+0x8f262u+at)==channels[t])continue;
        U8(bank+0x8f262u+at)=channels[t];U8(0x100a53b0u+at)=channels[t];
        U8(0x46c76de0u+t*68u)=channels[t];changed=1;
    }
    if(changed) {
        U8(bank+0x95048u)|=(uint8_t)(1u<<part);U8(0x100b145eu)|=(uint8_t)(1u<<part);
        U32(bank+0x9b332u)=1;U32(0x100f8598u)=1;
    }
}
int mm_profile_wake(void) {
    if(U32(0x460d17d2u)>U32(0x460d17deu))return 0;
    ((void (*)(void *,const void *))0x40000c3cu)((void *)0x460d17ceu,(const void *)0x400bc5f0u);
    return 1;
}
void mm_profile_redraw(unsigned status) {
    ((void (*)(int))0x4004d948u)(-1);
    if(U32(0x400bc6c0u)) {
        unsigned track=U8(0x100b14ccu);uint32_t bank=U32(0x46c82456u);unsigned part=U8(0x100b14cfu);
        if(track<8&&part<4&&bank>=0x40000400u&&bank<0x47e00000u)
            U32(0x460d5cb4u)=U8(bank+0x8f262u+part*6322u+track*36u);
        ((void (*)(void))0x40036548u)();
    }
    if(status==2||status==3||status==4)
        ((void (*)(const char *,unsigned))0x4005a2b8u)(status==2?"MIDI PROFILE SAVED":status==3?"MIDI SAVE FAILED":"MIDI PROFILE DAMAGED",80);
}
