/* SPDX-License-Identifier: MIT */
#include "ui_text.h"
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
static int equal(const char *a, const char *b) {
    while (*a && *a == *b) { ++a; ++b; }
    return *a == *b;
}
static uint32_t length(const char *s) { uint32_t n=0; while (s[n]) ++n; return n; }
static uint32_t decimal(const char **at) {
    uint32_t n=0;
    while (**at >= '0' && **at <= '9') { n=n*10+(uint32_t)(**at-'0'); ++*at; }
    return n;
}
int bs_ui_text_selftest(void) {
    char out[BS_UI_LABEL_BYTES];
    for (uint32_t plural=0; plural<2; ++plural) {
        for (uint32_t value=720; value<=7200; ++value) {
            CHECK(bs_ui_plan_label(out, sizeof out, plural ? 64 : 1, value));
            const char *at = out + (plural ? 11 : 9);
            uint32_t whole = decimal(&at);
            CHECK(*at++ == '.');
            uint32_t fraction = decimal(&at);
            CHECK(equal(at," BPM") && whole*100+fraction == (value*25+3)/6);
            CHECK(length(out) <= 21);
        }
    }
    CHECK(bs_ui_plan_label(out, sizeof out, 2, 2886) && equal(out,"2 SLICES: 120.25 BPM"));
    CHECK(bs_ui_plan_label(out, sizeof out, 1, 2880) && equal(out,"1 SLICE: 120.00 BPM"));
    CHECK(bs_ui_plan_label(out, sizeof out, 64, 7200) && equal(out,"64 SLICES: 300.00 BPM"));
    for (uint32_t old=0; old<=64; ++old) {
        for (uint32_t added=0; added<=64-old; ++added) {
            CHECK(bs_ui_counts_label(out, sizeof out, old, added));
            const char *at=out+10;
            CHECK(decimal(&at)==old && at[0]==' ' && at[1]=='N' && at[2]=='E' && at[3]=='W' && at[4]==':' && at[5]==' ');
            at+=6; CHECK(decimal(&at)==added && !*at);
            CHECK(length(out)<=21);
        }
    }
    /* Every short capacity refuses without modifying any byte or canary. */
    for (uint32_t cap=0; cap<32; ++cap) {
        char box[34]; for (uint32_t i=0;i<34;++i) box[i]='!';
        int ok=bs_ui_plan_label(box+1,cap,64,7200);
        CHECK(ok == (cap > 21));
        CHECK(box[0]=='!' && box[33]=='!');
        if (!ok) for (uint32_t i=0;i<34;++i) CHECK(box[i]=='!');
        else { CHECK(equal(box+1,"64 SLICES: 300.00 BPM")); for (uint32_t i=23;i<34;++i) CHECK(box[i]=='!'); }
    }
    for (uint32_t i=0;i<sizeof out;++i) out[i]='!';
    CHECK(!bs_ui_plan_label(out,sizeof out,1,719));
    CHECK(!bs_ui_plan_label(out,sizeof out,1,7201));
    CHECK(!bs_ui_plan_label(out,sizeof out,65,2880));
    CHECK(!bs_ui_counts_label(out,sizeof out,64,1));
    CHECK(!bs_ui_counts_label(out,sizeof out,0,UINT32_MAX));
    CHECK(!bs_ui_counts_label(out,sizeof out,UINT32_MAX,0));
    CHECK(!bs_ui_plan_label(0,32,1,2880));
    for (uint32_t i=0;i<sizeof out;++i) CHECK(out[i]=='!');
    return 0;
}
