// Loop Sync: the project storage fields of the samples' settings.
// The 32 fields are one bit stream of 51 entries, 20 bits each: the slot (8
// bits, 0 a free entry), the mode (4) and the correction (8, signed, in 0.2 %
// steps), the first bit in a field's high bit. Keep in step with build.json's
// storage list (Modwerk allows 32 fields in all).
#define LOOP_SYNC_FIELDS \
    X(0) \
    X(1) \
    X(2) \
    X(3) \
    X(4) \
    X(5) \
    X(6) \
    X(7) \
    X(8) \
    X(9) \
    X(10) \
    X(11) \
    X(12) \
    X(13) \
    X(14) \
    X(15) \
    X(16) \
    X(17) \
    X(18) \
    X(19) \
    X(20) \
    X(21) \
    X(22) \
    X(23) \
    X(24) \
    X(25) \
    X(26) \
    X(27) \
    X(28) \
    X(29) \
    X(30) \
    X(31) \

