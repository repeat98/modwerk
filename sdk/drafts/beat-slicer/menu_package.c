/* SPDX-License-Identifier: MIT */
#include "menu_package.h"
static uint32_t word(const uint8_t *p) {
    return (uint32_t)p[0]<<24 | (uint32_t)p[1]<<16 | (uint32_t)p[2]<<8 | p[3];
}
static int image_base(const struct runtime_owner *o, uintptr_t *base) {
    if(o->image_offset>o->extent_bytes || o->image_bytes>o->extent_bytes-o->image_offset ||
       o->owned_extent>UINTPTR_MAX-o->extent_bytes)return 0;
    *base=o->owned_extent+o->image_offset;return 1;
}
int bs_menu_package_bind_locked(struct bs_menu_package_action *out,
    const struct runtime_owner *owner,uint32_t offset) {
    uintptr_t base;
    uint32_t entry,key,action;
    if(!out || out->lease.state!=BS_MENU_OWNER_EMPTY || !owner ||
       !bs_menu_owner_published_locked(owner) || !image_base(owner,&base) ||
       (offset&3u) || offset<8u || offset>owner->image_bytes ||
       BS_MENU_PACKAGE_BYTES>owner->image_bytes-offset)return 0;
    /* Validate and publish the same bounded copy. The loader lock pins the
     * image, but the caller must ALSO exclude module-side metadata writers
     * during this copy; loader stability alone is not data coherence. */
    uint8_t bytes[BS_MENU_PACKAGE_BYTES];
    const uint8_t *source=(const uint8_t *)(base+offset),*p=bytes;
    for(unsigned i=0;i<BS_MENU_PACKAGE_BYTES;++i)bytes[i]=source[i];
    if(word(p)!=1u || word(p+4)!=BS_MENU_PACKAGE_BYTES || word(p+20) ||
       word(p+56) || word(p+60))return 0;
    key=word(p+8);action=word(p+12);entry=word(p+16);
    if(!key || !action || (entry&1u) || entry<8u || entry>owner->image_bytes ||
       2u>owner->image_bytes-entry ||
       (entry<offset+BS_MENU_PACKAGE_BYTES && entry+2u>offset))return 0;
    unsigned end=0;
    while(end<BS_MENU_LABEL_BYTES && p[24+end]) {
        if(p[24+end]<32u || p[24+end]>126u)return 0;
        ++end;
    }
    if(!end || end==BS_MENU_LABEL_BYTES)return 0;
    for(unsigned i=end;i<BS_MENU_LABEL_BYTES;++i)if(p[24+i])return 0;
    /* All fallible parsing precedes the one-time lease publication. The caller
     * owns serialization; no module callback or yielding reader runs here. */
    if(!bs_menu_owner_bind_locked(&out->lease,owner))return 0;
    out->key=key;out->action=action;out->entry_offset=entry;
    for(unsigned i=0;i<BS_MENU_LABEL_BYTES;++i)out->label[i]=(char)p[24+i];
    return 1;
}
int bs_menu_package_view_locked(struct bs_menu_package_action *binding,bs_menu_action *out) {
    if(!binding || !out || !bs_menu_owner_current_locked(&binding->lease))return 0;
    out->key=binding->key;out->action=binding->action;
    out->owner.module=binding->lease.owner.module;
    out->owner.generation=binding->lease.owner.generation;
    out->label=binding->label;return 1;
}
int bs_menu_package_entry_locked(struct bs_menu_package_action *binding,uint32_t action,
    uintptr_t *entry) {
    uintptr_t base;
    if(!binding || !entry || action!=binding->action ||
       !bs_menu_owner_current_locked(&binding->lease) || !image_base(&binding->lease.owner,&base))return 0;
    *entry=base+binding->entry_offset;return 1;
}
