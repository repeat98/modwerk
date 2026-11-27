/* Exercise the actual private native engine, including its static birth. */
#define main existing_fixture_main
#include "fract_machine.c"
#undef main

#ifndef OG_ENGINE_READERS
#define OG_ENGINE_READERS OG_MAX_GRAINS
#endif

static uint32_t wrap(int64_t coordinate,uint32_t frames) {
    coordinate%=frames;
    return (uint32_t)(coordinate<0?coordinate+frames:coordinate);
}
int main(void) {
    _Static_assert(sizeof(OgGrain)==128 && OG_MAX_GRAINS==3,"Retain grain ABI");
    _Static_assert(OG_ENGINE_READERS==2 || OG_ENGINE_READERS==3,"Supported live reader count");
    const uint32_t sources[]={1,2,17,440,441,2048,88200,441000,44860416};
    unsigned cases=0;
    for(unsigned n=0;n<sizeof sources/sizeof *sources;++n)
      for(unsigned pos=0;pos<128;++pos) for(unsigned size=0;size<128;++size)
      for(unsigned reverse=0;reverse<2;++reverse) {
        uint32_t frames=sources[n];
        uint8_t p[OG_PARAMS]={127,(uint8_t)size,(uint8_t)pos,64,0,64,64,
                             (uint8_t)(reverse?127:0)};
        OgGrain s={0};og_reset(&s,1);s.scan=(pos*7919u)%frames;
        unsigned born=OG_MAX_GRAINS;birth(&s,frames,p,&born);
        OgHead *h=s.head;uint32_t length=og_size(size);
        int64_t centre=((int64_t)(frames-1u)*pos)/127u+s.scan;
        int64_t first=centre-(length-1u)/2u;
        assert(born==0 && h->length==length && h->reverse==reverse);
        assert(h->cursor==wrap(first+(reverse?length-1u:0u),frames));
        assert(h->start==h->cursor && !h->phase && !h->age);
        /* Reverse and forward share exactly the same interval. */
        assert(wrap((int64_t)h->start+(reverse?-(int64_t)(length-1u):0),frames)
               ==wrap(first,frames));
        ++cases;
      }
    /* SIZE cannot perturb SPRD/PAN/REVS draws, for any configured live head. */
    for(unsigned g=0;g<OG_ENGINE_READERS;++g) for(unsigned spread=1;spread<128;++spread)
      for(unsigned mode=0;mode<2;++mode) {
        OgGrain a={0},b={0};og_reset(&a,1);og_reset(&b,1);
        a.spread_mode=b.spread_mode=(uint8_t)mode;
        for(unsigned i=0;i<g;++i) a.head[i].length=b.head[i].length=88200;
        uint8_t p[OG_PARAMS]={127,0,63,64,(uint8_t)spread,91,64,61};
        unsigned born;birth(&a,441000,p,&born);assert(born==g);
        p[1]=127;birth(&b,441000,p,&born);assert(born==g);
        OgHead *x=a.head+g,*y=b.head+g;
        uint32_t cx=wrap((int64_t)x->start+(x->length-1u)/2u-
                          (x->reverse?x->length-1u:0u),441000);
        uint32_t cy=wrap((int64_t)y->start+(y->length-1u)/2u-
                          (y->reverse?y->length-1u:0u),441000);
        assert(cx==cy && a.seed==b.seed && a.pan_seed==b.pan_seed);
        assert(x->reverse==y->reverse && x->rev_seed==y->rev_seed);
        assert(x->left==y->left && x->right==y->right);
        /* A live edit retains phase, amplitude and the source clock. */
        x->age=13;x->phase=x->step*13;
        uint32_t phase=x->phase,cursor=x->cursor,start=x->start;
        retime(&a,0,og_size(127));
        assert(x->phase==phase && x->cursor==cursor && x->start==start);
      }
    /* A failed launch must leave state and reserved slots unchanged. */
    OgGrain full={0};og_reset(&full,1);
    for(unsigned g=0;g<OG_ENGINE_READERS;++g)full.head[g].length=88200;
    OgGrain before=full;
    uint8_t params[OG_PARAMS]={127,86,18,64,127,127,64,127};
    unsigned born=OG_ENGINE_READERS;
    birth(&full,441000,params,&born);
    assert(born==OG_ENGINE_READERS && !memcmp(&full,&before,sizeof full));
    for(unsigned g=OG_ENGINE_READERS;g<OG_MAX_GRAINS;++g)assert(!full.head[g].length);
    printf("%u centred native births: POS, SIZE, wrap, reverse; RNG and live continuity OK\n",cases);
    return 0;
}
