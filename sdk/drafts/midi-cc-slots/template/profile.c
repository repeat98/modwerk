/* SPDX-License-Identifier: MIT
 * Project-local names and explicitly requested native-channel setup.
 * Journal recovery restores the PREVIOUS snapshot, never Bank A defaults.
 */
#include "template.h"
struct names_profile {
    char names[15][8][16];
    uint8_t overrides[16],old_channels[64][8],old_initialized[8];
    unsigned initialized;
};
static struct names_profile state;
static char directory[260],requested_directory[260],clone_directory[260];
static uint32_t generation,jsequence;
static unsigned loaded,dirty,pending_wake,redraw,status,ticks,revision;
static unsigned peer,jpeer,busy,requested,recovery,damaged,clone_ready,finishing;
static unsigned step,cursor,cancelled,rollback_reload,failure;
static unsigned confirming,confirm_armed,replacing;
uint8_t mt_work[MM_PROFILE_BYTES] __attribute__((aligned(16)));
static uint8_t journal[MM_PROFILE_BYTES] __attribute__((aligned(16)));
static uint8_t desired[1024];
char mt_command[16];

static void copy(void *to,const void *from,unsigned n){uint8_t*d=to;const uint8_t*s=from;while(n--)*d++=*s++;}
static void clear(void *to,unsigned n){uint8_t*d=to;while(n--)*d++=0;}
static int equal(const void*a,const void*b,unsigned n){const uint8_t*x=a,*y=b;while(n--)if(*x++!=*y++)return 0;return 1;}
static uint32_t get32(const uint8_t*p){return (uint32_t)p[0]<<24|(uint32_t)p[1]<<16|(uint32_t)p[2]<<8|p[3];}
static void put32(uint8_t*p,uint32_t v){p[0]=v>>24;p[1]=v>>16;p[2]=v>>8;p[3]=v;}
static uint32_t crc(const uint8_t*p,unsigned n){uint32_t c=~0u;for(unsigned i=0;i<n-4;i++){c^=p[i];for(unsigned b=0;b<8;b++)c=(c>>1)^(0xedb88320u&(0u-(c&1u)));}return ~c;}
static void seal(uint8_t*p){put32(p+4092,crc(p,4096));}
static int mapped(const uint8_t*p){return get32(p+32)==0x4d415031u||get32(p+32)==0x4d415032u;}
static int checked(const uint8_t*p,uint32_t magic){return get32(p)==magic&&get32(p+4)==1&&get32(p+4092)==crc(p,4096);}
static void announce(unsigned v){status=v;redraw=1;}
static int current(char*out){return mm_profile_directory(out,260)&&out[0];}
static int same(const char*a,const char*b){unsigned i=0;while(i<259&&a[i]&&b[i]&&a[i]==b[i])++i;return i<259&&a[i]==0&&b[i]==0;}
static int path(char*out,const char*suffix){unsigned n=0;while(directory[n]){if(n>240)return 0;out[n]=directory[n];++n;}if(!n)return 0;if(out[n-1]!='/')out[n++]='/';while(*suffix)out[n++]=*suffix++;out[n]=0;return 1;}
static int file(unsigned write,const char*name,uint8_t*p){char name_path[260];return path(name_path,name)?mm_profile_file(write,name_path,p,4096):-1;}
static char *slot(unsigned bank,unsigned track){return bank?state.names[bank-1][track]:names_store[track];}
static int name_valid(const uint8_t*p){unsigned end=0;for(unsigned c=0;c<16;c++){unsigned v=p[c];if(!v)end=1;else if(end||c>=10||v<32||v>254)return 0;}return 1;}
static int valid_profile(const uint8_t*p){
    if(!checked(p,0x4d4d3450u)||get32(p+12)>1)return 0;
    for(unsigned i=0;i<128;i++)if(!name_valid(p+16+i*16))return 0;
    for(unsigned i=0;i<512;i++)if(p[2064+i]>16)return 0;
    return 1;
}
static void unpack(const uint8_t*p){
    for(unsigned b=0;b<16;b++)for(unsigned t=0;t<8;t++)copy(slot(b,t),p+16+b*128+t*16,16);
    copy(state.old_channels,p+2064,512);copy(state.old_initialized,p+2576,8);copy(state.overrides,p+2584,16);
    generation=get32(p+8);state.initialized=get32(p+12);
}
static void pack(uint8_t*p,uint32_t gen){
    clear(p,4096);put32(p,0x4d4d3450u);put32(p+4,1);put32(p+8,gen);put32(p+12,state.initialized);
    for(unsigned b=0;b<16;b++)for(unsigned t=0;t<8;t++)copy(p+16+b*128+t*16,slot(b,t),16);
    copy(p+2064,state.old_channels,512);copy(p+2576,state.old_initialized,8);copy(p+2584,state.overrides,16);seal(p);
}
static int store(void){
    if(!mt_writable())return 0;
    const char *name=peer?"MIDI4_1.DAT":"MIDI4_0.DAT";
    int r=file(0,name,mt_work);
    if(r<0||(r>0&&(get32(mt_work)!=0x4d4d3450u||get32(mt_work+4)!=1)))return 0;
    uint32_t next=generation+1,snapshot=revision;pack(mt_work,next);
    if(file(1,name,mt_work)!=1||file(0,name,mt_work)!=1||!valid_profile(mt_work)||get32(mt_work+8)!=next)return 0;
    generation=next;peer^=1u;if(snapshot==revision)dirty=0;return 1;
}
static void import_old(void){
    uint32_t newest=0;unsigned found=0;
    for(unsigned legacy=0;legacy<2&&!found;legacy++)for(unsigned i=0;i<2;i++){
        const char*name=legacy?(i?"MIDI2_1.DAT":"MIDI2_0.DAT"):(i?"MIDI3_1.DAT":"MIDI3_0.DAT");
        char name_path[260];if(!path(name_path,name)){damaged=1;return;}
        unsigned length=legacy?1024:4096;int r=mm_profile_file(0,name_path,mt_work,length);
        if(!r)continue;
        if(r!=1||get32(mt_work)!=0x4d4d3250u||get32(mt_work+4)!=(legacy?1u:2u)||get32(mt_work+length-4)!=crc(mt_work,length)){damaged=1;continue;}
        unsigned valid=1;
        for(unsigned t=0;t<8;t++)if(!name_valid(mt_work+16+t*16))valid=0;
        for(unsigned c=0;c<512;c++)if(mt_work[152+c]>16)valid=0;
        if(!legacy)for(unsigned c=0;c<120;c++)if(!name_valid(mt_work+688+c*16))valid=0;
        if(!valid){damaged=1;continue;}
        uint32_t gen=get32(mt_work+8);if(found&&(int32_t)(gen-newest)<=0)continue;
        newest=gen;found=1;copy(names_store,mt_work+16,128);
        copy(state.old_channels,mt_work+152,512);copy(state.old_initialized,mt_work+664,8);
        if(!legacy){copy(state.overrides,mt_work+672,16);copy(state.names,mt_work+688,1920);}
    }
    /* Do not overwrite damaged old storage with a blank import. */
    if(found){damaged=0;dirty=1;}
}
static void load_profile(void){
    clear(&state,sizeof state);clear(names_store,128);generation=peer=dirty=damaged=0;
    unsigned found=0;
    for(unsigned i=0;i<2;i++){
        int r=file(0,i?"MIDI4_1.DAT":"MIDI4_0.DAT",mt_work);
        if(!r)continue;
        if(r!=1||!valid_profile(mt_work)){damaged=1;continue;}
        uint32_t gen=get32(mt_work+8);
        if(!found||(int32_t)(gen-generation)>0){unpack(mt_work);peer=i^1u;found=1;}
    }
    if(found)damaged=0;else if(!damaged)import_old();
    loaded=1;++revision;
}
static int valid_journal(const uint8_t*p){
    unsigned version=get32(p+4);
    if(get32(p)!=0x4d4d344au||(version!=1&&version!=2)||get32(p+4092)!=crc(p,4096)||get32(p+12)<1||get32(p+12)>3)return 0;
    if(version==2&&get32(p+32)!=0x4d415032u)return 0;
    if(mapped(p)&&(get32(p+28)&0xffff0000u))return 0;
    for(unsigned i=0;i<1024;i++)if(p[64+i]>16)return 0;
    if(get32(p+32)==0x4d415032u)for(unsigned i=0;i<2048;i++)if(p[MT_DISK_CHANNELS+i]>16)return 0;
    return 1;
}
static int read_journal(void){
    unsigned found=0,bad=0;jsequence=jpeer=0;
    for(unsigned i=0;i<2;i++){
        int r=file(0,i?"MIDI4_J1.DAT":"MIDI4_J0.DAT",mt_work);
        if(!r)continue;
        if(r!=1||!valid_journal(mt_work)){bad=1;continue;}
        uint32_t seq=get32(mt_work+8);
        if(!found||(int32_t)(seq-jsequence)>0){copy(journal,mt_work,4096);jsequence=seq;jpeer=i^1u;found=1;}
    }
    return found?1:bad?-1:0;
}
static int write_journal(unsigned phase){
    const char*name=jpeer?"MIDI4_J1.DAT":"MIDI4_J0.DAT";
    int r=file(0,name,mt_work);
    if(r<0||(r>0&&(get32(mt_work)!=0x4d4d344au||(get32(mt_work+4)!=1&&get32(mt_work+4)!=2))))return 0;
    /* Old modules must refuse pending split-map recovery. Once every bank
     * is committed/restored, a v1 terminal record is safe for old readers. */
    if(phase!=1){put32(journal+4,1);if(get32(journal+32)==0x4d415032u)put32(journal+32,0x4d415031u);}
    put32(journal+8,jsequence+1);put32(journal+12,phase);seal(journal);
    if(file(1,name,journal)!=1||file(0,name,mt_work)!=1||!valid_journal(mt_work)||!equal(journal,mt_work,4096))return 0;
    ++jsequence;jpeer^=1u;return 1;
}
static int recover(void){
    int r=read_journal();if(r<0||damaged){announce(12);return 0;}
    if(!r){recovery=0;return 1;}
    unsigned phase=get32(journal+12);uint32_t target=get32(journal+16);
    if(phase==2){if(!state.initialized){announce(12);return 0;}recovery=0;return 1;}
    if(phase==3){recovery=0;return 1;}
    if(state.initialized&&(int32_t)(generation-target)>=0){
        if(!write_journal(2)){announce(3);return 0;}
        recovery=0;dirty=finishing=busy=1;return 1;
    }
    pack(mt_work,generation);
    if(generation!=get32(journal+20)||get32(mt_work+4092)!=get32(journal+24)){announce(12);return 0;}
    /* Schedule recovery one bank per engine turn. A live failure restores
     * RAM in place; only boot recovery needs a native reload of other data. */
    if(!mt_channels(1,journal+64)){announce(12);return 0;}
    if(mapped(journal))failure=get32(journal+36);
    step=3;cursor=0;busy=recovery=1;announce(16);return 2;
}
static void failed(unsigned code){
    failure=code;step=0;
    if(mapped(journal)){put32(journal+36,code);(void)write_journal(1);}
    load_profile();rollback_reload=0;
    int result=recover();if(result==0){busy=1;announce(12);}
}
static void initialize(void){
    if(!mt_writable()){busy=0;announce(15);return;}
    if(dirty||!generation){if(!store()){busy=0;announce(3);return;}}
    clear(journal,4096);put32(journal,0x4d4d344au);put32(journal+4,2);
    put32(journal+16,generation+1);put32(journal+20,generation);pack(mt_work,generation);put32(journal+24,get32(mt_work+4092));
    /* MAP2 adds separate working/stored disk maps. MAP1 remains readable;
     * untagged old journals conservatively recover all sixteen pairs. */
    put32(journal+32,0x4d415032u);
    if(!mt_channels(0,journal+64)){busy=0;failure=400;announce(17);return;}
    for(unsigned b=0;b<16;b++)for(unsigned p=0;p<4;p++)for(unsigned t=0;t<8;t++){
        unsigned at=b*4+p;
        uint8_t v=journal[64+b*64+p*8+t];
        if(replacing)v=journal[64+t];
        else if(at&&(state.old_initialized[at>>3]&(1u<<(at&7u))))v=state.old_channels[at][t];
        else if(at&&v==0)v=journal[64+t];
        desired[b*64+p*8+t]=desired[b*64+(p+4)*8+t]=v;
    }
    cursor=0;step=1;announce(6);
}
static void advance(void){
    if(step==1){
        if(cancelled){cancelled=step=busy=0;announce(11);return;}
        if(!mt_preflight_bank(journal+64,journal+1088,journal+MT_DISK_CHANNELS,cursor)){
            failure=100+cursor;step=busy=0;announce(14);return;
        }
        if(++cursor==16){
            /* Retire both old journal peers before ANY bank mutation. An
             * older module then fails closed instead of using one RAM map. */
            if(!write_journal(1)||!write_journal(1)){step=0;recovery=busy=1;announce(3);return;}
            recovery=1;cursor=0;step=2;
        }
        announce(6);return;
    }
    if(step==2){
        if(cancelled){cancelled=0;failed(0);return;}
        if(cursor<16){
            /* Persist intent for this bank BEFORE touching either copy. */
            put32(journal+28,get32(journal+28)|(1u<<cursor));
            if(!write_journal(1)){failed(200+cursor);return;}
            if(!mt_persist_bank(desired,journal+1088,cursor)){failed(300+cursor);return;}
            ++cursor;announce(6);return;
        }
        if(!mt_channels(1,desired)){failed(400);return;}
        for(unsigned b=1;b<16;b++)for(unsigned t=0;t<8;t++)if(replacing||!(state.overrides[b]&(1u<<t)))copy(slot(b,t),names_store[t],16);
        for(unsigned b=0;b<16;b++)state.overrides[b]=255;
        state.initialized=1;++revision;dirty=1;
        if(!store()){failed(401);return;}
        step=0;
        if(!write_journal(2)){announce(3);return;}
        recovery=0;dirty=finishing=1;
        if(store()){finishing=busy=0;announce(7);}else announce(3);
        return;
    }
    if(step==3){
        unsigned touched=mapped(journal)?get32(journal+28):65535u;
        while(cursor<16&&!(touched&(1u<<cursor)))++cursor;
        if(cursor<16){
            int restored=get32(journal+32)==0x4d415032u?mt_restore_bank(journal+MT_DISK_CHANNELS,journal+1088,cursor):mt_persist_bank(journal+64,journal+1088,cursor);
            if(!restored){announce(12);return;}
            ++cursor;announce(16);return;
        }
        if(!write_journal(3)){announce(3);return;}
        recovery=step=busy=0;loaded=0;
        if(rollback_reload){rollback_reload=0;mt_reload_project();announce(8);}
        else announce(failure?17:11);
    }
}
void mm_profile_service(void){
    pending_wake=0;if(!mm_profile_gate())return;
    char now[260];if(!current(now))return;
    if(!loaded||!same(now,directory)){
        unsigned was=requested||confirming;requested=finishing=busy=step=cancelled=confirming=confirm_armed=replacing=0;copy(directory,now,260);load_profile();recovery=1;rollback_reload=1;
        if(recover()!=1){busy=1;return;}if(was)announce(13);
    }
    if(step){advance();return;}
    if(recovery){if(recover()!=1){busy=1;return;}busy=finishing?1:0;}
    if(requested){requested=0;if(!same(requested_directory,directory)){busy=0;announce(13);return;}initialize();return;}
    if(dirty&&!damaged){
        if(!mt_writable()){if(status!=15)announce(15);return;}
        if(store()){if(finishing){finishing=busy=0;announce(7);}else announce(2);}else announce(3);
    }
}
static void confirm(unsigned yes,unsigned no){
    if(!confirming)return;
    if(no){confirming=confirm_armed=busy=replacing=0;announce(11);}
    else if(yes&&confirm_armed){confirming=confirm_armed=0;requested=1;announce(6);}
}
void mm_profile_tick(void*api){
    if(confirming){
        unsigned held=mt_confirm_held();
        if(!held)confirm_armed=1;
        else confirm(held&1u,held&2u);
        if(confirming&&ticks==59)redraw=1;
    }
    if(mt_busy()&&step!=3&&mt_cancel_held())cancelled=1;
    (void)api;if(redraw){redraw=0;mm_profile_redraw(status);}
    if(++ticks<60&&((step==3&&status==12)||(loaded&&!step&&(!dirty||!mt_writable())&&!requested&&!recovery&&!finishing)))return;
    ticks=0;if(!pending_wake){pending_wake=1;if(!mm_profile_wake())pending_wake=0;}
}
void mm_profile_changed(void){++revision;dirty=1;}
char *mm_profile_name(unsigned track){unsigned b=mm_profile_bank();track&=7;return b<16&&b&&(state.overrides[b]&(1u<<track))?slot(b,track):names_store[track];}
char *mm_profile_edit(unsigned track){unsigned b=mm_profile_bank();track&=7;if(b>15||!mm_profile_ready())return 0;if(b&&!(state.overrides[b]&(1u<<track)))copy(slot(b,track),names_store[track],16);return slot(b,track);}
void mm_profile_name_changed(char*value){
    if(value==mt_command){announce(11);return;}
    if(!mm_profile_ready())return;
    for(unsigned b=0;b<16;b++)for(unsigned t=0;t<8;t++)if(value==slot(b,t)){state.overrides[b]|=(uint8_t)(1u<<t);mm_profile_changed();return;}
}
unsigned mm_profile_ready(void){return loaded&&!busy&&!recovery&&!damaged;}
unsigned mm_profile_status(void){return status;}
unsigned mt_initialized(void){return state.initialized;}
unsigned mt_busy(void){return busy||recovery;}
void mt_request(void){
    if(!mm_profile_ready()||!mt_stopped()){announce(10);return;}
    if(!mt_writable()){announce(15);return;}
    char now[260];if(!current(now)||!same(now,directory)){announce(13);return;}
    copy(requested_directory,directory,260);failure=cancelled=0;busy=1;replacing=!!state.initialized;
    if(replacing){confirming=1;confirm_armed=0;announce(18);}
    else {requested=1;announce(6);}
}
unsigned mt_progress(void){return step*100+cursor;}
unsigned mt_failure(void){return failure;}
int mt_runtime_key(int code,int pressed){
    if(confirming){
        if(code==0x31||code==0x32){if(pressed)confirm(code==0x31,code==0x32);return 1;}
        if(code==0x27&&pressed)confirm(0,1);
        if(code!=0x27&&code!=0x2d)return 1;
    }
    /* NO cancels at a bank boundary; always deliver STOP and FUNC releases. */
    if(mt_busy()){
        if(code==0x32){if(pressed&&step!=3)cancelled=1;return 1;}
        if(code!=0x27&&code!=0x2d&&!mt_view_key(code))return 1;
    }
    if(code==0x28&&pressed&&!mm_profile_ready()){announce(12);return 1;}return 0;
}
int mt_runtime_enc(int code,int delta){(void)code;(void)delta;return (int)mt_busy();}
void mt_project_loaded(unsigned caller){if(caller==0x400853deu){loaded=0;clone_ready=0;}}
void mt_clone_begin(void){
    clone_ready=0;if(!mm_profile_gate())return;
    mm_profile_service();if(!mm_profile_ready())return;
    if(dirty&&mt_writable()&&!store())return;
    if(current(clone_directory)&&same(clone_directory,directory))clone_ready=1;
}
void mt_clone_finish(void){
    char now[260];if(!clone_ready)return;clone_ready=0;
    if(!same(directory,clone_directory)||!current(now)||same(now,directory))return;
    char previous[260];copy(previous,directory,260);copy(directory,now,260);
    for(unsigned i=0;i<2;i++)if(file(0,i?"MIDI4_1.DAT":"MIDI4_0.DAT",mt_work)!=0){copy(directory,previous,260);announce(3);return;}
    generation=peer=0;dirty=1;++revision;
    if(!store()){announce(3);return;}
    dirty=1;if(!store()){announce(3);return;}announce(2);
}
