#include "firmware.h"
typedef unsigned long u32;
typedef signed long s32;
typedef unsigned short u16;
typedef unsigned char u8;
typedef signed char s8;
#define R32(a) (*(u32 *)(a))
#define FW(a) ((u32 (*)())(a))
#define PATTERN_SIZE 0x1ec68UL
#define TRACK_SIZE 0x38fUL
typedef struct { u8 enabled,p1,p2; s8 r1,r2,rotation; u8 op; } Euc;
extern Euc euc_patterns[128][16];
extern u32 euc_stats[16];
u32 euc_lock(void);
void euc_unlock(u32);
void euc_copy(void *,const void *,u32);
void euc_zero(void *,u32);
Euc *euc_settings(u32,u32);
s32 euc_length(u32,u32);
s32 euc_step(u32,u32,s32);
u32 euc_set(u32,u32,const Euc *);
u32 euc_commit(u32,u32);
void euc_notify(u32,u32);
u32 euc_open(u32);
