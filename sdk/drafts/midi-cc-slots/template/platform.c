/* SPDX-License-Identifier: MIT
 * 1.40C adapter. All storage and bank mutation run in the stopped engine task.
 */
#define MM_PROFILE_IO_ALIGN 16
#define mm_profile_redraw mt_old_redraw
#include "../profile_140c.c"
#undef mm_profile_redraw
#include "template.h"

int mt_stopped(void){
    if(U32(0x800065b8u))return 0;
    for(unsigned i=0;i<16;i++)if(U8(0x80006500u+i)||U8(0x80004f1eu+84*i))return 0;
    return 1;
}
int mt_writable(void){return U32(0x100f847cu)==0;}
int mt_cancel_held(void){return !!(U8(0x46100b18u+(0x32u>>3))&(1u<<(0x32u&7u)));}
unsigned mt_confirm_held(void){
    return !!(U8(0x46100b18u+(0x31u>>3))&(1u<<(0x31u&7u)))|(unsigned)mt_cancel_held()<<1;
}
int mt_view_key(int code){
    if(code<0x22||code>0x26||U32(0x46c7c730u))return 0;
    /* Only a bare page key is read-only. A held modifier/track could turn
     * that key into a different stock command, so keep that chord blocked. */
    for(unsigned row=0;row<8;row++){
        unsigned allowed=row==(unsigned)code/8?1u<<((unsigned)code&7u):0;
        if(U8(0x46100b18u+row)&~allowed)return 0;
    }
    return 1;
}
int mt_ui_context(void){return U32(0x400bcd14u)==0x400bc6b8u&&U32(0x80000012u)!=0;}
extern uint32_t names_window,names_pending;
static unsigned claimed,armed;
int mt_key(int code,int down){
    if(mt_runtime_key(code,down)){if(code==59&&!down)claimed=0;return 1;}
    if(code!=59)return 0;
    if(down){
        if(!mt_ui_context())return 0;
        claimed=1;armed=!!(U8(0x46100b18u+(0x2du>>3))&(1u<<(0x2du&7u)));return 1;
    }
    if(!claimed)return 0;claimed=0;
    if(!mt_ui_context())return 1;
    if(!mt_writable()){
        ((void(*)(const char*,unsigned))0x4005a2b8u)("PROJECT IS PROTECTED",80);return 1;
    }
    if(!mm_profile_ready()||!mt_stopped()){
        ((void(*)(const char*,unsigned))0x4005a2b8u)("STOP FOR MIDI SETUP",80);return 1;
    }
    if(!armed||!(U8(0x46100b18u+(0x2du>>3))&(1u<<(0x2du&7u)))){
        ((void(*)(const char*,unsigned))0x4005a2b8u)("HOLD FUNC + PUSH D",100);return 1;
    }
    mt_request();return 1;
}
int mt_channels(unsigned write,uint8_t values[1024]){
    unsigned bank=U8(0x100b14ceu),part=U8(0x100b14cfu);
    if(bank>15||part>3||U32(0x46c82456u)!=0x400e21e0u+bank*0x9b340u||!mt_stopped())return 0;
    /* Validate EVERY byte before any mutation. Saved Parts start two bytes
     * after the four-current-Part area, not at a naive eight-Part stride. */
    for(unsigned b=0;b<16;b++)for(unsigned p=0;p<8;p++)for(unsigned t=0;t<8;t++){
        uint32_t at=0x400e21e0u+b*0x9b340u+(p<4?0x8ed80u+p*6322u:0x9504au+(p-4)*6322u)+0x4e2u+t*36u;
        unsigned i=b*64+p*8+t;
        if((write?values[i]:U8(at))>16)return 0;
    }
    for(unsigned b=0;b<16;b++)for(unsigned p=0;p<8;p++)for(unsigned t=0;t<8;t++){
        uint32_t at=0x400e21e0u+b*0x9b340u+(p<4?0x8ed80u+p*6322u:0x9504au+(p-4)*6322u)+0x4e2u+t*36u;
        unsigned i=b*64+p*8+t;
        if(write){
            U8(at)=values[i];
            if(b==bank){
                uint32_t mirror=(p<4?0x100a53b0u+p*6322u:0x100ab678u+(p-4)*6322u)+t*36u;
                U8(mirror)=values[i];
                if(p==part)U8(0x46c76de0u+t*68u)=values[i];
            }
        }else values[i]=U8(at);
    }
    if(write){
        for(unsigned b=0;b<16;b++)U32(0x400e21e0u+b*0x9b340u+0x9b332u)=1;
        U32(0x100f8598u)=1;
    }
    return 1;
}
#include "banks.h"
static uint8_t write_io[512] __attribute__((aligned(16)));
int mt_bank_open(struct mt_bank_file*f,const char*name,unsigned write){return ((int(*)(void*,const char*,const char*,void*,unsigned))0x40016864u)(f,name,write?"w":"r",write?write_io:io,512)>=0;}
int mt_bank_close(struct mt_bank_file*f){return ((int(*)(void*))0x4001677cu)(f)>=0;}
int mt_bank_seek(struct mt_bank_file*f,unsigned at){return ((int(*)(void*,unsigned))0x4001660cu)(f,at)>=0;}
int mt_bank_read(struct mt_bank_file*f,uint8_t*p,unsigned n){return ((int(*)(void*,void*,unsigned))0x40016564u)(f,p,n)==1;}
int mt_bank_write(struct mt_bank_file*f,const uint8_t*p,unsigned n){
    int r=((int(*)(void*,const void*,unsigned))0x400166b8u)(f,p,n);
    /* Only complete sectors are written. Preserve logical EOF on EVERY exit;
     * stock write-mode close otherwise truncates a bank to the last seek. */
    unsigned pending=f->word[3];f->word[3]=0;f->word[4]=636113;
    return r==1&&pending==0;
}
int mt_bank_size(struct mt_bank_file*f){return ((int(*)(uint32_t))(uintptr_t)U32(0x46c8241eu))(f->word[0]);}
void mt_reload_project(void){((void(*)(const char*))0x40023c7cu)((const char*)0x100f8378u);}
void mm_profile_redraw(unsigned value){
    mt_old_redraw(value);
    const char*message=0;
    switch(value){
    case 6:message="SAVING MIDI SETUP";break;
    case 7:message="MIDI SETUP SAVED";break;
    case 8:message="MIDI SETUP RESTORED";break;
    case 9:message="MIDI SETUP ALREADY SET";break;
    case 10:message="STOP FOR MIDI SETUP";break;
    case 11:message="MIDI SETUP CANCELLED";break;
    case 12:message="MIDI RECOVERY REQUIRED";break;
    case 13:message="PROJECT CHANGED";break;
    case 15:message="PROJECT IS PROTECTED";break;
    case 18:message="REPLACE ALL? YES/NO";break;
    }
    char progress[26];
    if(value==6||value==16){
        unsigned p=mt_progress(),bank=p%100+1;if(bank>16)bank=16;
        const char*text=value==16?"RESTORE MIDI ":p/100==1?"CHECK MIDI ":"APPLY MIDI ";
        unsigned n=0;while(text[n]){progress[n]=text[n];++n;}
        progress[n++]=(char)('0'+bank/10);progress[n++]=(char)('0'+bank%10);
        progress[n++]='/';progress[n++]='1';progress[n++]='6';progress[n]=0;message=progress;
    }else if(value==17||value==14){
        const char*text=value==14?"CHECK FAILED ":"APPLY FAILED ";unsigned n=0,v=mt_failure();
        while(text[n]){progress[n]=text[n];++n;}
        progress[n++]=(char)('0'+v/100%10);progress[n++]=(char)('0'+v/10%10);progress[n++]=(char)('0'+v%10);progress[n]=0;message=progress;
    }
    if(message)((void(*)(const char*,unsigned))0x4005a2b8u)(message,100);
}
