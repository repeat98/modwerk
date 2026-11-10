# SPDX-License-Identifier: GPL-3.0-or-later
"""Private frame-driver metadata and exact generated-transport seams.

This does not alter the preserved upstream sources or admit runtime modules.
Apply transport() only after build_core's existing DSP/width substitutions.
"""


def controller_c(prepared):
    lines = ['#include "stock_hook_driver.h"']
    declared = set()
    for row in prepared['receipt']:
        tag = row['tag']
        for fragment in row['packedFragments']:
            symbol = fragment['symbol']
            if symbol not in declared:
                lines.append('extern const uint8_t %s[], %s_end[];' % (symbol, symbol))
                declared.add(symbol)
        lines += ['static const struct mw_hook_fragment fragments_%s[] = {' % tag] + [
            '{%s,%s_end,%du},' % (f['symbol'], f['symbol'], f['authoredBytes']) for f in row['packedFragments']] + ['};']
        lines += ['static const struct mw_hook_record records_%s[] = {' % tag] + [
            '{%du,%su,%du,%du},' % (1 if r['space'] == 'x' else 2, r['address'], r['words'], r['owner'])
            for r in row['records']] + ['};']
    lines += ['const struct mw_hook_boot_core modwerk_hook_boot[2] = {'] + [
        '{fragments_%s,records_%s,%du,%du,%du},' % (r['tag'], r['tag'], len(r['packedFragments']), len(r['records']), r['authoredBytes'])
        for r in prepared['receipt']] + ['};']
    return '\n'.join(lines) + '\n'


def transport(text):
    """Closed op10 CAS and op11 fixed-resource reset, using real frame jobs."""
    def change(old, new):
        nonlocal text
        if text.count(old) != 1:
            raise ValueError('Generated resident transport seam changed: ' + old[:70])
        text = text.replace(old, new)
    change('op!=DL_BASE && op!=DL_PEEK)) return 0;',
           'op!=DL_BASE && op!=DL_PEEK && op!=10u)) return 0;\n'
           '    if(op==10u && (id&~(c ? 13u:15u) || init&~(c ? 13u:15u) || proc)) return 0;')
    change('opcode==DL_BASE || opcode==DL_PEEK || opcode==DL_SUM) {',
           'opcode==DL_BASE || opcode==DL_PEEK || opcode==DL_SUM || opcode==10u) {')
    change('        if(opcode==DL_WRITE) {', '        if(opcode==DL_WRITE || opcode==11u) {')
    # A reset job carries up to DL_RESET_DATA words, one packet a frame, each packet's offset its own (as a WRITE's).
    change('                    else if(jobs[c].opcode==DL_WRITE) {',
           '                    else if(jobs[c].opcode==DL_WRITE || jobs[c].opcode==11u) {')
    change('            t[7]=(uint16_t)j->expected; t[56]=(uint16_t)(j->expected>>16);',
           '            t[7]=(uint16_t)(opcode==11u ? j->id:j->expected); t[56]=(uint16_t)(j->expected>>16);')
    change('int dl_job_status(unsigned c) {', '''/* Fixed feature/logical-offset upload; the DSP maps its owned ranges independently. */
int dl_hook_reset_start(unsigned c,unsigned feature,unsigned offset,unsigned count,const uint32_t *words) {
    unsigned total=@TOTAL@;
    unsigned end=@END@; /* the end of the owned range offset is in: one range per chunk */
    if(c>1 || jobs[c].state || !total || (c && feature==2u) || !words || !count || count>DL_RESET_DATA ||
       offset>=total || count>total-offset || end<=offset || count>end-offset) return 0;
    for(unsigned i=0;i<count;++i) if(words[i]>0xffffffu) return 0;
    jobs[c].upload.words=words; jobs[c].upload.relocations=0; jobs[c].upload.relocation_count=0;
    jobs[c].upload.count=(uint16_t)count; jobs[c].upload.offset=(uint16_t)offset;
    jobs[c].position=0; jobs[c].opcode=11u; jobs[c].id=(uint16_t)feature;
    publish(); jobs[c].state=1; return 1;
}
int dl_job_status(unsigned c) {''')
    # The reset totals and range ends are the ledger's (dsp-sites.json; dsp_sites.py --check proves them).
    sites, reg = _ledger()
    totals, _ = sites.reset_words(reg)
    text = text.replace('@TOTAL@', ' : '.join('feature==%du ? %du' % (f, n) for f, n in totals.items()) + ' : 0u', 1)
    text = text.replace('@END@', sites.reset_end_expression(reg, 'feature', 'offset'), 1)
    return owned_transport(text)


