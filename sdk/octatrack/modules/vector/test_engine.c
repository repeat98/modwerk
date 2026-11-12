/* Firmware-free behavioral tests. Run only in the isolated native workspace. */
#include "engine.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static void blank(uint8_t *r) {
    memset(r,0,VECTOR_TRACK_BYTES);
    memset(r+VECTOR_LOCKS,255,64*32);
    memset(r+0x40,0xaa,8); r[0x50]=16; r[0x51]=2; r[0x52]=20;
}
static int on(const uint8_t *r,unsigned i,unsigned m) {
    return (r[m*8+7-i/8]>>(i%8))&1;
}
static void deterministic_and_scale(void) {
    const unsigned allowed[]={0xfff,0x5ad,0xab5,0x6ad,0x4a9};
    VectorPhrase a,b;
    unsigned cases=0;
    for(unsigned seed=0;seed<24;++seed) for(unsigned scale=0;scale<5;++scale)
    for(unsigned root=0;root<12;++root) for(unsigned length=1;length<=64;length+=7) {
        VectorParams p=vector_defaults; p.root=root;p.scale=scale;p.type=seed%16;
        unsigned previous=0; VectorPhrase before={0};
        for(unsigned density=0;density<=16;++density) {
            p.density=density;
            assert(vector_generate(&a,&p,length,100,seed));
            assert(vector_generate(&b,&p,length,100,seed));
            assert(!memcmp(&a,&b,sizeof a));
            unsigned count=0;
            for(unsigned i=0;i<64;++i) {
                assert(a.steps[i].active>=before.steps[i].active);
                if(a.steps[i].active) {
                    ++count;assert(i<length);
                    int pitch=((int)a.steps[i].pitch-64)/5;
                    assert(pitch>=-12 && pitch<=12);
                    unsigned pc=(unsigned)(pitch+24-(int)root)%12;
                    assert(allowed[scale]&(1u<<pc));
                    assert(a.steps[i].hold<=p.gate && a.steps[i].volume<=100);
                }
            }
            assert(count>=previous);
            assert(count==(length*density+8)/16);
            if(density==16) assert(count==length);
            previous=count;before=a;++cases;
        }
    }
    printf("PASS %u deterministic/scale/density cases, including 1..64-step boundaries\n",cases);
}
static void writer(void) {
    uint8_t guarded[VECTOR_TRACK_BYTES+32],before[VECTOR_TRACK_BYTES];
    memset(guarded,0x5a,sizeof guarded);uint8_t *r=guarded+16;blank(r);
    VectorPhrase p;assert(vector_generate(&p,&vector_defaults,64,100,0));
    assert(vector_track_empty(r,VECTOR_TRACK_BYTES));
    assert(vector_write_phrase(r,VECTOR_TRACK_BYTES,&p,0));
    memcpy(before,r,sizeof before);
    assert(!vector_write_phrase(r,VECTOR_TRACK_BYTES,&p,0));assert(!memcmp(before,r,sizeof before));
    for(unsigned i=0;i<16;++i) assert(guarded[i]==0x5a && guarded[sizeof guarded-1-i]==0x5a);
    for(unsigned i=0;i<64;++i) {
        assert(on(r,i,0)==p.steps[i].active);
        if(on(r,i,0)) assert(r[VECTOR_LOCKS+32*i]==p.steps[i].pitch);
    }
    blank(r);r[VECTOR_LOCKS+18]=79; /* existing FX lock refuses first-play auto fill */
    assert(!vector_track_empty(r,VECTOR_TRACK_BYTES));
    assert(!vector_write_phrase(r,VECTOR_TRACK_BYTES,&p,0));
    for(unsigned mask=1;mask<10;++mask) {
        if(mask==8) continue; /* swing alone is allowed on an empty track */
        blank(r);r[mask*8+7]=1;
        memcpy(before,r,sizeof before);
        assert(!vector_track_empty(r,VECTOR_TRACK_BYTES));
        assert(!vector_write_phrase(r,VECTOR_TRACK_BYTES,&p,0));
        assert(!memcmp(before,r,sizeof before));
    }
    blank(r);
    /* Every step carries unrelated locks; recorder masks and swing must survive. */
    for(unsigned i=0;i<64;++i) {
        r[VECTOR_LOCKS+32*i+18]=(uint8_t)(i%128);
        r[VECTOR_LOCKS+32*i+6]=87;
        r[VECTOR_LOCKS+32*i+31]=3;
    }
    for(unsigned i=32;i<72;++i) r[i]=(uint8_t)(i*3+1);
    memcpy(before,r,sizeof before);
    VectorParams params=vector_defaults;params.density=0;
    assert(vector_generate(&p,&params,16,100,9));
    assert(vector_write_phrase(r,VECTOR_TRACK_BYTES,&p,1));
    assert(!memcmp(r+32,before+32,40)); /* recorders + swing mask */
    assert(r[0x50]==16 && r[0x51]==2 && r[0x52]==20); /* track timing */
    for(unsigned i=0;i<64;++i) {
        assert(!on(r,i,0) && on(r,i,2));
        assert(r[VECTOR_LOCKS+32*i+18]==i && r[VECTOR_LOCKS+32*i+6]==87 && r[VECTOR_LOCKS+32*i+31]==3);
    }
    memcpy(before,r,sizeof before);p.steps[63].active=1;
    assert(!vector_write_phrase(r,VECTOR_TRACK_BYTES,&p,1));assert(!memcmp(before,r,sizeof before));
    assert(!vector_write_phrase(r,VECTOR_TRACK_BYTES-1,&p,1));
    assert(!vector_generate(&p,&params,0,100,0));assert(!vector_generate(&p,&params,65,100,0));
    assert(!vector_generate(&p,&params,16,128,0));
    assert(vector_next_seed(0xffffff)==0);
    puts("PASS native-record writer: visible trigs, repeat/edit protection, exact swing/recorder/other-lock preservation, bounds and fail-before-write");
}
static void secondary_controls(void) {
    const unsigned allowed[]={0xfff,0x5ad,0xab5,0x6ad,0x4a9};
    VectorPhrase base, altered;
    unsigned cases=0;
    for(unsigned scale=0;scale<5;++scale) for(unsigned root=0;root<12;++root)
    for(unsigned span=0;span<=12;++span) for(unsigned offset=0;offset<=24;++offset) {
        VectorParams p=vector_defaults; p.scale=(uint8_t)scale; p.root=(uint8_t)root;
        p.span=(uint8_t)span; p.offset=(uint8_t)offset; p.density=16;
        assert(vector_generate(&altered,&p,64,127,cases%128));
        for(unsigned i=0;i<64;++i) {
            int pitch=((int)altered.steps[i].pitch-64)/5;
            unsigned pc=(unsigned)(pitch+24-(int)root)%12;
            assert(pitch>=-12 && pitch<=12 && (allowed[scale]&(1u<<pc)));
        }
        ++cases;
    }
    for(unsigned length=1;length<=64;++length) {
        VectorParams p=vector_defaults;
        assert(vector_generate(&base,&p,length,100,7));
        for(unsigned rotation=0;rotation<64;++rotation) for(unsigned dir=0;dir<2;++dir) {
            p.rotation=(uint8_t)rotation; p.direction=(uint8_t)dir;
            assert(vector_generate(&altered,&p,length,100,7));
            for(unsigned i=0;i<length;++i) {
                unsigned source=(i+length-rotation%length)%length;
                if(dir) source=length-1-source;
                assert(!memcmp(&altered.steps[i],&base.steps[source],sizeof(VectorStep)));
            }
            ++cases;
        }
        p=vector_defaults;
        for(unsigned repeat=1;repeat<=length;++repeat) {
            p.repeat=(uint8_t)repeat;
            assert(vector_generate(&altered,&p,length,100,7));
            for(unsigned i=repeat;i<length;++i)
                assert(!memcmp(&altered.steps[i],&altered.steps[i%repeat],sizeof(VectorStep)));
            ++cases;
        }
    }
    VectorParams p=vector_defaults, unpacked;
    uint8_t guard[11]; memset(guard,0xa5,sizeof guard);
    for(unsigned seed=0;seed<128;++seed) {
        p.type=(uint8_t)(seed%16); p.scale=(uint8_t)(seed%5);
        p.density=(uint8_t)(seed%17); p.direction=(uint8_t)(seed%2);
        p.root=(uint8_t)(seed%12); p.span=(uint8_t)(seed%13);
        p.gate=(uint8_t)(seed%127); p.accent=(uint8_t)seed;
        p.offset=(uint8_t)(seed%25); p.rotation=(uint8_t)(seed%64); p.repeat=(uint8_t)(seed%65);
        vector_pack(guard+1,&p,seed);
        uint32_t read_seed=999;
        vector_unpack(&unpacked,&read_seed,guard+1);
        assert(!memcmp(&unpacked,&p,sizeof p) && read_seed==seed);
        assert(guard[0]==0xa5 && guard[10]==0xa5);
    }
    p=vector_defaults;
    assert(vector_generate(&base,&p,64,100,7));
    p.gate=126; p.accent=127;
    assert(vector_generate(&altered,&p,64,100,7));
    for(unsigned i=0;i<64;++i) {
        assert(base.steps[i].active==altered.steps[i].active);
        assert(base.steps[i].pitch==altered.steps[i].pitch);
    }
    printf("PASS %u secondary-control cases; packed settings, stable gate/accent edits and seed wrap\n",cases);
    assert(vector_next_seed(127)==0);
}
int main(void) {deterministic_and_scale();secondary_controls();writer();return 0;}
