/* SPDX-License-Identifier: MIT
 * GRAIN: un motor granular (Model-TG) como maquina de pista de la Octatrack (base de Modwerk, OS 1.40C).
 *
 * El motor (gran.c) es el de Model-TG, sin cambios de sonido. Esta parte lo conecta con la Octatrack, copiando la forma de AMIGA
 * (sdk/octatrack/modules/amiga/amiga.c, Jannik Assfalg, MIT): stock prepara una nota FLEX normal y, antes de que el DSP la
 * remuestree, GRAIN sustituye su PCM fuente por la mezcla de granos, leida del propio sample FLEX en sus paginas.
 * Para que el remuestreador no toque nada, durante START y el render stock ve una FLEX «neutra» (PTCH 0, RATE adelante,
 * sin retrig ni time-stretch); el pitch lo aplica el motor, como en el original.
 *
 * Mandos (ESPECIFICACION_GRANULAR.md):
 *   SRC        A PTCH (de stock)  B POS   C SIZE  D DENS  E SPRY  F (libre)
 *   SRC SETUP  A SHAPE  B DIR  C PAN  D MODE  E FRZ  F (libre)
 *
 * [POR COMPROBAR en la unidad] todo lo marcado con «?»: valores del LOOP de stock, escala de PTCH, que el remuestreo
 * quede 1:1, y que relabelar los mandos B-D del SRC funcione como en E-F. Origen de las direcciones: amiga.c. */
#include <stdint.h>
#include "gran.c"
#include "modwerk_events.h"
#include "modwerk_page.h"

#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U16(a) (*(volatile uint16_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define FLEX_RENDER ((int (*)(unsigned, unsigned, unsigned, unsigned))(uintptr_t)0x40004008u)
#define FLEX_START ((int (*)(unsigned, unsigned, unsigned))(uintptr_t)0x4000f450u)
#define FP_PTR 0x800062a8u
#define CURSOR 0x80001c80u
#define TEMPO24 0x8000181cu
#define VOICE 0x800049d8u
/* tecla pulsada, como la mira el paso de serie de los mandos (0x4003240c): la capa de teclas, 24 octetos por tecla, +0x10 */
#define KEY_HELD(code) (U32(0x46c7d8eeu + 24u * (code)) != 0)
#define K_SRC 0x22u
#define K_FUNC 0x2du
#define FLEX_DEFAULTS 0x400d320cu   /* los 12 octetos con que empieza una pista FLEX */

static GranEngine eng = { .seed = GRAN_SEED0 };   /* el azar de SPRAY/DIR, desde donde el original (gran.c) */
static GranSample smp[8];

/* ---- el sample FLEX en la memoria de stock (como AMIGA, tras el adaptador FLEX de FRACT, ex1010, MIT) ---- */
typedef struct { uint32_t slot, perpage; } Pages;
static Pages pages[8];
static uintptr_t flex_page(const void *ctx, uint32_t frame, uint32_t *first, uint32_t *count)
{
    const Pages *p = ctx;
    uintptr_t bases = U32(0x80006918u), map = U32(0x80006914u);
    /* 0x40096f82 son las paginas LIBRES (flex_sample calcula las ocupadas como 14602 - eso), no el total: con ese tope
     * se descartaban las paginas de numero alto y el principio del sample salia en silencio (v0.2.4, Bell Pad C).
     * El tope es el total de paginas del arena, 14602. */
    uint32_t total = 14602u, index, page;
    if (((bases - 0x46000000u) | (map - 0x46000000u)) >= 0x02000000u) return 0;
    index = U32(bases + 4u * p->slot) + frame / p->perpage;
    if (index > total || !(page = U16(map + 2u * index)) || page > total) return 0;
    *first = frame - frame % p->perpage; *count = p->perpage;
    return U32(0x4000045eu) + page * 6144u;
}
static int recorder_idle(uint32_t slot)
{
    unsigned t = slot - 128u, sel = U32(0x80004f18u) >> t & 1u;
    return !U8(0x80004f1eu + 84u * (t + 8u * sel)) && (U8(0x80004f1eu + 84u * (t + 8u * (1u - sel))) | 2u) == 2u;
}
/* 1 cuando el sample de la voz se puede leer: lo describe en smp[track] */
static int flex_sample(unsigned track, uintptr_t voice)
{
    uint32_t taken = 14602u - U32(0x40096f82u), m = U32(voice + 4u) - 0x46c922c4u, slot = m / 44u;
    if (taken >= 14602u || U32(0x4000045eu) - 0x40a955e0u > (taken & 0xffffu) * 6144u || m % 44u || slot >= 136u) return 0;
    if (slot >= 128u && !recorder_idle(slot)) return 0;
    uintptr_t at = 0x46c922c4u + m;
    uint32_t mode = U32(at), frames = U32(at + 16u), id = U32(at + 20u);
    if (mode > 3u || U32(at + 8u) || frames - 1u >= 44860416u || !id || id != U32(0x46c920a4u + 4u * slot)) return 0;
    GranSample *s = &smp[track];
    s->bytes = mode < 2u ? 3u : 2u; s->channels = (uint8_t)((mode & 1u) + 1u); s->count = frames;
    s->locate = flex_page; s->ctx = &pages[track];
    if (pages[track].slot != slot) eng.t[track].pg.pcount = 0;  /* otro sample: olvidar la pagina en cache */
    pages[track].slot = slot; pages[track].perpage = 6144u / (s->bytes * s->channels);
    return 1;
}

/* Para la pantalla: el sample que la Part asigna a la pista (su byte de slot FLEX, Part + 0x2ca + 5t + 1, octabam
 * docs/firmware/PARTS.md 1a), sin esperar a que suene (v0.3.3 seguia dibujando el sample anterior hasta la nota).
 * Copia aparte (dsmp/dpages): la pantalla no toca lo que usa el render. */
static GranSample dsmp[8];
static Pages dpages[8];
static int slot_sample(unsigned track, uint32_t slot)
{
    uint32_t taken = 14602u - U32(0x40096f82u);
    if (taken >= 14602u || U32(0x4000045eu) - 0x40a955e0u > (taken & 0xffffu) * 6144u || slot >= 136u) return 0;
    if (slot >= 128u && !recorder_idle(slot)) return 0;
    uintptr_t at = 0x46c922c4u + 44u * slot;
    uint32_t mode = U32(at), frames = U32(at + 16u), id = U32(at + 20u);
    if (mode > 3u || U32(at + 8u) || frames - 1u >= 44860416u || !id || id != U32(0x46c920a4u + 4u * slot)) return 0;
    GranSample *s = &dsmp[track];
    s->bytes = mode < 2u ? 3u : 2u; s->channels = (uint8_t)((mode & 1u) + 1u); s->count = frames;
    s->locate = flex_page; s->ctx = &dpages[track];
    dpages[track].slot = slot; dpages[track].perpage = 6144u / (s->bytes * s->channels);
    return 1;
}

static uintptr_t lane(unsigned track)
{
    uintptr_t at = 0x80000510u + track * 48u, fp = U32(FP_PTR);
    return track < 8 && (fp == at || fp == at + 384u) ? fp : 0;
}

static unsigned packet(unsigned track, uintptr_t fp, uintptr_t before, int32_t **pcm)
{
    uintptr_t after = U32(CURSOR), record = 0x80001c90u + (fp - (0x80000510u + track * 48u)) / 384u * 0xa80u + track * 336u;
    if (before < record || before - record > 320u || after < before + 16u || after > record + 336u) return 0;
    uint32_t header = U32(before);
    unsigned sources = header & 255u, segments = 0;
    for (uint32_t h = header >> 8; h; h >>= 8, ++segments)
        if (!(h & 255u)) return 0;
    if (!segments || after - before != 16u + 4u * (segments - 1u) + 8u * sources) return 0;
    *pcm = (int32_t *)(before + 16u);
    return sources;
}

