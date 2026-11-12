/* Original VECTOR phrase generator; no firmware, DSP or MIDI dependencies. */
#ifndef VECTOR_ENGINE_H
#define VECTOR_ENGINE_H
#include <stdint.h>
#include <stddef.h>
#define VECTOR_STEPS 64u
#define VECTOR_TRACK_BYTES 0x91au
#define VECTOR_LOCKS 0x59u
#define VECTOR_NO_LOCK 255u

typedef struct {
    uint8_t type, density, root, scale, gate, accent;
    uint8_t span, offset, rotation, repeat, direction;
} VectorParams;
typedef struct {
    uint8_t active, pitch, hold, volume;
} VectorStep;
typedef struct {
    VectorStep steps[VECTOR_STEPS];
    uint8_t length;
} VectorPhrase;
/* SRC A-F and secondary SRC SETUP controls. Seed is a separate argument.
 * Offset is stored as 0..24, displayed as -12..+12 semitones. */
extern const VectorParams vector_defaults;
extern const char *const vector_control_names[12];
extern const uint8_t vector_control_max[12];
extern const char *const vector_scale_names[5];
/* Nine bytes in the unused PICKUP slots; never spill into another track. */
void vector_pack(uint8_t out[9], const VectorParams *params, uint32_t seed);
void vector_unpack(VectorParams *params, uint32_t *seed, const uint8_t in[9]);
uint32_t vector_next_seed(uint32_t seed);
int vector_generate(VectorPhrase *out, const VectorParams *params,
                   unsigned length, unsigned base_volume, uint32_t seed);
/* Read/write a SINGLE native RAM TRAC record. No addressing of other tracks.
 * The caller must hold the editor's write boundary and mirror/publish it.
 * Slots 0/PTCH, 13/HOLD and 15/VOL are the only locks owned by generation.
 * Other locks and recorder/swing masks are preserved. */
int vector_track_empty(const uint8_t *record, size_t size);
int vector_write_phrase(uint8_t *record, size_t size,
                       const VectorPhrase *phrase, int replace);
#endif
