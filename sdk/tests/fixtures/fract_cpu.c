#define main existing_fixture_main
#include "fract_machine.c"
#undef main

extern void cpu_reference_all(OgGrain *,uint32_t,const uint8_t *,int32_t *,unsigned,
                               void (*)(void *,uint32_t,int32_t *),void *);
extern void cpu_reference_reset(OgGrain *,uint32_t);

/* Independent scalar source decoder, with the accepted endpoint join. */
static void reference_read(void *context,uint32_t frame,int32_t *pcm) {
    OgSource *s=context;unsigned left;
    uintptr_t at=og_locate(s,frame,&left);
    decode(s,at,pcm);
    if(s->frames>=2048 && s->frames-1u-frame<128u && at) {
        int32_t first[2];uintptr_t start=og_locate(s,0,&left);
        decode(s,start,first);
        if(start) for(unsigned c=0;c<2;++c)
            pcm[c]=(int16_t)(pcm[c]+(((first[c]-pcm[c])*(int)(128u-(s->frames-1u-frame)))>>7));
    }
}

int main(void) {
    _Static_assert(OG_MAX_GRAINS==3 && sizeof(OgGrain)==128,"Three real heads");
    static const unsigned lengths[]={1,2,441,2047,2048,2049,3072};
    static const unsigned sizes[]={0,1,32,86,127};
    unsigned cases=0,max_live=0;uint64_t frames=0;
    for(unsigned format=0;format<4;++format) for(unsigned n=0;n<7;++n)
      for(unsigned sz=0;sz<5;++sz) for(unsigned mode=0;mode<4;++mode)
      for(unsigned missing=0;missing<3;++missing) {
        fixture(format,lengths[n]);
        if(missing) {
            unsigned bpf=(format<2?3u:2u)*((format&1u)+1u);
            unsigned index=missing==1?0:(lengths[n]-1u)/(6144u/bpf);
            put(0x46c2e9c0u+2u*index,2,0);
        }
        OgSource src={0};assert(og_describe(0,&src));src.join_mode=src.frames>=2048;
        uint8_t p[OG_PARAMS]={127,(uint8_t)sizes[sz],126,64,127,127,64,0};
        if(mode==1) {p[6]=0;p[7]=127;}
        if(mode==2) {p[6]=127;p[7]=64;}
        if(mode==3) {p[2]=114;p[7]=127;p[5]=0;p[4]=0;}
        OgGrain native={0},scalar={0};og_reset(&native,1);cpu_reference_reset(&scalar,1);
        unsigned total=og_size(p[1])+128u;
        for(unsigned at=0;at<total;) {
            unsigned count=(at%3==0?63:at%3==1?16:1);if(count>total-at) count=total-at;
            struct {uint32_t before;int32_t audio[128];uint32_t after;} got,want;
            got.before=want.before=0x87654321u;got.after=want.after=0x12345678u;
            for(unsigned j=0;j<128;++j) got.audio[j]=want.audio[j]=((int)j-64)*65536;
            og_engine(&native,&src,p,got.audio,count);
            cpu_reference_all(&scalar,src.frames,p,want.audio,count,reference_read,&src);
            assert(!memcmp(&got,&want,sizeof got));
            assert(!memcmp(&native,&scalar,sizeof native));
            unsigned live=0;for(unsigned g=0;g<3;++g) live+=native.head[g].length!=0;
            if(live>max_live)max_live=live;
            at+=count;frames+=count;
        }
        ++cases;
    }
    assert(max_live==3);
    /* Coincident full-scale grains: the sum must stay in int32 for every SHPE. */
    for(unsigned sign=0;sign<2;++sign) for(unsigned shape=0;shape<=32;++shape)
      for(unsigned i=0;i<=128;++i) {
        unsigned env=og_envelope_shape(shape,(uint32_t)i<<24);
        assert(env<=21845);
        int64_t sum=(sign?-32768:32767)*(int64_t)env*3;
        assert(sum>=INT32_MIN && sum<=INT32_MAX);
    }
    printf("%u three-head optimized scalar/native cases, %llu stereo frames, three live readers; guards and all-shape full-scale bounds OK\n",
           cases,(unsigned long long)frames);
    return 0;
}