/* ---- los mandos: guardados de la vía (con p-locks, LFOs y escenas ya aplicados) mientras stock ve una FLEX neutra ---- */
typedef struct { uint16_t w[6]; uint8_t setup[6]; } View;   /* palabras del SRC (valor en el octeto alto) y octetos del SETUP */
static void view_open(uintptr_t fp, View *v)
{
    for (unsigned k = 0; k < 6; ++k) v->w[k] = U16(fp + 2u * k);
    for (unsigned k = 0; k < 6; ++k) v->setup[k] = U8(fp + 24u + k);
    U16(fp) = 0x4000u;                    /* PTCH 0: el motor pone el pitch ? */
    U16(fp + 2u) = 0;                     /* STRT al principio */
    U16(fp + 4u) = 0x7f00u;               /* LEN al maximo ? */
    U16(fp + 6u) = 0x7f00u;               /* RATE adelante, a velocidad normal */
    U32(fp + 8u) = 0x00004000u;           /* RTRG 0, RTIM centro (como AMIGA) */
    U8(fp + 24u) = 1;                     /* LOOP ON: la voz sigue viva mientras suena la nota ? */
    U8(fp + 25u) = 0;                     /* SLIC OFF */
    U8(fp + 26u) = U8(FLEX_DEFAULTS + 8u); U8(fp + 27u) = 0; U8(fp + 28u) = 0; U8(fp + 29u) = U8(FLEX_DEFAULTS + 11u);
}
static void view_close(uintptr_t fp, const View *v)
{
    for (unsigned k = 0; k < 6; ++k) U16(fp + 2u * k) = v->w[k];
    for (unsigned k = 0; k < 6; ++k) U8(fp + 24u + k) = v->setup[k];
}
static int bank_ok(void);
static volatile uint8_t *part_at(unsigned i);
/* Lo que GRAIN guarda en la Part pasa por si solo la comprobacion de stock (regla de Modwerk, docs/ADD_A_MODULE.md):
 * PTCH como el de FLEX (64 = 0, 40..88 para +-24); SHAP (0..3) y MODE (0..1) en LOOP y RATE; los octavos de POS en
 * TSNS (0..127); DIR y PAN, que necesitan 0..127, en el bloque NEIGHBOR de la pista (sin uso; como VECTOR y FM Synth):
 * tras la firma GR 1 (60 + 30 t), DIR en 63 + 30 t y PAN en 64 + 30 t. Sus casillas FLEX (SLIC, LEN) quedan en 0. */
#define NB_DIR(t) (63u + 30u * (t))
#define NB_PAN(t) (64u + 30u * (t))
static void params_of(const View *v, GranParams *p, unsigned track)
{
    /* POS con su fraccion: el octeto bajo de la palabra es lo que ponen las escenas, los LFOs y los slides entre dos
     * valores; girando el mando es 0 y POS suena igual que en el original */
    /* y los octavos del mando (SETUP F, oculto: pos_step), 1/8 = 32/256, como los pasos de POS del original */
    {
        /* solo si POS es la del mando tal cual (la de la Part, sin escena, LFO ni p-lock): con una escena el crossfader no
         * llegaba al principio, porque los octavos se sumaban tambien a su valor (author, 19/11) */
        uint32_t pw = v->w[1];
        if (!(pw & 0xffu) && bank_ok() && track < 8u && (pw >> 8) == part_at(U8(0x80000003u) & 3u)[0x30u + 30u * track + 1u])
            pw += 32u * (v->setup[5] & 7u);
        if (pw > 0x7fffu) pw = 0x7fffu;
        p->pos = (uint8_t)(pw >> 8); p->posf = (uint8_t)pw;
    }
    {   /* SIZE igual: sus octavos en SETUP E (indice 4), solo sin modulacion; en numeros enteros suena como siempre */
        uint32_t sw = v->w[2];
        if (sw > 0x7fffu) sw = 0x7fffu;
        p->size = (uint8_t)(sw >> 8); p->sizef = (uint8_t)sw;
    }
    p->dens = (uint8_t)(v->w[3] >> 8);
    p->spray = (uint8_t)(v->w[4] >> 8);
    {   /* SCAN: fuera de 0..127 es un RTIM heredado de stock o de la 0.1.0 (se veia «3.03»): cuenta como 0.00, quieto */
        unsigned sc = v->w[5] >> 8;
        p->scan = (int8_t)(sc > 127u ? 0 : (int)sc - 64);
    }
    p->shape = v->setup[0]; p->sync = v->setup[3]; p->freeze = 0;
    {   /* DIR y PAN, de la Part que suena */
        const volatile uint8_t *pp = bank_ok() && track < 8u ? part_at(U8(0x80000003u) & 3u) : 0;
        p->dir = pp ? pp[NB_DIR(track)] & 127u : 0; p->pan = pp ? pp[NB_PAN(track)] & 127u : 0;
    }
}

/* PTCH (palabra, 0x4000 = 0, 0x100 por semitono ?) -> paso de lectura Q32.32: 2^(st/12) */
static void pitch_step(uint16_t ptch, int32_t *whole, uint32_t *frac)
{
    static const uint32_t semi[12] = { /* 2^(k/12) en Q31 */
        2147483648u, 2275179671u, 2410468846u, 2553802834u, 2705659852u, 2866546703u,
        3037000500u, 3217589982u, 3408917050u, 3611618883u, 3826370402u, 4053888097u };
    /* PTCH de GRAIN: el mando va de 0 a 48 con 24 = 0 semitonos (-24..+24, como se pidio; stock llegaba a +-60).
     * Un valor mayor (pistas de versiones anteriores, centradas en 64) se recorta a +24. */
    int32_t st = (int32_t)(ptch >> 8) - 64;      /* como el PTCH de FLEX: 64 = 0 semitonos */
    if (st > 24) st = 24;
    if (st < -24) st = -24;
    int32_t oct = st >= 0 ? st / 12 : -((11 - st) / 12);
    uint64_t q = (uint64_t)semi[st - 12 * oct] << 1;    /* Q32 de 1..2 */
    /* oct va de -2 a +2: desplazamientos fijos (uno variable de 64 bits pide __ashldi3, que no hay en la base) */
    if (oct == 2) q <<= 2; else if (oct == 1) q <<= 1; else if (oct == -1) q >>= 1; else if (oct == -2) q >>= 2;
    *whole = (int32_t)(q >> 32); *frac = (uint32_t)q;
}

/* lo que suena de verdad (palabras del SRC tras p-locks, LFOs y escenas), para dibujarlo; live_at = live_tick del
 * ultimo render de la pista (live_tick lo avanza la pantalla) */
static uint16_t live_w[8][6];
static volatile uint32_t live_at[8], live_tick = 1;

int grain_start(unsigned track, unsigned sample, unsigned flags)
{
    uintptr_t fp = lane(track);
    if (!fp) return 0;
    View v;
    view_open(fp, &v);
    int result = FLEX_START(track, sample, flags);
    view_close(fp, &v);
    gran_trigger(&eng, track);
    return result;
}

/* La interrupcion de frame, dos veces por frame por pista nuestra: hasta 16 frames de salida por llamada. */
int grain_render(unsigned track, unsigned ping, unsigned start, unsigned end)
{
    uintptr_t fp = lane(track);
    if (!fp || start > end || end > 16) return 0;
    View v;
    uintptr_t before = U32(CURSOR), voice = VOICE + track * 168u;
    view_open(fp, &v);
    int result = FLEX_RENDER(track, ping, start, end);
    if (U8(voice)) {
        int32_t *pcm = 0;
        unsigned sources = packet(track, fp, before, &pcm);
        if (pcm && sources && sources <= 32u) {
            GranParams p;
            int32_t whole; uint32_t frac;
            params_of(&v, &p, track);
            for (unsigned k = 0; k < 6; ++k) live_w[track][k] = v.w[k];   /* para la pantalla: con escenas y LFOs */
            live_w[track][1] = (uint16_t)(p.pos << 8 | p.posf);            /* POS con sus octavos */
            live_w[track][2] = (uint16_t)(p.size << 8 | p.sizef);          /* SIZE con sus octavos */
            live_at[track] = live_tick;
            pitch_step(v.w[0], &whole, &frac);
            if (flex_sample(track, voice)) {
                gran_params(&eng, track, &p, &smp[track], U32(TEMPO24));
                gran_render(&eng, track, &p, &smp[track], whole, frac, pcm, sources);
            } else
                for (unsigned i = 0; i < 2u * sources; ++i) pcm[i] = 0;   /* sample ilegible: silencio */
        }
    }
    view_close(fp, &v);
    return result;
}

