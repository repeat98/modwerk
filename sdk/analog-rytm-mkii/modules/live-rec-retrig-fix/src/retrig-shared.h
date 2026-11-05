// What both sources read: the retrig rates and the pattern in memory.
#define TRACKS 12               // the twelve pad tracks
#define PULSE_TICKS 10          // the sequencer's pulse, 24 PPQN

// OS 1.74 locations (build.json release cflags)
#define RT_ACTIVE ((volatile uint8_t *)RT_ACTIVE_AT)        // [t] 1: a pad's series
#define RT_COUNT ((volatile int32_t *)RT_COUNT_AT)          // [t] 960..1
#define RT_RATE(t) (*(volatile int32_t *)(RT_TEMPLATE_AT + 56 * (t) + 36))  // RETRIG 0..16
#define SEQ_PATTERN (*(volatile int8_t *)SEQ_PATTERN_AT)
#define SPEED_PULSES ((const int32_t *)SPEED_PULSES_AT)     // 3, 4, 6, 8, 12, 24, 48

// The pattern in memory (85760 bytes), and a track in it (917 bytes)
#define PATTERN(p) ((const volatile int8_t *)PATTERNS_AT + 85760 * (p))
#define PAT_SCALE 85689         // 1: ADVANCED, each track its own length and speed
#define PAT_SPEED 85690         // 0..6, as SPEED_PULSES
#define TRK_SPEED 711

// RETRIG 1/1 .. 1/80, in ticks
extern const int16_t retrig_period[17];

extern uint32_t STOCK_APP(void);
extern uint32_t STOCK_LIVE_REC(uint32_t app);
