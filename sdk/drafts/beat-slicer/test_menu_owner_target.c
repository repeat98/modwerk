/* SPDX-License-Identifier: MIT */
/* Compiled-helper execution with explicit synthetic loader answers. This does
 * not replace the separate tests against the real loader or qualify USB. */
#include "menu_owner.h"
#define CHECK(x) do { if(!(x))return __LINE__; } while(0)
static struct runtime_module first_image, other_image;
static const struct runtime_module *positions[RUNTIME_MODULES];
static struct runtime_owner expected;
static uint32_t intact, valid_calls, position_calls;
static int same(const struct runtime_owner *a,const struct runtime_owner *b) {
    if(a->generation!=b->generation || a->module!=b->module ||
       a->owned_extent!=b->owned_extent || a->extent_bytes!=b->extent_bytes ||
       a->image_offset!=b->image_offset || a->image_bytes!=b->image_bytes)return 0;
    for(unsigned i=0;i<MU_DIGEST_BYTES;++i)
        if(a->package_sha256[i]!=b->package_sha256[i] ||
           a->controller_sha256[i]!=b->controller_sha256[i])return 0;
    return 1;
}
int modwerk_runtime_owner_valid(const struct runtime_owner *o) {
    ++valid_calls;return intact && o && same(o,&expected);
}
const struct runtime_module *modwerk_runtime_module(unsigned i) {
    ++position_calls;return i<RUNTIME_MODULES?positions[i]:0;
}
static void clear(void *p,unsigned n) {
    uint8_t *b=p;for(unsigned i=0;i<n;++i)b[i]=0;
}
static int untouched(const void *p,unsigned n) {
    const uint8_t *b=p;for(unsigned i=0;i<n;++i)if(b[i])return 0;return 1;
}
static void fill(struct runtime_owner *o,unsigned serial) {
    o->generation=0x81234500u+serial;o->module=0x92345678u;
    o->owned_extent=(uintptr_t)&first_image;o->extent_bytes=0x12340;
    o->image_offset=0x234;o->image_bytes=0x5678;
    for(unsigned i=0;i<MU_DIGEST_BYTES;++i) {
        o->package_sha256[i]=(uint8_t)(i*7u+serial);
        o->controller_sha256[i]=(uint8_t)(i*13u+serial+1u);
    }
}
int bs_owner_target_selftest(void) {
    struct { uint32_t left;struct bs_menu_owner_lease lease;uint32_t right; } guarded;
    struct runtime_owner input;
    for(unsigned pos=0;pos<RUNTIME_MODULES;++pos) {
        clear(positions,sizeof positions);clear(&guarded,sizeof guarded);
        guarded.left=0x11223344u;guarded.right=0xaabbccddu;
        fill(&input,pos);fill(&expected,pos);intact=0;valid_calls=position_calls=0;
        CHECK(!bs_menu_owner_published_locked(0) && !valid_calls && !position_calls);
        CHECK(!bs_menu_owner_bind_locked(0,&input));
        CHECK(!bs_menu_owner_current_locked(0));bs_menu_owner_retire_locked(0);
        CHECK(!bs_menu_owner_bind_locked(&guarded.lease,&input));
        CHECK(valid_calls==1 && !position_calls && untouched(&guarded.lease,sizeof guarded.lease));
        intact=1;valid_calls=position_calls=0;
        CHECK(!bs_menu_owner_bind_locked(&guarded.lease,&input));
        CHECK(valid_calls==1 && position_calls==RUNTIME_MODULES && untouched(&guarded.lease,sizeof guarded.lease));
        positions[pos]=&first_image;valid_calls=position_calls=0;
        CHECK(bs_menu_owner_bind_locked(&guarded.lease,&input));
        CHECK(valid_calls==1 && position_calls==pos+1 && same(&guarded.lease.owner,&input));
        CHECK(guarded.lease.state==BS_MENU_OWNER_LIVE);
        /* The caller's original record may disappear after its full value was
         * copied. Every native-sized field and all digest bytes must survive. */
        clear(&input,sizeof input);
        CHECK(bs_menu_owner_current_locked(&guarded.lease));
        CHECK(!bs_menu_owner_bind_locked(&guarded.lease,&expected));
        CHECK(same(&guarded.lease.owner,&expected));
        if(pos%3u==0)intact=0;
        else if(pos%3u==1)positions[pos]=&other_image;
        else bs_menu_owner_retire_locked(&guarded.lease);
        CHECK(!bs_menu_owner_current_locked(&guarded.lease));
        CHECK(guarded.lease.state==BS_MENU_OWNER_RETIRED);
        intact=1;positions[pos]=&first_image;valid_calls=position_calls=0;
        CHECK(!bs_menu_owner_current_locked(&guarded.lease));
        CHECK(!bs_menu_owner_bind_locked(&guarded.lease,&expected));
        bs_menu_owner_retire_locked(&guarded.lease);
        CHECK(!valid_calls && !position_calls && same(&guarded.lease.owner,&expected));
        CHECK(guarded.left==0x11223344u && guarded.right==0xaabbccddu);
    }
    return 0;
}