def _ledger():
    import importlib.util
    from pathlib import Path
    spec = importlib.util.spec_from_file_location('dsp_sites_ledger', Path(__file__).resolve().parents[1] / 'dsp_sites.py')
    sites = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sites)
    return sites, sites.load()


OWNED_HEADER = '''
#ifndef DL_OWNED_TRANSFER
#define DL_OWNED_TRANSFER
/* Engine-only: call reserve/submit/poll/release under the loader's stable lock. The
 * generation comes from its owned-image ledger. No caller supplies a ticket
 * or wire sequence. Uploaded arrays must remain immutable through release.
 * The private receiver signals HF2/HF3, not a returned sequence. A timeout,
 * abort, failed owned job or any global wire wrap closes owned reservations
 * until cold initialization; an answered legacy refusal (HF3: a PEEK 1 bit, a
 * SUM mismatch) does not. This API does not qualify a hardware ACK. */
struct dl_owned_job {
    uint32_t generation, ticket;
    uint16_t first_sequence, last_sequence, offset, count, id, init, proc;
    uint8_t core, opcode;
};
typedef char dl_owned_receipt_has_no_padding[(sizeof(struct dl_owned_job)==24)?1:-1];
struct dl_owned_progress { uint16_t sent_sequence, acknowledged_sequence; };
int dl_owned_command_reserve(unsigned core,uint32_t generation,unsigned opcode,
    unsigned id,unsigned init,unsigned proc,struct dl_owned_job *);
int dl_owned_upload_reserve(unsigned core,uint32_t generation,const struct dl_upload *,struct dl_owned_job *);
int dl_owned_reset_reserve(unsigned core,uint32_t generation,unsigned feature,unsigned offset,
    unsigned count,const uint32_t *words,struct dl_owned_job *);
/* The words one reset job carries: up to eight packets, one a frame (about 3 ms), never past one owned range. A
 * controller's 3,776-word reset is 20 board ticks, not 158 (2.6 s) at one packet a tick. */
#define DL_RESET_DATA (8u*DL_DATA)
/* Reserve consumes ticket/sequence and holds the sole core slot without any
 * transmission. Submit is the registry backend's exact start callback.
 * Cancel is valid only before submit; consumed identities are never reused. */
int dl_owned_submit(const struct dl_owned_job *);
int dl_owned_cancel(const struct dl_owned_job *);
/* 0 pending, 1 complete, -1 failed/uncertain, -2 stale/unowned. */
int dl_owned_job_poll(const struct dl_owned_job *,struct dl_owned_progress *);
/* Exactly 1 only after terminal state and exact owned identity; no pending
 * abandonment. Release of failed storage never proves controller retirement. */
int dl_owned_job_release(const struct dl_owned_job *);
/* Board uncertainty may only close this boot's owned core; never reopen it. */
void dl_owned_fail_closed(unsigned core);
/* Whole-transport journal lease (resident_journal.py). Acquire checks both slots,
 * pending packets and queued probes/stages atomically. While held, every legacy
 * start refuses, queued probes/stages wait, and only owned reservations of this
 * generation proceed. Release needs the same generation and an idle transport. */
int dl_owned_lease_acquire(uint32_t generation);
int dl_owned_lease_release(uint32_t generation);
/* The ticket of the owned job holding core c (reserved, submitted or not yet released), 0 none. While one holds it,
 * a legacy start refuses and dl_job_status answers -2: the manager waits for it (resident_journal.py). */
uint32_t dl_owned_holder(unsigned core);
/* Whether this boot's owned channel to core c is closed (it never reopens): a board job there can never run. */
int dl_owned_closed(unsigned core);
#endif
'''


def transport_header(text):
    """Expose the engine API in the actual private copied transfer header."""
    if text.count('\n#endif\n') != 1:
        raise ValueError('Generated owned transport header seam changed')
    return text.replace('\n#endif\n', OWNED_HEADER + '\n#endif\n')