/* ---- la pagina ---- */
static void number(char *out, unsigned n)
{
    char digit[6]; unsigned k = 0;
    do digit[k++] = (char)('0' + n % 10u); while (n /= 10u);
    while (k) *out++ = digit[--k];
    *out = 0;
}
static void word(char *out, const char *text) { while ((*out++ = *text++)) {} }
static void shape_text(char *out, int v) { word(out, v <= 0 ? "NORM" : v == 1 ? "TRI" : v == 2 ? "PERC" : "SQR"); }
static void mode_text(char *out, int v) { word(out, v <= 0 ? "RAND" : "SYNC"); }
static void pan_text(char *out, int v) { if (v <= 0) word(out, "OFF"); else number(out, (unsigned)v); }
/* SCAN: valor del mando - 64, en 1/32: "-2.00" .. "+1.97" (1.00 = la velocidad del sample) */
static void scan_text(char *out, int v)
{
    int s = v > 127 ? 0 : v - 64; unsigned a = (unsigned)(s < 0 ? -s : s), c = a * 100u / 32u;
    *out++ = s < 0 ? '-' : s > 0 ? '+' : ' ';
    *out++ = (char)('0' + c / 100u); *out++ = '.'; *out++ = (char)('0' + c / 10u % 10u); *out++ = (char)('0' + c % 10u); *out = 0;
}
static void blank_text(char *out, int v) { (void)v; *out = 0; }
static void ptch_text(char *out, int v)
{
    int st = v - 64;
    if (st > 24) st = 24;
    if (st < -24) st = -24;
    if (st < 0) { *out++ = '-'; st = -st; } else if (st > 0) *out++ = '+';
    number(out, (unsigned)st);
}
#define KNOBS 12u
static const struct { uint8_t slot, start, count; char name[6]; void (*text)(char *, int); } knobs[KNOBS] = {
    {0, 64, 49, "PTCH", ptch_text},          /* 40..88 (minimo puesto aparte): -24..+24 */
    {1, 0, 128, "POS", 0}, {2, 64, 128, "SIZE", 0}, {3, 64, 128, "DENS", 0}, {4, 0, 128, "SPRY", 0},
    {5, 64, 128, "SCAN", scan_text},
    {6, 0, 4, "SHAP", shape_text}, {7, 0, 128, "DIR", 0}, {8, 0, 128, "PAN", pan_text}, {9, 0, 2, "MODE", mode_text},
    {10, 0, 1, "", blank_text}, {11, 0, 1, "", blank_text}};
static uint8_t defaults[12];
static uint8_t page[MODWERK_PAGE_BYTES] __attribute__((aligned(4)));
static uint32_t page_built;
#define BUILT 0x4752414eu

static uint32_t src_seen, setup_seen, draws;   /* el ultimo dibujo en que stock pidio nuestra pagina SRC / SETUP */
static uint32_t grain_page_any(void);
static uint32_t grain_page(const volatile uint8_t *slot)
{
    (void)slot;
    src_seen = draws + 1u;
    return grain_page_any();
}
/* POS en octavos al girar el mando, como en el original (41.0 41.1 41.2 41.3 41.5 41.6 41.7 41.8 42.0).
 * La rutina de los mandos de pagina 1 (0x40055008) pregunta a la pagina por la funcion de paso de cada mando
 * (P + 0x12a + 4 * slot; si es 0, el paso de serie de la base, mw_knob_step) con (slot, detents, valor) y guarda en la
 * Part lo que devuelve (ev_knob_store, 0x40055170; octabam lo usa para el cuantizador de PTCH). La parte entera es el
 * octeto de POS de siempre; los octavos (0..7) van en SETUP F (Part + 0x1e0 + 30 t + 5), oculto, cuyo rango de FLEX
 * (TSNS, 0..127) pasa el validador de stock. Despacio (un detent) avanza un octavo; deprisa, numeros enteros.
 * Girando con un trig pulsado (p-lock) no pasa por aqui: el p-lock es entero. */
static int bank_ok(void);
static volatile uint8_t *part_at(unsigned i);
static int ours(const volatile uint8_t *p, unsigned t);
static int pos_step(int slot, int detents, int value)
{
    unsigned t = U8(0x100b14ccu) & 7u, pi = U8(0x100b14cfu) & 3u;
    volatile uint8_t *part = part_at(pi);
    /* POS (slot 1): octavos en SETUP F (indice 5); SIZE (slot 2): en SETUP E (indice 4), tambien oculto (author, 19/11) */
    if (slot != 1 || !bank_ok() || !ours(part, t)) return value + detents;
    unsigned ix = slot == 1 ? 5u : 4u, at = 0x1e0u + 30u * t + ix;
    int e = value * 8 + (part[at] & 7);
    /* con el mando pulsado, como el paso de serie (0x4003240c): cada detent vale 7 numeros enteros; el estado de la tecla
     * del mando (0x38 + slot) esta en 0x46c7d8ee + 24 * (slot + 56) */
    if (U32(0x46c7d8eeu + 24u * (unsigned)(slot + 56))) e += detents * 7 * 8;
    else {
        /* Aceleracion por la velocidad de giro (author, 19/11: despacio, decimales; un poco mas deprisa, mas rapido, sin
         * tener que pulsar). El tiempo entre detents, con el temporizador libre del frame (DTCN3, 132 MHz): mas de 70 ms,
         * un octavo; 30-70 ms, un cuarto; 12-30 ms, una unidad; menos, dos unidades. Varios detents juntos = deprisa. */
        static uint32_t last;
        uint32_t now = U32(0xfc07c00cu), ms = (now - last) / 132000u;
        int ad = detents < 0 ? -detents : detents, per;
        last = now;
        if (ad > 1 || ms < 12u) per = 16;
        else if (ms < 30u) per = 8;
        else if (ms < 70u) per = 2;
        else per = 1;
        e += detents * per;
    }
    if (e < 0) e = 0;
    if (e > 127 * 8 + 7) e = 127 * 8 + 7;
    uint8_t fine = (uint8_t)(e & 7);
    part[at] = fine;
    U8(0x100a4eceu + pi * 6322u + at) = fine;      /* la copia de la Part en SRAM, como put12 */
    U8(0x80000830u + 72u * t + ix) = fine;           /* y la via, para que suene ya */
    return e >> 3;
}

/* Las ruedas de DIR y PAN (casillas 1 y 2 de la pagina 2): las dibuja la propia Octatrack con su rutina de ruedas
 * (0x400479b4, la que la pagina usa cuando la casilla no tiene otra), pero con el valor de verdad, que GRAIN guarda en
 * NEIGHBOR; en sus casillas FLEX hay un 0 que la comprobacion de arranque acepta. Argumentos, vistos en el emulador: la
 * posicion, la fila, la casilla (1 DIR, 2 PAN), el valor, las marcas, la funcion del texto y la superficie. Nada del
 * dibujo esta copiado: lo hace la Octatrack. */
/* El numero bajo cada rueda: la Octatrack dibuja la rueda de dos formas, con numero (marca 8) y sin el (marca 0). Se pide con
 * numero mientras se mantiene PLAYBACK y en la rueda que se acaba de girar (la Octatrack redibuja la pagina al girar un
 * mando y al pulsar o soltar una tecla). Se quita al salir de SETUP y al girar la otra rueda. */
