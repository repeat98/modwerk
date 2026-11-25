/* SPDX-License-Identifier: GPL-3.0-or-later
 * DECK: todo lo que el módulo lee del OS 1.40C del Octatrack, en un solo sitio.
 *
 * Cada dirección lleva su fuente y su grado de confianza:
 *   [OK]   usada por código de Modwerk probado en hardware (base o módulos).
 *   [DOC]  documentada en Octabam/Modwerk (lectura estática, emulador o una MK1
 *          ajena); hay que confirmarla en TU MK1 con `npm run device -- mem`.
 *   [??]   desconocida: el módulo usa un valor por defecto hasta que se sondee
 *          (ver PROBES.md). Nada aquí escribe en memoria del OS.
 *
 * La MK1 y la MKII comparten la imagen 1.40C, así que las direcciones son las
 * mismas; lo que cambia es el panel (teclas) y la pantalla (LCD en la MK1).
 */
#ifndef OT_STATE_H
#define OT_STATE_H
#include <stdint.h>

/* ---- Lectura de memoria ------------------------------------------------- */
#ifdef DECK_HOST
uint32_t host_rd32(uint32_t addr);
uint16_t host_rd16(uint32_t addr);
uint8_t host_rd8(uint32_t addr);
void host_redraw(void);
#define RD32(a) host_rd32(a)
#define RD16(a) host_rd16(a)
#define RD8(a) host_rd8(a)
#define OT_REDRAW() host_redraw()
#else
#define RD32(a) (*(const volatile uint32_t *)(uintptr_t)(a))
#define RD16(a) (*(const volatile uint16_t *)(uintptr_t)(a))
#define RD8(a) (*(const volatile uint8_t *)(uintptr_t)(a))
/* [OK] runtime.c: redibuja la pantalla de pista como hace CUE (0x4004d948(-1)).
 * Solo desde la tarea de UI (module_key / module_tick lo son). */
#define OT_REDRAW() ((void (*)(int))0x4004d948u)(-1)
#endif

/* ---- Variante de panel --------------------------------------------------- */
/* [OK] boot_anim.c (PANEL_MKII): palabra que el arranque pone por GPIO; 0 = MK1. */
#define OT_PANEL_MKII 0x46c8d18cu

/* ---- Motor de audio ------------------------------------------------------ */
/* [DOC] Octabam ARCHITECTURE.md §6: estado de voz por pista, 8 x 0xA8 bytes,
 * byte 0 = activa. */
#define OT_VOICE_BASE 0x800049d8u
#define OT_VOICE_STRIDE 0xA8u
#define OT_VOICE_ACTIVE 0x00u /* u8 */
/* [DOC] Octabam REPITCH.md: "T1's sample position (voice +68)", en frames. */
#define OT_VOICE_POS 0x44u /* u32 */
/* [DOC] Octabam STORAGE.md §4: al arrancar la voz, el OS copia la región de
 * trim del slot (inicio, fin) a la voz en +40. Leído en ot_emu (MKI, base de
 * desarrollo, 26 oct 2026) con un WAV de 120 s en una Static sin trim:
 * +0x28 = 0 y +0x2c = 5.292.000 frames (+0x34 y +0x3c también; +0x30 = 0, así
 * que +0x30 no es el final). Sin confirmar en una unidad real. */
#define OT_VOICE_START 0x28u /* u32, frames: inicio del trim */
#define OT_VOICE_END 0x2cu   /* u32, frames: fin del trim, donde la Static se para */

/* [DOC] Octabam RECORDER.md: tempo del proyecto, BPM x 24 (720..7200). */
#define OT_TEMPO24 0x80001814u /* u32 */

/* [DOC] Octabam MAINMENU.md §6: pista de audio actual (0..7). */
#define OT_CUR_TRACK 0x80000000u /* u8 */

/* [DOC] Octabam STORAGE.md (MK1): ajustes de cada slot STATIC, paso 0x448;
 * REPITCH.md: tempo de la muestra en +0x116 (BPM x 24). */
#define OT_STATIC_SETTINGS 0x100d5b30u
#define OT_SLOT_STRIDE 0x448u
#define OT_SLOT_TEMPO24 0x116u /* u16 */

/* [OK] status.c (DTCN3): contador libre del temporizador de frames, 132 MHz,
 * 32 bits (da la vuelta cada 32,5 s). Sirve para medir tiempo real. */
#define OT_DTCN3 0xfc07c00cu
#define OT_DTCN3_PER_MS 132000u

/* El Octatrack reproduce a 44,1 kHz; las posiciones de voz son frames. */
#define OT_RATE 44100u

/* ---- Desconocidos que hay que sondear (PROBES.md) ------------------------ */
/* Qué slot STATIC usa cada pista en la Part activa.         [??] P4 */
/* Muteo por pista (FUNC + TRACK).                            [??] P5 */
/* Envío a CUE por pista (CUE + TRACK) en modo NORMAL/STUDIO. [??] P6 */
/* Destinos de Output Matrix (MATRIX): byte de LEVEL/cue de la Part, según su
 * README "the choice is stored in the Part".                  [??] P7 */
/* Lista de slots, nombres y rutas (para el navegador).       [??] P8 */
/* API de ficheros de la CF para leer los .dkp:
 * STORAGE.md §1 (vtable 0x46c823fa..; open 0x46c8242a, size 0x46c8241e). [??] P9 */

#endif