def owned_transport(text):
    """Bind the sole actual job slot, every packet and its storage lifetime.

    Legacy jobs retain their protocol. They cannot consume or release owned
    jobs. Reservations use the actual global per-core sequence including UI
    probes/stages; no sequence can be reused by an owned job after wrap.
    """
    def change(old, new):
        nonlocal text
        if text.count(old) != 1:
            raise ValueError('Generated owned transport seam changed: ' + old[:70])
        text = text.replace(old, new)
    # Keep the preserved upstream and existing exact DSP/WIDTH seams intact.
    # The fallback declarations also let legacy generated-source fixtures
    # compile without manufacturing a separate transport implementation.
    change('#include "selection.h"\n', '#include "selection.h"\n' + OWNED_HEADER)
    change('static struct job jobs[2]={0};', '''static struct job jobs[2]={0};
static struct dl_owned_job owned_jobs[2];
static uint32_t owned_ticket;
static uint8_t owned_closed[2];
/* Diagnostic only, never an ABI: the first path that closed each core (see owned_close callers). */
static uint8_t owned_close_why[2];
static uint16_t owned_sent[2];
static uint32_t owned_lease;
enum { OWNED_WHY_WRAP=1, OWNED_WHY_AGE=2, OWNED_WHY_ABORT=3, OWNED_WHY_POLL=4, OWNED_WHY_RELEASE=5, OWNED_WHY_BOARD=6 };
static void owned_close(unsigned c,unsigned why) {
    if(!owned_closed[c]) owned_close_why[c]=(uint8_t)why;
    owned_closed[c]=1;
}
''')
    # Share the real validation with reservations. Word/relocation validation
    # stays outside the short full interrupt mask used for the sole-slot claim.
    def validator(signature, mutation, name, arguments):
        start = text.index(signature)
        end = text.index(mutation, start)
        original = text[start:end]
        checked = original.replace(signature, 'static int ' + name + signature[signature.index('('):])
        checked = checked.replace('jobs[c].state || ', '')
        change(original, checked + '    return 1;\n}\n' + signature + '\n'
               '    if(c>1 || jobs[c].state || owned_lease || !' + name + '(' + arguments + ')) return 0;\n')
    validator('int dl_upload_start(unsigned c,const struct dl_upload *u) {',
              '    jobs[c].upload.words=u->words;', 'owned_upload_valid', 'c,u')
    validator('int dl_command_start(unsigned c,unsigned op,unsigned id,unsigned init,unsigned proc) {',
              '    jobs[c].opcode=op;', 'owned_command_valid', 'c,op,id,init,proc')
    validator('int dl_hook_reset_start(unsigned c,unsigned feature,unsigned offset,unsigned count,const uint32_t *words) {',
              '    jobs[c].upload.words=words;', 'owned_reset_valid', 'c,feature,offset,count,words')
    change('    unsigned state=jobs[c].state;',
           '    if(owned_jobs[c].ticket) return -2;\n    unsigned state=jobs[c].state;')
    # A legacy job in state 4 was either refused by an answer, which is a complete
    # HF2 round trip (every PEEK 1 bit and SUM mismatch ends so: the status page's
    # meter reads did, closing both cores at boot), or it timed out or was
    # aborted, and those close the owned core where they happen, below.
    change('    if(c<2 && jobs[c].state>=3) { publish(); jobs[c].state=0; }',
           '    if(c<2 && !owned_jobs[c].ticket && jobs[c].state>=3) { publish(); jobs[c].state=0; }')
    change('    if(++sequence[c]==0) ++sequence[c];',
           '    uint16_t wire_sequence;\n'
           '    if(owned_jobs[c].ticket) wire_sequence=owned_jobs[c].first_sequence+owned_sent[c]++;\n'
           '    else { if(++sequence[c]==0) { ++sequence[c]; owned_close(c,OWNED_WHY_WRAP); } wire_sequence=sequence[c]; }')
    change('t[1]=sequence[c];', 't[1]=wire_sequence;')
    change('+sequence[c]+c)&0xffffffu;', '+wire_sequence+c)&0xffffffu;')
    change('    pending[c]=sequence[c]; age[c]=0;', '    pending[c]=wire_sequence; age[c]=0;')
    change('            } else if(++age[c]>=64) {',
           '            } else if(++age[c]>=64) {\n                owned_close(c,OWNED_WHY_AGE);')
    # Timeouts and watchdog aborts stay uncertain with no owned job in flight: the ACK is
    # an unsequenced HF2 toggle, so a late toggle for the lost packet would read as the
    # ACK of the next owned packet sent before it arrived.
    change('    for(unsigned c=0;c<2;++c) if(pending[c] || jobs[c].state==2) {',
           '    for(unsigned c=0;c<2;++c) if(pending[c] || jobs[c].state==2) {\n        owned_close(c,OWNED_WHY_ABORT);')
    # The journal lease also holds the self-test's SUM and every queued probe/stage request.
    change('    if(c>1 || jobs[c].state || !count || count>256 ||', '    if(c>1 || jobs[c].state || owned_lease || !count || count>256 ||')
    change('    if(dl_request_probe!=requests && !pending[0]', '    if(dl_request_probe!=requests && !owned_lease && !pending[0]')
    change('    if(dl_request_stage!=stages && !pending[0]', '    if(dl_request_stage!=stages && !owned_lease && !pending[0]')
    # One-word development probes deliberately alter the upload protocol.
    # They cannot confer owned lifetime readiness for the normal receiver.
    disabled = '1' if 'if(n>1) n=1;' in text else '0'
    text += '\n#define DL_OWNED_DISABLED ' + disabled + '\n' + '''
#ifdef DL_OWNED_ADVERSARIAL
extern void dl_owned_test_boundary(unsigned);
#define OWNED_BOUNDARY(n) dl_owned_test_boundary(n)
#else
#define OWNED_BOUNDARY(n) ((void)0)
#endif
static uint16_t owned_mask(void) {
    uint16_t saved=0;
    OWNED_BOUNDARY(0);
#ifndef DL_NATIVE_TEST
    __asm__ volatile("move.w %%sr,%0\\n\\tmove.w #0x2700,%%sr" : "=d"(saved) :: "memory","cc");
#endif
    OWNED_BOUNDARY(1);
    return saved;
}
static void owned_restore(uint16_t saved) {
    OWNED_BOUNDARY(2);
#ifndef DL_NATIVE_TEST
    __asm__ volatile("move.w %0,%%sr" :: "d"(saved) : "memory","cc");
#else
    (void)saved;
#endif
    OWNED_BOUNDARY(3);
}
static int owned_reserve(unsigned c,uint32_t generation,unsigned op,unsigned id,unsigned init,unsigned proc,
        const struct dl_upload *u,struct dl_owned_job *out) {
    unsigned packets=u ? (u->count+DL_DATA-1u)/DL_DATA : 1;
    if(DL_OWNED_DISABLED || c>1 || !generation || !out || !packets) return 0;
    uint16_t saved=owned_mask();
    if(jobs[c].state || pending[c] || owned_jobs[c].ticket || owned_closed[c] || (owned_lease && generation!=owned_lease) ||
       owned_ticket==UINT32_MAX || packets>65535u-sequence[c]) { owned_restore(saved); return 0; }
    /* Level 7 only for this bounded claim, not validation or payload copying.
     * State 5 prevents frame/probe producers while immutable fields fill. */
    jobs[c].state=5;
    struct dl_owned_job *v=&owned_jobs[c];
    v->generation=generation; v->ticket=++owned_ticket;
    v->first_sequence=sequence[c]+1u; v->last_sequence=sequence[c]+packets;
    sequence[c]=v->last_sequence; owned_sent[c]=0;
    publish(); owned_restore(saved);
    struct job *j=&jobs[c];
    j->opcode=op; j->id=id; j->init=init; j->proc=proc; j->position=0;
    v->core=c; v->opcode=op; v->id=id; v->init=init; v->proc=proc; v->offset=v->count=0;
    if(u) { j->upload=*u; v->offset=u->offset; v->count=u->count; }
    *out=*v; publish(); OWNED_BOUNDARY(4); return 1;
}
int dl_owned_command_reserve(unsigned c,uint32_t generation,unsigned op,unsigned id,unsigned init,unsigned proc,
        struct dl_owned_job *out) {
    /* PEEK storm restarts have no bounded lifetime and are legacy-only. */
    if((op!=DL_PROBE && op!=DL_BIND && op!=DL_UNBIND && op!=DL_BYPASS && op!=DL_BASE && op!=10u) ||
       !owned_command_valid(c,op,id,init,proc)) return 0;
    return owned_reserve(c,generation,op,id,init,proc,0,out);
}
int dl_owned_upload_reserve(unsigned c,uint32_t generation,const struct dl_upload *u,struct dl_owned_job *out) {
    if(!owned_upload_valid(c,u)) return 0;
    return owned_reserve(c,generation,DL_WRITE,0,0,0,u,out);
}
int dl_owned_reset_reserve(unsigned c,uint32_t generation,unsigned feature,unsigned offset,unsigned count,
        const uint32_t *words,struct dl_owned_job *out) {
    if(!owned_reset_valid(c,feature,offset,count,words)) return 0;
    struct dl_upload u={words,0,(uint16_t)count,0,(uint16_t)offset};
    return owned_reserve(c,generation,11u,feature,0,0,&u,out);
}
static int owned_matches(const struct dl_owned_job *v) {
    if(!v || v->core>1 || !v->ticket) return 0;
    const uint8_t *a=(const uint8_t *)v,*b=(const uint8_t *)&owned_jobs[v->core];
    for(unsigned i=0;i<sizeof *v;i++) if(a[i]!=b[i]) return 0;
    return 1;
}
int dl_owned_submit(const struct dl_owned_job *v) {
    if(!owned_matches(v) || jobs[v->core].state!=5) return 0;
    publish(); jobs[v->core].state=1; return 1;
}
int dl_owned_cancel(const struct dl_owned_job *v) {
    if(!owned_matches(v) || jobs[v->core].state!=5 || owned_sent[v->core]) return 0;
    owned_jobs[v->core].ticket=0; publish(); jobs[v->core].state=0; return 1;
}
int dl_owned_job_poll(const struct dl_owned_job *v,struct dl_owned_progress *out) {
    if(!owned_matches(v)) return -2;
    unsigned c=v->core,state=jobs[c].state;
    publish();
    if(out) {
        out->sent_sequence=owned_sent[c] ? (uint16_t)(v->first_sequence+owned_sent[c]-1u) : 0;
        unsigned n=jobs[c].opcode==DL_WRITE || jobs[c].opcode==11u ? (jobs[c].position+DL_DATA-1u)/DL_DATA : 0;
        out->acknowledged_sequence=state==3 ? v->last_sequence : n ? (uint16_t)(v->first_sequence+n-1u) : 0;
    }
    if(state==4 || !state) { owned_close(c,OWNED_WHY_POLL); return -1; }
    return state==3 ? 1 : 0;
}
int dl_owned_job_release(const struct dl_owned_job *v) {
    if(!owned_matches(v) || (jobs[v->core].state!=3 && jobs[v->core].state!=4)) return 0;
    unsigned c=v->core;
    if(jobs[c].state==4) owned_close(c,OWNED_WHY_RELEASE);
    owned_jobs[c].ticket=0; publish(); jobs[c].state=0; return 1;
}
void dl_owned_fail_closed(unsigned c) { if(c<2) owned_close(c,OWNED_WHY_BOARD); }
static int owned_idle(void) {
    return !jobs[0].state && !jobs[1].state && !pending[0] && !pending[1] && !owned_jobs[0].ticket && !owned_jobs[1].ticket;
}
uint32_t dl_owned_holder(unsigned c) { return c<2 ? owned_jobs[c].ticket : 0u; }
int dl_owned_closed(unsigned c) { return c<2 && owned_closed[c]; }
int dl_owned_lease_acquire(uint32_t generation) {
    if(DL_OWNED_DISABLED || !generation) return 0;
    uint16_t saved=owned_mask();
    int ok=!owned_lease && owned_idle() && dl_request_probe==requests && dl_request_stage==stages;
    if(ok) owned_lease=generation;
    owned_restore(saved); return ok;
}
int dl_owned_lease_release(uint32_t generation) {
    if(!generation || owned_lease!=generation) return 0;
    uint16_t saved=owned_mask();
    int ok=owned_idle();
    if(ok) owned_lease=0;
    owned_restore(saved); return ok;
}
'''
    return text
