// Mute Latch for the Digitakt II (OS 1.17): a Modwerk elemod module.
//
// PREP MUTES (FUNC held, TRIG keys choose tracks) normally mutes the chosen tracks the moment FUNC is let
// go. With PERFORM pressed in that session the choice is armed instead (header: MUTES ARMED) and applied at
// the pattern's first step, so every key can be released in between.
//
// FUNC + PERFORM opens a stock view over PREP MUTES, so the module takes that one key event (core ev_key)
// while a PREP MUTES session is open, tracks are chosen and the sequencer plays; every other key, and
// PERFORM anywhere else, goes on to the stock OS untouched. It follows the master track's step position on
// ev_tick (the UI task, about 30 Hz) and applies the choice on the tick that sees the last step; if that
// tick is missed, on the tick that sees the wrap. It patches no stock site: it reads a few words of the
// sequencer's state and the top view's object, calls the stock routine that applies a PREP MUTES choice and
// shows the stock header message. Those stock locations are named once, per release, in build.json.

#include <stdint.h>

#define PERFORM_KEY 7
#define TRACKS 16

// Stock locations of the release being built: build.json passes each one as a -D value
// (a compiled module cannot import a bare address, so they are constants, not linker symbols).
#define mlk_vt_prep ((const char *)MLK_VT_PREP)                       // vtable of the PREP MUTES view (the top view while it is open)
#define mlk_apply ((void (*)(void *))MLK_APPLY)                       // applies the view's mask: toggles each chosen track's mute, clears it
#define mlk_seq_pos ((volatile uint8_t *)MLK_SEQ_POS)                 // each track's step position (TRACKS bytes), 0 at the first step
#define mlk_seq_pattern (*(volatile uint32_t *)MLK_SEQ_PATTERN)       // address of the pattern the sequencer plays
#define mlk_seq_state (*(volatile uint32_t *)MLK_SEQ_STATE)           // 1 while the sequencer plays
#define mlk_ev_down ((int (*)(void *))MLK_EV_DOWN)                    // low byte: 1 for a key-down event
#define mlk_toast ((void (*)(void *, const char *, ...))MLK_TOAST)       // the header's message
#define mlk_ui_states ((uintptr_t (*)(void))MLK_UI_STATES)
#define mlk_brain ((uintptr_t (*)(void))MLK_BRAIN)                    // the Brain; its view controller is at +0x40

// Offsets inside the stock objects, found in OS 1.17 (see README "How it works").
#define VIEW_MASK 0x88        // u32 inside the PREP MUTES view: bit n = track n chosen
#define EV_CODE 0x0c          // u32 inside a key event: the key (PERFORM = 7)
#define VIEW_SESSION 0x8d     // u8: 1 while a PREP MUTES session is open (FUNC held)
#define PAT_PER_TRACK 0x1db79 // u8 inside the pattern: 1 = each track has its own length
#define PAT_MASTER_LEN 0x1db74
#define TRACK_STRIDE 0x6a5
#define TRACK_LEN 0x48c

static uint32_t parked;        // tracks waiting for the next first step
static void *view;             // the PREP MUTES view, once seen on top
static int last_pos = -1;      // the master track's position at the previous tick
static int was_playing;
static int taken;              // a PERFORM press was taken, so its release is taken too

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

// ev_key: PERFORM pressed in an open PREP MUTES session while the pattern plays parks the chosen tracks; with
// nothing chosen it drops what is parked. Both take the event, so Tap tempo does not open. Anything else
// returns 0 and the stock OS sees the event as if the module were not there.
int mod_key(void *brain, void *event)
{
    (void)brain;
    if (*(uint32_t *)((uint8_t *)event + EV_CODE) != PERFORM_KEY)
        return 0;
    if (!(mlk_ev_down(event) & 0xff)) {
        int was = taken;                        // the release of a press the module took
        taken = 0;
        return was;
    }
    void *obj = top_object();
    if (!obj || *(uint32_t *)obj != (uint32_t)(uintptr_t)mlk_vt_prep)
        return 0;
    uint8_t *v = (uint8_t *)obj;
    if (!v[VIEW_SESSION] || mlk_seq_state != 1)
        return 0;
    uint32_t *mask = (uint32_t *)(v + VIEW_MASK);
    if (*mask) {
        view = obj;
        parked ^= *mask & 0xffff;               // a second press of a track takes it back out
        *mask = 0;                              // so releasing FUNC applies nothing now
        mlk_toast((void *)mlk_ui_states(), "%s", parked ? "MUTES ARMED" : "ARM CANCELED");
    } else if (parked) {
        parked = 0;                             // PERFORM with nothing chosen cancels
        mlk_toast((void *)mlk_ui_states(), "%s", "ARM CANCELED");
    } else {
        return 0;                               // nothing to do: stock Tap tempo
    }
    taken = 1;
    return 1;
}

// ev_tick: runs in the UI task, so the stock view code never runs beside it.
void mod_tick(void *ctrl)
{
    (void)ctrl;
    int playing = mlk_seq_state == 1;
    uint8_t *pat = (uint8_t *)mlk_seq_pattern;

    // Stopping drops what is parked: the stock flow is the immediate one.
    if (!playing || !pat) {
        parked = 0;
        last_pos = -1;
        was_playing = 0;
        return;
    }

    // Follow the master track's step position on every tick, armed or not, so a wrap is seen
    // against the position of the previous tick and never against a stale one.
    int master = master_track(pat);
    int pos = mlk_seq_pos[master];
    int on_last = pos == track_len(pat, master) - 1;
    int wrapped = was_playing && last_pos >= 0 && pos < last_pos;
    last_pos = pos;
    was_playing = 1;

    // Apply on the tick that sees the last step, so the switch lands before the first step plays; the
    // wrap is the fallback if that tick was missed. A choice being made in a new PREP MUTES session is kept.
    if ((on_last || wrapped) && parked && view) {
        uint32_t *mask = (uint32_t *)((uint8_t *)view + VIEW_MASK);
        uint32_t chosen = *mask;
        *mask = parked;
        parked = 0;
        mlk_apply(view);
        *mask = chosen;
    }
}
