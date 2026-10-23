// Loop Sync: the project storage fields of the sample slots' corrections.
// Field n holds slots 4n..4n+3, a signed byte each (tenths of a percent), the
// first slot in the high byte; slot 0 is OFF and unused. Keep in step with
// build.json's storage list (Modwerk allows 32 fields in all: 1 + 31).
#define LOOP_SYNC_SLOT_FIELDS \
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