static volatile uint8_t setup_turned[2];  /* DIR / PAN girada hace poco: su numero se ve */
static volatile uint8_t setup_visible;   /* SRC SETUP de una pista GRAIN a la vista (lo ve grain_draw en el fotograma) */
static unsigned number_state(void)
{
    return (KEY_HELD(K_SRC) ? 3u : 0u) | (setup_turned[0] ? 1u : 0u) | (setup_turned[1] ? 2u : 0u);
}
typedef void (*StockKnob)(uintptr_t, int, int, int, unsigned, const void *, void *);
static void grain_dial(uintptr_t a, int y, int slot, int value, unsigned flags, const void *text, void *surface)
{
    unsigned t = U8(0x100b14ccu) & 7u, pi = U8(0x100b14cfu) & 3u;
    if ((slot == 1 || slot == 2) && bank_ok()) {
        volatile uint8_t *part = part_at(pi);
        if (ours(part, t)) value = part[slot == 1 ? NB_DIR(t) : NB_PAN(t)] & 127u;
    }
    if (slot == 1 || slot == 2) flags = (number_state() >> (slot - 1u) & 1u) ? 8u : 0u;   /* con numero o sin el */
    ((StockKnob)(uintptr_t)0x400479b4u)(a, y, slot, value, flags, text, surface);
}

static uint32_t grain_page_any(void)
{
    if (page_built != BUILT) {
        static const char title[5] = "GRN", kind[13] = "GRANULAR";
        for (unsigned i = 0; i < sizeof page; ++i) page[i] = U8(0x400d3176u + i);   /* la pagina FLEX de stock */
        for (unsigned i = 0; i < 5; ++i) page[0x3c + i] = (uint8_t)title[i];
        for (unsigned i = 0; i < 13; ++i) page[0x41 + i] = (uint8_t)kind[i];
        for (unsigned k = 0; k < KNOBS; ++k)
            modwerk_page_control(page, knobs[k].slot, knobs[k].name, knobs[k].start, knobs[k].count, knobs[k].text);
        /* SETUP E y F vacios: su cifra en la palabra de dibujo de p8..p11 (P+0x18a, p8 en el nibble bajo) a 0, como las
         * casillas «---» de THRU/NEIGHBOR (octabam docs/firmware/PARAM_PAGES.md; FLEX = 0x00001751: LEN 1 RATE 5 TSTR 7 TSNS 1) */
        page[0x38 + 0x18a + 2] = 0;
        /* sin el lacito de las escenas (bit 2 de la cifra de dibujo: une el mando con el de su izquierda; en FLEX, STRT/LEN y
         * RTRG/RTIM). P+0x18e = 0x55311311 (p0 en el nibble bajo): p2 (SIZE) y p5 (SCAN) pasan de 3 a 1 (author, 19/11) */
        page[0x38 + 0x18e + 1] = 0x11; page[0x38 + 0x18e + 2] = 0x11;
        /* y DIR (p7) como PAN (nibble 1): sin la marca de dibujo de SLIC (bit 2), que pintaba su numero siempre; p6 (SHAP) queda en 5 */
        page[0x38 + 0x18e + 0] = 0x15;
        {   /* el paso de POS (slot 1) y de SIZE (slot 2): pos_step */
            uint32_t f = (uint32_t)(uintptr_t)pos_step;
            for (unsigned i = 0; i < 4; ++i) page[0x38 + 0x12a + 4 + i] = (uint8_t)(f >> (24 - 8 * i));
        }
        modwerk_page_put32(page, 0xa2u, 40u);    /* PTCH: minimo 40 (stock FLEX: 4..124, 64 = 0) */
        /* la rutina de dibujo de DIR y PAN (casillas 7 y 8; matriz de dibujo B, P + 0xfa + 4 * casilla) */
        modwerk_page_put32(page + 0x38, 0xfau + 4u * 7u, (uint32_t)(uintptr_t)grain_dial);
        modwerk_page_put32(page + 0x38, 0xfau + 4u * 8u, (uint32_t)(uintptr_t)grain_dial);
        page_built = BUILT;
    }
    return (uint32_t)(uintptr_t)(page + 0x38);
}
static uint32_t grain_setup_page(uint32_t stock) { (void)stock; setup_seen = draws + 1u; return grain_page_any(); }
static unsigned grain_admit(const volatile uint8_t *part, unsigned track)
{
    (void)part; (void)track;
    for (unsigned k = 0; k < 12; ++k) defaults[k] = U8(FLEX_DEFAULTS + k);
    for (unsigned k = 0; k < KNOBS; ++k) defaults[knobs[k].slot] = knobs[k].start;
    return 1;
}

/* ---- el pool de samples FLEX, igual que AMIGA (cola de S950/POLY8/FRACT, MIT) ---- */
#define BANK 0x46c82456u
#define POOL_WINDOW 0x460e70e0u
static uint32_t pool_bank, publish_bank;
static uint8_t pool_part, pool_track, pool_direct, publish_part, publish_tracks;
__asm__(".text\n\t.even\ngrain_stock_pool:\n\tmove.l %a2,-(%sp)\n\ttst.l 0x460e70e0\n\tjmp 0x400791ec\n");
extern void grain_stock_pool(void);
static int bank_ok(void) { uint32_t b = U32(BANK); return b >= 0x40000000u && b < 0x47f00000u; }
static volatile uint8_t *part_at(unsigned i) { return (volatile uint8_t *)(uintptr_t)(U32(BANK) + 0x8ed80u + i * 6322u); }
static int ours(const volatile uint8_t *p, unsigned t)
{
    const volatile uint8_t *s = p + 60u + 30u * t;
    return t < 8 && p[0x22u + t] == 1 && s[0] == 'G' && s[1] == 'R' && s[2] == 1;
}
static int pool_ours(void)
{
    return pool_direct && bank_ok() && U32(BANK) == pool_bank && (U8(0x100b14cfu) & 3u) == pool_part &&
        U8(0x100b14ccu) == pool_track && !U8(0x80000015u) && ours(part_at(pool_part), pool_track);
}
static unsigned grain_chooser(unsigned type, const volatile uint8_t *slot)
{
    return pool_ours() && slot == part_at(pool_part) + 0x22u + pool_track ? type : 5;
}
static void put12(volatile uint8_t *part, volatile uint8_t *mirror, unsigned t, const volatile uint8_t *from)
{
    for (unsigned k = 0; k < 12; ++k) {
        unsigned at = (k < 6 ? 0x30u : 0x1e0u) + 30u * t + k % 6u;
        part[at] = mirror[at] = from[k];
    }
}
static unsigned grain_assign(volatile uint8_t *part, unsigned t, unsigned on)
{
    unsigned index = 0;
    if (!bank_ok() || t >= 8) return (unsigned)-1;
    while (index < 4 && part != part_at(index)) ++index;
    if (index == 4) return (unsigned)-1;
    volatile uint8_t *mirror = (volatile uint8_t *)(uintptr_t)(0x100a4eceu + index * 6322u), *sig = part + 60u + 30u * t;
    int was = ours(part, t), keep = pool_ours() && part == part_at(pool_part) && t == pool_track;
    if (!on && !keep && !was) return 1;
    if ((on || keep) && !was) put12(part, mirror, t, defaults);
    if (!on && !keep) put12(part, mirror, t, (const volatile uint8_t *)(uintptr_t)FLEX_DEFAULTS);
    for (unsigned k = 0; k < 3; ++k) {
        uint8_t v = on || keep ? (uint8_t)"GR\1"[k] : 0;
        sig[k] = v; mirror[60u + 30u * t + k] = v;
    }
    if (!on && !keep)                       /* deja de ser GRAIN: DIR y PAN fuera de NEIGHBOR */
        for (unsigned a = NB_DIR(t); a <= NB_PAN(t); ++a) part[a] = mirror[a] = 0;
    if (!was || (!on && !keep)) {
        if (publish_bank != U32(BANK) || publish_part != index) publish_tracks = 0;
        publish_bank = U32(BANK); publish_part = (uint8_t)index; publish_tracks |= (uint8_t)(1u << t);
    }
    return 1;
}
static void grain_pool_open(void)
{
    if (!bank_ok() || U8(0x80000015u) || U32(0x460e5e30u) || U32(POOL_WINDOW)) return;
    unsigned part = U8(0x100b14cfu) & 3u, t = U8(0x100b14ccu);
    if (!ours(part_at(part), t)) return;
    pool_bank = U32(BANK); pool_part = (uint8_t)part; pool_track = (uint8_t)t; pool_direct = 1;
    grain_stock_pool();
    if (!U32(POOL_WINDOW)) pool_direct = 0;
    ((void (*)(int))(uintptr_t)0x4004d948u)(-1);
}
static void grain_pool_left(unsigned key, unsigned edge)
{
    pool_direct = 0;
    ((void (*)(unsigned, unsigned))(uintptr_t)0x4007893cu)(key, edge);
}
static volatile uint8_t want_src_page;      /* ui_tick: volver a la pagina SRC (tras FUNC + PLAYBACK) */
/* Partes guardadas con la 0.3.14 o antes: DIR y PAN estaban en SLIC y LEN (0..127, que stock no admite) y PTCH en 0..48
 * con 24 = 0. Se pasan a su sitio nuevo en las cuatro Parts del banco y su copia de SRAM. Un PTCH entre 40 y 48 ya no se
 * distingue (se toma como nuevo). */
