/* SPDX-License-Identifier: GPL-3.0-or-later
 * TIEMPOS: el tiempo que le queda a cada una de las 8 pistas, en una pantalla.
 * Módulo de runtime de Modwerk para Octatrack MK1 y MKII (OS 1.40C).
 *
 *   python3 -B sdk/runtime/loader/build.py tiempos.c -o tiempos.mwrm
 *   npm run device -- try tiempos.mwrm --seconds 300
 *
 * Solo lee y dibuja: no escribe en memoria del OS ni parchea código de stock.
 * No necesita forma de onda, archivos .dkp, tarjeta ni deckprep: solo la posición
 * y el final de la muestra de cada voz (sondeos P2 y P3).
 *
 * Tiempo real sin conocer el BPM de la muestra: el módulo mide a qué velocidad
 * avanza la posición de cada voz (frames por segundo de reloj, con el temporizador
 * de 132 MHz). Así el tiempo restante ya incluye time-stretch, repitch y cambios de
 * tempo, y no hace falta saber qué slot usa cada pista (P4).
 *
 * Con RATE negativo la voz va hacia atrás: la posición baja (hasta -1 al llegar al
 * inicio) y un redisparo salta al final. La velocidad se mide con signo, solo si el
 * sentido se mantiene en la ventana; hacia atrás falta lo que hay hasta el inicio del
 * trim. Con RATE 0 la voz está quieta y el tiempo restante se muestra como --:--.
 *
 * Teclas (deck_keys.h): CUE + MIDI abre y cierra · NO cierra · LEFT / RIGHT cambian
 * la columna derecha (duración total / tiempo transcurrido) · páginas, BANK y
 * PATTERN cierran y llegan al OS · dos pulsaciones de la misma tecla de pista en
 * menos de 400 ms cierran y llegan al OS · todo lo demás sigue yendo al OS.
 *
 * Fila de cada pista (8 px de alto, 8 filas):
 *   x 0-8    número: relleno = suena; contorno = cargada y parada; punteado = vacía
 *   x 10     marca de la pista seleccionada
 *   x 13-80  barra: maciza lo que falta, línea fina lo ya sonado, tope al final
 *   x 84-103 tiempo restante m:ss (parpadea en negativo bajo 30 s si suena)
 *   x 108-127 duración total o tiempo transcurrido, al tempo actual
 */
#include <stdint.h>
#include "modwerk_module.h"
#include "ot_state.h"
#include "deck_keys.h"
#include "deck_font.h"

#define TRACKS 8
#define ROW_H 8
#define BAR_X0 13
#define BAR_X1 80
#define REM_END 103
#define RIGHT_END 127
#define WINDOW_MS 500u      /* ventana de medida de la velocidad */
#define BLINK_SECS 30u
#define DOUBLE_MS 400u      /* dos pulsaciones de la misma pista: cierra */
#define STILL_RATE 64u      /* frames por segundo: por debajo, la voz está quieta (RATE 0) */

/* ---------------------------------------------------------------- dibujo */
static unsigned char *fb;

static void px(int x, int y, int on)
{
    if ((unsigned)x > 127u || (unsigned)y > 63u) return;
    unsigned char *b = fb + x * 8 + 7 - (y >> 3);
    unsigned char m = (unsigned char)(1u << (y & 7));
    if (on) *b |= m; else *b &= (unsigned char)~m;
}

static void rect(int x0, int y0, int x1, int y1, int on)
{
    for (int x = x0; x <= x1; ++x)
        for (int y = y0; y <= y1; ++y) px(x, y, on);
}

static void text(int x, int y, const char *s, int on)
{
    for (; *s; ++s, x += 4) {
        int c = (unsigned char)*s;
        if (c < 32 || c >= 96) continue;
        unsigned g = deck_font[c - 32];
        for (int r = 0; r < 5; ++r)
            for (int k = 0; k < 3; ++k)
                if (g & (1u << (14 - r * 3 - k))) px(x + k, y + r, on);
    }
}

static int text_w(const char *s)
{
    int n = 0;
    while (s[n]) ++n;
    return n ? n * 4 - 1 : 0;
}

static void fmt_time(char *s, uint32_t secs)
{
    if (secs > 5999u) secs = 5999u;
    uint32_t m = secs / 60u;
    if (m >= 10u) *s++ = (char)('0' + m / 10u);
    *s++ = (char)('0' + m % 10u);
    *s++ = ':';
    *s++ = (char)('0' + (secs % 60u) / 10u);
    *s++ = (char)('0' + secs % 10u);
    *s = 0;
}

/* ---------------------------------------------------------------- estado */
struct track {
    int32_t pos, last_pos;     /* frames, con signo: hacia atrás llega a -1 */
    uint32_t start, len;       /* el trim de la voz, frames */
    int32_t win_pos;           /* inicio de la ventana de medida */
    uint32_t win_t;
    int32_t rate;              /* frames por segundo real, con signo (< 0 = hacia atrás) */
    int8_t dir, win_dir;       /* sentido del último avance y de la ventana: 1, -1 o 0 */
    uint8_t active, measuring, measured;
};

