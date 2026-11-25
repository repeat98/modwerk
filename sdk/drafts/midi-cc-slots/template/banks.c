/* SPDX-License-Identifier: MIT
 * Checked, length-preserving channel-sector updates. No stock serializer.
 */
#include "template.h"
#include "banks.h"
static uint32_t crc_table[256];
struct bank_info {uint32_t hash;unsigned sum,stored;uint8_t channels[64];};
static uint32_t read_be(const uint8_t*p){return (uint32_t)p[0]<<24|(uint32_t)p[1]<<16|(uint32_t)p[2]<<8|p[3];}
static void write_be(uint8_t*p,uint32_t v){p[0]=v>>24;p[1]=v>>16;p[2]=v>>8;p[3]=v;}
static unsigned cell(unsigned i){return 0x8eed6u+(i/8)*0x18bbu+9+0x4e2u+(i%8)*36u;}
static void bank_path(char*name,const char*folder,unsigned bank,unsigned saved){
    unsigned n=0;while(folder[n]){name[n]=folder[n];++n;}if(n&&name[n-1]!='/')name[n++]='/';
    const char*p="bank";while(*p)name[n++]=*p++;
    name[n++]=(char)('0'+(bank+1)/10);name[n++]=(char)('0'+(bank+1)%10);
    p=saved?".strd":".work";while(*p)name[n++]=*p++;name[n]=0;
}
static int inspect_bank(const char*name,struct bank_info*info){
    struct mt_bank_file f;if(!mt_bank_open(&f,name,0))return 0;
    unsigned valid=mt_bank_size(&f)==636113;
    info->sum=info->stored=0;uint32_t hash=~0u;
    for(unsigned at=0;valid&&at<636113;){
        unsigned n=636113-at;if(n>4096)n=4096;
        if(!mt_bank_read(&f,mt_work,n)){valid=0;break;}
        if(!at&&!(mt_work[0]=='F'&&mt_work[1]=='O'&&mt_work[2]=='R'&&mt_work[3]=='M'&&mt_work[12]=='B'&&mt_work[13]=='A'&&mt_work[14]=='N'&&mt_work[15]=='K'))valid=0;
        for(unsigned i=0;i<n;i++){
            unsigned pos=at+i;if(pos>=16&&pos<636111)info->sum+=mt_work[i];
            if(pos==636111)info->stored=(unsigned)mt_work[i]<<8;if(pos==636112)info->stored|=mt_work[i];
        }
        for(unsigned i=0;i<64;i++){
            unsigned pos=cell(i);
            if(pos>=at&&pos<at+n){volatile unsigned relative=pos-at;info->channels[i]=mt_work[relative];mt_work[relative]=0;}
        }
        for(unsigned i=0;i<n;i++){
            unsigned pos=at+i;uint8_t v=pos>=636111?0:mt_work[i];
            hash=(hash>>8)^crc_table[(hash^v)&255];
        }
        at+=n;
    }
    info->hash=~hash;
    return mt_bank_close(&f)&&valid;
}
static void hash_init(void){if(crc_table[1])return;for(unsigned i=0;i<256;i++){uint32_t c=i;for(unsigned b=0;b<8;b++)c=(c>>1)^(0xedb88320u&(0u-(c&1u)));crc_table[i]=c;}}
int mt_preflight_bank(const uint8_t values[1024],uint8_t fingerprints[128],uint8_t disk_channels[2048],unsigned b){
    hash_init();char folder[260],name[300];if(!mt_stopped()||!mm_profile_directory(folder,260))return 0;
    if(b>=16)return 0;
    {
        uint32_t first=0;
        for(unsigned saved=0;saved<2;saved++){
            struct bank_info info;bank_path(name,folder,b,saved);
            if(!inspect_bank(name,&info)||(info.sum&65535)!=info.stored)return 0;
            for(unsigned i=0;i<64;i++){
                if(info.channels[i]>16||(!saved&&info.channels[i]!=values[b*64+i]))return 0;
                if(disk_channels)disk_channels[saved*1024+b*64+i]=info.channels[i];
            }
            if(saved&&first!=info.hash)return 0;first=info.hash;
            write_be(fingerprints+(b*2+saved)*4,info.hash);
        }
    }
    return 1;
}
static int restore_peer(const char*good,const char*bad){
    struct mt_bank_file input,output;if(!mt_bank_open(&input,good,0))return 0;
    if(!mt_bank_open(&output,bad,1)){mt_bank_close(&input);return 0;}
    output.word[4]=636113;unsigned valid=1;
    for(unsigned at=0;valid&&at<636113;){
        unsigned n=636113-at;if(n>4096)n=4096;
        if(!mt_bank_read(&input,mt_work,n)){valid=0;break;}
        unsigned padded=(n+511)&~511u;for(unsigned i=n;i<padded;i++)mt_work[i]=0;
        if(!mt_bank_write(&output,mt_work,padded))valid=0;at+=n;
    }
    int out_ok=mt_bank_close(&output),in_ok=mt_bank_close(&input);return valid&&out_ok&&in_ok;
}
static int patch_bank(const char*name,const uint8_t values[64],const struct bank_info*before){
    unsigned sum=before->sum;
    for(unsigned i=0;i<64;i++)sum=sum-before->channels[i]+values[i];sum&=65535;
    unsigned sectors[65],count=0,previous=~0u;
    for(unsigned i=0;i<64;i++){unsigned sector=cell(i)&~511u;if(sector!=previous)sectors[count++]=sector;previous=sector;}
    sectors[count++]=636111u&~511u;
    /* Never keep a read descriptor open while writing the SAME file. Read
     * up to eight sectors, close, then write that batch and close again. */
    for(unsigned first=0;first<count;first+=8){
        unsigned amount=count-first;if(amount>8)amount=8;
        struct mt_bank_file input;if(!mt_bank_open(&input,name,0))return 0;
        unsigned valid=1;
        for(unsigned s=0;valid&&s<amount;s++){
            unsigned at=sectors[first+s],n=636113-at;if(n>512)n=512;
            uint8_t*buffer=mt_work+s*512;
            if(!mt_bank_seek(&input,at)||!mt_bank_read(&input,buffer,n)){valid=0;break;}
            for(unsigned i=n;i<512;i++)buffer[i]=0;
            for(unsigned i=0;i<64;i++){unsigned pos=cell(i);if(pos>=at&&pos<at+512){volatile unsigned relative=pos-at;buffer[relative]=values[i];}}
            if(at==(636111u&~511u)){buffer[636111u&511u]=(uint8_t)(sum>>8);buffer[636112u&511u]=(uint8_t)sum;}
        }
        if(!mt_bank_close(&input)||!valid)return 0;
        struct mt_bank_file output;if(!mt_bank_open(&output,name,1))return 0;output.word[4]=636113;
        for(unsigned s=0;valid&&s<amount;s++){
            if(!mt_bank_seek(&output,sectors[first+s])||!mt_bank_write(&output,mt_work+s*512,512))valid=0;
            output.word[4]=636113;
        }
        output.word[3]=0;output.word[4]=636113;
        int out_ok=mt_bank_close(&output);if(!valid||!out_ok)return 0;
    }
    return 1;
}

