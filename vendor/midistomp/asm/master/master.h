/* MASTER metering screen (docs/dev/master-ui-mockup.html is the spec): fixed addresses.
 * The section is 48 KB from 0xC010A000, lent by the looper (asm/looper/block.S region 1
 * starts at 0xC0116000). Code and small data first (scripts/build_master_ui.py END), then
 * the buffers below, which are not in the image: master.c clears them at first open. */
#ifndef MASTER_H
#define MASTER_H

#define MS_BASE   0xC010A000u
#define MS_FFT    ((float *)0xC0110480)           /* [1024] 512 complex: the 1024-point real FFT */
#define MS_SIN    ((float *)0xC0111480)           /* [257] sin(2 pi k / 1024), k = 0..256: twiddles and Hann; built at first open */
#define MS_RING_M ((short *)0xC0111C80)           /* [4096] mono (L + R) / 2, int16: scope, FFT */
#define MS_RING_S ((short *)0xC0113C80)           /* [2048] side (L - R) / 2, int16: stereo, loudness */
#define MS_HIST   ((unsigned short *)0xC0114C80)  /* [2][704] loudness histograms (I, LRA), 0.1 LU */
#define MS_END    0xC0116000u
#define RING_M_N  4096
#define RING_S_N  2048

/* The mixer's chain signal after the limiter (asm/mixer/engine.c): 16 floats, L x8 then R x8,
 * and the limiter gain (mixer.S GAINS +144, G_LIM = 5). */
#define MS_F      ((const volatile float *)0x11F03738)
#define MS_GLIM   (*(const volatile float *)(0xC00F6000u + 144 + 4 * 5))
/* The stock post mix after the engine (docs/dev/mixer-mode-m0.md step 10): F = ((F + Acc) * g1 + Snap * g2) * g3,
 * then out_to_int clamps to +-1. master_tap does the same sum, so the meters see the real output and its clipping. */
#define MS_ACC    ((const volatile float *)0x11F03778)
#define MS_SNAP   ((const volatile float *)0x11F037F8)
#define MS_PMG    ((const volatile float *)0x11F03B64)   /* g1, g2, g3 */

/* The OS (asm/mixer/mixer.S, stock.h) */
#define MS_B14        0xC00EF748u
#define MS_MODE       (*(volatile int *)(MS_B14 + 320))   /* 11 = menu */
#define MS_SCREEN     (*(volatile int *)(MS_B14 + 352))
#define MS_CUR_PATCH  (*(volatile int *)(MS_B14 + 324))
#define MS_MAILBOX    (*(volatile int *)(MS_B14 + 656))
#define MS_MENU_ENTRY (*(volatile unsigned char *)0xC00F60BF)   /* MENUSCR[7] (menu_enter.S): 3 = MASTER, 6 = KALEIDO */
#define MS_IDLE_SHOWN (*(volatile unsigned char *)0xC00F60B2)   /* KALEIDO opened by IDLE KALEIDO (chain_keys.c idle_ev) */

#endif
