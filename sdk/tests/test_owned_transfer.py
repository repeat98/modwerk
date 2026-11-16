# SPDX-License-Identifier: GPL-3.0-or-later
"""Stock-free tests of the actual private generated sole frame transport.

Only its fixed clock MMIO read is substituted. HF2/HF3 fixture events exercise
source lifetime behavior, never physical DSP timing or hardware qualification.
"""
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ADAPTER = ROOT / 'sdk/machines/octatrack/module-adapters'
ELEK = ROOT / 'sdk/machines/octatrack/elekloader'
sys.path.insert(0, str(ADAPTER))
import resident_driver
from host_flags import SANITIZE  # noqa: E402


FIXTURE = r'''
#include <assert.h>
#include <string.h>
#include <stdint.h>
volatile uint32_t test_clock;
static unsigned flags[2];
unsigned modwerk_dsp_flags(unsigned c) { return flags[c]; }
void modwerk_diag_frame(void) {} /* diag.c: the frame interrupt's freeze watch */
void dl_selection_tick(void) {}
void dl_residency_tick(void) {}
void dl_show_message(const char *s,unsigned n) { (void)s;(void)n; }
#define DL_OWNED_ADVERSARIAL
#include "transfer.c"
static unsigned adversarial,masked,boundaries;
void dl_owned_test_boundary(unsigned boundary) {
    boundaries++;
    if(boundary==1) { assert(!masked);masked=1; }
    if(boundary==2) {
        assert(masked);
        if(adversarial==2) { assert(jobs[0].state==5);dl_request_probe++; }
    }
    if(boundary==3) { assert(masked);masked=0; }
    /* An interrupt requested under the full mask is deferred until restore.
     * At restore the slot is already state5; fields need not be filled yet. */
    if(adversarial && !masked) {
        if(adversarial==1 && boundary==0) dl_request_probe++;
        if(adversarial==3 && boundary==0) assert(dl_command_start(0,DL_PROBE,0,0,0));
        dl_frame();
    }
}
static void answer(unsigned c,unsigned refused) {
    flags[c]=(flags[c]^1u)&1u;
    if(refused) flags[c]|=2u;
    dl_frame();
}
static void legacy(unsigned c) {
    assert(dl_command_start(c,DL_PROBE,0,0,0)); dl_frame();
    answer(c,0); assert(dl_job_status(c)==1); dl_job_release(c);
}
static void check_packet(unsigned c,unsigned op,unsigned seq) {
    unsigned sum=0;for(unsigned i=0;i<DL_WORDS;i++) sum+=dl_tx[c][i];
    assert(!(sum&65535u) && dl_tx[c][0]==DL_MAGIC && dl_tx[c][1]==seq && dl_tx[c][2]==op);
}
int main(int argc,char **argv) {
    assert(argc==2);
    unsigned mode=(unsigned)(argv[1][0]-'0');
    if(argv[1][1]) mode=mode*10u+(unsigned)(argv[1][1]-'0');
    struct dl_owned_job a,b,bad;
    struct dl_owned_progress p;
    uint32_t words[49];for(unsigned i=0;i<49;i++) words[i]=i+1u;
    if(mode==0) {
        memset(&a,0x5a,sizeof a);bad=a;
        assert(!dl_owned_command_reserve(0,0,10,0,1,0,&a) && !memcmp(&a,&bad,sizeof a));
        assert(!dl_owned_command_reserve(2,1,10,0,1,0,&a));
        assert(!dl_owned_command_reserve(0,1,8,0,0,0,&a)); /* storm-only PEEK */
        assert(!dl_owned_reset_reserve(0,1,1,15,2,words,&a) && !dl_owned_reset_reserve(0,1,1,529,2,words,&a)); /* MON 16 | window 514 | bus 512 */
        assert(!dl_owned_reset_reserve(1,1,2,0,1,words,&a));
        assert(dl_owned_command_reserve(0,7,10,0,1,0,&a));
        assert(a.generation==7 && a.ticket==1 && a.first_sequence==1 && a.last_sequence==1);
        assert(a.opcode==10 && a.core==0 && a.id==0 && a.init==1 && a.proc==0);
        for(unsigned i=0;i<3;i++) dl_frame();
        assert(dl_tx[0][0]==0 && dl_owned_job_poll(&a,&p)==0 && !p.sent_sequence && !p.acknowledged_sequence);
        assert(!dl_owned_job_release(&a) && !dl_command_start(0,DL_PROBE,0,0,0));
        bad=a;bad.ticket++;assert(!dl_owned_submit(&bad) && dl_owned_job_poll(&bad,&p)==-2);
        bad=a;bad.generation++;assert(!dl_owned_cancel(&bad));
        assert(dl_owned_cancel(&a) && !dl_owned_cancel(&a));
        assert(dl_owned_command_reserve(0,7,10,0,1,0,&b));
        assert(b.ticket==2 && b.first_sequence==2 && !dl_owned_submit(&a));
        for(unsigned i=0;i<sizeof b;i++) {
            bad=b;((uint8_t *)&bad)[i]^=1u;
            assert(dl_owned_job_poll(&bad,0)==-2 && !dl_owned_submit(&bad) && !dl_owned_job_release(&bad));
        }
        bad=b;bad.init=5;assert(!dl_owned_submit(&bad));
        assert(dl_owned_submit(&b) && !dl_owned_submit(&b) && !dl_owned_cancel(&b));
        dl_frame();check_packet(0,10,2);assert(dl_owned_job_poll(&b,&p)==0 && p.sent_sequence==2);
        dl_job_release(0);assert(dl_job_status(0)==-2 && dl_owned_job_poll(&b,0)==0);
        assert(!dl_owned_job_release(&b));answer(0,0);
        assert(dl_owned_job_poll(&b,&p)==1 && p.acknowledged_sequence==2);
        dl_job_release(0);assert(dl_owned_job_poll(&b,0)==1); /* legacy cannot release owned storage */
        assert(!dl_owned_job_release(&a) && dl_owned_job_release(&b) && !dl_owned_job_release(&b));
        assert(dl_owned_job_poll(&b,0)==-2);legacy(0); /* normal legacy behavior remains */
        assert(dl_owned_reset_reserve(1,8,4,3775,1,words,&a));
        assert(a.opcode==11 && a.offset==3775 && a.count==1 && a.id==4 && a.init==0 && a.proc==0);
        assert(dl_owned_submit(&a));dl_frame();check_packet(1,11,a.first_sequence);
        assert(dl_tx[1][5]==3775 && dl_tx[1][7]==4);answer(1,0);
        assert(dl_owned_job_poll(&a,0)==1 && dl_owned_job_release(&a));
    } else if(mode==1) {
        struct dl_upload u={words,0,49,0,64};
        assert(dl_owned_upload_reserve(0,9,&u,&a));
        assert(a.first_sequence==1 && a.last_sequence==3 && a.offset==64 && a.count==49 && a.id==0);
        assert(dl_owned_submit(&a));dl_frame();check_packet(0,DL_WRITE,1);
        answer(0,0);check_packet(0,DL_WRITE,2);
        assert(dl_owned_job_poll(&a,&p)==0 && p.sent_sequence==2 && p.acknowledged_sequence==1);
        answer(0,0);check_packet(0,DL_WRITE,3);
        assert(dl_tx[0][4]==1 && dl_tx[0][5]==112);
        assert(dl_owned_job_poll(&a,&p)==0 && p.sent_sequence==3 && p.acknowledged_sequence==2);
        answer(0,0);assert(dl_owned_job_poll(&a,&p)==1 && p.acknowledged_sequence==3);
        assert(dl_owned_job_release(&a));legacy(0);assert(dl_tx[0][1]==4);
        /* A standalone legacy probe already pending cannot be adopted. */
        dl_request_probe++;dl_frame();
        assert(!dl_owned_command_reserve(0,10,10,0,1,0,&b));
        answer(0,0);answer(1,0);
    } else if(mode==2 || mode==3 || mode==4) {
        assert(dl_owned_command_reserve(0,10,10,0,1,0,&a));assert(dl_owned_submit(&a));dl_frame();
        if(mode==2) for(unsigned i=0;i<64;i++) dl_frame();
        else if(mode==3) dl_abort();
        else answer(0,1);
        assert(dl_owned_job_poll(&a,0)==-1 && !dl_owned_cancel(&a));
        assert(owned_close_why[0]==(mode==2 ? OWNED_WHY_AGE : mode==3 ? OWNED_WHY_ABORT : OWNED_WHY_POLL));
        assert(!dl_owned_command_reserve(0,11,10,0,1,0,&b));
        answer(0,0); /* late old completion cannot rehabilitate an uncertain job */
        assert(dl_owned_job_poll(&a,0)==-1 && dl_owned_job_release(&a));
        assert(!dl_owned_command_reserve(0,11,10,0,1,0,&b));
        assert(dl_owned_command_reserve(1,11,10,0,1,0,&b)); /* independent core */
        assert(dl_owned_cancel(&b));legacy(0); /* legacy stays available, owned remains closed */
        assert(!dl_owned_command_reserve(0,12,10,0,1,0,&b));
    } else if(mode==5) {
        for(unsigned i=0;i<65535;i++) legacy(0);
        assert(sequence[0]==65535 && !dl_owned_command_reserve(0,1,10,0,1,0,&a) && !owned_closed[0]);
        legacy(0);assert(sequence[0]==1 && owned_close_why[0]==OWNED_WHY_WRAP); /* legacy still wraps nonzero */
        assert(!dl_owned_command_reserve(0,1,10,0,1,0,&a));
        assert(dl_owned_command_reserve(1,1,10,0,1,0,&a));assert(dl_owned_cancel(&a));
    } else if(mode==6) {
        /* Boundaries in boot-local counters are fixture injection, not ACK facts. */
        owned_ticket=UINT32_MAX;
        assert(!dl_owned_command_reserve(0,1,10,0,1,0,&a));
    } else if(mode==7) {
        assert(dl_command_start(0,DL_PROBE,0,0,0));dl_frame();
        for(unsigned i=0;i<64;i++) dl_frame();
        assert(dl_job_status(0)==-1 && owned_close_why[0]==OWNED_WHY_AGE);dl_job_release(0);
        /* No owned job was in flight, yet the late toggle below would read as the next packet's ACK. */
        answer(0,0);assert(!dl_owned_command_reserve(0,1,10,0,1,0,&a));
        assert(dl_owned_command_reserve(1,1,10,0,1,0,&a) && dl_owned_cancel(&a));
    } else if(mode==8) {
        assert(dl_owned_command_reserve(0,1,10,0,1,0,&a));assert(dl_owned_submit(&a));
        assert(dl_owned_command_reserve(1,2,10,0,5,0,&b));assert(dl_owned_submit(&b));dl_frame();
        check_packet(0,10,a.first_sequence);check_packet(1,10,b.first_sequence);
        answer(1,0);assert(dl_owned_job_poll(&a,0)==0 && dl_owned_job_poll(&b,0)==1);
        answer(0,0);assert(dl_owned_job_poll(&a,0)==1);
        assert(dl_owned_job_release(&a) && dl_owned_job_release(&b));
    } else if(mode==9) {
        adversarial=1;memset(&a,0x5a,sizeof a);bad=a;
        assert(!dl_owned_command_reserve(0,1,10,0,1,0,&a));
        assert(!memcmp(&a,&bad,sizeof a) && !owned_ticket && !jobs[0].state && pending[0]);
        adversarial=0;answer(0,0);answer(1,0);
        adversarial=2;assert(dl_owned_command_reserve(0,1,10,0,1,0,&a));
        assert(!masked && jobs[0].state==5 && !pending[0] && !pending[1] && !dl_tx[0][0]);
        assert(dl_owned_job_poll(&a,&p)==0 && !p.sent_sequence);
        adversarial=0;assert(dl_owned_submit(&a));dl_frame();check_packet(0,10,a.first_sequence);
        answer(0,0);assert(dl_owned_job_poll(&a,0)==1 && dl_owned_job_release(&a));
        dl_frame();assert(pending[0] && pending[1]); /* queued probe waits for owned release */
    } else if(mode==10) {
        struct dl_upload u={words,0,49,0,64};words[48]=0x1000000;
        assert(!dl_owned_upload_reserve(0,1,&u,&a) && !boundaries); /* validation precedes mask */
        words[48]=49;adversarial=3;
        assert(!dl_owned_upload_reserve(0,1,&u,&a) && !owned_ticket);
        assert(jobs[0].state==2 && pending[0]);adversarial=0;answer(0,0);
        assert(dl_job_status(0)==1);dl_job_release(0);
    } else if(mode==11) {
        /* Whole-transport journal lease: atomic idle check, every legacy start held, one generation only. */
        uint32_t w=1;struct dl_upload one={&w,0,1,0,64};
        assert(!dl_owned_lease_acquire(0));
        assert(dl_command_start(0,DL_PROBE,0,0,0) && !dl_owned_lease_acquire(5));  /* legacy job queued */
        dl_frame();assert(!dl_owned_lease_acquire(5));answer(0,0);dl_job_release(0); /* its packet pending */
        dl_request_probe++;assert(!dl_owned_lease_acquire(5));dl_frame();answer(0,0);answer(1,0);
        dl_request_stage++;assert(!dl_owned_lease_acquire(5));dl_frame();answer(0,0);answer(1,0);
        assert(dl_owned_command_reserve(1,3,10,0,1,0,&a) && !dl_owned_lease_acquire(5) && dl_owned_cancel(&a));
        assert(dl_owned_lease_acquire(5) && !dl_owned_lease_acquire(5) && !dl_owned_lease_acquire(6));
        assert(!dl_command_start(0,DL_PROBE,0,0,0) && !dl_upload_start(0,&one) && !dl_sum_start(0,64,1,1) &&
               !dl_hook_reset_start(0,1,0,1,&w) && !jobs[0].state);
        dl_request_probe++;dl_frame();assert(!pending[0] && !pending[1] && !dl_tx[0][0]); /* held, not dropped */
        assert(!dl_owned_command_reserve(0,6,10,0,1,0,&a));                        /* another generation */
        assert(dl_owned_command_reserve(0,5,10,0,1,0,&a) && !dl_owned_lease_release(5));
        assert(dl_owned_submit(&a));dl_frame();answer(0,0);
        assert(!dl_owned_lease_release(6) && !dl_owned_lease_release(5));             /* complete, unreleased */
        assert(dl_owned_job_release(&a) && dl_owned_lease_release(5) && !dl_owned_lease_release(5));
        dl_frame();assert(pending[0] && pending[1] && dl_tx[0][2]==DL_PROBE);answer(0,0);answer(1,0);
        legacy(0);
    } else if(mode==12) {
        /* Answered legacy refusals (HF3) are complete round trips: a PEEK 1 bit, a SUM mismatch, a refused
         * probe or upload leave the owned channel open, with no owned job outstanding. */
        uint32_t errors=dl_errors,rejected=dl_rejected[0];
        assert(dl_command_start(0,DL_PEEK,0,100,1) && !dl_owned_command_reserve(0,1,10,0,1,0,&a));
        dl_frame();answer(0,1);
        assert(dl_job_status(0)==-1 && dl_errors==errors && dl_rejected[0]==rejected); /* a 1 bit is no error */
        dl_job_release(0);assert(!owned_closed[0] && !owned_close_why[0]);
        assert(dl_sum_start(0,64,1,5));dl_frame();answer(0,1);assert(dl_job_status(0)==-1);dl_job_release(0);
        assert(dl_command_start(0,DL_PROBE,0,0,0));dl_frame();answer(0,1);assert(dl_job_status(0)==-1);dl_job_release(0);
        struct dl_upload u={words,0,49,0,64};
        assert(dl_upload_start(0,&u));dl_frame();answer(0,0);answer(0,1);
        assert(dl_job_status(0)==-1 && dl_errors==errors+2);dl_job_release(0);
        assert(!owned_closed[0] && !owned_closed[1]);
        assert(dl_owned_reset_reserve(0,3,1,0,16,words,&a) && dl_owned_submit(&a));dl_frame();
        check_packet(0,11,a.first_sequence);answer(0,0);
        assert(dl_owned_job_poll(&a,&p)==1 && p.acknowledged_sequence==a.last_sequence && dl_owned_job_release(&a));
        /* An owned job refused by the same HF3 answer still closes its core. */
        assert(dl_owned_command_reserve(0,3,10,0,1,0,&a) && dl_owned_submit(&a));dl_frame();answer(0,1);
        assert(dl_owned_job_poll(&a,0)==-1 && owned_close_why[0]==OWNED_WHY_POLL && dl_owned_job_release(&a));
        assert(!dl_owned_command_reserve(0,4,10,0,1,0,&a));
        assert(dl_owned_command_reserve(1,4,10,0,1,0,&a) && dl_owned_cancel(&a));
    } else if(mode==13) {
        /* Boot-like: dormant probes and a resident upload, then the status page's meter read on both cores
         * (120 PEEK bits each, ones answered HF3, as dsp.c's peek_tick), then a controller RESET per core. */
        dl_request_probe++;dl_frame();answer(0,0);answer(1,0);
        struct dl_upload u={words,0,49,0,64};
        for(unsigned c=0;c<2;++c) { assert(dl_upload_start(c,&u));dl_frame();answer(c,0);answer(c,0);answer(c,0);
            assert(dl_job_status(c)==1);dl_job_release(c); }
        for(unsigned c=0;c<2;++c) for(unsigned bit=0;bit<120;++bit) {
            assert(dl_command_start(c,DL_PEEK,0,200+bit/24u,1u<<(bit%16u)));dl_frame();
            answer(c,(bit*7u+c)%3u==0);assert(dl_job_status(c)!=0);dl_job_release(c);
        }
        assert(!owned_closed[0] && !owned_closed[1] && !owned_close_why[0] && !owned_close_why[1] && !dl_errors);
        assert(dl_owned_reset_reserve(0,9,1,0,16,words,&a) && dl_owned_reset_reserve(1,9,1,0,16,words,&b));
        assert(dl_owned_submit(&a) && dl_owned_submit(&b));dl_frame();answer(0,0);answer(1,0);
        assert(dl_owned_job_poll(&a,0)==1 && dl_owned_job_poll(&b,0)==1);
        assert(dl_owned_job_release(&a) && dl_owned_job_release(&b));
        /* A watchdog abort with nothing in flight closes nothing; with a legacy packet in flight it closes
         * that core only, first cause kept, even with no owned job outstanding. */
        dl_abort();assert(!owned_closed[0] && !owned_closed[1]);
        assert(dl_command_start(1,DL_PEEK,0,200,1));dl_frame();dl_abort();
        assert(!owned_closed[0] && owned_closed[1] && owned_close_why[1]==OWNED_WHY_ABORT);
        dl_job_release(1);dl_owned_fail_closed(1);assert(owned_close_why[1]==OWNED_WHY_ABORT);
        dl_owned_fail_closed(0);assert(owned_close_why[0]==OWNED_WHY_BOARD && !dl_owned_command_reserve(0,9,10,0,1,0,&a));
    } else assert(0);
    return 0;
}
'''


@unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
class OwnedTransfer(unittest.TestCase):
    def generated(self):
        spec = importlib.util.spec_from_file_location('owned_transfer_core_fixture', ELEK / 'build_core.py')
        core = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(core)
        texts = {}
        for name in ('transfer.c', 'transfer.h', 'selection.h'):
            text = (core.DYNLOAD / name).read_text()
            for old, new in core.DSP_EDITS.get(name, ()) + core.WIDTH_EDITS.get(name, ()):
                self.assertEqual(text.count(old), 1)
                text = text.replace(old, new)
            if name == 'transfer.c':
                text = resident_driver.transport(text)
                clock = '*(volatile uint32_t *)0xfc07c00cu'
                self.assertEqual(text.count(clock), 1)
                text = text.replace(clock, 'test_clock')
            elif name == 'transfer.h':
                text = resident_driver.transport_header(text)
            texts[name] = text
        return texts

    def test_owned_reserve_submit_identity_chunking_late_flags_and_wrap(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            for name, text in self.generated().items():
                (work / name).write_text(text)
            shutil.copyfile(ELEK / 'fxids.h', work / 'fxids.h')
            (work / 'fixture.c').write_text(FIXTURE)
            executable = work / 'owned'
            compile_result = subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic',
                *SANITIZE, '-fno-omit-frame-pointer', '-DDL_NATIVE_TEST',
                '-DMODWERK_FX_IDS=64', '-DMODWERK_DSP_TABLE0=4096', '-DMODWERK_DSP_TABLE1=4096',
                '-DMODWERK_DSP_WORDS0=2000', '-DMODWERK_DSP_WORDS1=2000', '-I' + str(work),
                str(work / 'fixture.c'), '-o', str(executable)], capture_output=True, text=True)
            self.assertEqual(compile_result.returncode, 0, compile_result.stderr)
            for mode in range(14):
                with self.subTest(mode=mode):
                    result = subprocess.run([str(executable), str(mode)], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)

    def test_header_and_actual_transport_guards_refuse_drift(self):
        texts = self.generated()
        self.assertIn('int dl_owned_submit', texts['transfer.h'])
        self.assertIn('wire_sequence=owned_jobs[c].first_sequence+owned_sent[c]++', texts['transfer.c'])
        self.assertIn('int dl_owned_lease_acquire(uint32_t generation);', texts['transfer.h'])
        self.assertEqual(texts['transfer.c'].count('jobs[c].state || owned_lease ||'), 4)  # upload, command, reset, SUM
        self.assertEqual(texts['transfer.c'].count('!owned_lease && !pending[0]'), 2)       # queued probe and stage
        with self.assertRaisesRegex(ValueError, 'header seam changed'):
            resident_driver.transport_header(texts['transfer.h'])
        with self.assertRaisesRegex(ValueError, 'transport seam changed'):
            resident_driver.owned_transport(texts['transfer.c'])