static void grain_migrate(void)
{
    if (!bank_ok()) return;
    for (unsigned i = 0; i < 4u; ++i) {
        volatile uint8_t *part = part_at(i), *mirror = (volatile uint8_t *)(uintptr_t)(0x100a4eceu + i * 6322u);
        for (unsigned t = 0; t < 8u; ++t) {
            if (!ours(part, t)) continue;
            unsigned s = 0x1e0u + 30u * t;
            if (part[s + 1] > 1u || part[s + 2] > 1u) {
                part[NB_DIR(t)] = mirror[NB_DIR(t)] = part[s + 1] & 127u;
                part[NB_PAN(t)] = mirror[NB_PAN(t)] = part[s + 2] & 127u;
                part[s + 1] = mirror[s + 1] = 0; part[s + 2] = mirror[s + 2] = 0;
            }
            if (part[0x30u + 30u * t] < 40u) {
                uint8_t v = (uint8_t)(part[0x30u + 30u * t] + 40u);
                part[0x30u + 30u * t] = mirror[0x30u + 30u * t] = v;
            }
        }
    }
}

static void grain_ui_tick(void)
{
    grain_migrate();
    if (!setup_visible) setup_turned[0] = setup_turned[1] = 0;   /* fuera de SETUP, sin numeros */
    if (want_src_page) {    /* FUNC + PLAYBACK abrio SRC SETUP: de vuelta a la pagina SRC (pantalla completa) */
        want_src_page = 0;
        ((void (*)(unsigned, unsigned))(uintptr_t)0x40055720u)(0x22u, 1u);
    }
    /* el pool abierto desde una pista GRAIN sigue siendo suyo mientras no se vuelva a una pagina: tambien en el explorador
     * de archivos que se abre desde el (otra carpeta). La 0.3.14 lo olvidaba al cerrarse la ventana del pool, y al cargar el
     * sample la pista dejaba de ser GRAIN (author, 19/11). Lo cierra grain_draw al ver SRC o SRC SETUP. */
    if (pool_direct && !pool_ours()) pool_direct = 0;
    unsigned tracks = publish_tracks;
    publish_tracks = 0;
    if (!tracks || !bank_ok() || U32(BANK) != publish_bank || (U8(0x100b14cfu) & 3u) != publish_part || U8(0x80000015u)) return;
    volatile uint8_t *part = part_at(publish_part);
    for (unsigned t = 0; t < 8; ++t)
        if (tracks >> t & 1u)
            for (unsigned k = 0; k < 6; ++k) {
                ((int (*)(unsigned, unsigned, unsigned))(uintptr_t)0x40054cd8u)(t, k, part[0x30u + 30u * t + k]);
                U8(0x80000830u + 72u * t + k) = part[0x1e0u + 30u * t + k];
            }
}

/* ---- la pantalla: la zona de los 6 mandos del SRC pasa a ser la ventana de onda con los granos ----
 * Lo demas (tempo, LEV, pista, barra de titulo) lo dibuja stock tal cual. Fotograma de 128 x 64: el pixel (x, y) es el
 * bit (y & 7) del octeto x * 8 + 7 - (y >> 3) (como lo usa Tiempos). Granos como en el original: 3 x 3
 * encendido con marco de 1 px apagado; x = posicion en el sample, y = paneo. POS = linea de puntos con triangulito. */
/* La zona de mandos de stock. En las fotos, su linea izquierda esta en x 60-61 y la derecha en 115-116: no se fija al
 * pixel, se busca en cada fotograma (v0.2.1 la esperaba en x 61 exacto y por eso no dibujaba). */
static int WX0 = 60, WX1 = 116;
#define WY0 6                       /* para buscar las lineas del marco */
#define WY1 52
#define CY0 9                       /* desde aqui se borra: encima quedan los nombres PTCH POS SIZE de la propia OT */
#define COLS 64                     /* columnas de la forma de onda calculada (se escalan al ancho real) */
static unsigned char *fbp;
static void dpx(int x, int y, int on)
{
    if ((unsigned)x > 127u || (unsigned)y > 63u) return;
    unsigned char *b = fbp + x * 8 + 7 - (y >> 3), m = (unsigned char)(1u << (y & 7));
    if (on) *b |= m; else *b &= (unsigned char)~m;
}
/* El texto, con la fuente pequena de la propia Octatrack (0x400ba876) y su rutina de texto, como hace Pattern Sample
 * Locks (native.c): una superficie local copiada de stock que apunta a este fotograma; y se cuenta desde abajo. */
#define OS_FONT 0x400ba876u
static int os_width(const char *s) { return ((int (*)(uint32_t, int, const char *))0x40012f30u)(OS_FONT, -1, s); }
static void os_text(int x, int top, const char *s)
{
    uint32_t surface[7];
    for (unsigned i = 0; i < 7u; ++i) surface[i] = U32(0x400bf10au + 4u * i);
    surface[3] = (uint32_t)(uintptr_t)fbp;
    ((void (*)(uint32_t, void *, int, int, int, const char *))0x40012bd8u)(OS_FONT, surface, x, 59 - top, -1, s);
}
static void dinv(int x0, int y0, int x1, int y1)
{
    for (int x = x0; x <= x1; ++x)
        for (int y = y0; y <= y1; ++y) {
            if ((unsigned)x > 127u || (unsigned)y > 63u) continue;
            fbp[x * 8 + 7 - (y >> 3)] ^= (unsigned char)(1u << (y & 7));
        }
}
static unsigned slen(const char *s) { unsigned n = 0; while (s[n]) ++n; return n; }

