/* Private exact-base binding, not a production SDK capability. */
#ifndef OG_MACHINE_BASE_BINDING_H
#define OG_MACHINE_BASE_BINDING_H
#ifdef OG_MACHINE_BASE_BOUND
int og_machine_base_ready(void);
#else
/* Unbound host prototypes use controlled API implementations. */
static inline int og_machine_base_ready(void) { return 1; }
#endif
#endif
