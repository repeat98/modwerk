/* Test adapters for stock reads, interrupt mask and LCD invalidation. */
static uint8_t host_byte(uintptr_t address);
static uint32_t host_long(uintptr_t address);
#define BYTE(address) host_byte(address)
#define LONG(address) host_long(address)
static unsigned critical(void) { return 0; }
static void restore(unsigned sr) { (void)sr; }
static void redraw(void) {}