/* la forma de la onda del sample (pico por columna), calculada una vez por sample */
static uint8_t env_l[8][COLS], env_r[8][COLS];
static uint32_t env_slot[8] = { 0xffffffffu, 0xffffffffu, 0xffffffffu, 0xffffffffu, 0xffffffffu, 0xffffffffu, 0xffffffffu, 0xffffffffu };
static void envelope(unsigned t)
{
    GranSample *s = &dsmp[t];
    GranPage pg = { 0, 0, 0 };
    uint32_t step = s->count / COLS + 1u;
    if (!s->count || env_slot[t] == dpages[t].slot) return;
    env_slot[t] = dpages[t].slot;
    for (unsigned c = 0; c < COLS; ++c) {
        int32_t pl = 0, pr = 0;
        for (unsigned k = 0; k < 16u; ++k) {
            uint32_t f = c * step + k * (step / 16u + 1u), first = 0, n = s->count;
            if (f >= s->count) break;
            if (f - pg.pfirst >= pg.pcount) {
                uintptr_t page = s->locate(s->ctx, f, &first, &n);
                pg.page = page; pg.pfirst = first; pg.pcount = page ? n : 0;
                if (!page) continue;
            }
            const uint8_t *q = (const uint8_t *)pg.page + (f - pg.pfirst) * s->bytes * s->channels;
            int32_t l = (int16_t)(q[0] << 8 | q[1]), r = s->channels > 1 ? (int16_t)(q[s->bytes] << 8 | q[s->bytes + 1]) : l;
            if (l < 0) l = -l;
            if (r < 0) r = -r;
            if (l > pl) pl = l;
            if (r > pr) pr = r;
        }
        env_l[t][c] = (uint8_t)(pl >> 8); env_r[t][c] = (uint8_t)(pr >> 8);
    }
    /* normalizada al pico del sample, como la dibuja el editor de la Octatrack (v0.2.0: los pads salian planos) */
    /* al pico, sin recortar: v0.3.3 recortaba al doble de la media y la onda llenaba la ventana como un bloque (foto de
     * author, 19/11, frente a la del original) */
    unsigned peak = 1;
    for (unsigned c = 0; c < COLS; ++c) { if (env_l[t][c] > peak) peak = env_l[t][c]; if (env_r[t][c] > peak) peak = env_r[t][c]; }
    /* escala de raiz cuadrada (127 * sqrt(v / pico)): realza lo flojo, como los editores de audio; en lineal el arranque de
     * un pad salia plano */
    for (unsigned c = 0; c < COLS; ++c)
        for (unsigned ch = 0; ch < 2; ++ch) {
            uint8_t *e = ch ? &env_r[t][c] : &env_l[t][c];
            unsigned q = (unsigned)*e * 16129u / peak, r = 0;   /* 127^2 * v / pico; su raiz entera */
            while ((r + 1u) * (r + 1u) <= q) ++r;
            *e = (uint8_t)r;
        }
}

static uint8_t last_val[8][6], show_k = 0xff, show_t;
static uint32_t show_until;
static void value_text(char *out, unsigned k, unsigned v)
{
    if (k == 0) ptch_text(out, (int)v);
    else if (k == 2) {          /* SIZE en milisegundos: 10.0 .. 99.9 con un decimal, luego enteros hasta 1000 */
        uint32_t d = gran_size[v > 127 ? 127 : v] * 10000u / 44100u;   /* decimas de ms */
        if (d < 1000u) { number(out, d / 10u); unsigned n = slen(out); out[n] = '.'; out[n + 1] = (char)('0' + d % 10u); out[n + 2] = 0; }
        else number(out, d / 10u);
    }
    else if (k == 5) scan_text(out, (int)v);
    else number(out, v);
}
/* POS con una decimal, como el original («44.5»): la palabra del mando en 1/256 */
static void pos_text(char *out, unsigned w)
{
    unsigned d = (w > 0x7fffu ? 0x7fffu : w) * 10u / 256u;
    number(out, d / 10u);
    unsigned n = slen(out); out[n] = '.'; out[n + 1] = (char)('0' + d % 10u); out[n + 2] = 0;
}

/* una columna de pixeles de y0 a y1 encendida (on) o apagada, por octetos enteros: mucho menos trabajo que pixel a
 * pixel (la 0.3.2 cargaba la CPU de la unidad) */
static void vfill(int x, int y0, int y1, int on)
{
    if ((unsigned)x > 127u) return;
    if (y0 < 0) y0 = 0;
    if (y1 > 63) y1 = 63;
    while (y0 <= y1) {
        int top = y0 | 7, end = y1 < top ? y1 : top;
        unsigned char m = (unsigned char)(((1u << (end - y0 + 1)) - 1u) << (y0 & 7));
        unsigned char *b = fbp + x * 8 + 7 - (y0 >> 3);
        if (on) *b |= m; else *b &= (unsigned char)~m;
        y0 = end + 1;
    }
}

/* POS de la Part con sus octavos, en 1/256 */
static unsigned part_pos(volatile uint8_t *part, unsigned t)
{
    unsigned w = ((unsigned)part[0x30u + 30u * t + 1] << 8) + 32u * (part[0x1e0u + 30u * t + 5u] & 7u);
    return w > 0x7fffu ? 0x7fffu : w;
}
/* SIZE de la Part con sus octavos (SETUP E), en 1/256 */
static unsigned part_size(volatile uint8_t *part, unsigned t)
{
    unsigned w = ((unsigned)part[0x30u + 30u * t + 2] << 8) + 32u * (part[0x1e0u + 30u * t + 4u] & 7u);
    return w > 0x7fffu ? 0x7fffu : w;
}

/* La onda del sample de la pista con la linea de POS y los granos vivos, en las columnas x0..x1 y las filas top..bot:
 * la misma en la pagina SRC y en la pantalla completa. Azul sobre blanco, una centrada (mono) o L arriba y R abajo
 * (estereo). */
static void wave_area(unsigned t, volatile uint8_t *part, int x0, int x1, int top, int bot)
{
    GranTrack *g = &eng.t[t];
    GranSample *s = &dsmp[t];
    if (!slot_sample(t, part[0x2cau + 5u * t + 1u])) s->count = 0;
    int live = live_at[t] + 8u > live_tick, mid = (top + bot) / 2, width = x1 - x0 + 1;
    /* se recalcula cada ~2 s: la primera vez el sample puede estar cargandose aun (en el emulador: «1>LOADING») y la onda
     * quedaba guardada a medias, con el principio vacio */
    static uint32_t env_at[8];
    if (s->count && (env_slot[t] != dpages[t].slot || draws - env_at[t] > 120u)) { env_slot[t] = 0xffffffffu; envelope(t); env_at[t] = draws; }
    if (!s->count || env_slot[t] != dpages[t].slot) {
        for (int x = x0; x <= x1; x += 2) dpx(x, mid, 1);            /* sin sample leido todavia: la linea central */
        return;
    }
    int st = s->channels > 1, half = st ? (bot - top) / 4 : (bot - top) / 2;
    int ml = st ? top + half : mid, mr = bot - half;
    /* con margen arriba y abajo, como el original: el pico llega a 3/4 de su media ventana */
    int amp = (half - 1) * 3 / 4;
    for (int c = 0; c < width; ++c) {
        int e = c * COLS / width, x = x0 + c, hl = env_l[t][e] * amp / 127, hr = env_r[t][e] * amp / 127;
        vfill(x, ml - hl, ml + hl, 1);
        if (st) vfill(x, mr - hr, mr + hr, 1);
    }
    /* POS: linea de puntos y triangulito, FIJA donde esta POS; con SCAN son los granos los que corren (author, 18/11).
     * POS de lo que suena (con escenas y LFOs) mientras suena; si no, el de la Part; misma cuenta que el motor */
    uint32_t step = s->count / (uint32_t)width + 1u, pw = live ? live_w[t][1] : part_pos(part, t);
    uint32_t at = gran_position(s->count, pw > 0x7fffu ? 0x7fffu : pw);
    int px = x0 + (int)(at / step);
    for (int y = top + 3; y <= bot; y += 2)          /* en inverso: se ve tambien encima de la onda */
        if ((unsigned)px <= 127u && (unsigned)y <= 63u) fbp[px * 8 + 7 - (y >> 3)] ^= (unsigned char)(1u << (y & 7));
    for (int i = 0; i < 3; ++i) for (int x = px - 2 + i; x <= px + 2 - i; ++x) dpx(x, top + i, 1);
    /* los granos vivos (solo si el render lee este mismo sample: tras cambiarlo, hasta la nota siguiente no hay granos
     * suyos). 3 x 3 encendido con marco de 1 px apagado; x = posicion, y = paneo */
    for (unsigned k = 0; k < GRAN_MAX && live && pages[t].slot == dpages[t].slot; ++k) {
        if (!g->g[k].left) continue;
        int gx = x0 + (int)((g->g[k].idx < s->count ? g->g[k].idx : s->count - 1) / step);
        int gy = mid + g->g[k].pan * ((bot - top) / 2 - 3) / 32768;
        for (int y = gy - 2; y <= gy + 2; ++y)
            for (int x = gx - 2; x <= gx + 2; ++x)
                dpx(x, y, (x - gx <= 1 && gx - x <= 1 && y - gy <= 1 && gy - y <= 1));
    }
}