static int persist_bank(const uint8_t work[1024],const uint8_t stored[1024],const uint8_t fingerprints[128],unsigned b){
    hash_init();char folder[260],name[2][300];if(!mt_stopped()||!mm_profile_directory(folder,260))return 0;
    if(b>=16)return 0;
    {
        struct bank_info info[2];unsigned valid[2];
        for(unsigned s=0;s<2;s++){bank_path(name[s],folder,b,s);valid[s]=inspect_bank(name[s],&info[s])&&info[s].hash==read_be(fingerprints+(b*2+s)*4);}
        if(!valid[0]&&!valid[1])return 0;
        for(unsigned s=0;s<2;s++)if(!valid[s]){
            if(read_be(fingerprints+b*8)!=read_be(fingerprints+b*8+4)||!restore_peer(name[s^1],name[s])||!inspect_bank(name[s],&info[s])||info[s].hash!=read_be(fingerprints+(b*2+s)*4))return 0;
        }
        for(unsigned s=0;s<2;s++){
            const uint8_t*values=s?stored:work;
            if(!patch_bank(name[s],values+b*64,&info[s])||!inspect_bank(name[s],&info[s])||info[s].hash!=read_be(fingerprints+(b*2+s)*4)||(info[s].sum&65535)!=info[s].stored)return 0;
            for(unsigned i=0;i<64;i++)if(info[s].channels[i]!=values[b*64+i])return 0;
        }
    }
    return 1;
}
int mt_persist_bank(const uint8_t values[1024],const uint8_t fingerprints[128],unsigned b){return persist_bank(values,values,fingerprints,b);}
int mt_restore_bank(const uint8_t disk_channels[2048],const uint8_t fingerprints[128],unsigned b){return persist_bank(disk_channels,disk_channels+1024,fingerprints,b);}

int mt_preflight(const uint8_t values[1024],uint8_t fingerprints[128]){
    for(unsigned b=0;b<16;b++)if(!mt_preflight_bank(values,fingerprints,0,b))return 0;return 1;
}
int mt_persist(const uint8_t values[1024],const uint8_t fingerprints[128]){
    for(unsigned b=0;b<16;b++)if(!mt_persist_bank(values,fingerprints,b))return 0;return 1;
}
