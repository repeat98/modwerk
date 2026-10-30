/* SPDX-License-Identifier: MIT */
#include "menu_owner.h"
int bs_menu_owner_published_locked(const struct runtime_owner *owner) {
    if(!owner || !modwerk_runtime_owner_valid(owner))return 0;
    for(unsigned i=0;i<RUNTIME_MODULES;++i) {
        const struct runtime_module *m=modwerk_runtime_module(i);
        if(m && (uintptr_t)m==owner->owned_extent)return 1;
    }
    return 0;
}
int bs_menu_owner_bind_locked(struct bs_menu_owner_lease *lease,const struct runtime_owner *owner) {
    if(!lease || lease->state!=BS_MENU_OWNER_EMPTY || !bs_menu_owner_published_locked(owner))return 0;
    /* Field copies avoid a compiler-generated C-library memcpy on ColdFire. */
#define COPY(field) lease->owner.field=owner->field
    COPY(generation);COPY(module);COPY(owned_extent);COPY(extent_bytes);
    COPY(image_offset);COPY(image_bytes);
#undef COPY
    for(unsigned i=0;i<MU_DIGEST_BYTES;++i) {
        lease->owner.package_sha256[i]=owner->package_sha256[i];
        lease->owner.controller_sha256[i]=owner->controller_sha256[i];
    }
    lease->state=BS_MENU_OWNER_LIVE;return 1;
}
int bs_menu_owner_current_locked(struct bs_menu_owner_lease *lease) {
    if(!lease || lease->state!=BS_MENU_OWNER_LIVE)return 0;
    if(bs_menu_owner_published_locked(&lease->owner))return 1;
    lease->state=BS_MENU_OWNER_RETIRED;return 0;
}
void bs_menu_owner_retire_locked(struct bs_menu_owner_lease *lease) {
    if(lease && lease->state==BS_MENU_OWNER_LIVE)lease->state=BS_MENU_OWNER_RETIRED;
}
