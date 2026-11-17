/* FRACT's authored SRC-page UI.  This unit owns presentation only. */
#ifndef FRACT_MACHINE_UI_H
#define FRACT_MACHINE_UI_H
#include <stdint.h>

enum { FRACT_UI_MAIN_COUNT = 6, FRACT_UI_SETUP_COUNT = 6,
       FRACT_UI_SAVED_BYTES = 12, FRACT_UI_BINS = 108 };
typedef struct {
    uint16_t peaks[FRACT_UI_BINS];
    uint32_t frames, position, length;
    uint32_t readers[3];
    uint16_t left[3], right[3];
    uint8_t reverse[3], sounding, active;
    uint8_t values[6];
    char caption[11];
} FractUiOverview;

extern const char *const fract_ui_main_labels[FRACT_UI_MAIN_COUNT];
extern const char *const fract_ui_setup_labels[FRACT_UI_SETUP_COUNT];

unsigned fract_ui_default(unsigned index);
void fract_ui_copy_saved_bytes(const uint8_t *part, unsigned track, uint8_t out[12]);
int fract_ui_machine_icon(uint32_t frame[256], unsigned track, unsigned selected);

void fract_ui_pool_heading(uint32_t frame[256]);
void fract_ui_control_text(char out[12], unsigned control, unsigned value);
void fract_ui_overview_draw(uint32_t frame[256], const FractUiOverview *view);
void fract_ui_tick(void);
void fract_ui_draw(unsigned char *frame);
struct modwerk_runtime_api;
void module_tick(struct modwerk_runtime_api *api);
void module_draw(unsigned char *frame);

#endif
