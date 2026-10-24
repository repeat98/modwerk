/* SPDX-License-Identifier: MIT */
#include "flex_metadata.h"
#include "edit_candidate.h"
#include <stddef.h>
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
static uint32_t controls[128*11], settings[128*274];
static uint32_t ready, kind, selected, bpm;
static struct bs_flex_metadata_binding binding;
static struct bs_source_lifetime identity;
static struct bs_source_snapshot snapshot;
static struct bs_marker_table table;

static void fill(void *p, uint32_t n, uint8_t value) {
    for (uint32_t i=0;i<n;++i) ((uint8_t *)p)[i]=value;
}
static int filled(const void *p, uint32_t n, uint8_t value) {
    for (uint32_t i=0;i<n;++i) if (((const uint8_t *)p)[i]!=value) return 0;
    return 1;
}
static void setup(uint32_t slot, uint32_t format, uint32_t count) {
    binding.ready=&ready; binding.controls=controls; binding.settings=settings;
    binding.editor_kind=&kind; binding.editor_slot=&selected; binding.project_bpm24=&bpm;
    binding.control_words=128*11; binding.setting_words=128*274;
    ready=1; kind=1; selected=slot; bpm=2166;
    identity.owner_id=17; identity.owner_generation=19; identity.sample_id=23;
    identity.sample_generation=29; identity.editor_generation=31; identity.playback_generation=37;
    identity.slot=slot;
    for (uint32_t i=0;i<11;++i) controls[slot*11+i]=i*73+slot;
    for (uint32_t i=0;i<274;++i) settings[slot*274+i]=0x81234567u+i*31+slot;
    controls[slot*11]=format; controls[slot*11+2]=0; controls[slot*11+4]=44100;
    settings[slot*274+69]=2886;
    settings[slot*274+75]=64; settings[slot*274+76]=44000; settings[slot*274+77]=128;
    settings[slot*274+273]=count;
    /* Active rows use valid non-overlapping spans; inactive bytes stay distinct. */
    for (uint32_t i=0;i<count;++i) {
        settings[slot*274+78+i*3]=64+i*600;
        settings[slot*274+79+i*3]=664+i*600;
        settings[slot*274+80+i*3]=i%2?0xffffffffu:64+i*600;
    }
}
static uint32_t hash(uint32_t slot) {
    uint32_t h=2166136261u;
    for (uint32_t i=0;i<11;++i) h=(h^controls[slot*11+i])*16777619u;
    for (uint32_t i=0;i<274;++i) h=(h^settings[slot*274+i])*16777619u;
    return h;
}
static int cases(void) {
    const uint32_t counts[3]={0,1,64};
    for (uint32_t slot=0;slot<128;++slot) for (uint32_t format=0;format<4;++format)
    for (uint32_t n=0;n<3;++n) {
        setup(slot,format,counts[n]); uint32_t before=hash(slot);
        CHECK(bs_flex_snapshot_locked(&binding,&identity,&snapshot)==BS_PROVIDER_READY);
        CHECK(bs_flex_markers_locked(&binding,&identity,&table)==BS_PROVIDER_READY);
        CHECK(snapshot.owner_id==17 && snapshot.owner_generation==19 && snapshot.sample_id==23 &&
              snapshot.sample_generation==29 && snapshot.editor_generation==31 && snapshot.playback_generation==37);
        CHECK(snapshot.kind==BS_SOURCE_FLEX && snapshot.slot==slot && snapshot.frames==44100 && snapshot.sample_rate==44100);
        CHECK(snapshot.format.bits==(format&2?16u:24u) && snapshot.format.channels==(format&1?2u:1u) && !snapshot.format.little_endian);
        CHECK(snapshot.trim_start==64 && snapshot.trim_end==44000 && snapshot.loop==128 &&
              snapshot.sample_bpm24==2886 && snapshot.project_bpm24==2166 && snapshot.marker_count==counts[n] && table.count==counts[n]);
        for (uint32_t i=0;i<64;++i) {
            CHECK(snapshot.markers[i].start==settings[slot*274+78+i*3]);
            CHECK(snapshot.markers[i].end==settings[slot*274+79+i*3]);
            CHECK(snapshot.markers[i].loop==settings[slot*274+80+i*3]);
            CHECK(table.records[i].start==snapshot.markers[i].start && table.records[i].end==snapshot.markers[i].end &&
                  table.records[i].loop==snapshot.markers[i].loop);
        }
        CHECK(hash(slot)==before);
    }
    /* No silent tempo substitution, including a missing unselected source. */
    setup(0,3,1); settings[69]=0;
    CHECK(bs_flex_snapshot_locked(&binding,&identity,&snapshot)==BS_PROVIDER_READY && !snapshot.sample_bpm24 && snapshot.project_bpm24==2166);
    settings[69]=2886; bpm=0;
    CHECK(bs_flex_snapshot_locked(&binding,&identity,&snapshot)==BS_PROVIDER_READY && snapshot.sample_bpm24==2886 && !snapshot.project_bpm24);
    return 0;
}
static int refusals(void) {
    for (uint32_t mode=0;mode<39;++mode) {
        setup(127,3,64);
        const struct bs_flex_metadata_binding *b=&binding;
        const struct bs_source_lifetime *id=&identity;
        switch (mode) {
        case 0:b=0;break; case 1:id=0;break;
        case 2:identity.owner_id=0;break; case 3:identity.owner_generation=0;break;
        case 4:identity.sample_id=0;break; case 5:identity.sample_generation=0;break;
        case 6:identity.editor_generation=0;break; case 7:identity.playback_generation=0;break;
        case 8:identity.slot=128;break;
        case 9:binding.ready=0;break; case 10:binding.controls=0;break; case 11:binding.settings=0;break;
        case 12:binding.editor_kind=0;break; case 13:binding.editor_slot=0;break; case 14:binding.project_bpm24=0;break;
        case 15:binding.ready=(const volatile uint32_t *)((uintptr_t)&ready+1);break;
        case 16:binding.controls=(const volatile uint32_t *)((uintptr_t)controls+1);break;
        case 17:binding.settings=(const volatile uint32_t *)((uintptr_t)settings+1);break;
        case 18:binding.editor_kind=(const volatile uint32_t *)((uintptr_t)&kind+1);break;
        case 19:binding.editor_slot=(const volatile uint32_t *)((uintptr_t)&selected+1);break;
        case 20:binding.project_bpm24=(const volatile uint32_t *)((uintptr_t)&bpm+1);break;
        case 21:--binding.control_words;break; case 22:--binding.setting_words;break;
        case 23:ready=0;break; case 24:kind=0;break; case 25:kind=2;break; case 26:selected=126;break;
        case 27:controls[127*11]=4;break; case 28:controls[127*11+2]=1;break;
        case 29:controls[127*11+4]=0;break; case 30:controls[127*11+4]=0x80000000u;break;
        case 31:settings[127*274+75]=44000;break; case 32:settings[127*274+76]=44101;break;
        case 33:settings[127*274+273]=65;break;
        case 34:binding.controls=(const volatile uint32_t *)(UINTPTR_MAX-3u);break;
        case 35:binding.settings=(const volatile uint32_t *)(UINTPTR_MAX-3u);break;
        case 36:settings[127*274+75]=0xffffffffu;break;
        case 37:selected=128;break; case 38:settings[127*274+76]=0;break;
        }
        fill(&snapshot,sizeof(snapshot),0xa5); fill(&table,sizeof(table),0x5a);
        CHECK(bs_flex_snapshot_locked(b,id,&snapshot)==BS_PROVIDER_UNSUPPORTED);
        CHECK(bs_flex_markers_locked(b,id,&table)==BS_PROVIDER_UNSUPPORTED);
        CHECK(filled(&snapshot,sizeof(snapshot),0xa5) && filled(&table,sizeof(table),0x5a));
    }
    setup(0,0,0);
    CHECK(bs_flex_snapshot_locked(&binding,&identity,0)==BS_PROVIDER_UNSUPPORTED);
    CHECK(bs_flex_markers_locked(&binding,&identity,0)==BS_PROVIDER_UNSUPPORTED);
    return 0;
}
/* Integration uses this decoder as the actual session/candidate callback.
 * PCM and ownership are synthetic; no native writer exclusion is claimed. */