/* El valor de un mando para la pantalla: POS con sus octavos (lo que suena, si suena), el resto con value_text */
static void knob_value(char *buf, unsigned t, volatile uint8_t *part, unsigned k)
{
    if (k == 1) pos_text(buf, live_at[t] + 8u > live_tick ? live_w[t][1] : part_pos(part, t));
    else if (k == 2) number(buf, part[0x30u + 30u * t + 2]);   /* SIZE 0..127, entera como la lee el motor (author, 19/11) */
    else value_text(buf, k, part[0x30u + 30u * t + k]);
}

/* ---- la pantalla completa (maqueta A, elegida el 19/11) ----
 * Tercera pagina de PLAYBACK (author, 19/11): SRC -> (doble pulsacion) SRC SETUP -> PLAYBACK otra vez -> pantalla
 * completa. Desde SETUP, stock vuelve con esa pulsacion a la pagina SRC (0x4005578c), y encima se dibuja la pantalla
 * entera. Otra pulsacion de PLAYBACK, otra pagina u otra pista la cierran. (FUNC + PLAYBACK queda como en stock.) A la izquierda, la columna LEV de stock copiada tal cual (x 43-58, filas 0-31 de la pagina SRC) y la
 * pista; arriba PTCH POS SIZE y abajo DENS SPRY SCAN, cada uno con su valor a la derecha; el que se gira, en inverso. */
#define KEY_ROWS 0x46100b18u        /* las filas de teclas del panel: bit b de la fila n = tecla n*8+b pulsada */

#define FX0 18                      /* la zona de mandos y onda de la pantalla completa: x 18..127 */
static uint8_t full, full_t;

static void full_draw(unsigned t, volatile uint8_t *part, int sel)
{
    static const char *const names[6] = { "PTCH", "POS", "SIZE", "DENS", "SPRY", "SCAN" };
    uint8_t lev[16][4];
    for (int x = 0; x < 16; ++x) for (int b = 0; b < 4; ++b) lev[x][b] = fbp[(43 + x) * 8 + 4 + b];   /* filas 0-31 */
    for (int i = 0; i < 128 * 8; ++i) fbp[i] = 0;
    for (int x = 0; x < 16; ++x) for (int b = 0; b < 4; ++b) fbp[x * 8 + 4 + b] = lev[x][b];
    vfill(16, 0, 63, 1);                                                  /* el borde de la columna */
    {   /* la pista, en su casilla invertida, abajo de la columna */
        char tr[3] = { 'T', (char)('1' + t), 0 };
        int w = os_width(tr);
        os_text((16 - (w > 0 ? w : 0)) / 2, 56, tr);
        for (int x = 0; x <= 15; ++x) for (int y = 54; y <= 62; ++y) fbp[x * 8 + 7 - (y >> 3)] ^= (unsigned char)(1u << (y & 7));
    }
    int cw = (127 - FX0 + 1) / 3;
    for (unsigned k = 0; k < 6; ++k) {
        int cx = FX0 + 1 + (int)(k % 3) * cw, y = k < 3 ? 1 : 58;
        char buf[8];
        knob_value(buf, t, part, k);
        int wv = os_width(buf); if (wv < 0) wv = 0;
        os_text(cx + 1, y, names[k]);
        os_text(cx + cw - 3 - wv, y, buf);
        if ((int)k == sel)                                                /* el mando que se gira, en inverso */
            for (int x = cx; x <= cx + cw - 2; ++x) for (int yy = y - 1; yy <= y + 5; ++yy)
                fbp[x * 8 + 7 - (yy >> 3)] ^= (unsigned char)(1u << (yy & 7));
        if (k % 3) for (int yy = y - 1; yy <= y + 5; yy += 2) dpx(cx - 1, yy, 1);
    }
    for (int x = FX0 + 1; x <= 127; x += 2) { dpx(x, 7, 1); dpx(x, 56, 1); }
    wave_area(t, part, FX0 + 1, 127, 9, 54);
}

