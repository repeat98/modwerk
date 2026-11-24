/* SPDX-License-Identifier: MIT
 * Emulator-only core: stock bank/Part storage owns channels.
 * Include the unchanged checkpoint implementation, replacing only its service.
 */
#define mm_profile_service mm_profile_legacy_service
#include "../profile.c"
#undef mm_profile_service

unsigned mm_template_clone_count;
unsigned mm_template_clone_failed;

void mm_profile_service(void) {
    pending_wake=0;
    if(!mm_profile_gate())return;
    char current[260];
    if(!mm_profile_directory(current,sizeof current))return;
    unsigned n=0;while(current[n]&&n<sizeof current-1)++n;
    if(current[n]||!n)return;
    if(!loaded||!equal(current,directory,n+1)) {
        copy(directory,current,n+1);load();++revision;
        redraw=1;
    }
    if(dirty)save();
}

/* Called only after the confirmed stopped engine Save to New operation.
 * The private fixture supplies that boundary. No folder polling calls this.
 */
int mm_template_destination_created(const char *source_directory) {
    char current[260],previous[260],file[260];uint8_t data[MM_PROFILE_BYTES];
    if(!loaded||!mm_profile_directory(current,sizeof current))return 0;
    if(!source_directory)return 0;
    unsigned source_n=0;while(source_directory[source_n]&&source_n<sizeof directory-1)++source_n;
    if(!source_n||source_directory[source_n]||!equal(source_directory,directory,source_n+1))return 0;
    unsigned n=0;while(current[n]&&n<sizeof current-1)++n;
    if(!n||current[n]||equal(current,directory,n+1))return 0;
    copy(previous,directory,sizeof previous);
    copy(directory,current,n+1);
    /* A supposedly new destination must not already own extension files. */
    for(unsigned slot=0;slot<2;slot++)if(!path(file,slot,0)||mm_profile_file(0,file,data,sizeof data)!=0) {
        copy(directory,previous,sizeof previous);
        ++mm_template_clone_failed;announce(3);return -1;
    }
    generation=0;peer=0;dirty=1;++revision;
    save();
    if(dirty){++mm_template_clone_failed;return -1;}
    dirty=1;save();
    if(dirty){++mm_template_clone_failed;return -1;}
    ++mm_template_clone_count;redraw=1;return 1;
}
