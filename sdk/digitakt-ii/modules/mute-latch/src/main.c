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
#define mlk_fillrect ((void (*)(void *, int, int, int, int, int))MLK_FILLRECT)   // (bmp, x0, y0, x1, y1, colour 1 set 0 clear), y from the bottom
#define mlk_brain ((uintptr_t (*)(void))MLK_BRAIN)                    // the Brain; its view controller is at +0x40

// Offsets inside the stock objects, found in OS 1.17 (see README "How it works").
#define VIEW_MASK 0x88        // u32 inside the PREP MUTES view: bit n = track n chosen
#define EV_CODE 0x0c          // u32 inside a key event: the key (PERFORM = 7)
#define VIEW_SESSION 0x8d     // u8: 1 while a PREP MUTES session is open (FUNC held)
#define PAT_PER_TRACK 0x1db79 // u8 inside the pattern: 1 = each track has its own length
#define PAT_MASTER_LEN 0x1db74
#define TRACK_STRIDE 0x6a5
#define TRACK_LEN 0x48c

static uint32_t parked;        // tracks waiting for the end of the pattern
static int loops;              // PERFORM presses so far, 1 to 4: how many passes of the pattern to wait
static int remaining;          // passes still to wait; the switch comes at the end of the last one
static int seen_last;          // the master track's last step was already counted in this pass
static void *view;             // the PREP MUTES view, once seen on top
static int last_pos = -1;      // the master track's position at the previous tick
static int was_playing;
static int taken;              // a PERFORM press was taken, so its release is taken too
static const char note[] = "MUTES ARMED";   // the header message while armed

#define UI_MESSAGE 0x48        // std::string inside the UI states: the header's message
#define UI_MESSAGE_TIME 0x4c   // u32: ticks the message stays; the stock toast sets 30 or 120
#define UI_MESSAGE_KEEP 120

// Shows MUTES ARMED in the stock header message; the passes left and the loop icon are drawn by mod_draw.
static void show_armed(void)
{
    mlk_toast((void *)mlk_ui_states(), "%s", note);
}

// Does the header still show our message?
static int note_shown(uint8_t *ui)
{
    const char *a = *(const char **)(ui + UI_MESSAGE), *b = note;
    while (*a && *a == *b) {
        a++;
        b++;
    }
    return *a == 0 && *b == 0;
}

// While armed, keep the message up: the stock message counts its time down, so top it up each tick, but only
// while it still is ours (another message in the header is left to run out).
static void keep_armed_note(void)
{
    uint8_t *ui = (uint8_t *)mlk_ui_states();
    if (note_shown(ui))
        *(uint32_t *)(ui + UI_MESSAGE_TIME) = UI_MESSAGE_KEEP;
}

// Once the mutes have switched, let our message run out at once.
static void drop_armed_note(void)
{
    uint8_t *ui = (uint8_t *)mlk_ui_states();
    if (note_shown(ui))
        *(uint32_t *)(ui + UI_MESSAGE_TIME) = 1;
}

// The object of the view on top of the stack, or 0 when the stack is empty.
static void *top_object(void)
{
    char *ctrl = (char *)mlk_brain() + 0x40;    // the Brain's view controller
    char *node = *(char **)(ctrl + 0x18);       // its stack's last node is the top
    if (node == ctrl + 0x14)
        return 0;
    return *(void **)(node + 8);
}

