// __NAME__ for the __MACHINE_NAME__: a Modwerk elemod module.
// The core calls the handlers named in build.json on its shared hooks, in order with other mods.
// Handlers use the C calling convention: arguments on the stack, d0-d1/a0-a1 free, the result in d0.
// Never copy firmware bytes into source: refer to the stock OS only through the core's documented symbols.

#include <stdint.h>

// ev_draw: after the OS has drawn the screen. bitmap is the frame buffer, ctrl the UI controller.
void mod_draw(uint8_t *bitmap, void *ctrl)
{
    (void)bitmap;
    (void)ctrl;
}
