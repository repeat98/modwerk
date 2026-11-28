/* SPDX-License-Identifier: MIT */
#include "threshold.h"
#include <stdio.h>
static int fail;
#define CHECK(x) do { if(!(x)){ printf("FAIL %u\n",(unsigned)__LINE__); fail=1; return; } } while(0)
static void feed_all(struct ts_scan *s, const int32_t *peaks, uint32_t n)
{
    uint32_t guard=0;
    while(s->phase<2u && guard<n*4u) {
        uint32_t at=s->cursor, ask;
        ++guard;
        if(at>=n){ts_scan_feed(s,at,0,0);break;}
        ask=n-at>7u?7u:n-at;
        if(ts_scan_feed(s,at,peaks+at,ask))break;
    }
}
static void spikes(void)
{
    int32_t peaks[1000];
    struct ts_scan scan;
    uint32_t i;
    for(i=0;i<1000;++i)peaks[i]=0;
    peaks[200]=peaks[500]=peaks[800]=1000;
    ts_scan_begin(&scan,0,1000,1000,50,0);
    feed_all(&scan,peaks,1000);
    CHECK(scan.phase==2 && scan.status==TS_OK && scan.count==4);
    CHECK(scan.starts[0]==0 && scan.starts[1]==198 && scan.starts[2]==498 && scan.starts[3]==798);
}
static void silence(void)
{
    int32_t peaks[200];
    struct ts_scan scan;
    uint32_t i;
    for(i=0;i<200;++i)peaks[i]=0;
    ts_scan_begin(&scan,0,200,44100,40,50);
    feed_all(&scan,peaks,200);
    CHECK(scan.status==TS_EMPTY && scan.count==0);
}
static void too_many(void)
{
    enum { N=7000 };
    static int32_t peaks[N];
    struct ts_scan scan;
    uint32_t i;
    for(i=0;i<N;++i)peaks[i]=0;
    for(i=0;i<64;++i)peaks[100u+i*100u]=1000;
    ts_scan_begin(&scan,0,N,1000,40,0);
    feed_all(&scan,peaks,N);
    CHECK(scan.status==TS_TOO_MANY);
}
static void within_limit(void)
{
    enum { N=7000 };
    static int32_t peaks[N];
    struct ts_scan scan;
    uint32_t i;
    for(i=0;i<N;++i)peaks[i]=0;
    for(i=0;i<63;++i)peaks[100u+i*100u]=1000;
    ts_scan_begin(&scan,0,N,1000,40,0);
    feed_all(&scan,peaks,N);
    CHECK(scan.status==TS_OK && scan.count==64);
}
static void held(void)
{
    int32_t peaks[400];
    struct ts_scan scan;
    uint32_t i;
    for(i=0;i<400;++i)peaks[i]=0;
    for(i=150;i<180;++i)peaks[i]=1000;
    peaks[300]=1000;
    ts_scan_begin(&scan,0,400,1000,50,0);
    feed_all(&scan,peaks,400);
    CHECK(scan.status==TS_OK && scan.count==3);
    CHECK(scan.starts[1]==148 && scan.starts[2]==298);
}
static void short_trim(void)
{
    struct ts_scan scan;
    ts_scan_begin(&scan,0,40,44100,40,50);
    CHECK(scan.status==TS_SHORT && ts_scan_feed(&scan,0,0,0)==1);
}
/* A rectified tone: each half-cycle falls to zero. One burst is one slice. */
static void tone_burst(void)
{
    enum { N=12000 };
    static int32_t peaks[N];
    struct ts_scan scan;
    uint32_t i;
    for(i=0;i<N;++i)peaks[i]=0;
    for(i=3000;i<9000;++i) {
        uint32_t pos=(i-3000u)%200u;
        if(pos>=100u)pos-=100u;
        peaks[i]=(int32_t)(pos*(100u-pos)*4u);
    }
    ts_scan_begin(&scan,0,N,44100,40,10);
    feed_all(&scan,peaks,N);
    CHECK(scan.status==TS_OK && scan.count==2);
    CHECK(scan.starts[1]>3000u-200u && scan.starts[1]<3200u);
}
int main(void)
{
    spikes();silence();too_many();within_limit();held();short_trim();tone_burst();
    if(fail)return 1;
    puts("PASS: threshold scan");
    return 0;
}