// Is the PREP MUTES view still on the view stack? The view lives while Mute Mode is on (the same object in
// every FUNC session) and is freed when Mute Mode is left, so a pointer kept from an earlier press is only
// used after this check. The stack is a list: a header {next, prev} and nodes {next, prev, object, ...}.
static int view_alive(void *v)
{
    char *head = (char *)mlk_brain() + 0x40 + 0x14;
    char *node = *(char **)head;
    for (int n = 0; n < 32 && node && node != head; n++, node = *(char **)node)
        if (*(void **)(node + 8) == v)
            return *(const char **)v == mlk_vt_prep;
    return 0;
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

// ev_key: PERFORM pressed in an open PREP MUTES session while the pattern plays arms the chosen tracks. Each
// further press, with FUNC held, adds a pass of the pattern to wait, up to four; the fifth goes back to one.
// Choosing an armed track again and pressing PERFORM takes it back out, and the last one out cancels. Every
// press is taken, so the stock PERFORM view does not open. Anything else returns 0 and the stock OS sees
// the event as if the module were not there.
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
    int armed_before = parked != 0;
    if (*mask) {
        view = obj;
        parked ^= *mask & 0xffff;               // a second press of a track takes it back out
        *mask = 0;                              // so releasing FUNC applies nothing now
    } else if (!armed_before) {
        return 0;                               // nothing chosen, nothing armed: the stock key
    }
    if (parked) {
        loops = armed_before ? loops % 4 + 1 : 1;
        remaining = loops;
        show_armed();
    } else {
        mlk_toast((void *)mlk_ui_states(), "%s", "ARM CANCELED");
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

    // Stopping drops what is armed: the stock flow is the immediate one.
    if (!playing || !pat) {
        parked = 0;
        last_pos = -1;
        was_playing = 0;
        seen_last = 0;
        return;
    }

    // Follow the master track's step position on every tick, armed or not, so a pass is counted once.
    int master = master_track(pat);
    int pos = mlk_seq_pos[master];
    int on_last = pos == track_len(pat, master) - 1;
    int wrapped = was_playing && last_pos >= 0 && pos < last_pos;
    last_pos = pos;
    was_playing = 1;

    // A pass ends on the tick that sees the last step; the wrap counts it if that tick was missed.
    int passed = 0;
    if (on_last) {
        passed = !seen_last;
        seen_last = 1;
    } else {
        passed = wrapped && !seen_last;
        seen_last = 0;
    }

    if (!parked)
        return;
    if (!view || !view_alive(view)) {
        parked = 0;                             // Mute Mode was left: the choice goes with it
        drop_armed_note();
        return;
    }
    if (passed && --remaining <= 0) {
        // The last pass: switch before the first step plays. A choice being made in a new PREP MUTES
        // session is kept.
        uint32_t *mask = (uint32_t *)((uint8_t *)view + VIEW_MASK);
        uint32_t chosen = *mask;
        *mask = parked;
        parked = 0;
        mlk_apply(view);
        *mask = chosen;
        drop_armed_note();
        return;
    }
    if (passed)
        show_armed();
    keep_armed_note();
}

// The loop icon (9 x 7 pixels, two arrows chasing each other) one row per word, bit 8 is the left pixel.
static const uint16_t loop_icon[7] = { 0x008, 0x07e, 0x088, 0x101, 0x022, 0x0fc, 0x020 };

// The passes left, 1 to 4, as 3 x 5 pixel digits: one row per byte, bit 2 is the left pixel.
static const uint8_t digits[4][5] = {
    { 2, 6, 2, 2, 7 }, { 7, 1, 7, 4, 7 }, { 7, 1, 7, 1, 7 }, { 5, 5, 7, 1, 1 },
};

// ev_draw: after the OS has drawn the screen. While armed and our message is in the header, add the loop icon
// and the number of passes left right after it.
void mod_draw(void *bmp, void *ctrl)
{
    (void)ctrl;
    if (!parked || !note_shown((uint8_t *)mlk_ui_states()))
        return;
    for (int y = 0; y < 7; y++)
        for (int x = 0; x < 9; x++)
            if (loop_icon[y] & (0x100 >> x))
                mlk_fillrect(bmp, 79 + x, 63 - (2 + y), 79 + x, 63 - (2 + y), 0);
    int n = remaining < 1 ? 1 : remaining > 4 ? 4 : remaining;
    for (int y = 0; y < 5; y++)
        for (int x = 0; x < 3; x++)
            if (digits[n - 1][y] & (4 >> x))
                mlk_fillrect(bmp, 91 + x, 63 - (3 + y), 91 + x, 63 - (3 + y), 0);
}
