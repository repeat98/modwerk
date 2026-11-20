/* gran.h - el motor granular de Model-TG (gran_fill), muy ampliado y optimizado, portado a C para la
 * Octatrack. Mismo calculo muestra a muestra; no depende de la Octatrack (se prueba en el PC con host_test.c).
 *
 * Origen: Model-TG, TinyGregAudio y roterodamus (MIT); Mejoras y cambios de A Force Truly Evil (con Claude): PAN, SYNC, DIR, SCAN, POS fina, optimizaciones. */
#ifndef GRAN_H
#define GRAN_H
#include <stdint.h>

#define GRAN_MAX 6                  /* granos por pista, como en el original */
#define GRAN_TRACKS 8

/* El sample, tal como lo guarda la Octatrack: frames intercalados de `channels` canales (1 o 2), cada uno `bytes` octetos
 * (2 = 16 bits, 3 = 24 bits) big-endian; se usan los 16 bits altos. En paginas: `locate` da la direccion de la pagina
 * que contiene `frame`, su primer frame y cuantos tiene (0 si no hay). Sin `locate`, `ctx` apunta a todo el sample.
 * Para el granular se forman al vuelo los planos del original: mid = (L+R)>>1, side = (L-R)>>1 (mono: solo mid). */
typedef struct {
    uint32_t count;                 /* frames */
    uint8_t bytes, channels;
    uintptr_t (*locate)(const void *ctx, uint32_t frame, uint32_t *first, uint32_t *n);
    const void *ctx;
} GranSample;

/* Los mandos, 0..127 salvo donde se dice. Se leen en cada bloque (p-locks, LFOs). */
typedef struct {
    uint8_t pos, size, dens, spray;
    uint8_t shape;                  /* 0 NORMAL (Hann), 1 TRI, 2 PERC, 3 SQUARE */
    uint8_t dir;                    /* 0 todos hacia delante .. 127 todos hacia atras; 64 = mitad (el RND del original) */
    uint8_t pan;                    /* 0..127 (0 = OFF); 127 = el PAN maximo del original */
    uint8_t sync;                   /* 0 RAND (libre), 1 SYNC */
    uint8_t freeze;                 /* 1: POS fija desde la nota (ya no se usa en la Octatrack) */
    int8_t scan;                    /* -64..+63: velocidad del cabezal, scan/32 (1.00 = la del sample, -2.00..+1.97); 0 = quieto */
    uint8_t sizef;                  /* fraccion de SIZE (octavos del mando): solo para la pantalla. El motor original lee SIZE
                                     * entera (sw_gran: asrl #8), asi que un ajuste copiado del original suena igual */
    uint8_t posf;                   /* fraccion de POS en 1/256 (escenas, LFOs); 0 = POS entera, igual que el original */
} GranParams;

typedef struct {
    uint32_t idx, fr, left, ph, phs, start, rev;
    int32_t pan;                    /* -32768..+32767 */
} GranGrain;

typedef struct {
    uintptr_t page;                 /* la ultima pagina leida: direccion, primer frame y frames */
    uint32_t pfirst, pcount;
} GranPage;

typedef struct {
    GranGrain g[GRAN_MAX];
    GranPage pg;
    uint32_t cd;                    /* muestras hasta el siguiente grano */
    uint32_t pos, fpos, spray, len, spacing;
    uint32_t scan, scanf;           /* SCAN: lo que ha corrido el cabezal desde la nota (frames, y fraccion Q16) */
    uint32_t count;                 /* largo del sample (para la pantalla) */
    uint8_t on, trig;
    uint32_t sync_tempo24, sync_division;  /* cached inputs for the current SYNC spacing */
} GranTrack;

typedef struct {
    GranTrack t[GRAN_TRACKS];
    uint32_t seed;                  /* gran_seed de Model-TG (Spray y Dir) */
    uint32_t pseed;                 /* gp_seed del PAN (azar propio) */
} GranEngine;

void gran_init(GranEngine *e);
/* Una nota: el primer grano sale en la primera muestra del siguiente bloque. */
void gran_trigger(GranEngine *e, unsigned track);
/* Lo que hace sw_gran en cada bloque: de mandos a muestras. tempo24 = BPM x 24 (como la Octatrack lo publica). */
void gran_params(GranEngine *e, unsigned track, const GranParams *p, const GranSample *s, uint32_t tempo24);
/* n muestras (1..32) de la pista en out[2*n] (L,R intercalados, 16 bits en la mitad alta de cada int32, como el paquete de
 * la Octatrack). whole/frac: el paso de lectura de la nota (1.0 = whole 1, frac 0; frac es Q0.32). */
void gran_render(GranEngine *e, unsigned track, const GranParams *p, const GranSample *s, int32_t whole, uint32_t frac,
                 int32_t *out, unsigned n);
#endif