void grain_draw(unsigned char *frame)
{
    static const char *const names[6] = { "PTCH", "POS", "SIZE", "DENS", "SPRY", "SCAN" };
    static uint8_t src_was;
    ++draws; ++live_tick;
    {   /* PLAYBACK pulsada (flanco): desde SRC SETUP, la tercera pulsacion, abre la pantalla completa (stock vuelve a la
         * pagina SRC y encima se dibuja); con ella abierta, cualquier pulsacion la cierra */
        /* stock cambia de pagina al procesar la tecla, antes del dibujo que ya la ve pulsada: cuenta si SETUP se veia en el
         * dibujo anterior (en el emulador, la 0.3.10 miraba si se veia en ese momento y nunca abria) */
        static uint8_t was_setup;
        uint8_t down = KEY_HELD(K_SRC) ? 1u : 0u, press = down && !src_was, setup_before = was_setup;
        src_was = down;
        /* SRC SETUP de una pista nuestra: la pagina de stock sin la barra de titulo invertida de abajo (fila 59). La funcion
         * de pagina de SETUP no se llama en cada dibujo (contadores en pantalla, emulador 19/11), asi que se mira el fotograma */
        {
            unsigned tt = U8(0x100b14ccu) & 7u; int lit = 0;
            for (int x = 20; x < 110; ++x) lit += (frame[x * 8 + 7 - (59 >> 3)] >> (59 & 7)) & 1;
            was_setup = bank_ok() && !U8(0x80000015u) && U8(0x46c7d8d8u) == 0 && !U32(POOL_WINDOW) && !U32(0x460e5e30u) &&
                ours(part_at(U8(0x100b14cfu) & 3u), tt) && lit * 2 < 90;
            setup_visible = (uint8_t)was_setup;
            if (was_setup && !U32(POOL_WINDOW)) pool_direct = 0;        /* de vuelta en una pagina: el pool, cerrado */
        }
        if (press) {
            unsigned tt = U8(0x100b14ccu) & 7u;
            if (full) full = 0;
            else if (setup_before && bank_ok() && !U8(0x80000015u) && ours(part_at(U8(0x100b14cfu) & 3u), tt)) {
                full = 1; full_t = (uint8_t)tt;
            }
        }
    }
    /* nuestra pagina SRC pedida hace poco. Moviendo el crossfader stock se salta algunos dibujos (video del autor, 19/11:
     * asomaban las ruedecitas de stock y la pantalla completa se cerraba): margen de 30; lo que decide es el fotograma */
    if (src_seen + 30u < draws || !bank_ok() || U8(0x80000015u)) return;
    if (setup_seen + 3u >= draws) return;                                  /* SRC SETUP abierta (v0.2.2 pintaba encima) */
    /* la pagina que muestra stock (0x46c7d8d8, la pone la tecla de pagina 0x4005578c: SRC 0, LFO 1, AMP 2, FX1 3, FX2 4):
     * stock pide nuestra pagina SRC tambien con AMP, LFO o FX abiertas, y la 0.3.3 pintaba la onda encima de ellas */
    if (U8(0x46c7d8d8u) != 0) { full = 0; return; }
    /* con SCENE A o B pulsada, la pagina de stock tal cual: sus ruedecitas ensenan el valor que se bloquea en la escena
     * (fila 3 del panel, 0x46100b18 + 3: bit 1 SCENE A 0x19, bit 2 SCENE B 0x1a; octabam docs/firmware/PANEL.md) */
    if (U8(KEY_ROWS + 3u) & 6u) return;
    if (U32(POOL_WINDOW) || U32(0x460e5e30u)) return;                      /* el pool o un popup de stock, abiertos */
    unsigned t = U8(0x100b14ccu) & 7u, pi = U8(0x100b14cfu) & 3u;
    volatile uint8_t *part = part_at(pi);
    /* la pantalla completa es un modo, como la pagina 2 de stock: sigue al cambiar a otra pista GRAIN (author, 19/11); en
     * una pista que no es GRAIN no se dibuja, y vuelve al volver a una GRAIN */
    if (!ours(part, t)) return;
    full_t = (uint8_t)t;
    fbp = frame;
    /* Solo si en el fotograma se ve la pagina de stock tal cual: la linea vertical continua a la izquierda de los mandos.
     * Cualquier ventana (explorador de archivos, lista de samples, menus) la tapa, y entonces no se dibuja nada (v0.2.0
     * pintaba encima de «LOAD FILE TO FLEX» y de la lista del pool). */
    {
        int left = -1, right = -1;
        for (int x = 54; x <= 66 && left < 0; ++x) {
            int y = WY0 + 2;
            while (y <= WY1 - 4 && (frame[x * 8 + 7 - (y >> 3)] & (1u << (y & 7)))) ++y;
            if (y > WY1 - 4) left = x;
        }
        for (int x = 122; x >= 108 && right < 0; --x) {
            int y = WY0 + 2;
            while (y <= WY1 - 4 && (frame[x * 8 + 7 - (y >> 3)] & (1u << (y & 7)))) ++y;
            if (y > WY1 - 4) right = x;
        }
        if (left < 0 || right < 0 || right - left < 40) return;
        /* y la barra de titulo de abajo («GRANULAR:GRAIN», invertida): la pagina SRC la tiene; SRC SETUP y las ventanas
         * no (v0.2.3 pintaba encima de SETUP). En el video la barra ocupa las filas 58-61: se mira la 59, entre la linea
         * izquierda y la derecha, y tiene que estar encendida en mas de la mitad. */
        int on = 0, n = 0;
        for (int x = left + 2; x < right - 2; ++x, ++n) on += (frame[x * 8 + 7 - (59 >> 3)] >> (59 & 7)) & 1;
        if (on * 2 < n) return;
        WX0 = left; WX1 = right;
    }
    if (!U32(POOL_WINDOW)) pool_direct = 0;                                 /* la pagina SRC a la vista: el pool, cerrado */
    /* valores de los mandos (los de la Part): el que cambia se muestra un segundo */
    static uint8_t known[8];   /* la primera lectura de una pista no cuenta como giro (salia «0.00» al entrar) */
    for (unsigned k = 0; k < 6; ++k) {
        uint8_t v = part[0x30u + 30u * t + k];
        if (v != last_val[t][k]) {
            last_val[t][k] = v;
            if (known[t]) { show_k = (uint8_t)k; show_t = (uint8_t)t; show_until = draws + 60u; }
        }
    }
    {   /* un octavo de POS tambien es un giro de POS */
        static uint8_t last_fine[8];
        uint8_t f = part[0x1e0u + 30u * t + 5u] & 7u;
        if (f != last_fine[t]) { last_fine[t] = f; if (known[t]) { show_k = 1; show_t = (uint8_t)t; show_until = draws + 60u; } }
    }
    known[t] = 1;
    int turned = show_t == t && show_until > draws ? show_k : -1;
    if (full) { full_draw(t, part, turned); return; }
    /* hasta la fila 56, justo encima de la barra de titulo (57): en la 0.3.0 asomaban en las filas 53-54 los pies de
     * las ruedecitas de stock (visto en el emulador, mapa de pixeles) */
    for (int x = WX0 + 1; x < WX1; ++x) vfill(x, CY0, 56, 0);
    int cw = (WX1 - WX0) / 3;
    for (unsigned k = 0; k < 6; ++k) {
        /* arriba: los nombres los pone la propia OT (filas 3..7); al girar, el valor los sustituye. os_text(top) escribe
         * en las filas top..top+4 (mapa de pixeles del emulador). Abajo, simetrico a lo de arriba (author, 18/11): onda,
         * linea de puntos (fila 49), una fila libre y los nombres en las filas 51-55 */
        int cx = WX0 + 1 + (int)(k % 3) * cw, y = k < 3 ? 3 : 51;
        char buf[8]; const char *s = names[k];
        int sel = turned == (int)k;
        if (k < 3 && !sel) continue;
        /* al girar: se borra la casilla entera del nombre y se escribe el valor en su sitio */
        if (sel) {
            knob_value(buf, t, part, k);
            s = buf;
            for (int x = cx; x < cx + cw - 1; ++x) vfill(x, y - 1, y + 5 > 56 ? 56 : y + 5, 0);
        }
        int w = os_width(s), tx = cx + (cw - (w > 0 ? w : 0)) / 2;
        os_text(tx, y, s);
        if (k % 3) for (int yy = y - 1; yy <= y + 5 && yy <= 56; yy += 2) dpx(cx - 1, yy, 1);
    }
    for (int x = WX0 + 1; x < WX1; x += 2) { dpx(x, CY0, 1); dpx(x, 49, 1); }   /* lineas de puntos: bajo los nombres de arriba y sobre los de abajo */
    wave_area(t, part, WX0 + 1, WX1 - 1, CY0 + 1, 47);
}

/* SRC SETUP: los mandos B (DIR) y C (PAN) los edita GRAIN, en NEIGHBOR; el resto, stock */
static unsigned grain_setup_knob(unsigned index, int delta)
{
    unsigned t = U8(0x100b14ccu) & 7u, pi = U8(0x100b14cfu) & 3u;
    if ((index != 1u && index != 2u) || !bank_ok()) return 0;
    volatile uint8_t *part = part_at(pi), *mirror = (volatile uint8_t *)(uintptr_t)(0x100a4eceu + pi * 6322u);
    if (!ours(part, t)) return 0;
    unsigned a = index == 1u ? NB_DIR(t) : NB_PAN(t);
    int v = (int)(part[a] & 127u) + delta;
    if (v < 0) v = 0;
    if (v > 127) v = 127;
    part[a] = mirror[a] = (uint8_t)v;
    setup_turned[index - 1u] = 1; setup_turned[2u - index] = 0;
    {   /* la Part, cambiada: las mismas marcas que pone stock al editarla (0x40054fb2) */
        uintptr_t b = U32(BANK);
        U8(b + 0x95048u) |= (uint8_t)(1u << pi); U8(0x100b145eu) |= (uint8_t)(1u << pi);
        U32(b + 0x9b332u) = 1; U32(0x100f8598u) = 1;
    }
    return 1;
}

const struct modwerk_machine_setup grain_machine = {.machine = {
    .abi = MODWERK_MACHINE_ABI, .sig = {'G', 'R'}, .sig_lo = 1, .sig_hi = 1, .label = "GRAIN",
    .flags = MODWERK_MACHINE_PROTECT | MODWERK_MACHINE_POOL | MODWERK_MACHINE_START | MODWERK_MACHINE_NATIVE_FLEX |
        MODWERK_MACHINE_SETUP_ALL | MODWERK_MACHINE_SETUP_PAGE,
    .defaults = defaults, .admit_track = grain_admit, .assign = grain_assign, .chooser_type = grain_chooser,
    .track_page = grain_page, .ui_tick = grain_ui_tick, .pool_open = grain_pool_open, .pool_left = grain_pool_left,
    .render = grain_render,
    /* precio de CPU para la base (% de un frame, peor render en una pista): estimado, sin medir en la unidad. Sin el
     * (0 = el de la base) el emulador lo rechazaba con CPU FULL 88 %. AMIGA mide ~5,5 puntos; 6 granos, algo mas. */
    /* medido en la MKI del autor (20/11, medidor de CPU de la base, dos pistas): ~10 puntos por pista con DENS 64 (mono o
     * estereo), ~12 con DENS 64 y PAN, ~15 con DENS y PAN al maximo (los 6 granos sonando). El precio es el peor caso. */
    .reserved = {15},
}, .page = grain_setup_page, .knob = grain_setup_knob};
const struct modwerk_machine_start grain_machine_start = {
    .abi = MODWERK_MACHINE_START_ABI, .bytes = sizeof(struct modwerk_machine_start),
    .machine = &grain_machine.machine, .start = grain_start,
};