static struct track tr[TRACKS];
static int open, show_elapsed, cue_held, taken_key = -1;
static int last_track_key = -1;  /* última tecla de pista pulsada con la pantalla abierta */
static uint32_t last_track_at;   /* su instante, en cuentas del temporizador de 132 MHz */
static uint32_t ticks;
static uint8_t cur_track;
static uint32_t toast_until;

/* Velocidad para los cálculos, sin signo: la medida o, si no hay, la original (44,1 kHz). */
static uint32_t rate_of(const struct track *t)
{
    if (!t->measured) return OT_RATE;
    return t->rate < 0 ? (uint32_t)-t->rate : (uint32_t)t->rate;
}

/* Hacia atrás: el sentido medido o, sin medida, el del último avance. */
static int reverse(const struct track *t) { return t->measured && t->rate ? t->rate < 0 : t->dir < 0; }

/* RATE 0: medida y casi quieta; el tiempo restante no tiene sentido. */
static int still(const struct track *t) { return t->measured && rate_of(t) < STILL_RATE; }

static uint32_t secs_for(uint32_t frames, uint32_t rate)
{
    return rate ? frames / rate : 0u;
}

/* Lee las voces y actualiza la velocidad medida de cada una. */
static void sample_tracks(void)
{
    uint32_t now = RD32(OT_DTCN3);
    cur_track = RD8(OT_CUR_TRACK);
    for (unsigned i = 0; i < TRACKS; ++i) {
        struct track *t = &tr[i];
        uint32_t v = OT_VOICE_BASE + i * OT_VOICE_STRIDE;
        t->active = RD8(v + OT_VOICE_ACTIVE) != 0;
        t->pos = (int32_t)RD32(v + OT_VOICE_POS);
        t->start = RD32(v + OT_VOICE_START);
        t->len = RD32(v + OT_VOICE_END);

        /* Redisparo, cue o muestra nueva: un salto de más de 1 s, o uno en contra del
         * sentido en que suena de más de 1/8 s (hacia atrás, el redisparo vuelve al final).
         * Un paso corto en contra es un cambio de RATE: cambia el sentido, no es un salto. */
        int32_t step = t->pos - t->last_pos;
        uint32_t size = step < 0 ? (uint32_t)-step : (uint32_t)step;
        int8_t sign = step > 0 ? 1 : step < 0 ? -1 : 0;
        int jumped = size > OT_RATE || (sign && sign == -t->dir && size > OT_RATE / 8u);
        if (sign && !jumped) t->dir = sign;

        /* Se empieza otra ventana, conservando la última velocidad medida, tras un salto,
         * una parada o un cambio de sentido dentro de la ventana. */
        if (!t->active || jumped || !t->measuring || (sign && t->win_dir && sign != t->win_dir)) {
            t->win_pos = t->pos, t->win_t = now, t->measuring = t->active;
            t->win_dir = jumped ? 0 : sign;
        } else {
            if (sign) t->win_dir = sign;
            uint32_t dt = (now - t->win_t) / (OT_DTCN3_PER_MS / 10u); /* décimas de ms */
            if (dt >= WINDOW_MS * 10u) {
                int32_t dp = t->pos - t->win_pos;            /* |dp| < 2 * 44100 en 0,5 s */
                int32_t r = dp * 10000 / (int32_t)dt;        /* frames por segundo; |dp| * 1e4 < 2^31 */
                /* suaviza si es parecida a la anterior; si cambia mucho (tempo o RATE nuevos), se toma tal cual */
                int32_t d = r > t->rate ? r - t->rate : t->rate - r;
                int32_t m = t->rate < 0 ? -t->rate : t->rate;
                t->rate = t->measured && m && d * 50 < m ? (t->rate * 3 + r) / 4 : r;
                t->measured = 1;
                t->win_pos = t->pos, t->win_t = now, t->win_dir = 0;
            }
        }
        t->last_pos = t->pos;
    }
}

