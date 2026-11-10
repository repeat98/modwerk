/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Loop & Fade's looper, Digitakt I OS 1.54. Based on sumedho's RAM Machines (GPL-2.0-or-later):
 * one volatile input/main recorder, native ONESHOT playback.
 * Only the UI task allocates. The audio interrupt owns capture/publication.
 * A private descriptor avoids taking a user sample or the audition slots. */
#ifdef DT_LINKABLE
#include "euclidean.h" /* integer types and native-call macros only */
static u32 ram_lock(void){u32 sr;__asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr":"=d"(sr)::"memory");return sr;}
static void ram_unlock(u32 sr){__asm__ volatile("move.w %0,%%sr"::"d"(sr):"memory");}
#else
#include "../digitakt_euclidean/euclidean.h"
#define ram_lock euc_lock
#define ram_unlock euc_unlock
#endif
#include "digitakt-mk1/core3.h"
#ifdef DT_LINKABLE
#include "core21.h" /* Core 2.1 exports no firmware locations */
#include "digitakt-mk1/stock_knob.h"
#endif

#define RAM_P 122                      /* Loop & Fade's machine (RAM Machines has 120-121) */
#define CAPACITY 1584000UL
#define VOICE_ACTIVE(t) (*(volatile u8 *)(0x8000edecUL+94UL*(t)))
enum { EMPTY, RECORDING, READY, NO_MEMORY, EDITING };
volatile u32 ram_state,ram_count,ram_target,ram_owner,ram_generation;
/* Optional sample-tools client: 1 pins a take for editing, 2 commits PCM.
 * Reset invalidates the token; capture cannot overwrite a pinned buffer. */
volatile u32 ram_editor_busy;
volatile u32 ram_stats[12]; /* starts, finishes, busy, empty plays, plays, resets, blocks */
static short * volatile ram_pcm;
static u32 ram_gain;
static u32 ram_source; /* 0 MAIN, 1 input L, 2 input R, 3 input L+R */
static volatile u32 ram_stop,ram_pending_reset;
/* Modes (page 2, knob A): OFF; ONCE, the next loop after the button is recorded, handed over and
 * locked; CAPT, the input is recorded all the time and the button hands over the loop being recorded
 * when it ends. In ONCE and CAPT the input is always being recorded, loop by loop, into one of three
 * buffers: the one the looper plays (pub), the last complete loop (last) and the loop being recorded
 * (cur). A loop ends at a looper trig (PLAY TRIG), or after MAX steps. Handing a loop over only
 * switches buffers: nothing is copied or cut. These takes are not normalized. MODE_REC is OFF. */
enum { MODE_REC, MODE_ONCE, MODE_CAPT };
volatile u32 ram_mode,ram_locked,ram_once_stage,ram_capt_pending;
/* The looper's second SRC page (press SRC again) sets MODE, MAX length, SOURCE and LEVEL for the whole
 * unit. FILL, or UP on the looper's SRC pages (BTN, knob E), is the capture/arm button. */
u32 ram_set_mode,ram_set_source,ram_set_len=6,ram_set_gain=100;   /* MAX: 1<<n steps, 64 by default */
u32 ram_set_btn;                           /* the capture/arm button: 0 FILL, 1 UP (on the looper's SRC pages), 2 both */
/* PLAY (page 2, knob G): TRIG, the looper track's sequenced trigs end each loop and play the take, as before;
 * PICK, a pickup machine: loops start on the sequencer's step grid since PLAY, every MAX steps, and the
 * module plays the take on the looper track at each start itself. That track's own trigs are ignored, so
 * the loop plays on through any pattern whose kit has the looper on that track, trigs or none. */
u32 ram_set_play;                          /* 0 TRIG, 1 PICK, 2 PTCH, 3 WARP (PICK that follows the tempo, below) */
#define STEP_COUNT (*(volatile u32 *)0x4199ec68)   /* OS 1.54: the sequencer's steps since PLAY */
#define SEQ_PLAYING (*(volatile u8 *)0x4199ec2f)   /* 1 while the sequencer plays (2 after a MIDI STOP) */
static volatile u32 ram_pick,ram_pick_rec,pick_track=8;
/* PICK sets the loop track's voice up itself: the firmware builds a track's voice (its sound, the
 * voice record) only when the track is played, by a trig or a note; a start of ours only replays it.
 * So with no voice yet, ram_tick plays one note on the track, as the keyboard does (silenced: while
 * stopped, or until the next loop start); STOP clears the voice and it is set up again. */
static volatile u32 pk_voice,pk_quiet;          /* the voice is set up; silence it until the next loop start */
#define NOTEON  ((void (*)(s32,s32,s32,s32,s32,s32,s32))0x400d5604)   /* (track, note, vel, src, ...) */
#define NOTEOFF ((void (*)(s32,s32,s32))0x400d5986)                    /* (track, note, src) */   /* PICK is on; the sequencer plays (record then); its track */
/* A the looper voice: the core's table (set when a trig plays the track), or PICK's track, which gets no trigs
 * of its own. */
#define IS_P(t) (core_track_machine[t]==RAM_P||(ram_pick&&(t)==pick_track))
#define FILL_ON (*(volatile u8 *)0x421ee634)   /* OS 1.54: fill mode is on (the FILL trig condition reads it) */
/* Global track parameters: the looper track's parameters stay the same in every pattern, as far as GLOB
 * (page 2, knob F) reaches: SND the delay and reverb sends, FLT also the filter page, AMP also the amp
 * page, ALL also the SRC page (not the sample) and the LFO. A sound keeps parameter n as a word at
 * +0x14 + 2n, and the engine takes it by the same n (0x400771e8). The module remembers each track's last
 * values: one that changes while the pattern stays (a knob turn, by any route) becomes the shared value;
 * for a second after a pattern change (FW_CURRENT_PATTERN or the kit) a change is the new pattern
 * loading, and gets the shared values written over it. */
u32 ram_set_sends=1;                       /* GLOB: 0 off (stock), 1 SND, 2 FLT, 3 AMP, 4 ALL */
static const u8 glob_ids[]={42,43, 30,31,32,33,34,35,36,37, 38,39,40,41,44,45,
                            17,18,19,21,22,23,24, 1,2,3,4,5,6,7,8};
static const u8 glob_count[]={0,2,10,16,31};  /* how many of glob_ids each GLOB setting takes */
#define GLOB_N 31
static volatile u16 ram_gval[GLOB_N];      /* the shared values */
static u32 ram_glob_learned;               /* how many of glob_ids have been learned */
static u32 ram_kit_tick;                   /* the last pattern (kit) change */
static u16 ram_seen_send[8][GLOB_N];       /* each track's words as last seen */
static u32 ram_page2,ram_redraw;           /* the looper's second SRC page is shown; redraw it */
volatile u32 ram_dbg_grid,ram_ui;      /* the UI object (the SRC view's +0x6c), for the grid-recording test */   /* CAPT: hand over the loop now being recorded when it ends */   /* ONCE: 0 idle or locked, 1 armed, 2 recording the loop */
static short * volatile ram_buf[3];
static volatile u32 ram_len[3];
static volatile u32 ram_loop_want,ram_loop_nomem;         /* the audio side wants the loop buffers (ONCE or CAPT) */
static u32 ram_pub,ram_cur=1,ram_last=2,ram_loop_target,ram_loop_len;
static u32 ram_steps[3];                   /* each buffer's loop length in steps (MAX when it ended), for PTCH/WARP */
static volatile u32 w_restart;                    /* PTCH/WARP: the loop starts on the grid in this block */
static volatile u32 ram_tune=0x4000;               /* the loop track's TUNE word: 0x4000 is 0, 256 a semitone */

/* ABI is native {pointer, rate << 16, sample count, rate factor}. */
u32 ram_descriptor[4]={0x4031abd0,48000UL<<16,248,0x40000000};
extern void core_mtick(void),mp_tick(void *);
extern u32 ram_native_new(u32),ram_native_load(u32,u32,u32);
extern u32 ram_native_set(u32,u32,u32,u32);

/* Normalization. Capture tracks the take's peak; when the take ends it is
 * scaled to full scale in place, so BR (which quantizes on a fixed
 * full-scale grid) acts on it as on a normal sample, and the looper plays it
 * back with ram_boost instead of a fixed gain. The pass runs in the audio
 * interrupt, NORM_STEP samples a block from each end of the take, so a
 * forward or reverse voice started on the next step reads scaled samples.
 * Each scaled line is pushed from the copyback cache: the voice DMA reads
 * DDR. A commit from Sample Tools runs the same pass at unity to push it. */
#define NORM_STEP 512UL
#define NORM_MAX (64UL<<16) /* x64 at most, for near-silent takes */
#define BOOST_Q12 29600 /* x7.227 in Q12, 1/0.1384 */
#define LOOP_Q12 45000  /* ONCE/CAPT loops, recorded before the master compressor: x1.52 more, so a loop plays
                          * into the compressor at the level it was recorded with AMP VOL 127 (emulator round trip) */
static u32 ram_peak,ram_norm_lo,ram_norm_hi,ram_norm_gain;
static volatile u32 ram_boost=BOOST_Q12;
static void norm_range(u32 from,u32 to){
 short *p=ram_pcm;s32 g=(s32)ram_norm_gain;u32 i,a;
 if(g!=65536)for(i=from;i<to;i++)p[i]=(short)((p[i]*g)>>16);
 for(a=(u32)(p+from)&~15UL;a<(u32)(p+to);a+=16)
  __asm__ volatile("cpushl %%dc,(%0)"::"a"(a):"memory");
}
static void norm_step(void){
 u32 lo=ram_norm_lo,hi=ram_norm_hi,end;
 if(lo>=hi)return;
 end=hi-lo>NORM_STEP?lo+NORM_STEP:hi;norm_range(lo,end);lo=end;
 if(lo<hi){end=hi-lo>NORM_STEP?hi-NORM_STEP:lo;norm_range(end,hi);hi=end;}
 ram_norm_lo=lo;ram_norm_hi=hi;
}
static void norm_start(u32 gain){
 ram_norm_gain=gain;ram_norm_lo=0;ram_norm_hi=ram_count;norm_step();
}
static void norm_cancel(void){ram_norm_hi=ram_norm_lo;}
static u32 steps_len(u32 index){            /* 1<<index sixteenth steps at the current tempo, in samples */
 u32 tempo=FW(0x400770c8)(),target;
 if(index>7)index=7;
 if(tempo<120)tempo=120;
 target=((1UL<<index)*5760000UL/(tempo*4))*60;
 if(target>CAPACITY)target=CAPACITY;
 if(target<248)target=248;
 return target;
}
static u32 ram_one_track;                  /* a track with the looper in the kit */
static int loop_ready(void){return ram_buf[0]&&ram_buf[1]&&ram_buf[2];}
static void publish(u32 i){                /* the looper plays buffer i from its next trig */
 u32 old=ram_pub;
 if(ram_len[i]<248)return;
 norm_cancel();
 ram_pub=i;ram_pcm=ram_buf[i];ram_count=ram_len[i];
 ram_descriptor[0]=(u32)ram_pcm;ram_descriptor[2]=ram_count;
 ram_boost=LOOP_Q12;ram_state=READY;ram_generation++;ram_stats[1]++;
 if(ram_last==i){ram_last=old;ram_len[old]=0;}   /* no second hand-over until the next loop ends */
}
static void loop_end(void){                /* the loop being recorded is complete */
 ram_loop_len=ram_len[ram_cur];ram_steps[ram_cur]=1UL<<(ram_set_len&7);
 ram_last=ram_cur;
 ram_cur=3-ram_pub-ram_last;ram_len[ram_cur]=0;
 if(ram_mode==MODE_CAPT&&ram_capt_pending){publish(ram_last);ram_capt_pending=0;}
 if(ram_mode==MODE_ONCE){
  if(ram_once_stage==1)ram_once_stage=2;  /* the loop starting now is the one to take */
  else if(ram_once_stage==2){publish(ram_last);ram_once_stage=0;ram_locked=1;}
 }
}
static void silence(void){
 ram_descriptor[0]=0x4031abd0;ram_descriptor[2]=248;
}
static void kill_readers(void){
 u32 t;
 for(t=0;t<8;t++)if(IS_P(t))VOICE_ACTIVE(t)=0;
}
static void finish(void){
 if(ram_state!=RECORDING)return;
 if(ram_count<248){ram_state=EMPTY;silence();return;}
 /* All reads/writes are in the audio IRQ, with a non-yielding publication. */
 {u32 gain=ram_peak?(32767UL<<16)/ram_peak:65536;
  if(gain>NORM_MAX)gain=NORM_MAX;
  if(gain<65536)gain=65536;
  ram_boost=ram_peak?(BOOST_Q12*65536UL)/gain:0;norm_start(gain);}
 ram_descriptor[0]=(u32)ram_pcm;ram_descriptor[2]=ram_count;
 ram_state=READY;ram_generation++;ram_stats[1]++;
}
void ram_reset(void){
 u32 sr=ram_lock();ram_pending_reset=1;ram_stop=0;
 ram_generation++;if(ram_editor_busy!=2)ram_editor_busy=0;
 ram_state=EMPTY;ram_count=0;norm_cancel();silence();kill_readers();ram_stats[5]++;
 ram_locked=0;ram_once_stage=0;ram_capt_pending=0;ram_len[0]=ram_len[1]=ram_len[2]=0;
 ram_unlock(sr);
}
u32 ram_new(u32 project){ram_reset();return ram_native_new(project);}
u32 ram_load(u32 project,u32 slot,u32 message){ram_reset();return ram_native_load(project,slot,message);}
/* ---- the take in the native recorder's trim editor ----------------
 * On the looper's SRC page, pushing knob D copies a ready take into the recorder's buffer and
 * opens the native trim editor on it, as if it had just been recorded: trim, audition and YES to
 * save it as a sample with the native workflow. The take is pinned while the editor is open, so a
 * new loop cannot overwrite it, and released when the editor closes. Adapted from Sample Tools'
 * import (sumedho, GPL-2.0-or-later). */
#define REC_PCM ((short *)0x4237ef90)
#define REC_LOW ((u8 *)0x421fc410)
#define REC_COUNT R32(0x4199f104)
#define REC_STATE R32(0x4199f114)
static u32 ram_src_view,ram_src_seen,ram_ticks,ram_edit_open;
static u32 ram_shared[5];
static u32 ram_nothing(void){return 0;}
static void ram_destroy(u32 p){FW(0x400d4332)(p);}
static void ram_dispose(u32 p){ram_edit_open=0;ram_editor_busy=0;FW(0x40161196)(p+16);}   /* the editor closed: release the take */
static void popup(u32 parent,const char *s){FW(0x40093ab0)(R32(parent+0x6c),s);}
static void edit_take(u32 parent){
 u32 *block,view,shared[2],i,sr;
 if(REC_STATE){popup(parent,"CLEAR RECORDER FIRST");return;}
 sr=ram_lock();
 if(ram_state!=READY||ram_editor_busy||ram_norm_lo<ram_norm_hi||!ram_pcm){ram_unlock(sr);popup(parent,"NO TAKE TO EDIT");return;}
 ram_editor_busy=1;ram_unlock(sr);
 block=(u32 *)fw_op_new(0x9bc);
 if(!block){ram_editor_busy=0;popup(parent,"NOT ENOUGH MEMORY");return;}
 FW(0x400e8ae8)(REC_PCM,ram_pcm,ram_count*2);FW(0x400e8514)(REC_LOW,ram_count);
 REC_COUNT=ram_count;REC_STATE=4;
 if(!ram_shared[0]){ram_shared[0]=(u32)ram_nothing;ram_shared[1]=(u32)ram_destroy;
  ram_shared[2]=(u32)ram_dispose;ram_shared[3]=(u32)ram_destroy;ram_shared[4]=(u32)ram_nothing;}
 for(i=0;i<0x9bc/4;i++)block[i]=0;
 block[0]=(u32)ram_shared;block[1]=1;block[2]=1;block[3]=(u32)(block+4);view=(u32)(block+4);
 FW(0x400a818a)(view);                     /* the native trim editor's constructor */
 shared[0]=view;shared[1]=(u32)block;
 FW(0x400c9b3e)(parent,shared,0);FW(0x40137944)(&shared[1]);
 ram_edit_open=1;
}
static void ram_say(const char *m){if(ram_ui)FW(0x40093ab0)(ram_ui,m);}
static void ram_button(void){              /* the capture/arm button */
 if(!loop_ready()){ram_say("LOOP: NOT READY YET");return;}
 if(ram_editor_busy){ram_say("LOOP: TAKE IS BEING EDITED");return;}
 if(ram_mode==MODE_CAPT)ram_capt_pending=1;
 else if(ram_mode==MODE_ONCE){
  if(!ram_once_stage){ram_locked=0;ram_once_stage=1;}
 }
}
/* ---- the looper's second SRC page ----------------------------------------
 * Pressing SRC on the looper track's SRC page switches between the stock page (1/2) and its page 2 (2/2),
 * drawn by ram_draw over the whole screen. Knobs A-D set the loop settings there. */
static const char *const loop_names[]={"OFF","ONCE","CAPT"};
static const char *const src_names[]={"MAIN","IN L","IN R","IN LR"};
static u32 ui_machine(u32 t){u8 *kit=fw_kit;return kit&&t<8?FW_SOUND(kit,t)[FW_SOUND_MACHINE]:0;}   /* the UI side's view: the kit */
/* ---- page 2 saved on the +Drive ----------------------------------
 * The five RAM Loop settings are kept in /cfw/ramloop.a and .b, written in turn, so a save cut short
 * leaves the other whole; the valid one with the higher sequence number wins. Loaded once the drive is
 * mounted and free, saved about a second after the last change. ekFS calls as in CC Remap (OS 1.54). */
typedef struct { u32 inode, pos, writable, open; } ekfile;
#define EK_OPEN    ((s32 (*)(const char *, const char *, ekfile *))0x400cf3a0)
#define EK_READ    ((s32 (*)(void *, s32, ekfile *))0x400cf0e6)
#define EK_WRITE   ((s32 (*)(const void *, s32, ekfile *))0x400cf146)
#define EK_CLOSE   ((s32 (*)(ekfile *))0x400cf35e)
#define EK_MKDIR   ((s32 (*)(const char *))0x400ce034)
#define EK_LOOKUP  ((s32 (*)(const char *, u32 *, s32, s32, s32))0x400d0ccc)
#define EK_LOCK    ((void (*)(void *))0x40001884)
#define EK_UNLOCK  ((void (*)(void *))0x400019b6)
#define EK_MUTEX   ((void *)0x42686690)
#define EK_OWNER   (*(volatile u32 *)0x42686690)
#define EK_MOUNTED (*(volatile u32 *)0x420eec50)
#define RL_MAGIC   0x524c5031u             /* "RLP1" */
struct rl_file { u32 magic, size, seq, sum; u8 v[8]; u8 pad[16]; };
static struct rl_file rl_img;
static u32 rl_seq, rl_loaded, rl_dirty;
static const char *const rl_path[2] = { "/cfw/ramloop.b", "/cfw/ramloop.a" };
static u32 rl_sum(const u8 *v){u32 x=0x5eed1234u,i;for(i=0;i<8;i++)x=((x<<5)|(x>>27))^v[i];return x;}
static int rl_ready(void){return EK_MOUNTED!=0&&EK_OWNER==0;}
static int rl_read(const char *path){
 ekfile f;s32 got;
 if(EK_OPEN(path,"r",&f)!=0)return 0;
 got=EK_READ(&rl_img,sizeof rl_img,&f);EK_CLOSE(&f);
 return got>=(s32)(sizeof rl_img-sizeof rl_img.pad)&&rl_img.magic==RL_MAGIC&&rl_img.size==8&&rl_img.sum==rl_sum(rl_img.v)
  &&rl_img.v[0]<3&&rl_img.v[1]<8&&rl_img.v[2]<4&&rl_img.v[3]<128&&rl_img.v[4]<3&&rl_img.v[5]<5&&rl_img.v[6]<4;
}
static void rl_load(void){
 int ok0,ok1,pick;u32 seq0;
 ok0=rl_read(rl_path[0]);seq0=rl_img.seq;
 ok1=rl_read(rl_path[1]);
 pick=ok0&&ok1?(rl_img.seq>seq0?1:0):ok1?1:ok0?0:-1;
 if(pick==0&&!rl_read(rl_path[0]))pick=-1;
 if(pick>=0){rl_seq=rl_img.seq;ram_set_mode=rl_img.v[0];ram_set_len=rl_img.v[1];ram_set_source=rl_img.v[2];
  ram_set_gain=rl_img.v[3];ram_set_btn=rl_img.v[4];ram_set_sends=rl_img.v[5];ram_set_play=rl_img.v[6];}
 rl_loaded=1;
}
static int rl_save(void){                    /* 1 saved, -1 failed */
 ekfile f;u32 ino,seq=rl_seq+1,i;s32 r,w;
 EK_LOCK(EK_MUTEX);r=EK_LOOKUP("/cfw",&ino,0,0,0);EK_UNLOCK(EK_MUTEX);
 if(r==0x19&&EK_MKDIR("/cfw")!=0)return -1;
 for(i=0;i<8;i++)rl_img.v[i]=0;
 for(i=0;i<sizeof rl_img.pad;i++)rl_img.pad[i]=0;
 rl_img.v[0]=ram_set_mode;rl_img.v[1]=ram_set_len;rl_img.v[2]=ram_set_source;rl_img.v[3]=ram_set_gain;rl_img.v[4]=ram_set_btn;rl_img.v[5]=ram_set_sends;rl_img.v[6]=ram_set_play;
 rl_img.magic=RL_MAGIC;rl_img.size=8;rl_img.seq=seq;rl_img.sum=rl_sum(rl_img.v);
 if(EK_OPEN(rl_path[seq&1],"w",&f)!=0)return -1;
 w=EK_WRITE(&rl_img,sizeof rl_img,&f);EK_CLOSE(&f);
 if(w!=(s32)sizeof rl_img)return -1;
 rl_seq=seq;return 1;
}
static void rl_tick(void){
 if(!rl_ready())return;                    /* busy or not mounted: next tick */
 if(!rl_loaded){rl_load();return;}
 if(!rl_dirty||--rl_dirty)return;
 if(rl_save()<0)rl_dirty=300;              /* failed: again in 10 s */
}
static u32 src_shown(void){                /* the SRC page of the looper track is on screen, uncovered */
 u32 v=ram_src_view,t;
 if(!v||!R32(v+0x2c)||(R32(v+0x14)&0xffff))return 0;
 t=R32(v+0x1a4);                           /* the machine picker (FUNC + SRC), a view of its own; the */
 if(t&&R32(t+0x2c)==R32(v+0x2c))return 0;  /* pointer stays after it closes, so match its screen: open, stock keys */
 t=FW(0x4001d24e)(R32(v+116));
 return ui_machine(t)==RAM_P;
}
/* Page 2's knobs turn as on the stock pages (stock_knob.h): the firmware's speed, pushed while turning
 * coarse, FUNC + turn a jump to the default. The values keep a fraction, as stock values do. */
static dt_knobs ram_knobs;
static int ram_frac[7];
static const short p2_hi[7]={2,7,3,127,2,4,3},p2_def[7]={0,6,0,100,0,1,0};
static s32 page2_get(u32 k){
 switch(k){case 0:return ram_set_mode;case 1:return ram_set_len;case 2:return ram_set_source;
 case 3:return ram_set_gain;case 4:return ram_set_btn;case 5:return ram_set_sends;default:return ram_set_play;}
}
static void page2_set(u32 k,s32 v){
 v=v<0?0:v>p2_hi[k]?p2_hi[k]:v;
 switch(k){
 case 0:ram_set_mode=v;
  if(ram_set_mode==MODE_REC){ram_once_stage=0;ram_capt_pending=0;}
  ram_locked=0;break;
 case 1:ram_set_len=v;break;
 case 2:ram_set_source=v;break;
 case 3:ram_set_gain=v;break;
 case 4:ram_set_btn=v;break;
 case 5:ram_set_sends=v;break;
 case 6:ram_set_play=v;break;
 }
 ram_redraw=1;rl_dirty=30;               /* save about a second after the last change */
}
u32 ram_enc(u32 brain,u32 event){
 u32 id=R32(event+12);int d,jump;
 (void)brain;
 if(!ram_page2||!src_shown())return 0;
 if(id<1||id>8)return 0;                   /* LEVEL and the rest stay stock */
 if(id>7)return 1;                         /* H does nothing here */
 d=dt_knob(&ram_knobs,(void *)event,id-1,id==4?DT_KNOB_FINE:DT_KNOB_LIST,&jump);
 if(!d)return 1;
 if(jump){ram_frac[id-1]=0;page2_set(id-1,dt_knob_jump(page2_get(id-1),d,0,p2_hi[id-1],p2_def[id-1]));}
 else page2_set(id-1,dt_knob_apply(page2_get(id-1),&ram_frac[id-1],d,0,p2_hi[id-1]));
 return 1;
}
/* the looper's page 2, laid out like the stock second pages (FLTR 2/2): the stock header and left column
 * (SMP box, level bar) stay, and the eight knobs sit in the stock slots, a value over each name. */
static const char *short_state(void){
 if(ram_state==NO_MEMORY)return "NRAM";
 if(!loop_ready())return ram_set_mode==MODE_REC?"OFF":ram_loop_nomem?"NRAM":"WAIT";
 if(ram_mode==MODE_ONCE)return ram_once_stage==1?"ARM":ram_once_stage==2?"REC":ram_locked?"LOCK":"RDY";
 if(ram_mode==MODE_CAPT)return ram_capt_pending?"CAPT":"LOOP";
 return "OFF";
}
/* Drawn like the stock pages: the firmware's own knob graphics (0x4000f2bc reads only the parameter id's
 * UI record) at the stock knob places, labels in the stock label font; a value no stock graphic shows
 * gets a framed box like the stock SAMP box. */
#define KNOB_GFX(id,v,bmp,x,y) ((void (*)(u32,u32,s32,u32,u32,void *,s32,s32))0x4000f2bc)(0,(id),(v),0,0,(bmp),(x),(y))
#define LABEL(bmp,x,y,t) ((void (*)(void *,u32,s32,s32,s32,const char *,...))0x400c27e8)((bmp),0x4208dc70,(x),(y),0,"%s",(t))
/* Slot k's graphic spans x+1..x+17, y..y+16 (y up), its name below in the label font, as measured on
 * the stock FLTR 2/2 page. A value no stock graphic shows is plain text in the label font, as ROUT. */
static void knob_place(int k,int *x,int *y){*x=24+(k&3)*26;*y=k<4?34:7;}
static void knob_label(void *bmp,int k,const char *name){int x,y,n=0;knob_place(k,&x,&y);while(name[n])n++;LABEL(bmp,x+9-n*2,y-7,name);}
static void knob_box(void *bmp,int k,const char *val,const char *name){
 int x,y,n=0;knob_place(k,&x,&y);while(val[n])n++;
 LABEL(bmp,x+9-n*2,y+6,val);knob_label(bmp,k,name);
}
static void knob_gfx(void *bmp,int k,u32 id,s32 v,const char *name){int x,y;knob_place(k,&x,&y);KNOB_GFX(id,v<<8,bmp,x,y);knob_label(bmp,k,name);}
static void num(char *v,u32 n){u32 i=0,j=0;char t[4];do{t[i++]='0'+n%10;n/=10;}while(n&&i<4);while(i)v[j++]=t[--i];v[j]=0;}
static void page2_draw(void *bmp){
 static const char *const btn_names[]={"FILL","UP","BOTH"};
 static const char *const gn[]={"OFF","SND","FLT","AMP","ALL"};
 static const char *const play_names[]={"TRIG","PICK","PTCH","WARP"};
 char v[8];u32 len=ram_loop_len;
 fw_fillrect(bmp,17,0,127,53,0);                         /* the knob area; header and left column stay stock */
 knob_box(bmp,0,loop_names[ram_set_mode%3],"MODE");
 knob_gfx(bmp,1,111,(s32)(1UL<<(ram_set_len&7)),"MAX");
 knob_box(bmp,2,src_names[ram_set_source&3],"SRCE");
 knob_gfx(bmp,3,10,(s32)ram_set_gain,"RLEV");
 knob_box(bmp,4,btn_names[ram_set_btn%3],"BTN");
 knob_box(bmp,5,gn[ram_set_sends%5],"GLOB");
 knob_box(bmp,6,play_names[ram_set_play&3],"PLAY");
 if(len>=248){num(v,len/48000);
  {u32 j=0;while(v[j])j++;v[j]='.';v[j+1]='0'+len%48000*10/48000;v[j+2]=0;}}   /* seconds */
 else{const char *st=short_state();u32 j=0;while(st[j]&&j<7){v[j]=st[j];j++;}v[j]=0;}   /* no loop yet: the state */
 knob_box(bmp,7,v,"LOOP");
}
u32 ram_key(u32 brain,u32 event){
 u32 code=R32(event+12),flags=R32(event+16);
 if(code==11&&(flags&9)==1)ram_stop=1;
 if(code==13&&ram_page2&&src_shown())return 1;        /* NO on page 2: nothing, as on the stock 2/2 pages; SRC pages */
 if(code==20&&src_shown()&&!(FW(0x400d399c)(1)&255)){   /* SRC on the looper's SRC page: the other page */
  if((flags&9)==1){ram_page2=!ram_page2;dt_knobs_reset(&ram_knobs);ram_redraw=1;}
  return 1;
 }
 if(code==14&&ram_set_btn&&ram_mode!=MODE_REC&&src_shown()
    &&!(FW(0x400d399c)(1)&255)&&!(FW(0x400d399c)(2)&255)){   /* UP on the looper's SRC pages: the button */
  if((flags&9)==1)ram_button();
  return 1;
 }
 if(R32(event+12)==43&&(R32(event+16)&3)==1&&!ram_page2&&ram_src_view&&ram_ticks-ram_src_seen<3){  /* the looper: push D (page 1) */
  u32 track=FW(0x4001d24e)(R32(ram_src_view+116));
  if(ui_machine(track)==RAM_P){edit_take(ram_src_view);return 1;}
 }
#ifdef DT_LINKABLE
 (void)brain;return 0; /* Observe STOP; core dispatches the native event. */
#else
 return FW(0x400084fe)(brain,event);
#endif
}
void ram_src_draw(u32 view,u32 bmp){
 u32 mode=FW(0x4002b5d4)(view);
 if(mode==RAM_P){ram_src_view=view;ram_src_seen=ram_ticks;}
 ram_ui=R32(view+0x6c);
 /* The base SRC painter shows the native icon while the machine picker is
  * open, and parameter controls otherwise. Skip only the expanded file
  * waveform: our volatile take has no file waveform to display. */
 if(mode==RAM_P)FW(0x4002b48c)(view,bmp);
 else FW(0x4003a8f4)(view,bmp);
}
/* ---- the recording indicator on every page ------------------------
 * While the looper records, a bar along the top edge of the screen fills up with the loop (or, in REC, the
 * take): inverted pixels, so the header stays readable. A letter in the top-right corner shows the
 * state: C capturing (CAPT), A armed (blinks), R recording the take, L locked, O ONCE idle. */
static u32 ram_any_loop;
static int ram_has_loop(u8 *kit){u32 t;for(t=0;t<8;t++){u8 m=FW_SOUND(kit,t)[FW_SOUND_MACHINE];if(m==RAM_P)return 1;}return 0;}  /* a track with the looper */
/* The status banner: it slides down over the header's title, like the stock page title, while a take
 * is armed, being captured or recorded, and for a moment after a loop is handed over. */
u32 ram_ban_y,ram_ban_hold;          /* rows of the banner shown (0 hidden, 10 whole); hold until */
static int banner_wanted(void){
 if(!ram_any_loop)return 0;
 if(ram_mode==MODE_REC)return ram_state==RECORDING;
 if(!loop_ready())return 0;
 return ram_once_stage||ram_capt_pending||ram_ticks<ram_ban_hold;
}
void ram_draw(void *bmp,void *ctrl){
 u32 num,den,y0;const char *t;int blink=(ram_ticks/8)&1;
 (void)ctrl;
 if(ram_page2&&src_shown())page2_draw(bmp);
 if(!ram_ban_y)return;
 y0=64-ram_ban_y;
 fw_fillrect(bmp,17,y0,127,63,0);            /* white on black, like the stock pop-ups */
 if(ram_ban_y==10){
  if(ram_mode==MODE_REC){t="RECORDING";num=ram_count;den=ram_target;}
  else{
   num=ram_len[ram_cur];den=ram_loop_len>=248?ram_loop_len:ram_loop_target;
   t=ram_once_stage==1?(blink?"":"ARMED"):ram_once_stage==2?"RECORDING":
     ram_capt_pending?(blink?"":"CAPTURE"):ram_mode==MODE_ONCE?"TAKEN":"CAPTURED";
  }
  if(*t)fw_textf(bmp,fw_font5,19,56,-1,"%s",t);
  {int x0=70,x1=125,w=den?(int)((u32)num*(u32)(x1-x0-1)/den):0;
   if(w>x1-x0-1)w=x1-x0-1;
   fw_fillrect(bmp,x0,55,x1,55,1);fw_fillrect(bmp,x0,61,x1,61,1);
   fw_fillrect(bmp,x0,55,x0,61,1);fw_fillrect(bmp,x1,55,x1,61,1);
   if(w>0)fw_fillrect(bmp,x0+1,56,x0+w,60,1);}
 }
}
u32 ram_tick(u32 ctrl){
 u32 t,need=0;static u32 shown=0xffffffff;u8 *kit=fw_kit;
 ram_ticks++;
 rl_tick();
 if(ram_edit_open&&REC_STATE!=4){ram_edit_open=0;ram_editor_busy=0;}  /* editor closed: release the take */
#ifndef DT_LINKABLE
 core_mtick();mp_tick((void *)ctrl);
#endif
 if(kit)for(t=0;t<8;t++){
  u8 mode=FW_SOUND(kit,t)[FW_SOUND_MACHINE];if(mode==RAM_P)need=1;
 }
 if(!need&&!ram_pcm&&ram_state==NO_MEMORY)ram_state=EMPTY;
 if(need&&!ram_pcm&&ram_state!=NO_MEMORY){
  /* Native buddy allocation rounds to 4 MiB. Keep for the session so no
   * active DMA reader can observe freed/reallocated memory. */
  u32 block=fw_op_new(CAPACITY*2+512);
  if(block){
   FW(0x400e8514)(block,CAPACITY*2+512); /* native zero fill, OS 1.53 */
   ram_pcm=(short *)((block+31)&~15UL);ram_buf[0]=ram_pcm;
  }else ram_state=NO_MEMORY;
 }
 {static u32 retry;                        /* the two extra loop buffers; when memory is short (another */
  if(retry)retry--;                        /* project's samples), NRAM on page 2, tried again every 3 s */
  else if(ram_loop_want&&!loop_ready()&&ram_pcm){
   u32 block=fw_op_new(CAPACITY*2+512);
   if(block){FW(0x400e8514)(block,CAPACITY*2+512);
    if(!ram_buf[1])ram_buf[1]=(short *)((block+31)&~15UL);else ram_buf[2]=(short *)((block+31)&~15UL);
    if(loop_ready())ram_loop_nomem=0;}
   else{ram_loop_nomem=1;retry=90;}
  }}
 ram_any_loop=need&&kit&&ram_has_loop(kit);
 {static u32 wait;                         /* PICK: no voice on the loop track yet: play it one note */
  if(wait)wait--;
  else if(ram_pick&&!pk_voice&&pick_track<8){
   if(SEQ_PLAYING==1)pk_quiet=1;            /* playing: silent until the next loop start */
   NOTEOFF((s32)pick_track,60,0x40);NOTEON((s32)pick_track,60,100,0x40,0,-1,-1);
   wait=15;                                 /* try again in half a second if it did not take */
  }}
 {static u8 *kit_was;static u32 ptn_was;     /* global sends */
  u32 ptn=R32(0x4199ec38),k;int fresh;
  if(kit!=kit_was||ptn!=ptn_was)ram_kit_tick=ram_ticks;
  fresh=ram_ticks-ram_kit_tick<30;             /* the second after a pattern change */
  if(ram_set_sends&&kit){
   u32 n=glob_count[ram_set_sends%5];
   if(!fresh)for(t=0;t<8;t++){                 /* a value changed in place: yours, shared from now */
    u8 *so=FW_SOUND(kit,t);
    if(so[FW_SOUND_MACHINE]!=RAM_P)continue;
    for(k=0;k<n;k++){u16 w=*(u16 *)(so+0x14+2*glob_ids[k]);
     if(k>=ram_glob_learned||w!=ram_seen_send[t][k])ram_gval[k]=w;}
    if(n>ram_glob_learned)ram_glob_learned=n;
   }
   for(t=0;t<8;t++){                           /* every the looper track gets the shared values */
    u8 *so=FW_SOUND(kit,t);
    if(so[FW_SOUND_MACHINE]!=RAM_P)continue;
    for(k=0;k<n&&k<ram_glob_learned;k++){u16 *w=(u16 *)(so+0x14+2*glob_ids[k]);
     if(*w!=ram_gval[k]||(fresh&&!(ram_ticks%3))){*w=ram_gval[k];fw_set_param(ram_gval[k],t,glob_ids[k]);}
     ram_seen_send[t][k]=*w;}
   }
  }
  kit_was=kit;ptn_was=ptn;}
 if(kit){                                  /* FUNC+NO and loads write the sound in place, and the loop voice */
  static u16 sent[8][43-25+1];             /* never retriggers: hand it each FLTR/AMP/send change (slots 25-43) */
  u32 k;
  for(t=0;t<8;t++){
   u8 *so=FW_SOUND(kit,t);
   if(so[FW_SOUND_MACHINE]!=RAM_P)continue;
   for(k=25;k<=43;k++){u16 w=*(u16 *)(so+0x14+2*k);
    if(w!=sent[t][k-25]){sent[t][k-25]=w;fw_set_param(w,t,k);}}
  }}
 {static u8 fill_was;                      /* FILL switched on: the capture/arm button */
  u8 f=FILL_ON;
  if(f&&!fill_was&&ram_set_btn!=1&&ram_mode!=MODE_REC)ram_button();
  fill_was=f;}
 if(ram_page2&&!src_shown()&&ram_src_view&&!R32(ram_src_view+0x2c))ram_page2=0;   /* another page: back to 1/2 next time */
 if(ram_redraw){ram_redraw=0;*(u8 *)(ctrl+0x20)=1;}
 {static u32 seen_gen;                     /* a loop was handed over: say so */
  if(ram_generation!=seen_gen){
   if(ram_mode!=MODE_REC&&ram_state==READY)ram_ban_hold=ram_ticks+75;   /* show the new loop for 2.5 s */
   seen_gen=ram_generation;
  }}
 {u32 y=ram_ban_y;                         /* slide the banner in or out, 3 rows a tick */
  if(banner_wanted())y=y+3>10?10:y+3;else y=y>3?y-3:0;
  if(y!=ram_ban_y||(y&&!(ram_ticks%3)))*(u8 *)(ctrl+0x20)=1;   /* moving, or its bar: ~10 redraws/s */
  ram_ban_y=y;}
 if(ram_page2&&src_shown()&&!(ram_ticks%3))*(u8 *)(ctrl+0x20)=1;
 {u32 key=ram_state|ram_locked<<4|ram_mode<<8|ram_once_stage<<12;
  if(need&&shown!=key){*(u8 *)(ctrl+0x20)=1;shown=key;}}
 return *(u8 *)(ctrl+0x20);
}

/* Before the native pipelined reader. The previous block's start mask is
 * the one native playback consumes now; it already passed mute/conditions. */
void ram_audio(u32 params,u32 machines,u32 starts,u32 stops,u32 velocities){
 u32 t,previous=R32(0x8000122c);
 if(ram_pending_reset){ram_pending_reset=0;kill_readers();previous=0;pk_voice=0;}
 if(ram_stop||stops==0xffffffffUL){ram_stop=0;finish();previous=0;pk_voice=0;}
 {u32 any_p=0;
  for(t=0;t<8;t++)if(core_track_machine[t]==RAM_P)any_p=1;
  ram_one_track=any_p;
  {u8 *kit=fw_kit;u32 k=8;                  /* PICK: the kit names the track (core_track_machine only after a trig) */
   if(kit)for(t=0;t<8;t++){u8 m=FW_SOUND(kit,t)[FW_SOUND_MACHINE];if(m==RAM_P&&k==8)k=t;}
   pick_track=k;
   if(ram_set_play&&k<8)ram_one_track=1;}
  if(ram_one_track){                        /* one-track looping from SETTINGS */
   ram_mode=ram_set_mode;
   if(ram_mode!=MODE_REC){ram_loop_target=steps_len(ram_set_len);ram_gain=ram_set_gain;ram_source=ram_set_source;ram_loop_want=1;}
  }
 }
 {static u32 was_playing,last_step,was_track=8;   /* PICK: the step grid decides where loops start */
  u32 pick=ram_one_track&&ram_set_play&&pick_track<8&&ram_mode!=MODE_REC&&loop_ready();
  u32 playing=SEQ_PLAYING==1,step=STEP_COUNT,steps=1UL<<(ram_set_len&7),boundary=0;
  if(pick){
   /* The grid ends a loop, not the sample count: let the capture run a little past MAX. */
   u32 target=ram_loop_target+ram_loop_target/8;
   ram_loop_target=target>CAPACITY?CAPACITY:target;
   if(playing&&!was_playing&&step==0){ram_len[ram_cur]=0;boundary=2;}   /* PLAY: the first loop starts */
   else if(playing&&step!=last_step&&step%steps==0)boundary=1;
   if(boundary==1&&ram_len[ram_cur]>=248)loop_end();
   t=pick_track;
   if(t!=was_track)pk_voice=0;
   /* Until the voice is set up, whatever plays the track (ram_tick's note, or a trig) goes through;
    * from then on the track's trigs are ignored and the grid restarts the loop. */
   if(!pk_voice){if(previous&(1UL<<t))pk_voice=1;}
   else{starts&=~(1UL<<t);previous&=~(1UL<<t);}
   if(pk_voice&&boundary&&ram_state==READY){ /* the loop starts: play the take from its start */
    pk_quiet=0;w_restart=1;
    starts|=1UL<<t;
    ((volatile u16 *)velocities)[t]=100<<8;
   }
   was_track=t;
  }
  if(!pick)pk_voice=0;
  ram_pick=pick;ram_pick_rec=pick&&playing;
  was_playing=playing;last_step=step;}
 if(ram_mode!=MODE_REC&&loop_ready()&&!ram_pick){   /* TRIG: a looper trig ends the loop being recorded */
  for(t=0;t<8;t++)if(core_track_machine[t]==RAM_P&&(previous&(1UL<<t))){if(ram_len[ram_cur]>=248){ram_stats[8]++;loop_end();}break;}
 }
 for(t=0;t<8;t++)if(IS_P(t)){
  *(u16 *)(params+t*106+0x3a)=0x8300;
  if(ram_set_play>=2&&ram_pick&&t==pick_track){ram_tune=*(u16 *)(params+t*106+0x34);*(u16 *)(params+t*106+0x34)=0x4000;}
  if(previous&(1UL<<t))ram_stats[ram_state==READY?4:3]++;
 }
 FW(0x40075184)(params,machines,starts,stops,velocities);
}
/* PLAY PTCH and WARP: a PICK loop follows the tempo. The loop is MAX steps
 * long, so its length gives the tempo it was recorded at, and the module renders the loop track's block
 * itself, here before the track's filter and amp. PTCH plays the loop faster or slower and the pitch
 * follows; WARP keeps the pitch: each step plays its own slice of the loop from the step's start, with a
 * short crossfade, and a slice that runs out before the next step (a slower tempo) fades to silence.
 * Meanwhile the native voice reads a constant buffer, so its block is the gain the track applies (LEV,
 * velocity), and the module's samples get the same gain. The voice reads that buffer at TUNE 0 (off 0 its
 * output is silent): ram_tick keeps the track's TUNE (ram_tune) and gives the voice 0; PTCH adds TUNE to
 * the rate, WARP can't shift pitch and leaves it out. STRT doesn't apply to these loops. */
#define VOICE(t) (0x8000edecUL+94UL*(t)-48)        /* OS 1.54 voice record: +8 PCM, +12 position, +28 count */
#define DC_N 512
static const short ram_dc[DC_N] __attribute__((aligned(16)))={[0 ... DC_N-1]=16384};
#define XF 64                                      /* WARP crossfade and fade-out, samples */
static u32 w_run,w_t,w_pi,w_pf,w_k,w_a,w_b,w_bend,w_xf;
static s32 w_seg,w_gain,w_gprev;               /* the track's gain, as last seen settled; the last block's */
static u32 w_settle;                            /* blocks until the voice's output is the constant buffer again */
static u32 w_oi,w_of;                           /* PTCH: the loop's end, fading out over the start */
static const u32 semi_q16[13]={65536,69433,73562,77936,82570,87480,92682,98193,104032,110218,116772,123715,131072};
static u32 tune_q16(u32 w){                     /* 2^((w-0x4000)/3072) in Q16 */
 s32 x=(s32)w-0x4000+12*256*4;u32 o,k,f,a;      /* +4 octaves keeps x positive (TUNE is +-24) */
 if(x<0)x=0;
 o=(u32)x/3072;k=((u32)x%3072)>>8;f=(u32)x&255;
 a=semi_q16[k]+(((semi_q16[k+1]-semi_q16[k])*f)>>8);
 return o>=4?a<<(o-4):a>>(4-o);
}
static u32 udiv_q16(u32 a,u32 b){             /* a/b in Q16, a/b < 8 */
 u32 q=a/b,r=a%b,i;
 if(q>=8)return 8UL<<16;
 for(i=0;i<16;i++){r<<=1;q<<=1;if(r>=b){r-=b;q|=1;}}
 return q;
}
static s32 rd(const short *pcm,u32 n,u32 p){return p<n?pcm[p]:0;}
static s32 gate_env(u32 p,u32 end){return p<end?XF:p-end<XF?(s32)(XF-(p-end)):0;}
static void warp_block(s32 *b,u32 t){
 u32 v=VOICE(t),n=ram_count,steps=ram_steps[ram_pub],tempo=FW(0x400770c8)(),now,rec,r,i;
 const short *pcm=ram_pcm;
 int dc=R32(v+8)==(u32)ram_dc;
 if(!dc)w_settle=3;                            /* restarted: its interpolator rings for about a block after the */
 else if(w_settle)w_settle--;                  /* switch back, so hold the last gain until it has settled */
 else{s32 g0=b[0]>>14,g1=b[31]>>14,d=g0-g1;   /* a flat block is the track's gain; the voice's own declick */
  if(d<0)d=-d;                                 /* fade before a restart is not (the module crossfades instead) */
  if(d<=(g1>>4)+2)w_gain=g1;
 }
 if(tempo<120)tempo=120;
 if(!steps)steps=1UL<<(ram_set_len&7);
 now=1382400000UL/tempo;                       /* samples a step now, Q4 */
 rec=(n<<4)/steps;                             /* samples a step in the loop, Q4 */
 r=udiv_q16(rec,now);if(r>(4UL<<16))r=4UL<<16;if(r<(1UL<<14))r=1UL<<14;
 if(ram_set_play==2&&ram_tune!=0x4000){r=((r>>4)*(tune_q16(ram_tune)>>4))>>8;if(r>(8UL<<16))r=8UL<<16;if(r<(1UL<<13))r=1UL<<13;}
 if(w_restart||!w_run||w_t!=t){              /* a loop start on the grid (ram_tick), or the renderer starts: */
  u32 p0=0;                                    /* mid-loop, from where the voice is. Any other restart of the */
  if(!w_restart&&!dc){p0=R32(v+12)>=32?R32(v+12)-32:0;if(p0>=n)p0=0;}   /* voice (a trig key) doesn't move the loop */
  if(w_restart&&w_run&&w_t==t&&ram_set_play==2){w_oi=w_pi;w_of=w_pf;}   /* PTCH: the end fades out */
  w_pi=p0;w_pf=0;
  if(w_run&&w_t==t&&ram_set_play==3){w_b=w_a;w_bend=((w_k+1)*rec)>>4;w_xf=XF;}   /* WARP: the old slice fades out */
  else w_xf=w_restart&&w_run&&w_t==t&&ram_set_play==2?XF:0;
  w_restart=0;
  w_k=(p0<<4)/rec;w_a=p0;w_seg=(s32)now-(s32)((p0<<4)-w_k*rec);if(w_seg<16)w_seg=16;
  w_run=1;w_t=t;
 }
 for(i=0;i<32;i++){
  s32 gain=w_gprev+(w_gain-w_gprev)*(s32)(i+1)/32,s;   /* glides to the block's gain */
  if(ram_set_play==2){
   s=0;
   if(w_pi+1<n){s32 x=pcm[w_pi],y=pcm[w_pi+1];s=x+(((y-x)*(s32)(w_pf>>1))>>15);}
   w_pf+=r&0xffff;w_pi+=(r>>16)+(w_pf>>16);w_pf&=0xffff;
   if(w_xf){                                   /* the loop's start, crossfaded from its end */
    s32 o=0;
    if(w_oi+1<n){s32 x=pcm[w_oi],y=pcm[w_oi+1];o=x+(((y-x)*(s32)(w_of>>1))>>15);}
    w_of+=r&0xffff;w_oi+=(r>>16)+(w_of>>16);w_of&=0xffff;
    s=(s*(XF-(s32)w_xf)+o*(s32)w_xf)/XF;w_xf--;
   }
  }else{
   u32 end;
   w_seg-=16;
   if(w_seg<=0){                               /* the next step: its slice, crossfaded */
    w_seg+=(s32)now;w_bend=((w_k+1)*rec)>>4;w_k++;w_b=w_a;w_a=(w_k*rec)>>4;w_xf=XF;
   }
   end=((w_k+1)*rec)>>4;
   s=rd(pcm,n,w_a)*(XF-(s32)w_xf)*gate_env(w_a,end);
   if(w_xf){s+=rd(pcm,n,w_b)*(s32)w_xf*gate_env(w_b,w_bend);w_xf--;}
   s>>=12;w_a++;w_b++;
  }
  b[i]=gain*s;
 }
 w_gprev=w_gain;
 R32(v+8)=(u32)ram_dc;R32(v+28)=DC_N;          /* the voice keeps playing, on the constant buffer */
 if(R32(v+12)>=DC_N-128)R32(v+12)=0;
}
static void warp_off(void){                    /* back to the native voice where the renderer was */
 u32 v;
 if(!w_run)return;
 w_run=0;v=VOICE(w_t);
 if(R32(v+8)==(u32)ram_dc){
  u32 p=ram_set_play==2?w_pi:w_a;
  R32(v+8)=(u32)ram_pcm;R32(v+28)=ram_count;R32(v+12)=p<ram_count?p:0;
 }
}
/* After native playback, before overdrive/filter/envelope. */
void ram_gate(s32 *blocks){
 u32 t,i;
 for(t=0;t<8;t++)if((IS_P(t)&&ram_state!=READY)||(ram_pick&&t==pick_track&&(!ram_pick_rec||pk_quiet))){
  for(i=0;i<32;i++)blocks[t*32+i]=0;
  VOICE_ACTIVE(t)=0;
 }
 if(ram_set_play>=2&&ram_pick&&ram_pick_rec&&!pk_quiet&&pick_track<8&&ram_state==READY&&ram_pcm&&ram_count>=248
    &&VOICE_ACTIVE(pick_track))warp_block(blocks+pick_track*32,pick_track);
 else warp_off();
}
/* Replaces the renderer's call to the main mixer. Native playback scales a
 * sample by about 0.138 on its way to MAIN (LEV 100, AMP VOL 110, track
 * level 100, centre pan), so a take captured from MAIN played back at 1/7.
 * Boost the looper's post-amp block before the mixer, which feeds MAIN and both
 * sends from it: a take then plays at the level it was recorded. There a
 * full-scale take is 0.73 of full scale at default LEV; saturate above.
 * Takes are stored normalized, so the gain is per take: ram_boost is the
 * fixed x7.227 divided by the take's normalization gain. */
#define TRACK_BLOCKS ((s32 *)0x80001a18UL)
u32 ram_mix(u32 out,u32 bus,u32 params){
 u32 t,i;s32 boost=(s32)ram_boost,limit=boost?0x7fffffff/boost:0;
 for(t=0;t<8;t++)if(IS_P(t)){
  s32 *b=TRACK_BLOCKS+t*32;
  for(i=0;i<32;i++){
   s32 v=b[i]>>12;
   b[i]=!boost?0:v>limit?0x7fffffff:v< -limit?(s32)0x80000001:v*boost;
  }
 }
 return FW(0x40071c20)(out,bus,params);
}
/* MAIN is taken from the mix on its way into the master compressor (the mixer's
 * call at 0x4007211c), not from the output, so a loop goes through the compressor once, when it plays.
 * At the compressor the bus is the output << 14 (32 stereo frames, L/R interleaved). */
static s32 pre_bus[64];
void ram_comp(s32 *dst,s32 *bus,u32 p,u32 q){
 u32 i;
 for(i=0;i<64;i++)pre_bus[i]=bus[i];
 FW(0x4007425e)(dst,bus,p,q);
}
static s32 sample_at(const s32 *mix,u32 i){
 s32 v;
 if(ram_source==1)v=mix[i*2]>>16;
 else if(ram_source==2)v=mix[i*2+1]>>16;
 else if(ram_source==3)v=((mix[i*2]>>16)+(mix[i*2+1]>>16))/2;
 else v=((pre_bus[i*2]>>14)+(pre_bus[i*2+1]>>14))/2;
 v=v*(s32)ram_gain/100;
 if(v>32767)v=32767;
 if(v< -32768)v= -32768;
 return v;
}
void ram_capture(u32 external,u32 usb,u32 main,u32 tracks){
 u32 n,i;const s32 *mix;
 u32 peak;
 FW(0x40076650)(external,usb,main,tracks); /* ordinary sampling unchanged */
 if(ram_state==READY)norm_step();
 mix=(const s32 *)(ram_source?external:main);
 if(ram_mode!=MODE_REC&&loop_ready()){      /* ONCE and CAPT: always recording, loop by loop */
  short *b=ram_buf[ram_cur];u32 len=ram_len[ram_cur];
  if(ram_pick&&!ram_pick_rec)return;        /* PICK: only while the sequencer plays, on its grid */
  n=CAPACITY-len;if(n>32)n=32;
  for(i=0;i<n;i++)b[len+i]=(short)sample_at(mix,i);
  ram_len[ram_cur]=len+n;
  if(len+n>=ram_loop_target){ram_stats[9]++;ram_stats[10]=ram_loop_target;loop_end();}   /* no looper trig within MAX steps: the loop ends here */
  return;
 }
 if(ram_state!=RECORDING)return;
 n=ram_target-ram_count;if(n>32)n=32;
 for(i=0;i<n;i++){
  s32 v=sample_at(mix,i);
  ram_pcm[ram_count+i]=(short)v;
  peak=v<0?-v:v;if(peak>ram_peak)ram_peak=peak;
 }
 ram_count+=n;ram_stats[6]++;
 if(ram_count==ram_target)finish();
}

static void play_switch(int32_t t,int32_t from,uint8_t *sound){
 (void)from;*(u16 *)(sound+0x38)=3*256;if(t<8)fw_set_param(3*256,t,18);
}
u32 ram_set(u32 object,u32 mode,u32 channel,u32 send){
 u32 old=FW(0x4002200a)(object),result=ram_native_set(object,mode,channel,send),t;
 u8 *sound=(u8 *)FW(R32(R32(object)+0x28))(object),*kit=fw_kit;
 /* Only explicit native machine selection resets source defaults. Polling
  * mode changes would also reset saved settings on project/sound loading. */
 if(result&&sound&&old!=mode&&sound[0x7e]==mode&&mode==RAM_P){
  for(t=0;t<8;t++)if(kit&&FW_SOUND(kit,t)==sound)break;
  play_switch(t,old,sound);
 }
 return result;
}
#define HIDDEN { .flags=CM_HIDDEN }
static const struct cm_ui play_ui={
 .abi=cm_ui_v3,.page_from=0,.group="LOOP PLAY",
 .knob={{0},{0},{0},HIDDEN,{0},{0},{0},{0}}
};
const struct cm_machine ram_play_machine={RAM_P,"LOOP&FADE","L&F",0,0,0,CM_UI_TAG,&play_ui};
#ifndef DT_LINKABLE
const struct cm_machine *const core_machines[]={&ram_play_machine,0};
void (*const ev_render_voices[])(s32 *)={ram_gate,0};
#endif
