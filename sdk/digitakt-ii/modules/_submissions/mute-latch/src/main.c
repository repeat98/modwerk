// Mute Latch for the Digitakt II (OS 1.17): a Modwerk elemod module.
//
// PREP MUTES (FUNC held, TRIG keys choose tracks) normally mutes the chosen tracks the moment FUNC is let
// go. With TEMPO held in that session the choice is parked instead and applied on the next pass of the
// pattern's first step, so both hands are free in between.
//
// It uses the core's ev_tick (the UI task, about 30 Hz) and fw_key_down; it patches no stock site. It
// reads three words of the sequencer's state and the top view's object, and calls the stock routine that
// applies a PREP MUTES choice. Those stock locations are named once, per release, in build.json.

#include <stdint.h>

#define TEMPO_KEY 9
#define TRACKS 16

// Stock locations, resolved per release by build.json "defsym".
extern const char mlk_vt_prep[];             // vtable of the PREP MUTES view (the top view while it is open)
extern void mlk_apply(void *view);           // applies the view's mask: toggles each chosen track's mute, clears it
extern volatile uint8_t mlk_seq_pos[TRACKS]; // each track's step position, 0 at the first step
extern volatile uint32_t mlk_seq_pattern;    // address of the pattern the sequencer plays
extern volatile uint32_t mlk_seq_state;      // 1 while the sequencer plays

extern int mlk_key_down(int code);           // bit 0 while the key is down
extern uintptr_t mlk_brain(void);            // the Brain; its view controller is at +0x40

// Offsets inside the stock objects, found in OS 1.17 (see README "How it works").
#define VIEW_MASK 0x88        // u32 inside the PREP MUTES view: bit n = track n chosen
#define VIEW_SESSION 0x8d     // u8: 1 while a PREP MUTES session is open (FUNC held)
#define PAT_PER_TRACK 0x1db79 // u8 inside the pattern: 1 = each track has its own length
#define PAT_MASTER_LEN 0x1db74
#define TRACK_STRIDE 0x6a5
#define TRACK_LEN 0x48c

static uint32_t parked;        // tracks waiting for the next first step
static void *view;             // the PREP MUTES view, once seen on top
static int last_pos = -1;      // the master track's position at the previous tick
static int was_playing;

// The object of the view on top of the stack, or 0 when the stack is empty.
static void *top_object(void)
{
    char *ctrl = (char *)mlk_brain() + 0x40;    // the Brain's view controller
    char *node = *(char **)(ctrl + 0x18);       // its stack's last node is the top
    if (node == ctrl + 0x14)
        return 0;
    return *(void **)(node + 8);
}

// The pattern's length for a track, in steps.
static int track_len(uint8_t *pat, int t)
{
    if (pat[PAT_PER_TRACK])
        return *(int16_t *)(pat + t * TRACK_STRIDE + TRACK_LEN);
    return *(int16_t *)(pat + PAT_MASTER_LEN);
}

// The track whose wrap is the pattern's end: the longest, the lowest on a tie.
static int master_track(uint8_t *pat)
{
    int best = 0, longest = 0;
    for (int t = 0; t < TRACKS; t++) {
        int n = track_len(pat, t);
        if (n > longest) {
            longest = n;
            best = t;
        }
    }
    return best;
}

// ev_tick: runs in the UI task, so the stock view code never runs beside it.
void mod_tick(void *ctrl)
{
    (void)ctrl;
    int playing = mlk_seq_state == 1;
    uint8_t *pat = (uint8_t *)mlk_seq_pattern;

    // 1. Park the choice while TEMPO is held in an open PREP MUTES session.
    void *obj = top_object();
    if (obj && *(uint32_t *)obj == (uint32_t)(uintptr_t)mlk_vt_prep) {
        view = obj;
        uint8_t *v = (uint8_t *)obj;
        if (v[VIEW_SESSION] && (mlk_key_down(TEMPO_KEY) & 1) && playing) {
            uint32_t *mask = (uint32_t *)(v + VIEW_MASK);
            if (*mask) {
                parked ^= *mask & 0xffff;   // a second press of a track takes it back out
                *mask = 0;                  // so releasing FUNC applies nothing now
            }
        }
    }

    // 2. Stopping drops what is parked: the stock flow is the immediate one.
    if (!playing || !pat) {
        parked = 0;
        last_pos = -1;
        was_playing = 0;
        return;
    }

    // 3. Follow the master track's step position on every tick, parked or not, so a wrap is seen
    //    against the position of the previous tick and never against a stale one.
    int pos = mlk_seq_pos[master_track(pat)];
    int wrapped = was_playing && last_pos >= 0 && pos < last_pos;
    last_pos = pos;
    was_playing = 1;

    // 4. Apply on the wrap to the first step.
    if (wrapped && parked && view) {
        uint32_t *mask = (uint32_t *)((uint8_t *)view + VIEW_MASK);
        *mask = parked;
        parked = 0;
        mlk_apply(view);
    }
}