/* ---------------------------------------------------------------- vista */
static void draw_row(unsigned i)
{
    const struct track *t = &tr[i];
    int y = (int)i * ROW_H, loaded = t->len > t->start && t->pos <= (int32_t)t->len;
    /* posición dentro del trim; hacia atrás llega a -1, por debajo del inicio */
    uint32_t at_pos = t->pos > (int32_t)t->start ? (uint32_t)t->pos : t->start;
    uint32_t total = loaded ? t->len - t->start : 0u;
    int back = reverse(t);
    /* hacia delante falta hasta el final; hacia atrás, hasta el inicio del trim */
    uint32_t left = back ? at_pos - t->start : (loaded ? t->len - at_pos : 0u);
    uint32_t played = total - left;
    char s[8];
    s[0] = (char)('1' + i), s[1] = 0;

    /* número */
    if (loaded && t->active) {
        rect(0, y, 8, y + 6, 1);
        text(3, y + 1, s, 0);
    } else if (loaded) {
        rect(0, y, 8, y, 1), rect(0, y + 6, 8, y + 6, 1), rect(0, y, 0, y + 6, 1), rect(8, y, 8, y + 6, 1);
        text(3, y + 1, s, 1);
    } else {
        for (int x = 0; x <= 8; x += 2) px(x, y, 1), px(x, y + 6, 1);
        for (int yy = y; yy <= y + 6; yy += 2) px(0, yy, 1), px(8, yy, 1);
        text(3, y + 1, s, 1);
    }
    if (i == cur_track) rect(10, y + 2, 10, y + 4, 1);

    if (!loaded) {
        text(REM_END - text_w("--:--") + 1, y + 1, "--:--", 1);
        return;
    }

    /* barra: escala por longitud; la parte que falta, maciza (hacia atrás, a la izquierda) */
    int w = BAR_X1 - BAR_X0;
    int at = BAR_X0 + (int)(((at_pos - t->start) >> 8) * (uint32_t)w / ((total >> 8) + 1u));
    if (at > BAR_X1) at = BAR_X1;
    if (back) {
        rect(BAR_X0, y + 1, at, y + 5, 1);
        if (at < BAR_X1) rect(at + 1, y + 3, BAR_X1, y + 3, 1);
    } else {
        if (at > BAR_X0) rect(BAR_X0, y + 3, at - 1, y + 3, 1);
        rect(at, y + 1, BAR_X1, y + 5, 1);
    }
    rect(BAR_X1 + 1, y, BAR_X1 + 1, y + 6, 1); /* tope */

    /* RATE 0: sin tiempo restante ni total que mostrar (al final queda 0:00, quieta o no) */
    if (still(t) && left) {
        text(REM_END - text_w("--:--") + 1, y + 1, "--:--", 1);
        text(RIGHT_END - text_w("--:--") + 1, y + 1, "--:--", 1);
        return;
    }

    /* tiempo restante, real */
    uint32_t rate = rate_of(t), rem = secs_for(left, rate);
    fmt_time(s, rem);
    int x = REM_END - text_w(s) + 1;
    /* hacia atrás la voz sigue activa en el inicio: ahí ha terminado y no parpadea */
    if (t->active && left && rem < BLINK_SECS && !((ticks / 30u) & 1u)) {
        rect(x - 1, y, REM_END + 1, y + 6, 1);
        text(x, y + 1, s, 0);
    } else text(x, y + 1, s, 1);

    /* columna derecha: total o transcurrido, a la misma velocidad */
    fmt_time(s, secs_for(show_elapsed ? played : total, rate));
    text(RIGHT_END - text_w(s) + 1, y + 1, s, 1);
}

/* ---------------------------------------------------------------- eventos */
void module_tick(struct modwerk_runtime_api *api)
{
    ++ticks;
    sample_tracks(); /* también cerrado: así la velocidad ya está medida al abrir */
    if (api) api->value = (uint32_t)tr[0].rate; /* con signo: hacia atrás, negativa */
}

void module_draw(unsigned char *frame)
{
    if (!open) return;
    fb = frame;
    for (unsigned i = 0; i < 1024u; ++i) frame[i] = 0;
    for (unsigned i = 0; i < TRACKS; ++i) draw_row(i);
    /* aviso al cambiar la columna derecha (no hay sitio para una cabecera) */
    if ((int32_t)(toast_until - ticks) > 0) {
        const char *m = show_elapsed ? "ELAPSED" : "TOTAL";
        int w = text_w(m), x = 64 - w / 2;
        rect(x - 4, 26, x + w + 3, 36, 0);
        rect(x - 4, 26, x + w + 3, 26, 1), rect(x - 4, 36, x + w + 3, 36, 1);
        rect(x - 4, 26, x - 4, 36, 1), rect(x + w + 3, 26, x + w + 3, 36, 1);
        text(x, 29, m, 1);
    }
}

static void close_view(void)
{
    open = 0;
    OT_REDRAW();
}

int module_key(int code, int pressed)
{
    if (code == K_CUE) cue_held = pressed;
    if (!pressed) {
        if (code == taken_key) { taken_key = -1; return 1; }
        return 0;
    }
    if (code == K_OPEN && cue_held) {
        if (open) close_view(); else open = 1;
        last_track_key = -1;
        taken_key = code;
        return 1;
    }
    if (!open) return 0;
    /* Pista: una pulsación la selecciona y la pantalla sigue; la segunda de la misma
     * pista en menos de DOUBLE_MS cierra. Las dos llegan al OS. */
    if (code >= K_TRACK1 && code <= K_TRACK8) {
        uint32_t now = RD32(OT_DTCN3);
        if (code == last_track_key && now - last_track_at < DOUBLE_MS * OT_DTCN3_PER_MS) {
            last_track_key = -1;
            close_view();
            return 0;
        }
        last_track_key = code, last_track_at = now;
        return 0;
    }
    last_track_key = -1;
    if (code == K_NO) { close_view(); taken_key = code; return 1; }
    if (code == K_LEFT || code == K_RIGHT) { show_elapsed = !show_elapsed, toast_until = ticks + 75u; taken_key = code; return 1; }
    if ((code >= K_SRC && code <= K_FX2) || code == K_BANK || code == K_PATTERN) { close_view(); return 0; }
    return 0;
}

int module_enc(int encoder, int delta)
{
    (void)encoder, (void)delta;
    return 0;
}