static struct bs_preview_guard guard;
static struct bs_preview_session session;
static struct bs_edit_candidate candidate;
static struct bs_marker_edit edit;
static struct bs_plan plan;
static uint32_t held, bad;
static int lock(void *context) {
    (void)context; if (held) { bad=1; return 0; } held=1; return 1;
}
static void unlock(void *context) { (void)context; if (!held) bad=1; held=0; }
static enum bs_provider_reply capture(void *context, struct bs_source_snapshot *out) {
    (void)context; if (!held) { bad=1; return BS_PROVIDER_FAILED; }
    return bs_flex_snapshot_locked(&binding,&identity,out);
}
static enum bs_provider_reply markers(void *context, const struct bs_source_snapshot *source, struct bs_marker_table *out) {
    (void)context;
    if (!held || source->slot!=identity.slot) { bad=1; return BS_PROVIDER_FAILED; }
    return bs_flex_markers_locked(&binding,&identity,out);
}
static enum bs_provider_reply pcm(void *context, const struct bs_source_snapshot *source,
        const struct bs_pcm_read *request, uint8_t *out, uint32_t capacity, uint32_t *bytes) {
    (void)context;
    uint32_t n=request->count*source->format.bits/8*source->format.channels;
    if (!held || n>capacity || request->first>=source->frames || request->count>source->frames-request->first) {
        bad=1; return BS_PROVIDER_FAILED;
    }
    fill(out,n,0); *bytes=n; return BS_PROVIDER_READY;
}
static const struct bs_preview_backend backend={lock,unlock,capture,pcm};
static int preview(uint32_t source) {
    const struct bs_preview_options options={1,0,source};
    held=bad=0; bs_guard_init(&guard); CHECK(bs_guard_enable(&guard));
    bs_session_init(&session,&guard,&backend,0); bs_candidate_init(&candidate);
    enum bs_session_state state=bs_session_begin(&session,&options);
    uint32_t n=0;
    while ((state==BS_SESSION_RUNNING || state==BS_SESSION_WAITING) && ++n<20000)
        state=bs_session_step(&session);
    CHECK(state==BS_SESSION_READY && bs_session_result(&session,&plan) && !held && !bad);
    CHECK(plan.bpm24==(source==BS_SAMPLE_BPM?2886u:2166u));
    return 0;
}
static int integration(void) {
    for (uint32_t source=0;source<2;++source) for (uint32_t mode=0;mode<20;++mode) {
        setup(0,3,1); int error=preview(source); if (error) return error;
        switch (mode) {
        case 0:if (source==BS_SAMPLE_BPM) ++settings[69]; else ++bpm;break;
        case 1:if (source==BS_SAMPLE_BPM) bpm=0; else settings[69]=0;break;
        case 2:++settings[75];break; case 3:++settings[77];break;
        case 4:++settings[79];break; case 5:++settings[80];break;
        case 6:controls[0]=2;break; case 7:++controls[4];break;
        case 8:++identity.owner_generation;break; case 9:++identity.sample_generation;break;
        case 10:++identity.editor_generation;break; case 11:++identity.playback_generation;break;
        case 12:++identity.sample_id;break;
        case 13:selected=1;break; case 14:ready=0;break; case 15:controls[2]=1;break;
        case 16:settings[273]=0;break; case 17:kind=0;break;
        case 18:settings[273]=65;break; case 19:settings[76]=44101;break;
        }
        CHECK(bs_session_result(&session,&plan)==(mode==1));
        CHECK(!held && !bad);
    }
    for (uint32_t source=0;source<2;++source) {
        setup(0,3,1); int error=preview(source); if (error) return error;
        CHECK(bs_candidate_begin(&candidate,&session,markers)==BS_CANDIDATE_READY);
        uint32_t token=candidate.token.operation;
        CHECK(bs_candidate_result(&candidate,token,&edit));
        settings[78+63*3]^=1; /* An inactive record changes after preparation. */
        CHECK(bs_session_result(&session,&plan));
        fill(&edit,sizeof(edit),0xa5);
        CHECK(!bs_candidate_result(&candidate,token,&edit) && candidate.state==BS_CANDIDATE_STALE);
        CHECK(filled(&edit,sizeof(edit),0xa5) && !held && !bad);
    }
    return 0;
}
int bs_metadata_selftest(void) {
    int error=cases(); if (error) return error;
    error=refusals(); return error?error:integration();
}
